# v1.3: loophole fixes + new design

## The two problems you reported
- **Customers can now save their PDFs back.** Every uploaded document and print file has **View** and **Download** on the order page and in My orders > Print jobs. The print dialog also has a preview.
- **Services now show properly.** There's a **Services** page (sidebar) with category tabs (Identity, Finance, Applications, Printing) and search. Each service opens a detail page with *how it works*, documents needed, *included / not included*, processing time, notes and terms, before any upload or payment. The server also creates the sample services on first start, so the list is never empty.

## Loophole checklist status

| ID | Status | What changed |
|---|---|---|
| A1 | Fixed | Admin **Download** (and View) for every order document and print-queue file. |
| A2 | Fixed | Services have category, steps, processing time / days, included, not included (govt fees), notes, terms. Shown before upload; "I agree" checkbox required (time recorded on the order). |
| B1 | Fixed | In production the server refuses to start without Razorpay keys; test payments are impossible there. |
| B2 | Fixed | Webhook secret required in production. Plus a safety net: pending payments are checked with Razorpay every 5 minutes and whenever the customer opens the order or payments page. |
| B3 | Fixed | "Reject and refund" in one step (owner). Customers can request cancellation of a paid order until work starts; owner approves (auto refund) or declines. Refund policy is editable, shown before payment and at /refund-policy. Rejected-but-not-refunded orders show on the dashboard. |
| B4 | Fixed | At most 2 open free requests per customer (`MAX_OPEN_FREE_ORDERS`), plus the D2 limits. |
| C1 | Needs your hosting decision | Upload folder is configurable (`UPLOAD_DIR`); README explains using a persistent disk. Cloud storage (S3/Cloudinary) would need an extra package. |
| C2 | Mostly fixed | Backups are encrypted, and the owner can download one from Settings to keep off the server. Uploaded files still need their own disk backup; use an external scheduler on hosts that sleep. |
| C3 | Fixed | Every upload is encrypted on disk with AES-256-GCM (`FILE_ENCRYPTION_KEY`). Older unencrypted files still open. |
| C4 | Reduced | Files are checked by real content and served with `nosniff` + a sandbox policy. Virus scanning (ClamAV) needs a separate server program. |
| C5 | Fixed (have a lawyer check the text) | Privacy policy page, consent checkbox at sign-up (time + version recorded), download my data, delete my account. |
| D1 | Fixed | OTP limit is now per mobile number (30 s apart, 5 per hour); the per-IP limit is generous, so shared cafe WiFi is fine. |
| D2 | Fixed | Upload rate limit per login; max 5 unpaid orders and 5 unpaid print jobs per customer. |
| D3 | Fixed | Account is created only after the OTP is verified. |
| D4 | Fixed | One login flow for everyone; no "no account with this number" message. |
| D5 | Fixed | Owner on the default/weak password sees a red banner until they change it. Strong passwords (10+, letters + numbers) for owner and staff; new staff must change theirs. Live server won't start with the default password. |
| D6 | Fixed (no 2FA) | 5 wrong passwords lock the login for 15 minutes (recorded in the activity log). |
| D7 | Fixed | Customer sessions 3 days, staff 12 hours; every request is checked against the database. "Log out everywhere", password changes and account deletion end old sessions immediately. |
| D8 | Fixed | Activity log (owner): document views/downloads, status changes, files sent, refunds, cancellations, services, settings, staff, backups. |
| E1 | Fixed | Admin sends finished files (up to 5 at a time) to the order; the customer downloads them under "Ready for you" and is notified. |
| E2 | Fixed | Order numbers (CC-1001), status timeline with who and when, expected date (from the service's days, editable), reference / acknowledgement number. |
| E3 | Fixed | Allowed moves only: Submitted -> In Progress / Rejected, In Progress -> Completed / Rejected, Completed -> In Progress (owner). Rejected is final. Print queue moves are checked too. |
| E4 | Fixed | Every SMS/email is logged. Failures are retried every 10 minutes (3 tries), counted on the dashboard, listed in Activity with "Retry all now". |
| F1 | Fixed (clear message) | Word files get "save as PDF first" before and during upload. Converting on the server would need LibreOffice. |
| F2 | Fixed | Page count before paying, plus a preview of the file. |
| F3 | Fixed | Same as A1. |

## New design
White and cream background, deep green brand, serif headings and soft colour tiles, following your template: left sidebar (Overview, Services, My orders, Print services, Payments) with "Need a hand?", a top bar with "Open today · Until 8 PM", a hero banner, stat cards, service cards with tabs and ⌘K search, the "New print request" dialog, recent orders, a "Prefer a friendly face?" card and a payments table. The admin panel uses the same style. Animations: page fade-in, staggered cards, hover lift, dialog pop, progress bars, payment confirmation. Mobile gets a slide-out menu and a bottom tab bar.

Owner settings now include cafe name, phone, address, opening days and hours, and an optional banner photo.

## Upgrade notes
- No manual database migration. Existing services get the sample steps if their name matches; edit the rest in Admin > Services.
- Add `FILE_ENCRYPTION_KEY` to `.env` before going live (see `.env.example`). In development a key is created in `backend/.file-key`; **don't lose it** or encrypted files can't be opened.
- Your `.env` still has `JWT_EXPIRES_IN=7d`; change it to `3d` for the shorter customer sessions.
- Run `npm install` in both folders (no new packages were added).

# Changes in this update (v1.1)

## Fixes
- Revenue, "today", "this month", order date filters and the monthly Excel report now use India time. Before, a server running in UTC (Render, Railway) counted 12:00-5:30 AM payments on the wrong day.
- Revenue is counted on the day the payment succeeded (new `paidAt` on payments), and refunds are taken off.
- Uploads are checked by their real content (PDF/JPG/PNG signature), not only by the type the browser reports.
- Detail fields with a dot in the name (e.g. "D.O.B") crashed order creation with a server error. They are now rejected in the service form, and old services with dots still work.
- Duplicate document or detail names in a service are rejected.
- Extra uploaded files that don't match a required document are no longer left on disk.
- Paying twice for the same order no longer overwrites the receipt number; the second payment is flagged "Paid twice" for refund.
- Removing a staff login now locks it out immediately (before, the token kept working for up to 7 days).
- Moving a finished order back to Submitted / In Progress no longer lets its documents be deleted.
- Saving an order with no change no longer sends the customer a notification.
- Session expiry now logs the user out cleanly in the app.
- OTP: one code per number every 30 seconds; in production, a failed SMS shows an error instead of silently "sending".

## New
- Real SMS/OTP providers: Fast2SMS, MSG91, Twilio (`SMS_PROVIDER` in `.env`).
- PDF receipts (FR-18): download from the receipt page, attached to the payment email, admin copy from Payments.
- Refunds from the admin panel (full or part, through Razorpay; test payments refund instantly). Customer is notified; order shows "Refunded".
- Services: real delete when a service has never been ordered; otherwise it is hidden. Hidden services can be shown again.
- Customers can cancel an unpaid order (its documents are deleted).
- Privacy: documents of unpaid orders are deleted after `DRAFT_DAYS` (default 3). The order form tells the customer exactly how long documents are kept.
- Daily database backup with 14-day rotation, plus `npm run backup` / `npm run restore` / `npm run cleanup`.
- HTTPS redirect in production and a minimum JWT secret length.
- Monthly Excel report: refunds and net revenue, plus a "By service" sheet. Customers page shows paying customers per month.
- Dashboard shows double payments waiting for a refund.
- `vercel.json` / `_redirects` so page refreshes work after deploying the frontend.

## No database migration needed
New fields have defaults. Old payments without `paidAt` fall back to their last update time in reports.

# v1.2: new design

- New look across the customer app and admin panel: stamp-ink indigo and marigold palette,
  Bricolage Grotesque headings, Figtree body text, full dark mode.
- Customer app: login page with a printer that prints a "READY" ticket; greeting banner with
  live counts; searchable service cards with an icon per service; orders and print jobs in tabs;
  phone bottom tab bar.
- Ordering: drag-and-drop upload boxes that check type and size as soon as a file is picked,
  3-step progress (Documents, Review, Pay), receipt-style review ticket, striped upload progress.
- Order tracking: animated tracker (Submitted, In Progress, Completed) and a note from the cafe.
- Printing: colour and paper as tap buttons showing per-page rates, copies stepper, price that rolls
  to the new value as options change, sticky price summary.
- Payments: a "PAID" rubber stamp after a successful payment; receipts shown as perforated
  tickets with a large pickup code.
- Admin: indigo sidebar, dashboard with counting stats, animated revenue chart and per-service bars;
  print queue as a board (Waiting, Printing, Ready for pickup) that refreshes every 30 seconds;
  refund form in a dialog; customer search; status changes as tap buttons.
- Loading skeletons, empty states with next steps, and reduced-motion support.
- Backend: a clear tip about Atlas Network Access when MongoDB cannot be reached (server and seed).
- `.env.example` no longer contains real database credentials.
