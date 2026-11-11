import { Router } from 'express';
import { Order, Service, Document, Payment } from '../models.js';
import { ah, auth, HttpError } from '../lib/auth.js';
import { upload, removeFile } from '../lib/upload.js';

const r = Router();
r.use(auth(['customer']));

// FR-10..13: create order with uploaded documents. Files come as doc_0, doc_1 ... matching service.requiredDocs.
r.post(
  '/',
  upload.any(),
  ah(async (req, res) => {
    const files = req.files || [];
    const cleanup = () => files.forEach((f) => removeFile(f.path));
    try {
      const service = await Service.findById(req.body.serviceId).catch(() => null);
      if (!service || !service.isActive) throw new HttpError(404, 'Service not found.');

      const byField = Object.fromEntries(files.map((f) => [f.fieldname, f]));
      const missing = service.requiredDocs.filter((_, i) => !byField[`doc_${i}`]);
      if (missing.length) throw new HttpError(400, `Upload these documents: ${missing.join(', ')}.`);

      let details = {};
      try {
        details = JSON.parse(req.body.details || '{}');
      } catch {
        throw new HttpError(400, 'Details are not in the right format.');
      }
      const emptyField = service.detailFields.find((f) => !String(details[f] || '').trim());
      if (emptyField) throw new HttpError(400, `Fill in "${emptyField}".`);
      const cleanDetails = Object.fromEntries(service.detailFields.map((f) => [f, String(details[f]).trim()]));

      const order = await Order.create({
        user: req.user.id,
        service: service._id,
        serviceName: service.name,
        details: cleanDetails,
        totalAmount: service.price,
      });

      await Document.insertMany(
        service.requiredDocs.map((label, i) => {
          const f = byField[`doc_${i}`];
          return {
            user: req.user.id,
            order: order._id,
            label,
            fileUrl: f.path,
            originalName: f.originalname,
            type: f.mimetype,
            size: f.size,
          };
        })
      );
      res.status(201).json(order);
    } catch (e) {
      cleanup();
      throw e;
    }
  })
);

// FR-7: my orders
r.get(
  '/',
  ah(async (req, res) => {
    res.json(await Order.find({ user: req.user.id }).sort({ createdAt: -1 }));
  })
);

r.get(
  '/:id',
  ah(async (req, res) => {
    const order = await Order.findOne({ _id: req.params.id, user: req.user.id }).catch(() => null);
    if (!order) throw new HttpError(404, 'Order not found.');
    const [documents, payments] = await Promise.all([
      Document.find({ order: order._id }).select('-fileUrl'),
      Payment.find({ order: order._id }).sort({ createdAt: -1 }),
    ]);
    res.json({ order, documents, payments });
  })
);

export default r;
