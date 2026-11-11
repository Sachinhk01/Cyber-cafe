import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  // random names so files can't be guessed; originals are kept in the DB
  filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + (ALLOWED[file.mimetype] || '')),
});

export const upload = multer({
  storage,
  limits: { fileSize: Number(process.env.MAX_FILE_MB || 10) * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED[file.mimetype]) return cb(null, true);
    const err = new Error(`"${file.originalname}" is not allowed. Upload a PDF, JPG or PNG.`);
    err.status = 400;
    cb(err);
  },
});

export function removeFile(filePath) {
  fs.promises.unlink(filePath).catch(() => {});
}
