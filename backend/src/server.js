import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.js';
import serviceRoutes from './routes/services.js';
import orderRoutes from './routes/orders.js';
import printRoutes from './routes/print.js';
import paymentRoutes, { webhookHandler } from './routes/payments.js';
import fileRoutes from './routes/files.js';
import adminRoutes from './routes/admin.js';
import { startCleanupJob } from './lib/cleanup.js';
import { startBackupJob } from './lib/backup.js';
import { startNotificationRetryJob } from './lib/notify.js';
import { paymentConfigProblems, startReconcileJob, mockMode } from './lib/payments.js';
import { checkEncryptionKey } from './lib/crypto.js';
import { MAX_FILE_MB } from './lib/upload.js';
import { seedIfEmpty } from './lib/seedData.js';
import { getSettings, Service, PRIVACY_VERSION } from './models.js';

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const isProd = process.env.NODE_ENV === 'production';
if (isProd && process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET is too short for production. Use at least 32 random characters.');
  process.exit(1);
}

// B1 / B2 / C3: refuse to start a live server that is not safe to take money or store documents
const problems = [...paymentConfigProblems()];
try {
  checkEncryptionKey();
} catch (e) {
  problems.push(e.message);
}
if (isProd && /ChangeMe@123/i.test(process.env.ADMIN_PASSWORD || '')) {
  problems.push('ADMIN_PASSWORD is still the default "ChangeMe@123". Change it in .env (and in the admin panel).');
}
if (problems.length) {
  console.error('\nThe server cannot start:\n - ' + problems.join('\n - ') + '\n');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);

// SRS 5: HTTPS only. Hosts like Render/Railway terminate TLS and set x-forwarded-proto.
if (isProd) {
  app.use((req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https' || req.path === '/api/health') return next();
    if (req.method === 'GET') return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    res.status(403).json({ error: 'Use HTTPS.' });
  });
}
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(','), credentials: true }));
app.use(morgan(isProd ? 'combined' : 'dev'));

// Webhook must get the raw body, so it goes before express.json()
app.post('/api/payments/webhook', ...webhookHandler);
app.use(express.json({ limit: '1mb' }));

// D1: generous per-IP limits (a cafe's shared WiFi is one IP); the real OTP limit is per mobile number
const limit = (windowMin, max, extra = {}) =>
  rateLimit({ windowMs: windowMin * 60 * 1000, limit: max, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many requests. Wait a few minutes and try again.' }, ...extra });
app.use(['/api/auth/send-otp', '/api/auth/verify-otp', '/api/auth/complete-signup'], limit(10, 100));
app.use('/api/auth/admin/login', limit(10, 30));
// D2: uploads are limited per logged-in user
const byLogin = (req) => 'u:' + (req.headers.authorization || 'anonymous').slice(-40);
app.post(['/api/orders', '/api/print'], limit(10, 20, { keyGenerator: byLogin }));
app.use('/api/payments/create', limit(10, 40, { keyGenerator: byLogin }));

app.get('/api/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));

// Public info the customer app shows: print rates, retention, cafe details and hours, refund policy
app.get('/api/public-settings', async (req, res, next) => {
  try {
    const [s, serviceCount] = await Promise.all([getSettings(), Service.countDocuments({ isActive: true })]);
    res.json({
      serviceCount,
      printRates: s.printRates,
      retentionDays: s.retentionDays,
      draftDays: Number(process.env.DRAFT_DAYS || 3),
      maxFileMb: MAX_FILE_MB,
      cafeName: s.cafeName,
      cafePhone: s.cafePhone,
      cafeAddress: s.cafeAddress,
      openTime: s.openTime,
      closeTime: s.closeTime,
      openDays: s.openDays,
      heroImage: s.heroImage,
      refundPolicy: s.refundPolicy,
      privacyVersion: PRIVACY_VERSION,
      testPayments: mockMode,
    });
  } catch (e) {
    next(e);
  }
});
app.use('/api/auth', authRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/print', printRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Errors (including multer file errors)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: `File is too large. Max ${process.env.MAX_FILE_MB || 10} MB.` });
  if (err.name === 'MulterError') return res.status(400).json({ error: err.message });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server.' : err.message });
});

const PORT = process.env.PORT || 5000;
mongoose
  .connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cyber_cafe', { serverSelectionTimeoutMS: 15000 })
  .then(async () => {
    console.log('MongoDB connected');
    try {
      await seedIfEmpty(); // first run: owner login + sample services, so the Services page is never empty
    } catch (e) {
      console.error('First-run setup failed:', e.message);
    }
    startCleanupJob();
    startBackupJob();
    startNotificationRetryJob();
    startReconcileJob();
    app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error('Could not connect to MongoDB:', e.message);
    if (/whitelist|IP|ENOTFOUND|ETIMEOUT|querySrv/i.test(e.message)) {
      console.error(
        '\nTip: in MongoDB Atlas open "Network Access" and add your current IP address' +
          ' (or 0.0.0.0/0 while testing). Also check the user name and password in MONGO_URI.\n'
      );
    }
    process.exit(1);
  });

export default app;
