// npm run backup                      -> make a backup now
// npm run restore -- <file.json.gz.enc>   -> replace the database with a backup (asks for --yes)
import 'dotenv/config';
import mongoose from 'mongoose';
import { runBackup, restoreBackup } from '../lib/backup.js';

const [cmd, file, flag] = process.argv.slice(2);
await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cyber_cafe');
try {
  if (cmd === 'restore') {
    if (!file) throw new Error('Give the backup file: npm run restore -- backups/cyber-cafe-YYYY-MM-DD.json.gz.enc --yes');
    if (flag !== '--yes') throw new Error('Restore replaces ALL current data. Run again with --yes at the end to confirm.');
    await restoreBackup(file);
    console.log('Restore done.');
  } else {
    await runBackup();
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
