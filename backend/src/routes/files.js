import { Router } from 'express';
import { Document } from '../models.js';
import { ah, auth, isAdminRole, HttpError } from '../lib/auth.js';
import { sendDocument } from '../lib/upload.js';
import { audit } from '../lib/audit.js';

const r = Router();

// Private documents: only the owner of the file or cafe admins can open them.
// GET /api/files/:id             -> open in the browser
// GET /api/files/:id?download=1  -> save to the device (A1, F3, and customers saving their own files)
r.get(
  '/:id',
  auth(),
  ah(async (req, res) => {
    const doc = await Document.findById(req.params.id).catch(() => null);
    if (!doc) throw new HttpError(404, 'File not found. It may have been deleted after the retention period.');
    const admin = isAdminRole(req.user.role);
    if (!admin && String(doc.user) !== req.user.id) throw new HttpError(403, 'Not your file.');
    const download = req.query.download === '1';
    // D8: record every time staff open a customer's document
    if (admin) {
      await audit(req, download ? 'document.downloaded' : 'document.viewed', {
        targetType: doc.order ? 'order' : 'printJob',
        targetId: doc.order || doc.printJob,
        summary: `${doc.label || 'File'}: ${doc.originalName || ''}`,
      });
    }
    await sendDocument(res, doc, { download });
  })
);

export default r;
