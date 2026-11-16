// C5 + B3: public privacy policy and refund policy pages.
// The privacy text is a plain-language starting point; have it checked by a lawyer for the DPDP Act.
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useCafe, Eyebrow, BackLink } from '../components.jsx';

export function Privacy() {
  const cafe = useCafe();
  const { user } = useAuth();
  const name = cafe.cafeName || 'the cafe';
  return (
    <article className="stack-lg narrow">
      <BackLink to={user ? '/profile' : '/login'}>Back</BackLink>
      <div>
        <Eyebrow>Your documents stay yours</Eyebrow>
        <h1 style={{ marginTop: 12 }}>Privacy policy</h1>
        <p className="muted small" style={{ marginTop: 8 }}>
          Version {cafe.privacyVersion || '2026-11'}
        </p>
      </div>
      <div className="card pad-lg stack" style={{ lineHeight: 1.7 }}>
        <Section title="What we collect">
          Your name, mobile number and (if you give it) email; the documents and details you upload for an order; your orders, print jobs and payment records. Payments are processed by Razorpay; we never see or store your card or UPI PIN.
        </Section>
        <Section title="Why we use it">
          Only to do the work you ask for (fill and submit applications, print your files), to send you updates and receipts, and to keep the accounts the law requires.
        </Section>
        <Section title="Who can see your documents">
          Only you and the {name} staff working on your order. Files are encrypted on our server. Every time staff open or download one of your documents, it is recorded.
        </Section>
        <Section title="How long we keep them">
          Uploaded documents are deleted automatically {cafe.retentionDays || 30} days after your order is finished, or {cafe.draftDays || 3} days after you upload them if the order is never paid. Payment records are kept for tax purposes.
        </Section>
        <Section title="Your choices">
          From your <Link to="/profile">profile</Link> you can download a copy of your data, sign out on every device, or delete your account (this deletes your documents and personal details). You can also ask us at the counter{cafe.cafePhone ? ` or on ${cafe.cafePhone}` : ''}.
        </Section>
        <Section title="Contact">
          {name}
          {cafe.cafeAddress ? `, ${cafe.cafeAddress}` : ''}
          {cafe.cafePhone ? ` · ${cafe.cafePhone}` : ''}
        </Section>
      </div>
    </article>
  );
}

export function RefundPolicy() {
  const cafe = useCafe();
  const { user } = useAuth();
  return (
    <article className="stack-lg narrow">
      <BackLink to={user ? '/' : '/login'}>Back</BackLink>
      <div>
        <Eyebrow>Fair and clear</Eyebrow>
        <h1 style={{ marginTop: 12 }}>Refund and cancellation policy</h1>
      </div>
      <div className="card pad-lg stack" style={{ lineHeight: 1.7, whiteSpace: 'pre-line' }}>
        {cafe.refundPolicy || 'Loading…'}
      </div>
    </article>
  );
}

const Section = ({ title, children }) => (
  <section className="stack-sm">
    <h3>{title}</h3>
    <p className="muted">{children}</p>
  </section>
);
