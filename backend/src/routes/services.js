import { Router } from 'express';
import { Service, Order, SERVICE_CATEGORIES } from '../models.js';
import { ah, auth, HttpError } from '../lib/auth.js';
import { audit } from '../lib/audit.js';

const r = Router();

const toList = (v) =>
  (Array.isArray(v) ? v : String(v || '').split(','))
    .map((s) => String(s).trim())
    .filter(Boolean);
// Steps / included / not included are written one per line
const toLines = (v) =>
  (Array.isArray(v) ? v : String(v || '').split(/\r?\n/))
    .map((s) => String(s).trim().replace(/^([-*•]|\d+[.)])\s+/, ''))
    .filter(Boolean)
    .slice(0, 20);

function parseService(body) {
  const name = String(body.name || '').trim();
  const price = Number(body.price);
  if (!name) throw new HttpError(400, 'Service name is required.');
  if (!Number.isFinite(price) || price < 0) throw new HttpError(400, 'Enter a valid price.');
  const requiredDocs = toList(body.requiredDocs);
  const detailFields = toList(body.detailFields);
  // Detail fields become keys in the order record; MongoDB does not allow "." or a leading "$" there.
  const bad = detailFields.find((f) => f.includes('.') || f.startsWith('$'));
  if (bad) throw new HttpError(400, `"${bad}": remove the dot or $ from detail field names (e.g. write "DOB" instead of "D.O.B").`);
  const dup = (list) => list.find((x, i) => list.findIndex((y) => y.toLowerCase() === x.toLowerCase()) !== i);
  if (dup(requiredDocs)) throw new HttpError(400, `"${dup(requiredDocs)}" is listed twice in required documents.`);
  if (dup(detailFields)) throw new HttpError(400, `"${dup(detailFields)}" is listed twice in detail fields.`);
  const processingDays = Math.max(0, Math.min(365, parseInt(body.processingDays, 10) || 0));
  return {
    name,
    category: SERVICE_CATEGORIES.includes(body.category) ? body.category : 'Other',
    description: String(body.description || '').trim().slice(0, 500),
    price,
    requiredDocs,
    detailFields,
    // A2: procedure, time, what is and isn't included, notes and terms
    steps: toLines(body.steps),
    processingTime: String(body.processingTime || '').trim().slice(0, 40),
    processingDays,
    included: toLines(body.included),
    notIncluded: toLines(body.notIncluded),
    notes: String(body.notes || '').trim().slice(0, 1500),
    terms: String(body.terms || '').trim().slice(0, 3000),
    isActive: body.isActive !== false,
  };
}

// FR-6 / FR-9: active services for customers
r.get(
  '/',
  ah(async (req, res) => {
    res.json(await Service.find({ isActive: true }).sort({ category: 1, name: 1 }));
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
    const s = await Service.create(parseService(req.body));
    await audit(req, 'service.created', { targetType: 'service', targetId: s._id, summary: `${s.name} (Rs ${s.price})` });
    res.status(201).json(s);
  })
);

r.put(
  '/:id',
  auth(['owner']),
  ah(async (req, res) => {
    const s = await Service.findByIdAndUpdate(req.params.id, parseService(req.body), { new: true }).catch(() => null);
    if (!s) throw new HttpError(404, 'Service not found.');
    await audit(req, 'service.updated', { targetType: 'service', targetId: s._id, summary: `${s.name} (Rs ${s.price}, ${s.isActive ? 'shown' : 'hidden'})` });
    res.json(s);
  })
);

// FR-25 delete: a service with orders is only hidden (keeps old orders readable);
// one that was never ordered is deleted for good.
r.delete(
  '/:id',
  auth(['owner']),
  ah(async (req, res) => {
    const s = await Service.findById(req.params.id).catch(() => null);
    if (!s) throw new HttpError(404, 'Service not found.');
    if (await Order.exists({ service: s._id })) {
      s.isActive = false;
      await s.save();
      await audit(req, 'service.hidden', { targetType: 'service', targetId: s._id, summary: s.name });
      return res.json({ ok: true, hidden: true });
    }
    await s.deleteOne();
    await audit(req, 'service.deleted', { targetType: 'service', targetId: s._id, summary: s.name });
    res.json({ ok: true, deleted: true });
  })
);

export default r;
