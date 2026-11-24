# Cyber Cafe Web Platform (v1.3)

Customer app + admin panel + API, built from the SRS v1.0.

- `backend/`  Node.js + Express + MongoDB (Mongoose)
- `frontend/` React + Vite

## 1. Requirements

- Node.js 18 or newer (20 LTS recommended)
- A MongoDB database. `backend/.env` is not in Git: copy `.env.example` to `.env` and set `MONGO_URI` and `JWT_SECRET`.

## 2. Run the backend

```bash
cd backend
npm install
npm run dev                 # API on http://localhost:5000
```

On the first start the server creates the owner login (from `.env`) and 10 sample services with their
full procedure, so the Services page is never empty. (`npm run seed` does the same by hand.)

**Test everything in one go** (use a test database, test payments on, no SMS provider):

```bash
npm run smoke -- --yes      # 90 API checks: login, ordering, downloads, payments, refunds, admin, limits
```

**If you see "Could not connect to MongoDB"**: open MongoDB Atlas → *Network Access* → *Add IP Address* and add your current IP
(or `0.0.0.0/0` while testing). Atlas blocks every IP that is not on this list. Then run the command again.

## 3. Run the frontend (in a second terminal)

```bash
cd frontend
npm install
npm run dev                 # app on http://localhost:5173
```

Vite forwards `/api` to the backend, so no extra config is needed in development.
For a production build: `npm run build` (output in `frontend/dist`).

## 4. Try the full flow

**Customer**
1. Open http://localhost:5173 and create an account (name, username, mobile, password), or log in.
2. No SMS provider yet, so SMS updates print in the backend console.
3. Open **Services**, pick one, read how it works and what's included, upload the documents, review, tick "I agree", then pay.
   Your uploaded files can be viewed or downloaded again from the order page; files the cafe sends back appear under "Ready for you".
4. With no Razorpay keys the app opens a **test payment** box: choose "Pay successfully" or "Simulate failure". After a failure, open the order and pay again; documents are not re-uploaded.
5. **New print request** (Overview) or **Print services**: upload a PDF, see the preview and page count, change copies / colour / paper, then pay. You get a 4-digit pickup code. The file can be downloaded again from My orders > Print jobs.
6. **Payments** shows every payment; tap the download icon for the PDF receipt. The same PDF is emailed after each payment when SMTP is set up.
7. An unpaid order can be cancelled from its page. A paid order can get a **Request cancellation** until work starts.
8. **Profile**: download my data, log out everywhere, delete my account.

