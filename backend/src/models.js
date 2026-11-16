import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const ts = { timestamps: true };

export const ORDER_STATUSES = ['PendingPayment', 'Submitted', 'In Progress', 'Completed', 'Rejected'];
export const PRINT_STATUSES = ['PendingPayment', 'Pending', 'Printing', 'Ready', 'Collected'];
export const ADMIN_ROLES = ['staff', 'owner'];
export const PAYMENT_STATES = ['Pending', 'Paid', 'Failed', 'Refunded'];
export const SERVICE_CATEGORIES = ['Identity', 'Finance', 'Applications', 'Printing', 'Other'];

// E3: which status may follow which. Rejected is final; a Completed order can be re-opened.
export const ORDER_TRANSITIONS = {
  Submitted: ['In Progress', 'Rejected'],
  'In Progress': ['Completed', 'Rejected'],
  Completed: ['In Progress'],
  Rejected: [],
};

// C5: bump this when the privacy policy text changes, so new consent is recorded
export const PRIVACY_VERSION = '2026-11';

export const User = model(
  'User',
  new Schema(
    {
      name: { type: String, required: true, trim: true },
      mobile: { type: String, unique: true, sparse: true, trim: true },
      email: { type: String, lowercase: true, trim: true },
      role: { type: String, enum: ['customer', ...ADMIN_ROLES], default: 'customer' },
      passwordHash: { type: String, select: false },
      // D7: raising this number signs the user out everywhere
      tokenVersion: { type: Number, default: 0 },
      // D6: admin lockout after repeated wrong passwords
      failedLogins: { type: Number, default: 0 },
      lockUntil: Date,
      // D5: owner still on the default password from the seed
      mustChangePassword: { type: Boolean, default: false },
      // C5: consent record
      consentAt: Date,
      consentVersion: String,
      deletedAt: Date, // C5: customer deleted their account (personal data removed)
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
    sentAt: Date,
    // D1: per-number hourly cap (works on shared WiFi, unlike an IP limit)
    hourStart: Date,
    hourCount: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  })
);

export const Service = model(
  'Service',
  new Schema(
    {
      name: { type: String, required: true, trim: true },
      category: { type: String, enum: SERVICE_CATEGORIES, default: 'Other' },
      description: { type: String, default: '' },
      price: { type: Number, required: true, min: 0 },
      requiredDocs: [{ type: String, trim: true }],
      detailFields: [{ type: String, trim: true }],
      // A2: the procedure the customer sees before uploading and paying
      steps: [{ type: String, trim: true }],
      processingTime: { type: String, default: '' }, // shown as text, e.g. "1-2 days"
      processingDays: { type: Number, default: 0 }, // used for the expected date
      included: [{ type: String, trim: true }],
      notIncluded: [{ type: String, trim: true }], // e.g. government fees paid separately
      notes: { type: String, default: '' },
      terms: { type: String, default: '' },
      isActive: { type: Boolean, default: true },
    },
    ts
  )
);

