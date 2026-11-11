import { Router } from 'express';
import path from 'path';
import { Document } from '../models.js';
import { ah, auth, isAdminRole, HttpError } from '../lib/auth.js';

const r = Router();

// Private documents: only the owner of the file or cafe admins can open them.
r.get(
  '/:id',
  auth(),
  ah(async (req, res) => {
    const doc = await Document.findById(req.params.id).catch(() => null);
    if (!doc) throw new HttpError(404, 'File not found. It may have been deleted after the retention period.');
    if (!isAdminRole(req.user.role) && String(doc.user) !== req.user.id) throw new HttpError(403, 'Not your file.');
    res.setHeader('Content-Type', doc.type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalName || 'file')}"`);
    res.sendFile(path.resolve(doc.fileUrl), (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'File is missing on the server.' });
    });
  })
);

export default r;