**Admin** (http://localhost:5173/admin/login, owner email and password from `.env`)
1. **Orders**: search and filter, open an order, **View / Download** the documents, move it to the next allowed status, add a reference number, expected date and a note, **send finished files** to the customer, or **Reject and refund**. The customer is notified.
2. **Print queue**: View / Download the file → Start printing → Mark ready → enter the customer's pickup code → Hand over.
3. **Services**: category, price, processing time, steps, what's included / not included, notes and terms.
4. **Payments**: every transaction, PDF receipt, and **Refund** (full or part). A customer who paid twice for the same item is flagged "Paid twice".
5. **Customers**, **Dashboard** (today/month revenue after refunds, 14-day chart, orders per service).
6. **Customers → Export to Excel** downloads the monthly report: new customers, transactions with refunds, and a per-service summary.
7. **Services → Delete**: a service that was never ordered is deleted; one with orders is hidden so old orders stay readable. Hidden services have a **Show** button.
8. **Activity**: who opened which document, changed a status or refunded; SMS/emails that failed (with Retry).
9. **Settings**: cafe name, phone, address, opening hours, banner photo, print rates, retention days, refund policy, staff logins, change password, download an encrypted backup.

## Roles

| Role | Login | Can use |
|---|---|---|
| Customer | Username + password | Services, orders, print, receipts, profile |
| Staff | Email + password | Orders, print queue |
| Owner | Email + password | Everything, including revenue, payments, customers, reports, settings |

## Going live

- **Required on a live server** (`NODE_ENV=production`), or it refuses to start: Razorpay keys + webhook secret, `FILE_ENCRYPTION_KEY`, a `JWT_SECRET` of 32+ characters, and an `ADMIN_PASSWORD` that isn't the default.
- **Razorpay**: put `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (test keys first) in `backend/.env`. In the Razorpay dashboard add a webhook to `https://YOUR-API/api/payments/webhook` with events `payment.captured` and `payment.failed`, and copy its secret into `RAZORPAY_WEBHOOK_SECRET`.
- **OTP / SMS**: set `SMS_PROVIDER` to `fast2sms`, `msg91` or `twilio` and fill that provider's keys in `.env` (see `.env.example`). Indian SMS needs DLT-registered templates for status messages; Fast2SMS's OTP route works without one. Set `NODE_ENV=production` so OTPs stop showing on screen. One code per number every 30 seconds.
- **Email**: fill the `SMTP_*` values (Gmail app password or Google Workspace).
- **Files**: uploads are encrypted (AES-256-GCM) and saved to `UPLOAD_DIR` (private, served only to the file owner and admins). Free Render/Railway plans wipe the disk on every deploy: use a persistent disk (e.g. a Render disk mounted at `/var/data`, `UPLOAD_DIR=/var/data/uploads`). Keep `FILE_ENCRYPTION_KEY` safe; without it the files can't be opened.
- **Hosting**: frontend on Vercel (set `VITE_API_URL` to the API URL; `vercel.json` handles page refreshes), backend on Render or Railway, database on MongoDB Atlas. Set `CLIENT_URL` in the backend to the frontend URL. In production the API redirects to HTTPS and needs a `JWT_SECRET` of at least 32 characters.
- **Receipts**: fill `CAFE_NAME`, `CAFE_ADDRESS`, `CAFE_PHONE` (and `CAFE_GSTIN` if you have one) so they print on PDF receipts.
- **Backups**: the server saves one encrypted backup a day to `backups/` and keeps 14 (`BACKUP_DIR`, `BACKUP_KEEP`). The owner can also download one from Settings to keep off the server. Run one now with `npm run backup`; restore with `npm run restore -- backups/cyber-cafe-YYYY-MM-DD.json.gz.enc --yes`. Also turn on MongoDB Atlas backups and back up the uploads disk. A host that sleeps can skip a day, so schedule `npm run backup` externally too.
- **Privacy clean-up**: documents of finished orders are deleted after the retention days in Settings; documents of unpaid orders after `DRAFT_DAYS` (default 3). Run it by hand with `npm run cleanup`.

## Where things are

```
backend/src
  server.js          app setup, security, routes
  models.js          User, Service, Order, PrintJob, Payment, Document, Settings
  seed.js            owner account + sample services
  lib/auth.js        JWT + role checks (checked against the database on every request)
  lib/crypto.js      AES-256-GCM encryption for documents and backups
  lib/audit.js       activity log
  lib/seedData.js    owner login + sample services with steps, auto-run on first start
  lib/upload.js      file type/size validation (PDF, JPG, PNG)
  lib/payments.js    Razorpay, signature checks, mock mode
  lib/notify.js      email + SMS + OTP (Fast2SMS, MSG91, Twilio)
  lib/cleanup.js     deletes documents after the retention period and of unpaid drafts
  lib/invoice.js     PDF receipts
  lib/backup.js      daily backup + restore
  lib/time.js        India-time date helpers for reports
  scripts/           backup, restore and cleanup commands
backend/scripts/smoke-test.js   end-to-end API test (npm run smoke -- --yes)
  routes/            auth, services, orders, print, payments, files, admin
frontend/src
  main.jsx           routes
  styles.css         design system: white + cream, deep green, serif headings, cards, animations
  icons.jsx          inline SVG icons + automatic icon per service
  api.js             API calls, uploads with progress, private file viewing
  auth.jsx           login state + protected routes
  components.jsx     sidebar layout + phone tab bar, cafe hours, file view/download, preview,
                     payment button, upload dropzone, modals, animated numbers, loaders
  pages/Customer.jsx customer screens
  pages/Admin.jsx    admin screens
  pages/Legal.jsx    privacy policy and refund policy pages
```

## Not in v1 (from the SRS "later release" list)

Subscriptions and WhatsApp notifications. Refunds are now in the admin panel (Payments → Refund).
"# Cyber-cafe" 