const historySchema = new Schema(
  {
    status: String,
    note: String,
    by: String, // name of the person, or "Customer" / "System"
    byRole: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

export const Order = model(
  'Order',
  new Schema(
    {
      orderNo: { type: String, index: true },
      user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      service: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
      serviceName: String,
      details: { type: Map, of: String, default: {} },
      totalAmount: { type: Number, required: true },
      docsUploaded: { type: Number, default: 0 },
      status: { type: String, enum: ORDER_STATUSES, default: 'PendingPayment' },
      paymentStatus: { type: String, enum: PAYMENT_STATES, default: 'Pending' },
      remark: { type: String, default: '' },
      receiptNo: String,
      paidAt: Date,
      agreedToTermsAt: Date, // A2: customer ticked "I agree"
      // E2: tracking
      history: [historySchema],
      expectedBy: Date,
      referenceNo: { type: String, default: '' }, // application / acknowledgement number
      // B3: cancellation request on a paid order
      cancelRequest: {
        status: { type: String, enum: ['None', 'Requested', 'Approved', 'Declined'], default: 'None' },
        reason: String,
        at: Date,
        decidedAt: Date,
        decidedBy: String,
        note: String,
      },
    },
    ts
  )
);

export const PrintJob = model(
  'PrintJob',
  new Schema(
    {
      jobNo: String,
      user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      fileName: String,
      pages: { type: Number, default: 1 },
      copies: { type: Number, default: 1, min: 1, max: 100 },
      colorMode: { type: String, enum: ['bw', 'color'], default: 'bw' },
      paperSize: { type: String, enum: ['A4', 'A3'], default: 'A4' },
      price: { type: Number, required: true },
      status: { type: String, enum: PRINT_STATUSES, default: 'PendingPayment' },
      paymentStatus: { type: String, enum: PAYMENT_STATES, default: 'Pending' },
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
      paidAt: { type: Date, index: true }, // when it succeeded (used for revenue)
      mock: { type: Boolean, default: false },
      duplicate: { type: Boolean, default: false }, // paid twice for the same item: refund it
      refund: {
        status: { type: String, enum: ['None', 'Processed', 'Failed'], default: 'None' },
        amount: Number,
        razorpayRefundId: String,
        reason: String,
        at: Date,
      },
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
    // upload = customer's document, print = file to print, result = finished work from the cafe (E1)
    kind: { type: String, enum: ['upload', 'print', 'result'], default: 'upload' },
    label: String,
    fileUrl: { type: String, required: true }, // path on disk
    originalName: String,
    type: String, // mime type
    size: Number,
    encrypted: { type: Boolean, default: false }, // C3: AES-256-GCM at rest
    uploadedBy: String,
    uploadedAt: { type: Date, default: Date.now },
    expiresAt: Date, // set when the order finishes; cleanup job deletes after this
  })
);

// D8: who did what
export const AuditLog = model(
  'AuditLog',
  new Schema({
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    actorName: String,
    actorRole: String,
    action: { type: String, index: true },
    targetType: String,
    targetId: String,
    summary: String,
    ip: String,
    at: { type: Date, default: Date.now, index: true },
  })
);

// E4: every SMS / email we try to send, so failures are visible and retried
export const Notification = model(
  'Notification',
  new Schema(
    {
      user: { type: Schema.Types.ObjectId, ref: 'User' },
      channel: { type: String, enum: ['sms', 'email'] },
      to: String,
      subject: String,
      text: String,
      status: { type: String, enum: ['sent', 'failed', 'gave-up'], default: 'sent', index: true },
      attempts: { type: Number, default: 1 },
      lastError: String,
    },
    ts
  )
);

// Running numbers for orders (CC-1001) and print jobs (PR-1001)
const Counter = model('Counter', new Schema({ _id: String, seq: { type: Number, default: 0 } }));
export async function nextNumber(name, prefix) {
  const c = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return `${prefix}-${1000 + c.seq}`; // CC-1001, CC-1002 ...
}

export const Settings = model(
  'Settings',
  new Schema({
    key: { type: String, unique: true, default: 'main' },
    printRates: {
      bw: { A4: { type: Number, default: 2 }, A3: { type: Number, default: 5 } },
      color: { A4: { type: Number, default: 10 }, A3: { type: Number, default: 20 } },
    },
    retentionDays: { type: Number, default: 30 },
    // Shown in the app header and the "visit us" card
    cafeName: { type: String, default: 'Cyber Cafe' },
    cafePhone: { type: String, default: '' },
    cafeAddress: { type: String, default: '' },
    openTime: { type: String, default: '09:00' },
    closeTime: { type: String, default: '20:00' },
    openDays: { type: [Number], default: [1, 2, 3, 4, 5, 6] }, // 0 = Sunday
    heroImage: { type: String, default: '' },
    // B3: published refund policy
    refundPolicy: {
      type: String,
      default:
        'You can cancel an unpaid order at any time. After you pay, you can request a cancellation from the order page until we start working on it; we refund the full service charge. If we reject an order, we refund the full amount. Government or third-party fees already paid on your behalf cannot be refunded. Refunds reach your account in 5-7 working days.',
    },
    seededAt: Date,
  })
);

export async function getSettings() {
  let s = await Settings.findOne({ key: 'main' });
  if (!s) s = await Settings.create({ key: 'main' });
  return s;
}
