import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, Otp, Order, PrintJob, Document, Payment, PRIVACY_VERSION } from '../models.js';
import { ah, auth, signToken, HttpError, checkStrongPassword, DEFAULT_PASSWORDS } from '../lib/auth.js';
import { sendOtp } from '../lib/notify.js';
import { removeFile } from '../lib/upload.js';
import { audit } from '../lib/audit.js';

const r = Router();

const MOBILE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const cleanMobile = (m) => String(m || '').replace(/\D/g, '').slice(-10);
const isProd = () => process.env.NODE_ENV === 'production';

export const publicUser = (u) => ({
  id: u._id,
  name: u.name,
  mobile: u.mobile,
  email: u.email,
  role: u.role,
  mustChangePassword: !!u.mustChangePassword,
  createdAt: u.createdAt,
});

const OTP_PER_HOUR = Number(process.env.OTP_PER_HOUR || 5);

async function issueOtp(mobile) {
  const now = Date.now();
  const last = await Otp.findOne({ mobile }).lean();
  // One SMS per number every 30 seconds (SMS costs money and this stops abuse)
  if (last?.sentAt && now - new Date(last.sentAt).getTime() < 30 * 1000) {
    throw new HttpError(429, 'Please wait 30 seconds before asking for another code.');
  }
  // D1: limit per mobile number, not only per IP (a cafe WiFi shares one IP)
  const inSameHour = last?.hourStart && now - new Date(last.hourStart).getTime() < 3600 * 1000;
  const hourCount = inSameHour ? (last.hourCount || 0) + 1 : 1;
  if (hourCount > OTP_PER_HOUR) throw new HttpError(429, 'Too many codes for this number. Try again in an hour.');

  const code = String(crypto.randomInt(100000, 999999));
  await Otp.findOneAndUpdate(
    { mobile },
    {
      codeHash: hash(code),
      attempts: 0,
      sentAt: new Date(now),
      hourStart: inSameHour ? last.hourStart : new Date(now),
      hourCount,
      expiresAt: new Date(now + 5 * 60 * 1000),
    },
    { upsert: true }
  );
  const sent = await sendOtp(mobile, code);
  if (!sent && isProd()) throw new HttpError(503, 'We could not send the SMS right now. Please try again in a minute.');
  // In development the code is returned so you can test without an SMS provider.
  return isProd() ? {} : { devOtp: code };
}

// FR-2 + D3 + D4: one flow for everyone. The same answer is given whether or not the number
// has an account (no "no account with this number"), and an account is only created after
// the OTP proves the person owns the number.
r.post(
  '/send-otp',
  ah(async (req, res) => {
    const mobile = cleanMobile(req.body.mobile);
    if (!MOBILE_RE.test(mobile)) throw new HttpError(400, 'Enter a valid 10-digit mobile number.');
    res.json({ ok: true, ...(await issueOtp(mobile)) });
  })
);

r.post(
  '/verify-otp',
  ah(async (req, res) => {
    const mobile = cleanMobile(req.body.mobile);
    const code = String(req.body.otp || '').trim();
    const otp = await Otp.findOne({ mobile });
    if (!otp || otp.expiresAt < new Date()) throw new HttpError(400, 'Code expired. Request a new one.');
    if (otp.attempts >= 5) throw new HttpError(429, 'Too many wrong attempts. Request a new code.');
    if (otp.codeHash !== hash(code)) {
      otp.attempts += 1;
      await otp.save();
      throw new HttpError(400, 'Wrong code. Check the SMS and try again.');
    }
    // keep the hourly counter, but the code can't be used again
    otp.codeHash = hash(crypto.randomBytes(16).toString('hex'));
    otp.expiresAt = new Date(Date.now() + 3600 * 1000);
    await otp.save();

    const user = await User.findOne({ mobile, role: 'customer' });
    if (user) return res.json({ token: signToken(user), user: publicUser(user) });
    // New number: ask for name/email next. This short token proves the OTP was verified.
    const signupToken = jwt.sign({ mobile, purpose: 'signup' }, process.env.JWT_SECRET, { expiresIn: '20m' });
    res.json({ needsProfile: true, signupToken });
  })
);

// FR-1: finish creating the account (after OTP), with C5 consent
r.post(
  '/complete-signup',
  ah(async (req, res) => {
    let payload;
    try {
      payload = jwt.verify(String(req.body.signupToken || ''), process.env.JWT_SECRET);
    } catch {
      throw new HttpError(400, 'This sign-up link expired. Enter your number again.');
    }
    if (payload.purpose !== 'signup') throw new HttpError(400, 'Invalid sign-up request.');
    const name = String(req.body.name || '').trim().slice(0, 80);
    const email = String(req.body.email || '').trim().toLowerCase();
    if (name.length < 2) throw new HttpError(400, 'Enter your full name.');
    if (email && !EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    if (req.body.consent !== true) throw new HttpError(400, 'Please agree to the privacy policy to continue.');
    let user = await User.findOne({ mobile: payload.mobile, role: 'customer' });
    if (!user) {
      user = await User.create({
        name,
        mobile: payload.mobile,
        email,
        role: 'customer',
        consentAt: new Date(),
        consentVersion: PRIVACY_VERSION,
      });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

// FR-4 Admin login (owner or staff) with D6 lockout
const MAX_FAILS = 5;
const LOCK_MIN = 15;
r.post(
  '/admin/login',
  ah(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ email, role: { $in: ['owner', 'staff'] } }).select('+passwordHash');
    if (user?.lockUntil && user.lockUntil > new Date()) {
      const mins = Math.ceil((user.lockUntil - Date.now()) / 60000);
      throw new HttpError(429, `Too many wrong passwords. This login is locked for ${mins} more minute${mins > 1 ? 's' : ''}.`);
    }
    const ok = user && (await bcrypt.compare(password, user.passwordHash || ''));
    if (!ok) {
      if (user) {
        user.failedLogins = (user.failedLogins || 0) + 1;
        if (user.failedLogins >= MAX_FAILS) {
          user.lockUntil = new Date(Date.now() + LOCK_MIN * 60 * 1000);
          user.failedLogins = 0;
          await audit({ user: { id: user._id, name: user.name, role: user.role }, ip: req.ip }, 'login.locked', {
            targetType: 'user',
            targetId: user._id,
            summary: `${MAX_FAILS} wrong passwords for ${email}; locked ${LOCK_MIN} min`,
          });
        }
        await user.save();
      }
      throw new HttpError(401, 'Wrong email or password.');
    }
    user.failedLogins = 0;
    user.lockUntil = undefined;
    // D5: still on the default or a weak password? Ask them to change it.
    if (DEFAULT_PASSWORDS.includes(password) || checkStrongPassword(password)) user.mustChangePassword = true;
    await user.save();
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

// D5: staff/owner change their own password (also signs out other sessions)
r.post(
  '/change-password',
  auth(['owner', 'staff']),
  ah(async (req, res) => {
    const user = await User.findById(req.user.id).select('+passwordHash');
    if (!(await bcrypt.compare(String(req.body.current || ''), user.passwordHash || ''))) throw new HttpError(400, 'Your current password is wrong.');
    const problem = checkStrongPassword(req.body.next);
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
      { $set: { name: 'Deleted customer', deletedAt: new Date() }, $unset: { mobile: 1, email: 1 }, $inc: { tokenVersion: 1 } }
    );
    res.json({ ok: true });
  })
);

export default r;
