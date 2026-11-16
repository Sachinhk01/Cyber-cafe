// npm run cleanup -> run the document clean-up now (it also runs every 6 hours inside the server)
import 'dotenv/config';
import mongoose from 'mongoose';
import { runCleanup } from '../lib/cleanup.js';

await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cyber_cafe');
console.log(await runCleanup());
await mongoose.disconnect();
