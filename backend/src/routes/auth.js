import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { User, Order, PrintJob, Document, Payment, PRIVACY_VERSION } from '../models.js';
import { ah, auth, signToken, HttpError, checkStrongPassword, DEFAULT_PASSWORDS } from '../lib/auth.js';
import { removeFile } from '../lib/upload.js';
import { audit } from '../lib/audit.js';

const r = Router();

const MOBILE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9_.]{4,20}$/;
const RESERVED_USERNAMES = ['admin', 'owner', 'staff', 'root', 'support', 'cybercafe'];
const cleanMobile = (m) => String(m || '').replace(/\D/g, '').slice(-10);

export const publicUser = (u) => ({
  id: u._id,
  name: u.name,
  username: u.username,
  mobile: u.mobile,
  email: u.email,
  role: u.role,
  mustChangePassword: !!u.mustChangePassword,
  createdAt: u.createdAt,
});

// Rate limits for the open (not logged-in) routes. The per-account lockout below is the main protection;
// these are generous because a cafe's shared WiFi is one IP address.
const limiter = (windowMin, max) =>
  rateLimit({
    windowMs: windowMin * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Wait a few minutes and try again.' },
  });
const loginLimit = limiter(10, 100);
const registerLimit = limiter(60, 30);

// Customer password rule: kept simple on purpose (4 or more characters, anything goes).
// Owner and staff use the stricter checkStrongPassword.
function checkCustomerPassword(pw, username) {
  const p = String(pw || '');
  if (p.length < 4) return 'Use at least 4 characters.';
  if (p.length > 72) return 'Use at most 72 characters.';
  if (username && p.toLowerCase() === username) return 'Your password must be different from your username.';
  return null;
}

// D6: shared by customer and admin login. 5 wrong passwords lock the account for 15 minutes.
// A fake hash is checked when the account does not exist, so the response time does not reveal it.
const MAX_FAILS = 5;
const LOCK_MIN = 15;
const FAKE_HASH = bcrypt.hashSync('not-a-real-password', 10);

async function checkLogin(req, user, password, who, wrongMessage) {
  if (user?.lockUntil && user.lockUntil > new Date()) {
    const mins = Math.ceil((user.lockUntil - Date.now()) / 60000);
    throw new HttpError(429, `Too many wrong passwords. This login is locked for ${mins} more minute${mins > 1 ? 's' : ''}.`);
  }
  const match = await bcrypt.compare(password, user?.passwordHash || FAKE_HASH);
  if (!user || !user.passwordHash || !match) {
    if (user) {
      user.failedLogins = (user.failedLogins || 0) + 1;
      if (user.failedLogins >= MAX_FAILS) {
        user.lockUntil = new Date(Date.now() + LOCK_MIN * 60 * 1000);
        user.failedLogins = 0;
        await audit({ user: { id: user._id, name: user.name, role: user.role }, ip: req.ip }, 'login.locked', {
          targetType: 'user',
          targetId: user._id,
          summary: `${MAX_FAILS} wrong passwords for ${who}; locked ${LOCK_MIN} min`,
        });
      }
      await user.save();
    }
    throw new HttpError(401, wrongMessage);
  }
  user.failedLogins = 0;
  user.lockUntil = undefined;
}

