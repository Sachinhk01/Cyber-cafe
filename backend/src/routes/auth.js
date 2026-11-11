import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { User, Otp } from '../models.js';
import { ah, auth, signToken, HttpError } from '../lib/auth.js';
import { sendSms } from '../lib/notify.js';

const r = Router();

const MOBILE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const cleanMobile = (m) => String(m || '').replace(/\D/g, '').slice(-10);

const publicUser = (u) => ({ id: u._id, name: u.name, mobile: u.mobile, email: u.email, role: u.role });

async function issueOtp(mobile) {
  const code = String(crypto.randomInt(100000, 999999));
  await Otp.findOneAndUpdate(
    { mobile },
    { codeHash: hash(code), attempts: 0, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
    { upsert: true }
  );
  await sendSms(mobile, `Your Cyber Cafe login code is ${code}. It expires in 5 minutes.`);
  // In development the code is returned so you can test without an SMS provider.
  return process.env.NODE_ENV === 'production' ? {} : { devOtp: code };
}

// FR-1 Register
r.post(
  '/register',
  ah(async (req, res) => {
    const name = String(req.body.name || '').trim();
    const mobile = cleanMobile(req.body.mobile);
    const email = String(req.body.email || '').trim().toLowerCase();
    if (name.length < 2) throw new HttpError(400, 'Enter your full name.');
    if (!MOBILE_RE.test(mobile)) throw new HttpError(400, 'Enter a valid 10-digit mobile number.');
    if (email && !EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    if (await User.exists({ mobile })) throw new HttpError(409, 'This mobile number is already registered. Log in instead.');
    await User.create({ name, mobile, email, role: 'customer' });
    res.json({ ok: true, ...(await issueOtp(mobile)) });
  })
);

// FR-2 Login: request OTP
r.post(
  '/send-otp',
  ah(async (req, res) => {
    const mobile = cleanMobile(req.body.mobile);
    if (!MOBILE_RE.test(mobile)) throw new HttpError(400, 'Enter a valid 10-digit mobile number.');
    if (!(await User.exists({ mobile, role: 'customer' })))
      throw new HttpError(404, 'No account with this number. Register first.');
    res.json({ ok: true, ...(await issueOtp(mobile)) });
  })
);

// FR-2 Login: verify OTP
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
    await otp.deleteOne();
    const user = await User.findOne({ mobile, role: 'customer' });
    if (!user) throw new HttpError(404, 'Account not found.');
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

// FR-4 Admin login (owner or staff)
r.post(
  '/admin/login',
  ah(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = await User.findOne({ email, role: { $in: ['owner', 'staff'] } }).select('+passwordHash');
    const ok = user && (await bcrypt.compare(String(req.body.password || ''), user.passwordHash || ''));
    if (!ok) throw new HttpError(401, 'Wrong email or password.');
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
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    if (name.length < 2) throw new HttpError(400, 'Enter your full name.');
    if (email && !EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    const user = await User.findByIdAndUpdate(req.user.id, { name, email }, { new: true });
    res.json(publicUser(user));
  })
);

export default r;
