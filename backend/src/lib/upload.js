import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { encryptFileInPlace, readStoredFile } from './crypto.js';

// C1: point UPLOAD_DIR at a persistent disk in production (e.g. a Render disk mounted at /var/data/uploads)
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 10);

const ALLOWED = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  // random names so files can't be guessed; originals are kept in the DB
  filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + (ALLOWED[file.mimetype] || '') + '.bin'),
});

export const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 10, fields: 50 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED[file.mimetype]) return cb(null, true);
    const isWord = /\.(docx?|odt|rtf)$/i.test(file.originalname);
    const err = new Error(
      isWord
        ? `"${file.originalname}" is a Word file. Save it as PDF first (in Word: File > Save As > PDF), then upload the PDF.`
        : `"${file.originalname}" is not allowed. Upload a PDF, JPG or PNG.`
    );
    err.status = 400;
    cb(err);
  },
});

export function removeFile(filePath) {
  if (filePath) fs.promises.unlink(filePath).catch(() => {});
}

// The browser decides the mime type, so check the file's first bytes too.
// Stops e.g. an .exe renamed to .pdf from being stored and opened by staff.
const SIGNATURES = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
};

export async function hasValidSignature(filePath, mimetype) {
  const sigs = SIGNATURES[mimetype];
  if (!sigs) return false;
  const fh = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(1024);
    const { bytesRead } = await fh.read(buf, 0, 1024, 0);
    const head = buf.subarray(0, bytesRead);
    if (mimetype === 'application/pdf') {
      // PDFs may have a few junk bytes before %PDF
      return head.indexOf(Buffer.from('%PDF')) !== -1;
    }
    return sigs.some((sig) => sig.every((b, i) => head[i] === b));
  } finally {
    await fh.close();
  }
}

// Throws a 400 for the first file whose content does not match its type.
export async function assertRealFiles(files) {
  for (const f of files) {
    if (!(await hasValidSignature(f.path, f.mimetype))) {
      const err = new Error(`"${f.originalname}" is not a real PDF, JPG or PNG file.`);
      err.status = 400;
      throw err;
    }
  }
}

// C3: encrypt every accepted upload before its Document record is saved
export async function encryptUploads(files) {
  for (const f of files) await encryptFileInPlace(f.path);
}

// Fields for a Document record from a multer file
export const docFields = (f) => ({
  fileUrl: f.path,
  originalName: f.originalname,
  type: f.mimetype,
  size: f.size,
  encrypted: true,
});

const safeName = (name) => String(name || 'file').replace(/[\r\n"\\]/g, '_');

// A1 / F3: send a stored document. ?download=1 saves it, otherwise it opens in the browser.
export async function sendDocument(res, doc, { download = false } = {}) {
  let data;
  try {
    data = await readStoredFile(doc);
  } catch {
    return res.status(404).json({ error: 'This file is missing on the server or could not be decrypted.' });
  }
  const name = safeName(doc.originalName);
  res.setHeader('Content-Type', doc.type || 'application/octet-stream');
  res.setHeader('Content-Length', data.length);
  res.setHeader(
    'Content-Disposition',
    `${download ? 'attachment' : 'inline'}; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`
  );
  // C4: never let the browser guess the type, and run any opened file in a locked-down sandbox
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self' data: blob:; style-src 'unsafe-inline'");
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(data);
}
