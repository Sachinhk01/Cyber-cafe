import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const ts = { timestamps: true };

export const ORDER_STATUSES = ['PendingPayment', 'Submitted', 'In Progress', 'Completed', 'Rejected'];
export const PRINT_STATUSES = ['PendingPayment', 'Pending', 'Printing', 'Ready', 'Collected'];
export const ADMIN_ROLES = ['staff', 'owner'];

export const User = model(
  'User',
  new Schema(
    {
      name: { type: String, required: true, trim: true },
      mobile: { type: String, unique: true, sparse: true, trim: true },
      email: { type: String, lowercase: true, trim: true },
      role: { type: String, enum: ['customer', ...ADMIN_ROLES], default: 'customer' },
      passwordHash: { type: String, select: false },
    },
    ts
  )
);

export const Otp = model(
  'Otp',
  new Schema({
    mobile: { type: String, required: true, unique: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  })
);

export const Service = model(
  'Service',
  new Schema(
    {
      name: { type: String, required: true, trim: true },
      description: { type: String, default: '' },
      price: { type: Number, required: true, min: 0 },
      requiredDocs: [{ type: String, trim: true }],
      detailFields: [{ type: String, trim: true }],
      isActive: { type: Boolean, default: true },
    },
    ts
  )
);

export const Order = model(
  'Order',
  new Schema(
    {
      user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      service: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
      serviceName: String,
      details: { type: Map, of: String, default: {} },
      totalAmount: { type: Number, required: true },
      status: { type: String, enum: ORDER_STATUSES, default: 'PendingPayment' },
      paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Failed'], default: 'Pending' },
      remark: { type: String, default: '' },
      receiptNo: String,
      paidAt: Date,
    },
    ts
  )
);

export const PrintJob = model(
  'PrintJob',
  new Schema(
    {
      user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      fileName: String,
      pages: { type: Number, default: 1 },
      copies: { type: Number, default: 1, min: 1, max: 100 },
      colorMode: { type: String, enum: ['bw', 'color'], default: 'bw' },
      paperSize: { type: String, enum: ['A4', 'A3'], default: 'A4' },
      price: { type: Number, required: true },
      status: { type: String, enum: PRINT_STATUSES, default: 'PendingPayment' },
      paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Failed'], default: 'Pending' },
      pickupCode: String,
      receiptNo: String,
      paidAt: Date,
    },
    ts
  )
);

export const Payment = model(
  'Payment',
  new Schema(
    {
      user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      kind: { type: String, enum: ['order', 'print'], required: true },
      order: { type: Schema.Types.ObjectId, ref: 'Order' },
      printJob: { type: Schema.Types.ObjectId, ref: 'PrintJob' },
      amount: { type: Number, required: true },
      razorpayOrderId: { type: String, index: true },
      razorpayPaymentId: String,
      status: { type: String, enum: ['Pending', 'Success', 'Failed'], default: 'Pending' },
      mock: { type: Boolean, default: false },
    },
    ts
  )
);

export const Document = model(
  'Document',
  new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    printJob: { type: Schema.Types.ObjectId, ref: 'PrintJob' },
    label: String,
    fileUrl: { type: String, required: true }, // path on disk (or cloud URL later)
    originalName: String,
    type: String, // mime type
    size: Number,
    uploadedAt: { type: Date, default: Date.now },
    expiresAt: Date, // set when the order finishes; cleanup job deletes after this
  })
);

export const Settings = model(
  'Settings',
  new Schema({
    key: { type: String, unique: true, default: 'main' },
    printRates: {
      bw: { A4: { type: Number, default: 2 }, A3: { type: Number, default: 5 } },
      color: { A4: { type: Number, default: 10 }, A3: { type: Number, default: 20 } },
    },
    retentionDays: { type: Number, default: 30 },
  })
);

export async function getSettings() {
  let s = await Settings.findOne({ key: 'main' });
  if (!s) s = await Settings.create({ key: 'main' });
  return s;
}
