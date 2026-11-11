import nodemailer from 'nodemailer';

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

export async function sendEmail(to, subject, text) {
  if (!to) return;
  if (!transporter) {
    console.log(`[email -> ${to}] ${subject}\n${text}\n`);
    return;
  }
  try {
    await transporter.sendMail({ from: process.env.MAIL_FROM, to, subject, text });
  } catch (e) {
    console.error('Email failed:', e.message);
  }
}

// Plug in your SMS provider here (MSG91, Twilio, Fast2SMS...).
export async function sendSms(mobile, text) {
  if (!process.env.SMS_PROVIDER) {
    console.log(`[sms -> ${mobile}] ${text}`);
    return;
  }
  // Example shape:
  // await fetch('https://provider/api', { method: 'POST', headers: {...}, body: JSON.stringify({ to: mobile, text }) });
  console.log(`[sms via ${process.env.SMS_PROVIDER} -> ${mobile}] ${text}`);
}

// Status-change notification: SMS + email
export async function notifyUser(user, subject, text) {
  if (!user) return;
  await Promise.all([user.mobile && sendSms(user.mobile, text), sendEmail(user.email, subject, text)]);
}
