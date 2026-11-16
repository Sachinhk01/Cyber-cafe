// npm run seed -> owner login (from .env) + sample services with their full procedure.
// The server also does this automatically on its first start, so this is optional.
import 'dotenv/config';
import mongoose from 'mongoose';
import { ensureOwner, ensureServices, upgradeSampleServices } from './lib/seedData.js';

try {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cyber_cafe', { serverSelectionTimeoutMS: 15000 });
} catch (e) {
  console.error('Could not connect to MongoDB:', e.message);
  console.error('Tip: in MongoDB Atlas -> Network Access, add your current IP address (or 0.0.0.0/0 while testing).');
  process.exit(1);
}

if (!(await ensureOwner())) console.log('An owner login already exists');
await ensureServices({ force: true });
await upgradeSampleServices();
console.log('Seed done');
await mongoose.disconnect();
