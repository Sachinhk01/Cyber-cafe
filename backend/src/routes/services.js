import { Router } from 'express';
import { Service } from '../models.js';
import { ah, auth, HttpError } from '../lib/auth.js';

const r = Router();

const toList = (v) =>
  (Array.isArray(v) ? v : String(v || '').split(','))
    .map((s) => String(s).trim())
    .filter(Boolean);

function parseService(body) {
  const name = String(body.name || '').trim();
  const price = Number(body.price);
  if (!name) throw new HttpError(400, 'Service name is required.');
  if (!Number.isFinite(price) || price < 0) throw new HttpError(400, 'Enter a valid price.');
  return {
    name,
    description: String(body.description || '').trim(),
    price,
    requiredDocs: toList(body.requiredDocs),
    detailFields: toList(body.detailFields),
    isActive: body.isActive !== false,
  };
}

// FR-6 / FR-9: active services for customers
r.get(
  '/',
  ah(async (req, res) => {
    res.json(await Service.find({ isActive: true }).sort({ name: 1 }));
  })
);

// Admin: all services including inactive
r.get(
  '/all',
  auth(['owner', 'staff']),
  ah(async (req, res) => {
    res.json(await Service.find().sort({ name: 1 }));
  })
);

r.get(
  '/:id',
  ah(async (req, res) => {
    const s = await Service.findById(req.params.id).catch(() => null);
    if (!s || !s.isActive) throw new HttpError(404, 'Service not found.');
    res.json(s);
  })
);

// FR-25 CRUD (owner only)
r.post(
  '/',
  auth(['owner']),
  ah(async (req, res) => {
    res.status(201).json(await Service.create(parseService(req.body)));
  })
);

r.put(
  '/:id',
  auth(['owner']),
  ah(async (req, res) => {
    const s = await Service.findByIdAndUpdate(req.params.id, parseService(req.body), { new: true });
    if (!s) throw new HttpError(404, 'Service not found.');
    res.json(s);
  })
);

// Soft delete keeps old orders readable
r.delete(
  '/:id',
  auth(['owner']),
  ah(async (req, res) => {
    await Service.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ ok: true });
  })
);

export default r;
