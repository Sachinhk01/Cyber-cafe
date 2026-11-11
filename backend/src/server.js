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

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(','), credentials: true }));
app.use(morgan('dev'));

// Webhook must get the raw body, so it goes before express.json()
app.post('/api/payments/webhook', ...webhookHandler);
app.use(express.json({ limit: '1mb' }));

const otpLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 10, message: { error: 'Too many attempts. Wait a few minutes and try again.' } });
app.use(['/api/auth/send-otp', '/api/auth/register', '/api/auth/verify-otp', '/api/auth/admin/login'], otpLimiter);

app.get('/api/health', (req, res) => res.json({ ok: true }));
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
  .connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cyber_cafe')
  .then(() => {
    console.log('MongoDB connected');
    startCleanupJob();
    app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error('Could not connect to MongoDB:', e.message);
    process.exit(1);
  });

export default app;
