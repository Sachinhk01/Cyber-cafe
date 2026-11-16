import nodemailer from 'nodemailer';
import { Notification } from '../models.js';

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

// Returns { ok, error }. Without SMTP the email is printed to the console (development).
export async function sendEmail(to, subject, text, attachments) {
  if (!to) return { ok: true };
  if (!transporter) {
    console.log(`[email -> ${to}] ${subject}\n${text}${attachments?.length ? `\n(+${attachments.length} attachment)` : ''}\n`);
    return { ok: true };
  }
  try {
    await transporter.sendMail({ from: process.env.MAIL_FROM, to, subject, text, attachments });
    return { ok: true };
  } catch (e) {
    console.error('Email failed:', e.message);
    return { ok: false, error: e.message };
  }
}

/*
 * SMS / OTP (FR-2, FR-24). Pick a provider with SMS_PROVIDER:
 *   (empty)  -> print to the console (development)
 *   fast2sms -> FAST2SMS_API_KEY            (DLT route needs FAST2SMS_SENDER_ID + FAST2SMS_TEMPLATE_ID)
 *   msg91    -> MSG91_AUTH_KEY, MSG91_TEMPLATE_ID (Flow template with a ##message## variable)
 *   twilio   -> TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
 * In India, commercial SMS must use a DLT-registered sender and template. Register the OTP
 * template text with your provider exactly as the app sends it.
 */
const PROVIDERS = {
  async fast2sms(mobile, text) {
    const { FAST2SMS_API_KEY: key, FAST2SMS_SENDER_ID: sender, FAST2SMS_TEMPLATE_ID: template } = process.env;
    if (!key) throw new Error('FAST2SMS_API_KEY is not set');
    const body = sender && template
      ? { route: 'dlt', sender_id: sender, message: template, variables_values: text.replace(/\|/g, '/'), numbers: mobile }
      : { route: 'q', message: text, numbers: mobile }; // quick route (no DLT) for testing
    const r = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: { authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.return === false) throw new Error(data.message?.toString() || `Fast2SMS HTTP ${r.status}`);
  },

  async msg91(mobile, text) {
    const { MSG91_AUTH_KEY: key, MSG91_TEMPLATE_ID: template } = process.env;
    if (!key || !template) throw new Error('MSG91_AUTH_KEY / MSG91_TEMPLATE_ID are not set');
    const r = await fetch('https://control.msg91.com/api/v5/flow', {
      method: 'POST',
      headers: { authkey: key, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ template_id: template, short_url: '0', recipients: [{ mobiles: '91' + mobile, message: text }] }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.type === 'error') throw new Error(data.message || `MSG91 HTTP ${r.status}`);
  },

  async twilio(mobile, text) {
    const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = process.env;
    if (!sid || !token || !from) throw new Error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM are not set');
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: '+91' + mobile, From: from, Body: text }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.message || `Twilio HTTP ${r.status}`);
    }
  },
};

// Returns { ok, error }. For OTPs the caller needs to know if delivery failed.
export async function sendSmsResult(mobile, text) {
  const name = (process.env.SMS_PROVIDER || '').toLowerCase();
  if (!name) {
    console.log(`[sms -> ${mobile}] ${text}`);
    return { ok: true };
  }
  const provider = PROVIDERS[name];
  if (!provider) return { ok: false, error: `Unknown SMS_PROVIDER "${name}". Use fast2sms, msg91 or twilio.` };
  try {
    await provider(mobile, text);
    return { ok: true };
  } catch (e) {
    console.error(`SMS via ${name} failed:`, e.message);
    return { ok: false, error: e.message };
  }
}
export const sendSms = async (mobile, text) => (await sendSmsResult(mobile, text)).ok;

// Login OTP (FR-2). Uses each provider's dedicated OTP route where it has one,
// so you don't need a separate DLT template just for the code.
export async function sendOtp(mobile, code) {
  const name = (process.env.SMS_PROVIDER || '').toLowerCase();
  const text = `Your Cyber Cafe login code is ${code}. It expires in 5 minutes.`;
  try {
    if (name === 'fast2sms') {
      const r = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: { authorization: process.env.FAST2SMS_API_KEY || '', 'Content-Type': 'application/json' },
        body: JSON.stringify({ route: 'otp', variables_values: code, numbers: mobile }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.return === false) throw new Error(data.message?.toString() || `Fast2SMS HTTP ${r.status}`);
      return true;
    }
    if (name === 'msg91' && process.env.MSG91_OTP_TEMPLATE_ID) {
      const r = await fetch('https://control.msg91.com/api/v5/flow', {
        method: 'POST',
        headers: { authkey: process.env.MSG91_AUTH_KEY || '', 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ template_id: process.env.MSG91_OTP_TEMPLATE_ID, short_url: '0', recipients: [{ mobiles: '91' + mobile, otp: code }] }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.type === 'error') throw new Error(data.message || `MSG91 HTTP ${r.status}`);
      return true;
    }
  } catch (e) {
    console.error(`OTP via ${name} failed:`, e.message);
    return false;
  }
  return sendSms(mobile, text);
}

// Status-change notification (FR-24): SMS + email.
// E4: every attempt is recorded; failures show on the owner's dashboard and are retried.
export async function notifyUser(user, subject, text, attachments) {
  if (!user) return;
  const jobs = [];
  if (user.mobile) jobs.push(deliver({ user: user._id, channel: 'sms', to: user.mobile, subject, text }));
  if (user.email) jobs.push(deliver({ user: user._id, channel: 'email', to: user.email, subject, text }, attachments));
  await Promise.all(jobs);
}

async function deliver(n, attachments) {
  const r = n.channel === 'sms' ? await sendSmsResult(n.to, n.text) : await sendEmail(n.to, n.subject, n.text, attachments);
  try {
    await Notification.create({ ...n, status: r.ok ? 'sent' : 'failed', lastError: r.error });
  } catch (e) {
    console.error('Could not record notification:', e.message);
  }
  return r.ok;
}

const MAX_ATTEMPTS = 3;
export async function retryFailedNotifications() {
  const due = await Notification.find({ status: 'failed', updatedAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } }).limit(50);
  for (const n of due) {
    const r = n.channel === 'sms' ? await sendSmsResult(n.to, n.text) : await sendEmail(n.to, n.subject, n.text);
    n.attempts += 1;
    if (r.ok) n.status = 'sent';
    else {
      n.lastError = r.error;
      if (n.attempts >= MAX_ATTEMPTS) n.status = 'gave-up';
    }
    await n.save();
  }
  return due.length;
}

export function startNotificationRetryJob() {
  setInterval(() => retryFailedNotifications().catch((e) => console.error('Notification retry failed:', e.message)), 10 * 60 * 1000);
}