// FR-1: customer sign up with username + password (mobile is saved for SMS updates, not verified)
r.post(
  '/register',
  registerLimit,
  ah(async (req, res) => {
    const name = String(req.body.name || '').trim().slice(0, 80);
    const username = String(req.body.username || '').trim().toLowerCase();
    const mobile = cleanMobile(req.body.mobile);
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (name.length < 2) throw new HttpError(400, 'Enter your full name.');
    if (!USERNAME_RE.test(username)) throw new HttpError(400, 'Username must be 4 to 20 characters: letters, numbers, dot or underscore.');
    if (RESERVED_USERNAMES.includes(username)) throw new HttpError(400, 'That username is not available. Try another.');
    if (!MOBILE_RE.test(mobile)) throw new HttpError(400, 'Enter a valid 10-digit mobile number.');
    if (email && !EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    const problem = checkCustomerPassword(password, username);
    if (problem) throw new HttpError(400, problem);
    if (req.body.consent !== true) throw new HttpError(400, 'Please agree to the privacy policy to continue.');

    const [usernameTaken, mobileTaken] = await Promise.all([User.exists({ username }), User.exists({ mobile })]);
    if (usernameTaken) throw new HttpError(409, 'That username is already taken. Try another.');
    if (mobileTaken) throw new HttpError(409, 'This mobile number already has an account. Log in instead.');

    let user;
    try {
      user = await User.create({
        name,
        username,
        mobile,
        email,
        role: 'customer',
        passwordHash: await bcrypt.hash(password, 10),
        consentAt: new Date(),
        consentVersion: PRIVACY_VERSION,
      });
    } catch (e) {
      if (e.code === 11000) throw new HttpError(409, 'That username or mobile number is already registered.');
      throw e;
    }
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

// FR-2: customer login with username + password
r.post(
  '/login',
  loginLimit,
  ah(async (req, res) => {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ username, role: 'customer' }).select('+passwordHash');
    await checkLogin(req, user, password, username, 'Wrong username or password.');
    await user.save();
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

// FR-4: admin login (owner or staff) with email + password
r.post(
  '/admin/login',
  loginLimit,
  ah(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ email, role: { $in: ['owner', 'staff'] } }).select('+passwordHash');
    await checkLogin(req, user, password, email, 'Wrong email or password.');
    // D5: still on the default or a weak password? Ask them to change it.
    if (DEFAULT_PASSWORDS.includes(password) || checkStrongPassword(password)) user.mustChangePassword = true;
    await user.save();
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

// D5: change your own password (also signs out other sessions)
r.post(
  '/change-password',
  auth(),
  ah(async (req, res) => {
    const user = await User.findById(req.user.id).select('+passwordHash');
    if (!(await bcrypt.compare(String(req.body.current || ''), user.passwordHash || ''))) throw new HttpError(400, 'Your current password is wrong.');
    const problem = user.role === 'customer' ? checkCustomerPassword(req.body.next, user.username) : checkStrongPassword(req.body.next);
    if (problem) throw new HttpError(400, problem);
    if (req.body.next === req.body.current) throw new HttpError(400, 'Choose a new password, different from the current one.');
    user.passwordHash = await bcrypt.hash(String(req.body.next), 10);
    user.mustChangePassword = false;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    await audit(req, 'password.changed', { targetType: 'user', targetId: user._id, summary: 'Changed own password' });
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

// FR-3 Profile
r.get(
  '/me',
  auth(),
  ah(async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) throw new HttpError(401, 'Account not found.');
    res.json(publicUser(user));
  })
);

r.put(
  '/me',
  auth(),
  ah(async (req, res) => {
    const name = String(req.body.name || '').trim().slice(0, 80);
    const email = String(req.body.email || '').trim().toLowerCase();
    if (name.length < 2) throw new HttpError(400, 'Enter your full name.');
    if (email && !EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    const user = await User.findByIdAndUpdate(req.user.id, { name, email }, { new: true });
    res.json(publicUser(user));
  })
);

// D7: sign out on every device
r.post(
  '/logout-all',
  auth(),
  ah(async (req, res) => {
    await User.updateOne({ _id: req.user.id }, { $inc: { tokenVersion: 1 } });
    res.json({ ok: true });
  })
);

// C5: a copy of everything we hold about the customer
r.get(
  '/my-data',
  auth(['customer']),
  ah(async (req, res) => {
    const [user, orders, prints, payments, documents] = await Promise.all([
      User.findById(req.user.id).lean(),
      Order.find({ user: req.user.id }).lean(),
      PrintJob.find({ user: req.user.id }).lean(),
      Payment.find({ user: req.user.id }).lean(),
      Document.find({ user: req.user.id }).select('-fileUrl').lean(),
    ]);
    res.setHeader('Content-Disposition', 'attachment; filename="my-data.json"');
    res.json({ exportedAt: new Date(), account: user, orders, printJobs: prints, payments, documents });
  })
);

// C5: delete my account. Uploaded documents are deleted, personal details are removed.
// Payment records stay (without name and number) because accounts must be kept for tax.
r.delete(
  '/me',
  auth(['customer']),
  ah(async (req, res) => {
    const [openOrders, openPrints] = await Promise.all([
      Order.countDocuments({ user: req.user.id, status: { $in: ['Submitted', 'In Progress'] } }),
      PrintJob.countDocuments({ user: req.user.id, status: { $in: ['Pending', 'Printing', 'Ready'] } }),
    ]);
    if (openOrders || openPrints) {
      throw new HttpError(400, 'You have orders or printouts in progress. Wait until they are finished (or cancel them), then delete your account.');
    }
    const docs = await Document.find({ user: req.user.id });
    docs.forEach((d) => removeFile(d.fileUrl));
    await Document.deleteMany({ user: req.user.id });
    await Order.updateMany({ user: req.user.id }, { details: {}, remark: '' });
    await Order.deleteMany({ user: req.user.id, paymentStatus: { $nin: ['Paid', 'Refunded'] } });
    await PrintJob.deleteMany({ user: req.user.id, paymentStatus: { $nin: ['Paid', 'Refunded'] } });
    await User.updateOne(
      { _id: req.user.id },
      { $set: { name: 'Deleted customer', deletedAt: new Date() }, $unset: { username: 1, passwordHash: 1, mobile: 1, email: 1 }, $inc: { tokenVersion: 1 } }
    );
    res.json({ ok: true });
  })
);

export default r;
