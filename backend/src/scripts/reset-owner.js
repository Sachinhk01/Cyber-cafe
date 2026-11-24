// Emergency: set a new owner password from the server terminal (no email needed).
// Usage: npm run reset-owner -- "NewStrongPassword2026"
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../models.js';
import { checkStrongPassword } from '../lib/auth.js';

const next = process.argv[2];
const problem = checkStrongPassword(next);
if (problem) {
  console.error(`Password not accepted: ${problem}\nUsage: npm run reset-owner -- "NewStrongPassword2026"`);
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cyber_cafe');
const owner = await User.findOne({ role: 'owner' }).select('+passwordHash');
if (!owner) {
  console.error('No owner account found. Start the server once to create it.');
  await mongoose.disconnect();
  process.exit(1);
}
owner.passwordHash = await bcrypt.hash(next, 10);
owner.mustChangePassword = false;
owner.failedLogins = 0;
owner.lockUntil = undefined;
owner.tokenVersion = (owner.tokenVersion || 0) + 1;
await owner.save();
console.log(`Password changed for ${owner.email}. Log in with the new password.`);
await mongoose.disconnect();
