import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, uploadForm, downloadFile, viewDoc, saveDoc, rupees, fmtDate, fmtDay, shortDay, orderRef, printRef } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PasswordInput } from '../PasswordInput.jsx';
import {
  Status,
  ErrorNote,
  SuccessNote,
  PayButton,
  useLoad,
  useCafe,
  Amount,
  CountUp,
  BackLink,
  Eyebrow,
  Empty,
  Skeleton,
  Loading,
  Dropzone,
  FilePreview,
  FileItem,
  Stepper,
  Modal,
  HeroArt,
  VisitArt,
  checkFile,
  openState,
  fmtTime,
  dayRange,
  initials,
} from '../components.jsx';
import { Icon, serviceIcon, serviceTint } from '../icons.jsx';

const CATEGORIES = ['Identity', 'Finance', 'Applications', 'Printing'];
const PROGRESS = { PendingPayment: 0.08, Submitted: 0.34, 'In Progress': 0.66, Completed: 1, Rejected: 1 };
const PRINT_PROGRESS = { PendingPayment: 0.08, Pending: 0.3, Printing: 0.6, Ready: 0.9, Collected: 1 };

function Brand({ light }) {
  const cafe = useCafe();
  return (
    <span className="brand" style={light ? { color: '#fff' } : undefined}>
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="brand-text">
        <span className="brand-name">{(cafe.cafeName || 'Cyber Cafe').toLowerCase()}</span>
        <span className="brand-sub">Cyber Café</span>
      </span>
    </span>
  );
}

/* ---------- Overview (FR-6, FR-7, FR-8) ---------- */
export function Overview() {
  const { user } = useAuth();
  const cafe = useCafe();
  const nav = useNavigate();
  const services = useLoad(() => api('/services'));
  const orders = useLoad(() => api('/orders'));
  const prints = useLoad(() => api('/print'));
  const payments = useLoad(() => api('/payments/mine'));
  const [printOpen, setPrintOpen] = useState(false);

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const active =
    (orders.data?.filter((o) => ['Submitted', 'In Progress'].includes(o.status)).length ?? 0) +
    (prints.data?.filter((j) => ['Pending', 'Printing', 'Ready'].includes(j.status)).length ?? 0);
  const done =
    (orders.data?.filter((o) => o.status === 'Completed' && new Date(o.updatedAt) >= monthStart).length ?? 0) +
    (prints.data?.filter((j) => j.status === 'Collected' && new Date(j.updatedAt) >= monthStart).length ?? 0);
  const paidMonth = payments.data?.filter((p) => p.status === 'Success' && new Date(p.paidAt || p.createdAt) >= monthStart) || [];
  const paidSum = paidMonth.reduce((s, p) => s + p.amount - (p.refund?.status === 'Processed' ? p.refund.amount : 0), 0);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Recent activity: orders and print jobs together
  const recent = useMemo(() => {
    const o = (orders.data || []).map((x) => ({ type: 'order', at: x.createdAt, x }));
    const p = (prints.data || []).map((x) => ({ type: 'print', at: x.createdAt, x }));
    return [...o, ...p].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 4);
  }, [orders.data, prints.data]);

  return (
    <div className="stack-xl">
      <div className="page-head">
        <div>
          <Eyebrow>Your personal desk</Eyebrow>
          <h1 style={{ marginTop: 12 }}>
            {greet}, {user.name.split(' ')[0]}
            <span className="spark" aria-hidden="true">
              ✳
            </span>
          </h1>
          <p className="lead">A little progress goes a long way. What can we help you with today?</p>
        </div>
        <button className="btn primary lg" onClick={() => setPrintOpen(true)}>
          <Icon name="printer" size={18} /> New print request
        </button>
      </div>

      <div className="stack">
        <section className={`hero rise ${cafe.heroImage ? 'has-image' : ''}`} style={cafe.heroImage ? { backgroundImage: `url("${cafe.heroImage}")` } : undefined}>
          {!cafe.heroImage && (
            <div className="hero-art">
              <HeroArt />
            </div>
          )}
          <div className="hero-body">
            <span className="hero-pill">Your neighbourhood digital desk</span>
            <h2>
              Everyday services.
              <br />
              Made a little easier.
            </h2>
            <p>From your first application to that last-minute printout, consider it taken care of.</p>
            <Link to="/services" className="btn accent lg">
              Explore our services <Icon name="arrowRight" size={18} className="arrow" />
            </Link>
          </div>
          <div className="hero-badge">
            <Icon name="checkCircle" size={16} /> Helpful people, right around the corner
          </div>
        </section>

        <div className="stat-strip rise" style={{ '--i': 2 }}>
          <Link to="/orders" className="stat-cell">
            <span className="tile tint-coral">
              <Icon name="fileText" />
            </span>
            <div>
              <div className="label">Active requests</div>
              <div className="value">
                <strong>{String(active).padStart(2, '0')}</strong>
                <span>in progress</span>
              </div>
            </div>
            <Icon name="arrowRight" size={18} className="go" />
          </Link>
          <Link to="/orders?tab=done" className="stat-cell">
            <span className="tile tint-mint">
              <Icon name="check" />
            </span>
            <div>
              <div className="label">Completed this month</div>
              <div className="value">
                <strong>{String(done).padStart(2, '0')}</strong>
                <span>all done</span>
              </div>
            </div>
            <Icon name="arrowRight" size={18} className="go" />
          </Link>
          <Link to="/payments" className="stat-cell">
            <span className="tile tint-lavender">
              <Icon name="wallet" />
            </span>
            <div>
              <div className="label">Payments this month</div>
              <div className="value">
                <strong>
                  <Amount value={paidSum} />
                </strong>
                <span>
                  {paidMonth.length} transaction{paidMonth.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>
            <Icon name="arrowRight" size={18} className="go" />
          </Link>
        </div>
      </div>

      <section className="stack-lg">
        <div className="section-head">
          <div>
            <Eyebrow>For the everyday</Eyebrow>
            <h2 style={{ marginTop: 10 }}>Services</h2>
            <p className="lead">Good people, practical help, and one less thing on your list.</p>
          </div>
          <span className="eyebrow plain">{String(services.data?.length ?? 0).padStart(2, '0')} services</span>
        </div>
        <ServiceBrowser services={services} />
      </section>

      <section className="split">
        <div className="stack">
          <div className="section-head">
            <div>
              <Eyebrow>Keeping things moving</Eyebrow>
              <h2 style={{ marginTop: 10 }}>Your recent orders</h2>
            </div>
            <Link to="/orders" className="link-btn">
              View all <Icon name="arrowRight" size={16} />
            </Link>
          </div>
          <div className="card pad" style={{ paddingTop: 6, paddingBottom: 6 }}>
            {(!orders.data || !prints.data) && !orders.error && <Skeleton rows={3} />}
            <ErrorNote error={orders.error || prints.error} />
            {orders.data && prints.data && recent.length === 0 && (
              <Empty icon="orders" title="No orders yet" action={<Link className="btn sm" to="/services">Browse services</Link>}>
                Pick a service or send a file to print. Your requests show up here.
              </Empty>
            )}
            <div className="rows">
              {recent.map((r) => (r.type === 'order' ? <OrderRow key={r.x._id} o={r.x} /> : <PrintRow key={r.x._id} j={r.x} compact />))}
            </div>
          </div>
          <p className="muted small row">
            <Icon name="clock" size={16} /> Updates appear as your request moves along.
            <Link to="/payments" className="link-btn" style={{ marginLeft: 'auto' }}>
              See payment history <Icon name="arrowRight" size={14} />
            </Link>
          </p>
        </div>
        <aside className="stack">
          <VisitCard />
          <details className="acc">
            <summary>
              <Icon name="shieldCheck" size={20} style={{ color: 'var(--green)' }} />
              <span className="stack-xs">
                <strong className="small">Your documents stay yours.</strong>
                <span className="tiny muted">Uploaded files are handled with care and only used for your request.</span>
              </span>
              <Icon name="chevronDown" size={18} className="chev" />
            </summary>
            <div className="acc-body">
              Files are encrypted on our server and only you and the cafe staff working on your order can open them. They are deleted automatically{' '}
              {cafe.retentionDays ? `${cafe.retentionDays} days after your order is finished` : 'after your order is finished'}
              {cafe.draftDays ? `, or after ${cafe.draftDays} days if an order is never paid` : ''}. <Link to="/privacy">Privacy policy</Link>
            </div>
          </details>
        </aside>
      </section>

      <section className="stack">
        <div className="section-head">
          <div>
            <Eyebrow>Nice and straightforward</Eyebrow>
            <h2 style={{ marginTop: 10 }}>Recent payments</h2>
          </div>
          <Link to="/payments" className="link-btn">
            All transactions <Icon name="arrowRight" size={16} />
          </Link>
        </div>
        <PaymentsTable payments={payments} limit={5} />
      </section>

      {printOpen && <PrintRequestModal onClose={() => setPrintOpen(false)} onDone={() => nav('/orders?tab=prints')} />}
    </div>
  );
}

function VisitCard() {
  const cafe = useCafe();
  const s = openState(cafe);
  return (
    <div className="card visit-card rise" style={{ '--i': 1 }}>
      <div className={`visit-art ${cafe.heroImage ? 'has-image' : ''}`} style={cafe.heroImage ? { backgroundImage: `url("${cafe.heroImage}")` } : undefined}>
        {!cafe.heroImage && <VisitArt />}
        <span className={`open-tag ${s.open ? '' : 'closed'}`}>{s.open ? 'Open today' : 'Closed now'}</span>
      </div>
      <div className="stack" style={{ padding: 20 }}>
        <div className="stack-sm">
          <Eyebrow plain>Good to see you</Eyebrow>
          <h3 className="serif" style={{ fontSize: '1.6rem', fontWeight: 400 }}>
            Prefer a friendly face?
          </h3>
          <p className="muted small">Some things are easier in person. Stop by and we'll help you figure out the rest.</p>
        </div>
        <hr className="divider" />
        <div className="row between small">
          <span className="row" style={{ gap: 8 }}>
            <Icon name="clock" size={16} /> {dayRange(cafe.openDays || [])}
          </span>
          <strong>
            {fmtTime(cafe.openTime || '09:00')} – {fmtTime(cafe.closeTime || '20:00')}
          </strong>
        </div>
        {cafe.cafeAddress && (
          <div className="row small muted top" style={{ gap: 8 }}>
            <Icon name="pin" size={16} /> {cafe.cafeAddress}
          </div>
        )}
        <a
          className="btn block"
          style={{ justifyContent: 'space-between' }}
          href={cafe.cafeAddress ? `https://maps.google.com/?q=${encodeURIComponent(cafe.cafeAddress)}` : cafe.cafePhone ? `tel:${cafe.cafePhone}` : '#'}
          target={cafe.cafeAddress ? '_blank' : undefined}
          rel="noreferrer"
        >
          Plan a visit <Icon name="arrowRight" size={16} className="arrow" />
        </a>
      </div>
    </div>
  );
}

/* Services grid with category tabs and search (used on Overview and Services) */
function ServiceBrowser({ services }) {
  const [tab, setTab] = useState('All');
  const [q, setQ] = useState('');
  const input = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const cats = useMemo(() => ['All', ...CATEGORIES.filter((c) => services.data?.some((s) => s.category === c)), ...(services.data?.some((s) => !CATEGORIES.includes(s.category)) ? ['Other'] : [])], [services.data]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (services.data || []).filter(
      (s) =>
        (tab === 'All' || (tab === 'Other' ? !CATEGORIES.includes(s.category) : s.category === tab)) &&
        (!term || `${s.name} ${s.description} ${s.category}`.toLowerCase().includes(term))
    );
  }, [services.data, tab, q]);

  return (
    <div className="stack-lg">
      <div className="toolbar">
        <div className="tabs-line" role="tablist" aria-label="Service categories">
          {cats.map((c) => (
            <button key={c} role="tab" aria-selected={tab === c} className={tab === c ? 'on' : ''} onClick={() => setTab(c)}>
              {c === 'All' ? 'All services' : c}
            </button>
          ))}
        </div>
        <div className="search">
          <Icon name="search" size={18} />
          <input ref={input} id="search" placeholder="Find a service…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a service" />
          <kbd>⌘ K</kbd>
        </div>
      </div>
      <ErrorNote error={services.error} />
      {!services.data && !services.error && <Skeleton rows={6} kind="card" />}
      {services.data?.length === 0 && <Empty icon="briefcase" title="No services yet">The cafe hasn't added services yet. Please check back soon or call the cafe.</Empty>}
      {services.data?.length > 0 && shown.length === 0 && <Empty icon="search" title={`Nothing matches "${q}"`}>Try another word, or ask our team.</Empty>}
      <div className="svc-grid" key={tab}>
        {shown.map((s, i) => (
          <ServiceCard key={s._id} s={s} i={i} />
        ))}
      </div>
      <p className="muted small" style={{ textAlign: 'center' }}>
        Looking for something else?{' '}
        <Link to="/profile#help" className="link-btn">
          Ask our team <Icon name="arrowRight" size={14} />
        </Link>
      </p>
    </div>
  );
}

function ServiceCard({ s, i }) {
  return (
    <Link to={`/services/${s._id}`} className="card lift svc-card rise" style={{ '--i': i }}>
      <div className="top">
        <span className={`tile ${serviceTint(s.name)}`}>
          <Icon name={serviceIcon(s.name)} size={20} />
        </span>
        {s.processingTime && (
          <span className="time-chip">
            <Icon name="clock" size={14} /> {s.processingTime}
          </span>
        )}
      </div>
      <div className="stack-xs">
        <h3>{s.name}</h3>
        <p>{s.description}</p>
      </div>
      <div className="foot">
        <span className="price-from">
          {s.price > 0 ? (
            <>
              <small>FROM</small>
              <strong>{rupees(s.price)}</strong>
            </>
          ) : (
            <strong>Free</strong>
          )}
        </span>
        <span className="btn sm">
          Get started <Icon name="arrowRight" size={14} className="arrow" />
        </span>
      </div>
    </Link>
  );
}

export function Services() {
  const services = useLoad(() => api('/services'));
  return (
    <div className="stack-xl">
      <div className="page-head">
        <div>
          <Eyebrow>For the everyday</Eyebrow>
          <h1 style={{ marginTop: 12 }}>Services</h1>
          <p className="lead">Open a service to see how it works, what you need, and what it costs, before you start.</p>
        </div>
      </div>
      <ServiceBrowser services={services} />
    </div>
  );
}

/* ---------- Service detail + ordering (FR-9..13, A2) ---------- */
export function ServiceOrder() {
  const { id } = useParams();
  const nav = useNavigate();
  const cafe = useCafe();
  const { data: service, error: loadError } = useLoad(() => api(`/services/${id}`), [id]);
  const [files, setFiles] = useState({});
  const [details, setDetails] = useState({});
  const [step, setStep] = useState('about'); // about -> docs -> review
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const top = useRef(null);

  useEffect(() => {
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [step]);

  if (loadError)
    return (
      <div className="narrow stack">
        <BackLink to="/services">All services</BackLink>
        <ErrorNote error={loadError} />
      </div>
    );
  if (!service) return <Loading />;

  function pick(i, f) {
    setError('');
    if (!f) return;
    const problem = checkFile(f, cafe.maxFileMb || 10);
    if (problem) return setError(problem);
    setFiles((cur) => ({ ...cur, [i]: f }));
  }

  function toReview(e) {
    e.preventDefault();
    setError('');
    for (let i = 0; i < service.requiredDocs.length; i++) if (!files[i]) return setError(`Upload ${service.requiredDocs[i]}.`);
    for (const f of service.detailFields) if (!String(details[f] || '').trim()) return setError(`Fill in "${f}".`);
    setStep('review');
  }

  async function submit() {
    setError('');
    if (!agree) return setError('Please tick "I agree" to continue.');
    const form = new FormData();
    form.append('serviceId', service._id);
    form.append('details', JSON.stringify(details));
    form.append('agreeTerms', 'true');
    service.requiredDocs.forEach((_, i) => form.append(`doc_${i}`, files[i]));
    try {
      setProgress(0);
      const order = await uploadForm('/orders', form, setProgress);
      nav(`/orders/${order._id}`, { replace: true, state: { justCreated: true } });
    } catch (e) {
      setError(e.message);
      setProgress(null);
    }
  }

  const uploaded = Object.keys(files).length;
  const flowIndex = { about: 0, docs: 1, review: 2 }[step];

  return (
    <div className="stack-lg" ref={top} style={{ scrollMarginTop: 90 }}>
      <BackLink to="/services">All services</BackLink>
      <div className="page-head">
        <div className="row top" style={{ gap: 18 }}>
          <span className={`tile lg ${serviceTint(service.name)}`}>
            <Icon name={serviceIcon(service.name)} size={26} />
          </span>
          <div className="stack-sm">
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="chip">{service.category || 'Service'}</span>
              {service.processingTime && (
                <span className="chip">
                  <Icon name="clock" size={13} /> {service.processingTime}
                </span>
              )}
            </div>
            <h1>{service.name}</h1>
            <p className="lead" style={{ marginTop: 0 }}>
              {service.description}
            </p>
          </div>
        </div>
      </div>

      <ol className="flow" aria-label="Steps">
        {['About', 'Documents & details', 'Review & agree', 'Pay'].map((s, i) => (
          <li key={s} className={i < flowIndex ? 'done' : i === flowIndex ? 'on' : ''}>
            <span>
              {i + 1}. {s}
            </span>
          </li>
        ))}
      </ol>

      <div className="split">
        <div className="stack">
          {step === 'about' && (
            <div className="stack fade">
              {service.steps?.length > 0 && (
                <div className="card pad-lg stack">
                  <h3>How it works</h3>
                  <ol className="steps">
                    {service.steps.map((s, i) => (
                      <li key={i} className="rise" style={{ '--i': i }}>
                        <span className="num">{i + 1}</span>
                        <span className="txt">{s}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <div className="cols-2">
                <div className="card pad stack-sm">
                  <h4>Documents you'll need</h4>
                  {service.requiredDocs.length ? (
                    <ul className="ticks">
                      {service.requiredDocs.map((d) => (
                        <li key={d}>
                          <Icon name="fileText" size={16} /> {d}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted small">No documents needed.</p>
                  )}
                  <p className="tiny muted">PDF, JPG or PNG, up to {cafe.maxFileMb || 10} MB each. Word files: save as PDF first.</p>
                </div>
                <div className="card pad stack-sm">
                  <h4>Details we'll ask for</h4>
                  {service.detailFields.length ? (
                    <ul className="ticks">
                      {service.detailFields.map((d) => (
                        <li key={d}>
                          <Icon name="pencil" size={16} /> {d}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted small">Nothing extra.</p>
                  )}
                </div>
              </div>
              {service.notes && (
                <div className="note info">
                  <Icon name="info" size={18} />
                  <span>
                    <strong>Good to know: </strong>
                    {service.notes}
                  </span>
                </div>
              )}
              {service.terms && (
                <details className="acc">
                  <summary>
                    <Icon name="fileText" size={18} />
                    <strong className="small">Terms for this service</strong>
                    <Icon name="chevronDown" size={18} className="chev" />
                  </summary>
                  <div className="acc-body" style={{ whiteSpace: 'pre-line' }}>
                    {service.terms}
                  </div>
                </details>
              )}
            </div>
          )}

          {step === 'docs' && (
            <form className="card pad-lg stack fade" onSubmit={toReview}>
              {service.requiredDocs.length > 0 && (
                <div className="card-head">
                  <h3>Upload documents</h3>
                  <span className="muted small">
                    {uploaded} of {service.requiredDocs.length} added
                  </span>
                </div>
              )}
              {service.requiredDocs.map((label, i) => (
                <Dropzone key={label} compact id={`doc_${i}`} label={label} file={files[i]} onFile={(f) => pick(i, f)} />
              ))}
              {service.detailFields.length > 0 && <h3 style={{ marginTop: 8 }}>Your details</h3>}
              <div className="form-grid">
                {service.detailFields.map((f) => (
                  <label key={f}>
                    {f}
                    <input id={`field_${f}`} value={details[f] || ''} onChange={(e) => setDetails({ ...details, [f]: e.target.value })} required />
                  </label>
                ))}
              </div>
              <div className="note">
                <Icon name="shieldCheck" size={18} />
                <span>
                  Your documents are encrypted and private. They are deleted automatically
                  {cafe.retentionDays ? ` ${cafe.retentionDays} days after your order is finished` : ' after your order is finished'}
                  {cafe.draftDays ? `, or after ${cafe.draftDays} days if the order is not paid.` : '.'}
                </span>
              </div>
              <ErrorNote error={error} />
              <div className="row wrap">
                <button className="btn primary lg">
                  Review order <Icon name="arrowRight" size={18} className="arrow" />
                </button>
                <button type="button" className="btn lg ghost" onClick={() => setStep('about')}>
                  Back
                </button>
              </div>
            </form>
          )}

          {step === 'review' && (
            <div className="card pad-lg stack fade receipt">
              <div className="card-head">
                <h3>Review your order</h3>
                <button className="link-btn" onClick={() => setStep('docs')} disabled={progress !== null}>
                  <Icon name="pencil" size={15} /> Edit
                </button>
              </div>
              <dl className="kv">
                <dt>Service</dt>
                <dd>{service.name}</dd>
                {service.requiredDocs.map((label, i) => (
                  <KV key={label} k={label} v={files[i]?.name} />
                ))}
                {service.detailFields.map((f) => (
                  <KV key={f} k={f} v={details[f]} />
                ))}
                {service.processingTime && <KV k="Usually takes" v={service.processingTime} />}
              </dl>
              <div className="perf" />
              {(service.terms || cafe.refundPolicy) && (
                <div className="note" style={{ maxHeight: 180, overflowY: 'auto', display: 'block', whiteSpace: 'pre-line' }}>
                  {service.terms && (
                    <>
                      <strong>Terms</strong>
                      {'\n'}
                      {service.terms}
                      {'\n\n'}
                    </>
                  )}
                  <strong>Refunds</strong>
                  {'\n'}
                  {cafe.refundPolicy}
                </div>
              )}
              <label className="check">
                <input id="agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>I have read how this service works and agree to the terms and the refund policy.</span>
              </label>
              {progress !== null && (
                <div className="progress" aria-label="Upload progress">
                  <div style={{ width: `${progress}%` }} />
                </div>
              )}
              <ErrorNote error={error} />
              <button className="btn primary lg block" disabled={progress !== null || !agree} onClick={submit}>
                {progress !== null ? (
                  <>
                    <span className="spinner" /> Uploading {progress}%
                  </>
                ) : (
                  <>
                    Confirm and continue to payment <Icon name="arrowRight" size={18} className="arrow" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        <aside className="card pad-lg stack sticky">
          <div className="stack-xs">
            <span className="muted small">Service charge</span>
            <span className="big-price">{service.price > 0 ? rupees(service.price) : 'Free'}</span>
          </div>
          {service.included?.length > 0 && (
            <div className="stack-sm">
              <h4>Included</h4>
              <ul className="ticks yes">
                {service.included.map((x) => (
                  <li key={x}>
                    <Icon name="check" size={16} stroke={2.4} /> {x}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {service.notIncluded?.length > 0 && (
            <div className="stack-sm">
              <h4>Not included</h4>
              <ul className="ticks no">
                {service.notIncluded.map((x) => (
                  <li key={x}>
                    <Icon name="x" size={16} stroke={2.4} /> {x}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {service.processingTime && (
            <div className="row small">
              <Icon name="clock" size={16} /> Usually ready in <strong>{service.processingTime}</strong>
            </div>
          )}
          {step === 'about' && (
            <button className="btn primary lg block" onClick={() => setStep('docs')}>
              Start this service <Icon name="arrowRight" size={18} className="arrow" />
            </button>
          )}
          <p className="tiny muted">
            You pay online after reviewing. See the <Link to="/refund-policy">refund policy</Link>.
          </p>
        </aside>
      </div>
    </div>
  );
}

const KV = ({ k, v }) => (
  <>
    <dt>{k}</dt>
    <dd>{v}</dd>
  </>
);

/* ---------- Order + print rows ---------- */
function OrderRow({ o }) {
  return (
    <Link to={`/orders/${o._id}`} className="order-row">
      <span className={`tile ${o.status === 'Completed' ? 'tint-mint' : o.status === 'Rejected' ? 'tint-coral' : 'tint-butter'}`}>
        <Icon name={o.status === 'Completed' ? 'check' : o.status === 'Rejected' ? 'x' : 'clock'} size={20} />
      </span>
      <div className="grow">
        <div className="title">
          <strong>{o.serviceName}</strong>
          <span className="ref">{orderRef(o)}</span>
        </div>
        <div className="meta">
          {o.status === 'Completed' ? `Completed ${shortDay(o.updatedAt)}` : `Placed ${shortDay(o.createdAt)}`}
          {' · '}
          {o.paymentStatus === 'Paid' ? 'Payment complete' : o.paymentStatus === 'Refunded' ? 'Refunded' : 'Payment pending'}
          {o.cancelRequest?.status === 'Requested' && ' · Cancellation requested'}
        </div>
        {['Submitted', 'In Progress', 'PendingPayment'].includes(o.status) && (
          <div className="mini-bar">
            <span style={{ width: `${PROGRESS[o.status] * 100}%` }} />
          </div>
        )}
      </div>
      <div className="end">
        <span className="amount hide-sm">{o.totalAmount > 0 ? rupees(o.totalAmount) : 'Free'}</span>
        <Status value={o.status} />
        <Icon name="chevron" size={18} className="muted" />
      </div>
    </Link>
  );
}

function PrintRow({ j, onChange, compact }) {
  const [err, setErr] = useState('');
  const [removing, setRemoving] = useState(false);
  const unpaid = !['Paid', 'Refunded'].includes(j.paymentStatus);
  async function remove() {
    setRemoving(true);
    try {
      await api(`/print/${j._id}`, { method: 'DELETE' });
      onChange?.();
    } catch (e) {
      setErr(e.message);
      setRemoving(false);
    }
  }
  return (
    <div className="order-row" style={{ alignItems: compact ? 'center' : 'flex-start' }}>
      <span className={`tile ${j.status === 'Ready' ? 'tint-coral' : j.status === 'Collected' ? 'tint-mint' : 'tint-butter'}`}>
        <Icon name="printer" size={20} />
      </span>
      <div className="grow stack-sm" style={{ gap: 6 }}>
        <div>
          <div className="title">
            <strong>Document printing</strong>
            <span className="ref">{printRef(j)}</span>
          </div>
          <div className="meta">
            {j.fileName} · {j.pages} page{j.pages > 1 ? 's' : ''} × {j.copies} · {j.colorMode === 'color' ? 'Colour' : 'B&W'} · {j.paperSize}
            {j.status === 'Ready' ? ` · Ready for collection` : ` · ${shortDay(j.createdAt)}`}
          </div>
        </div>
        {!compact && (
          <div className="row wrap" style={{ gap: 8 }}>
            {j.pickupCode && j.status !== 'Collected' && (
              <span className="pickup">
                Pickup code <b>{j.pickupCode}</b>
              </span>
            )}
            {j.documentId && (
              <>
                <button className="btn sm" onClick={() => viewDoc(j.documentId).catch((e) => setErr(e.message))}>
                  <Icon name="eye" size={15} /> View file
                </button>
                <button className="btn sm" onClick={() => saveDoc(j.documentId, j.fileName).catch((e) => setErr(e.message))}>
                  <Icon name="download" size={15} /> Download
                </button>
              </>
            )}
            {unpaid && (
              <button className="btn sm ghost" disabled={removing} onClick={remove}>
                <Icon name="trash" size={15} /> Remove
              </button>
            )}
          </div>
        )}
        <ErrorNote error={err} />
      </div>
      <div className="end">
        <span className="amount hide-sm">{rupees(j.price)}</span>
        {unpaid && !compact ? <PayButton kind="print" id={j._id} amount={j.price} onDone={onChange} size="sm" /> : <Status value={j.status} />}
      </div>
    </div>
  );
}

/* ---------- My orders (FR-7) ---------- */
export function MyOrders() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'active';
  const orders = useLoad(() => api('/orders'));
  const prints = useLoad(() => api('/print'));
  const setTab = (t) => setParams(t === 'active' ? {} : { tab: t }, { replace: true });

  const activeOrders = orders.data?.filter((o) => ['PendingPayment', 'Submitted', 'In Progress'].includes(o.status)) || [];
  const doneOrders = orders.data?.filter((o) => ['Completed', 'Rejected'].includes(o.status)) || [];
  const loading = (!orders.data && !orders.error) || (!prints.data && !prints.error);
  const tabs = [
    ['active', 'In progress', activeOrders.length],
    ['done', 'Completed', doneOrders.length],
    ['prints', 'Print jobs', prints.data?.length || 0],
  ];
  const list = tab === 'done' ? doneOrders : activeOrders;

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <Eyebrow>Keeping things moving</Eyebrow>
          <h1 style={{ marginTop: 12 }}>My orders</h1>
          <p className="lead">Track every request, download finished files, and see what's ready to collect.</p>
        </div>
        <Link to="/services" className="btn primary">
          <Icon name="plus" size={18} /> New order
        </Link>
      </div>
      <div className="tabs-line" role="tablist">
        {tabs.map(([k, l, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
            {n > 0 && <span className="count">{n}</span>}
          </button>
        ))}
      </div>
      <ErrorNote error={orders.error || prints.error} />
      {loading && <Skeleton rows={4} />}
      {!loading && tab !== 'prints' && (
        <div className="card pad fade" key={tab} style={{ paddingTop: 6, paddingBottom: 6 }}>
          {list.length === 0 ? (
            <Empty icon="orders" title={tab === 'done' ? 'Nothing completed yet' : 'No orders in progress'} action={<Link className="btn sm" to="/services">Browse services</Link>} />
          ) : (
            <div className="rows">
              {list.map((o) => (
                <OrderRow key={o._id} o={o} />
              ))}
            </div>
          )}
        </div>
      )}
      {!loading && tab === 'prints' && (
        <div className="card pad fade" style={{ paddingTop: 6, paddingBottom: 6 }}>
          {prints.data.length === 0 ? (
            <Empty icon="printer" title="No print jobs yet" action={<Link className="btn sm" to="/print">Print a document</Link>} />
          ) : (
            <div className="rows">
              {prints.data.map((j) => (
                <PrintRow key={j._id} j={j} onChange={prints.reload} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Order detail + tracking (FR-17, FR-23, E1, E2, B3) ---------- */
const STEPS = ['Submitted', 'In Progress', 'Completed'];
const STEP_ICON = { Submitted: 'send', 'In Progress': 'clock', Completed: 'check' };

export function OrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const cafe = useCafe();
  const { data, error, reload } = useLoad(() => api(`/orders/${id}`), [id]);
  const [fileError, setFileError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [requestOpen, setRequestOpen] = useState(false);

  async function cancel() {
    setCancelError('');
    try {
      await api(`/orders/${id}`, { method: 'DELETE' });
      nav('/orders', { replace: true });
    } catch (e) {
      setCancelError(e.message);
      setConfirmCancel(false);
    }
  }
  if (error)
    return (
      <div className="narrow stack">
        <BackLink to="/orders">My orders</BackLink>
        <ErrorNote error={error} />
      </div>
    );
  if (!data) return <Loading />;
  const { order, documents, payments, service } = data;
  const paid = payments.find((p) => p.status === 'Success' && !p.duplicate) || payments.find((p) => p.status === 'Success');
  const isPaid = ['Paid', 'Refunded'].includes(order.paymentStatus);
  const stepIndex = STEPS.indexOf(order.status);
  const uploads = documents.filter((d) => d.kind !== 'result');
  const results = documents.filter((d) => d.kind === 'result');
  const cr = order.cancelRequest || {};

  return (
    <div className="stack-lg">
      <BackLink to="/orders">My orders</BackLink>
      <div className="page-head">
        <div className="row top" style={{ gap: 18 }}>
          <span className={`tile lg ${serviceTint(order.serviceName)}`}>
            <Icon name={serviceIcon(order.serviceName)} size={26} />
          </span>
          <div className="stack-sm">
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="chip code">{orderRef(order)}</span>
              <Status value={order.status} />
              {order.paymentStatus === 'Refunded' && <Status value="Refunded" />}
            </div>
            <h1>{order.serviceName}</h1>
            <p className="muted small">Placed {fmtDate(order.createdAt)}</p>
          </div>
        </div>
        <div className="stack-xs right">
          <span className="muted small">Amount</span>
          <span className="big-price">{order.totalAmount > 0 ? rupees(order.totalAmount) : 'Free'}</span>
        </div>
      </div>

      {!isPaid && (
        <div className="card pad-lg stack rise" style={{ borderColor: '#f3e2b3', background: '#fffdf6' }}>
          <div className="card-head">
            <div className="card-title">
              <span className="tile tint-butter">
                <Icon name="wallet" />
              </span>
              <div>
                <h3>{order.totalAmount > 0 ? 'Payment pending' : 'Submit your request'}</h3>
                <p className="muted small">
                  {order.paymentStatus === 'Failed'
                    ? 'Your last payment did not go through. Your documents are saved, so you can pay again now.'
                    : order.totalAmount > 0
                    ? 'Your documents are uploaded. Pay to send the order to the cafe.'
                    : 'This service is free. Submit it to send it to the cafe.'}
                </p>
              </div>
            </div>
          </div>
          <div className="row wrap">
            <PayButton kind="order" id={order._id} amount={order.totalAmount} onDone={reload} size="lg" />
            {!confirmCancel ? (
              <button className="btn lg ghost" onClick={() => setConfirmCancel(true)}>
                Cancel order
              </button>
            ) : (
              <div className="row wrap fade">
                <span className="small">Cancel and delete the uploaded documents?</span>
                <button className="btn sm danger" onClick={cancel}>
                  Yes, cancel
                </button>
                <button className="btn sm" onClick={() => setConfirmCancel(false)}>
                  Keep it
                </button>
              </div>
            )}
          </div>
          <ErrorNote error={cancelError} />
          <p className="tiny muted">
            By paying you agree to the <Link to="/refund-policy">refund policy</Link>.
          </p>
        </div>
      )}

      {order.paymentStatus === 'Refunded' && (
        <div className="note good">
          <Icon name="wallet" size={18} />
          <span>Your payment for this order was refunded. It usually reaches your account in 5-7 working days.</span>
        </div>
      )}
      {order.status === 'Rejected' && (
        <div className="note bad">
          <Icon name="alert" size={18} />
          <span>
            {cr.status === 'Approved' ? 'This order was cancelled at your request.' : 'This order was rejected.'}
            {order.remark && ` Reason: ${order.remark}`}
            {order.paymentStatus === 'Paid' && order.totalAmount > 0 && ' The cafe will refund your payment.'}
          </span>
        </div>
      )}

      {isPaid && order.status !== 'Rejected' && (
        <div className="card pad-lg stack rise">
          <ol className="tracker" style={{ '--p': Math.max(0, stepIndex) / (STEPS.length - 1) }}>
            {STEPS.map((s, i) => (
              <li key={s} className={i < stepIndex || order.status === 'Completed' ? 'done' : i === stepIndex ? 'current' : ''}>
                <span className="node">
                  <Icon name={i < stepIndex || order.status === 'Completed' ? 'check' : STEP_ICON[s]} size={18} stroke={2.2} />
                </span>
                {s}
              </li>
            ))}
          </ol>
          {(order.expectedBy || order.referenceNo) && (
            <div className="row wrap" style={{ justifyContent: 'center', gap: 10 }}>
              {order.expectedBy && order.status !== 'Completed' && (
                <span className="chip">
                  <Icon name="calendar" size={14} /> Expected by {fmtDay(order.expectedBy)}
                </span>
              )}
              {order.referenceNo && (
                <span className="chip">
                  <Icon name="hash" size={14} /> Reference no. <span className="code">{order.referenceNo}</span>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {order.remark && order.status !== 'Rejected' && (
        <div className="note warn">
          <Icon name="bell" size={18} />
          <span>
            <strong>Note from the cafe:</strong> {order.remark}
          </span>
        </div>
      )}

      {results.length > 0 && (
        <div className="card pad-lg stack rise" style={{ borderColor: '#cfe9dd' }}>
          <div className="card-title">
            <span className="tile tint-mint">
              <Icon name="download" />
            </span>
            <div>
              <h3>Ready for you</h3>
              <p className="muted small">Files the cafe prepared for this order. Download and keep a copy.</p>
            </div>
          </div>
          <div className="files">
            {results.map((d) => (
              <FileItem key={d._id} doc={d} tone="result" onError={setFileError} />
            ))}
          </div>
        </div>
      )}

      <div className="split">
        <div className="stack">
          <div className="card pad-lg stack">
            <h3>Your documents</h3>
            {uploads.length === 0 && <p className="muted small">No documents (none were needed, or they were deleted after the retention period).</p>}
            <div className="files">
              {uploads.map((d) => (
                <FileItem key={d._id} doc={d} onError={setFileError} />
              ))}
            </div>
            <ErrorNote error={fileError} />
            <p className="tiny muted">
              Deleted automatically {cafe.retentionDays || 30} days after the order is finished.
            </p>
          </div>
          {Object.keys(order.details || {}).length > 0 && (
            <div className="card pad-lg stack">
              <h3>Details you gave</h3>
              <dl className="kv">
                {Object.entries(order.details || {}).map(([k, v]) => (
                  <KV key={k} k={k} v={v} />
                ))}
              </dl>
            </div>
          )}
          {service?.steps?.length > 0 && (
            <details className="acc">
              <summary>
                <Icon name="list" size={18} />
                <strong className="small">How this service works</strong>
                <Icon name="chevronDown" size={18} className="chev" />
              </summary>
              <div className="acc-body">
                <ol className="steps">
                  {service.steps.map((s, i) => (
                    <li key={i}>
                      <span className="num">{i + 1}</span>
                      <span className="txt">{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </details>
          )}
        </div>

        <aside className="stack">
          <div className="card pad-lg stack">
            <h3>Timeline</h3>
            {order.history?.length ? (
              <ol className="timeline">
                {[...order.history].reverse().map((h, i) => (
                  <li key={i}>
                    <div className="t-head">
                      <span>{h.status === 'PendingPayment' ? 'Order created' : h.status}</span>
                      <span className="t-meta">{fmtDate(h.at)}</span>
                    </div>
                    {h.note && <div className="t-note">{h.note}</div>}
                    <div className="t-meta">{h.byRole === 'customer' ? 'You' : h.byRole === 'system' ? 'Automatic' : `by ${h.by}`}</div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted small">Updates will appear here.</p>
            )}
          </div>

          {paid && (
            <Link className="btn lg block" to={`/payments/${paid._id}`}>
              <Icon name="receipt" size={18} /> View receipt
            </Link>
          )}

          {order.paymentStatus === 'Paid' && order.status === 'Submitted' && cr.status !== 'Requested' && cr.status !== 'Declined' && (
            <button className="btn block ghost" onClick={() => setRequestOpen(true)}>
              <Icon name="undo" size={16} /> Request cancellation
            </button>
          )}
          {cr.status === 'Requested' && (
            <div className="note warn">
              <Icon name="clock" size={18} />
              <span>
                You asked to cancel this order on {shortDay(cr.at)}. The cafe will reply soon.
              </span>
            </div>
          )}
          {cr.status === 'Declined' && (
            <div className="note">
              <Icon name="info" size={18} />
              <span>
                Your cancellation request was declined{cr.note ? `: ${cr.note}` : '.'}
              </span>
            </div>
          )}
        </aside>
      </div>

      {requestOpen && <CancelRequestModal order={order} onClose={() => setRequestOpen(false)} onDone={() => (setRequestOpen(false), reload())} />}
    </div>
  );
}

function CancelRequestModal({ order, onClose, onDone }) {
  const cafe = useCafe();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api(`/orders/${order._id}/cancel-request`, { method: 'POST', body: { reason } });
      onDone();
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  }
  return (
    <Modal onClose={onClose} busy={busy} label="Request cancellation">
      <form className="stack" onSubmit={submit}>
        <span className="tile tint-butter">
          <Icon name="undo" />
        </span>
        <h2>Cancel this order?</h2>
        <p className="muted small">The cafe hasn't started on it yet. If they approve, your payment is refunded in full.</p>
        <label>
          Why do you want to cancel?
          <textarea id="cancelReason" rows="3" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. I applied somewhere else" required />
        </label>
        <p className="tiny muted" style={{ whiteSpace: 'pre-line' }}>
          {cafe.refundPolicy}
        </p>
        <ErrorNote error={err} />
        <div className="row">
          <button className="btn primary grow" disabled={busy || reason.trim().length < 3}>
            {busy && <span className="spinner" />} Send request
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Keep order
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- Printing (FR-19..22, F2) ---------- */
function usePrintFlow() {
  const cafe = useCafe();
  const rates = cafe.printRates;
  const [file, setFile] = useState(null);
  const [job, setJob] = useState(null);
  const [opts, setOpts] = useState({ copies: 1, colorMode: 'bw', paperSize: 'A4' });
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const copies = Math.max(1, Math.min(100, parseInt(opts.copies, 10) || 1));
  const perPage = rates?.[opts.colorMode]?.[opts.paperSize] ?? 0;
  const pages = job?.pages || 0;
  const price = perPage * (pages || 1) * copies;

  // Upload as soon as a file is picked, so the server can count pages (F2)
  async function pick(f) {
    setError('');
    if (!f) return;
    const problem = checkFile(f, cafe.maxFileMb || 10);
    if (problem) return setError(problem);
    if (job && !['Paid', 'Refunded'].includes(job.paymentStatus)) api(`/print/${job._id}`, { method: 'DELETE' }).catch(() => {});
    setFile(f);
    setJob(null);
    const form = new FormData();
    form.append('file', f);
    Object.entries({ ...opts, copies }).forEach(([k, v]) => form.append(k, v));
    try {
      setProgress(0);
      setJob(await uploadForm('/print', form, setProgress));
    } catch (e) {
      setError(e.message);
      setFile(null);
    }
    setProgress(null);
  }

  async function save() {
    const updated = await api(`/print/${job._id}`, { method: 'PATCH', body: { ...opts, copies } });
    setJob((j) => ({ ...j, ...updated }));
    return updated;
  }
  const set = (k, v) => setOpts((o) => ({ ...o, [k]: v }));
  return { cafe, rates, file, job, opts, set, copies, perPage, pages, price, progress, error, setError, pick, save };
}

// Saves the chosen options first, then opens payment
function PayAfterSave({ flow, onDone, label }) {
  const [ready, setReady] = useState(null);
  const [busy, setBusy] = useState(false);
  const key = `${flow.opts.colorMode}-${flow.opts.paperSize}-${flow.copies}`;
  const [savedKey, setSavedKey] = useState(null);
  if (ready && savedKey === key) return <PayButton kind="print" id={flow.job._id} amount={ready.price} onDone={onDone} size="lg" block />;
  return (
    <button
      className="btn primary lg block"
      disabled={busy || !flow.job}
      onClick={async () => {
        setBusy(true);
        try {
          setReady(await flow.save());
          setSavedKey(key);
        } catch (e) {
          flow.setError(e.message);
        }
        setBusy(false);
      }}
    >
      {busy ? <span className="spinner" /> : null} {label || 'Send print request'} <Icon name="arrowRight" size={18} className="arrow" />
    </button>
  );
}

// The quick "New print request" dialog from the overview (template screen 2)
export function PrintRequestModal({ onClose, onDone }) {
  const f = usePrintFlow();
  return (
    <Modal onClose={onClose} label="Quick print request" busy={f.progress !== null}>
      <span className="tile tint-butter">
        <Icon name="printer" />
      </span>
      <div className="stack-sm">
        <Eyebrow plain>Quick print request</Eyebrow>
        <h2>What can we print for you?</h2>
        <p className="muted">Upload a document and choose your print options. You can collect it from the café.</p>
      </div>
      <Dropzone id="quickprint" label={f.file ? 'File ready' : 'Choose a file to print'} file={f.file} onFile={f.pick} />
      {f.progress !== null && (
        <div className="stack-xs">
          <span className="tiny muted">Uploading and counting pages… {f.progress}%</span>
          <div className="progress">
            <div style={{ width: `${f.progress}%` }} />
          </div>
        </div>
      )}
      {f.job && (
        <div className="row small fade" style={{ gap: 8 }}>
          <Icon name="fileText" size={16} />
          <span className="grow">
            <strong>{f.job.pages}</strong> page{f.job.pages > 1 ? 's' : ''} found
          </span>
          <button className="link-btn" onClick={() => viewDoc(f.job.documentId).catch((e) => f.setError(e.message))}>
            <Icon name="eye" size={15} /> Preview
          </button>
        </div>
      )}
      <div>
        <div className="field-row">
          <span>Copies</span>
          <Stepper value={f.opts.copies} onChange={(v) => f.set('copies', v)} />
        </div>
        <div className="field-row">
          <span>Print in</span>
          <select id="qColor" value={f.opts.colorMode} onChange={(e) => f.set('colorMode', e.target.value)} aria-label="Print in">
            <option value="bw">Black & white</option>
            <option value="color">Colour</option>
          </select>
        </div>
        <div className="field-row">
          <span>Paper size</span>
          <select id="qPaper" value={f.opts.paperSize} onChange={(e) => f.set('paperSize', e.target.value)} aria-label="Paper size">
            <option value="A4">A4</option>
            <option value="A3">A3</option>
          </select>
        </div>
      </div>
      <div className="total-line">
        <span className="muted">{f.job ? 'Total' : 'Estimated total (per page)'}</span>
        <strong>
          <Amount value={f.price} />
        </strong>
      </div>
      <ErrorNote error={f.error} />
      <PayAfterSave flow={f} onDone={() => (onClose(), onDone?.())} />
      <p className="tiny muted" style={{ textAlign: 'center' }}>
        Pay securely online, then collect at the counter with your pickup code.
      </p>
    </Modal>
  );
}

export function PrintPage() {
  const nav = useNavigate();
  const f = usePrintFlow();
  const prints = useLoad(() => api('/print'));
  const r = f.rates;

  return (
    <div className="stack-xl">
      <div className="page-head">
        <div>
          <Eyebrow>Print services</Eyebrow>
          <h1 style={{ marginTop: 12 }}>Print a document</h1>
          <p className="lead">Upload, check the preview, choose options and pay. Collect it at the counter with your pickup code.</p>
        </div>
      </div>

      <div className="split wide-side">
        <div className="card pad-lg stack">
          <div className="card-head">
            <h3>1. Your file</h3>
            {f.job && <span className="chip">{printRef(f.job)}</span>}
          </div>
          <Dropzone id="printfile" label={f.file ? 'Change file' : 'Choose a file to print'} file={f.file} onFile={f.pick} />
          {f.progress !== null && (
            <div className="stack-xs">
              <span className="tiny muted">Uploading and counting pages… {f.progress}%</span>
              <div className="progress">
                <div style={{ width: `${f.progress}%` }} />
              </div>
            </div>
          )}
          {f.file && f.job && <FilePreview file={f.file} pages={f.job.pages} />}

          <h3 style={{ marginTop: 8 }}>2. Print options</h3>
          <div className="stack-sm">
            <strong className="small">Colour</strong>
            <div className="choice" role="radiogroup" aria-label="Colour">
              {[
                ['bw', 'Black & white'],
                ['color', 'Colour'],
              ].map(([v, l]) => (
                <button key={v} id={`color_${v}`} type="button" role="radio" aria-checked={f.opts.colorMode === v} className={f.opts.colorMode === v ? 'on' : ''} onClick={() => f.set('colorMode', v)}>
                  <strong>{l}</strong>
                  <small>{r ? `${rupees(r[v][f.opts.paperSize])} / page` : ''}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="stack-sm">
            <strong className="small">Paper size</strong>
            <div className="choice" role="radiogroup" aria-label="Paper size">
              {['A4', 'A3'].map((v) => (
                <button key={v} id={`paper_${v}`} type="button" role="radio" aria-checked={f.opts.paperSize === v} className={f.opts.paperSize === v ? 'on' : ''} onClick={() => f.set('paperSize', v)}>
                  <strong>{v}</strong>
                  <small>{v === 'A4' ? 'Standard size' : 'Large, double A4'}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="row between">
            <strong className="small">Copies</strong>
            <Stepper value={f.opts.copies} onChange={(v) => f.set('copies', v)} />
          </div>
        </div>

        <aside className="card pad-lg stack sticky">
          <h3>3. Price</h3>
          <div className="sum">
            <div>
              <span>Rate</span>
              <span>{rupees(f.perPage)} / page</span>
            </div>
            <div>
              <span>Pages</span>
              <span>{f.job ? `× ${f.job.pages}` : 'upload a file'}</span>
            </div>
            <div>
              <span>Copies</span>
              <span>× {f.copies}</span>
            </div>
            <div className="total">
              <span>Total</span>
              <Amount value={f.job ? f.price : 0} />
            </div>
          </div>
          <ErrorNote error={f.error} />
          {f.job ? (
            <PayAfterSave flow={f} onDone={() => nav('/orders?tab=prints')} label={`Confirm options`} />
          ) : (
            <p className="muted small">Upload a file to see the exact price. It updates as you change colour, paper and copies.</p>
          )}
          {r && (
            <div className="sum tiny muted" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <div>
                <span>B&W A4 / A3</span>
                <span>
                  {rupees(r.bw.A4)} / {rupees(r.bw.A3)}
                </span>
              </div>
              <div>
                <span>Colour A4 / A3</span>
                <span>
                  {rupees(r.color.A4)} / {rupees(r.color.A3)}
                </span>
              </div>
            </div>
          )}
          <p className="tiny muted">Word files aren't accepted: save as PDF first.</p>
        </aside>
      </div>

      <section className="stack">
        <div className="section-head">
          <h2>Your print jobs</h2>
        </div>
        <div className="card pad" style={{ paddingTop: 6, paddingBottom: 6 }}>
          {!prints.data && !prints.error && <Skeleton rows={2} />}
          <ErrorNote error={prints.error} />
          {prints.data?.length === 0 && <Empty icon="printer" title="No print jobs yet">Your uploaded files appear here so you can view or download them again.</Empty>}
          <div className="rows">
            {prints.data?.map((j) => (
              <PrintRow key={j._id} j={j} onChange={prints.reload} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ---------- Payments + receipts (FR-8, FR-18) ---------- */
function PaymentsTable({ payments, limit }) {
  const [err, setErr] = useState('');
  const rows = limit ? payments.data?.slice(0, limit) : payments.data;
  return (
    <div className="card table-card">
      <ErrorNote error={payments.error || err} />
      {!payments.data && !payments.error && (
        <div style={{ padding: 16 }}>
          <Skeleton rows={3} />
        </div>
      )}
      {payments.data?.length === 0 && <Empty icon="wallet" title="No payments yet">Your receipts appear here after you pay for an order or a print.</Empty>}
      {rows?.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Date</th>
                <th className="hide-sm">Method</th>
                <th className="num">Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const item = p.kind === 'order' ? p.order?.serviceName : 'Document printing';
                const refunded = p.refund?.status === 'Processed';
                return (
                  <tr key={p._id}>
                    <td>
                      <div className="cell-main">
                        {p.status === 'Success' ? <Link to={`/payments/${p._id}`}>{item || 'Deleted item'}</Link> : <span>{item || 'Deleted item'}</span>}
                      </div>
                    </td>
                    <td className="small nowrap">{fmtDay(p.paidAt || p.createdAt)}</td>
                    <td className="small hide-sm">
                      <span className="row" style={{ gap: 6 }}>
                        <Icon name="phone" size={14} /> {p.mock ? 'Test' : p.amount === 0 ? 'Free' : 'Online'}
                      </span>
                    </td>
                    <td className="num strong nowrap">{rupees(p.amount)}</td>
                    <td>
                      <Status value={refunded ? 'Refunded' : p.status} />
                    </td>
                    <td className="num">
                      {p.status === 'Success' && (
                        <button
                          className="icon-btn"
                          title="Download PDF receipt"
                          aria-label="Download PDF receipt"
                          onClick={() => downloadFile(`/payments/${p._id}/invoice.pdf`, `receipt-${(p.order || p.printJob)?.receiptNo || p._id}.pdf`).catch((e) => setErr(e.message))}
                        >
                          <Icon name="download" size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function Payments() {
  const payments = useLoad(() => api('/payments/mine'));
  const ok = payments.data?.filter((p) => p.status === 'Success') || [];
  const total = ok.reduce((s, p) => s + p.amount - (p.refund?.status === 'Processed' ? p.refund.amount : 0), 0);
  const refunds = ok.filter((p) => p.refund?.status === 'Processed').reduce((s, p) => s + p.refund.amount, 0);
  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <Eyebrow>Nice and straightforward</Eyebrow>
          <h1 style={{ marginTop: 12 }}>Payments</h1>
          <p className="lead">Every payment with its PDF receipt. Tap a paid item to open the receipt.</p>
        </div>
      </div>
      <div className="stat-strip">
        <div className="stat-cell">
          <span className="tile tint-lavender">
            <Icon name="wallet" />
          </span>
          <div>
            <div className="label">Total paid</div>
            <div className="value">
              <strong>
                <Amount value={total} />
              </strong>
            </div>
          </div>
        </div>
        <div className="stat-cell">
          <span className="tile tint-mint">
            <Icon name="receipt" />
          </span>
          <div>
            <div className="label">Receipts</div>
            <div className="value">
              <strong>
                <CountUp value={ok.length} />
              </strong>
              <span>paid</span>
            </div>
          </div>
        </div>
        <div className="stat-cell">
          <span className="tile tint-coral">
            <Icon name="undo" />
          </span>
          <div>
            <div className="label">Refunded</div>
            <div className="value">
              <strong>
                <Amount value={refunds} />
              </strong>
            </div>
          </div>
        </div>
      </div>
      <PaymentsTable payments={payments} />
    </div>
  );
}

export function Receipt() {
  const { id } = useParams();
  const cafe = useCafe();
  const { data: p, error } = useLoad(() => api(`/payments/${id}/receipt`), [id]);
  const [dlError, setDlError] = useState('');
  if (error)
    return (
      <div className="narrow stack">
        <BackLink to="/payments">Payments</BackLink>
        <ErrorNote error={error} />
      </div>
    );
  if (!p) return <Loading />;
  const target = p.order || p.printJob;
  return (
    <div className="stack-lg" style={{ maxWidth: 640 }}>
      <BackLink to="/payments">Payments</BackLink>
      <div className="card pad-lg stack receipt rise">
        <div className="card-head">
          <div className="stack-xs">
            <h2>{cafe.cafeName || 'Cyber Cafe'}</h2>
            <span className="muted small">Payment receipt</span>
          </div>
          <span className="tile lg tint-mint">
            <Icon name="check" size={28} stroke={2.6} />
          </span>
        </div>
        <div className="perf" />
        <dl className="kv">
          <dt>Receipt no.</dt>
          <dd className="code">{target?.receiptNo}</dd>
          <dt>{p.order ? 'Order no.' : 'Print job'}</dt>
          <dd className="code">{p.order ? orderRef(p.order) : printRef(p.printJob)}</dd>
          <dt>Date</dt>
          <dd>{fmtDate(target?.paidAt || p.paidAt || p.updatedAt)}</dd>
          <dt>Customer</dt>
          <dd>
            {p.user?.name} · {p.user?.mobile}
          </dd>
          <dt>Item</dt>
          <dd>
            {p.order
              ? p.order.serviceName
              : `Printing: ${p.printJob.fileName} (${p.printJob.pages} pages × ${p.printJob.copies}, ${p.printJob.colorMode === 'color' ? 'colour' : 'B&W'}, ${p.printJob.paperSize})`}
          </dd>
          <dt>Payment ID</dt>
          <dd className="code small">{p.razorpayPaymentId}</dd>
          {p.refund?.status === 'Processed' && (
            <>
              <dt>Refunded</dt>
              <dd>
                {rupees(p.refund.amount)} on {fmtDate(p.refund.at)}
              </dd>
            </>
          )}
        </dl>
        {p.printJob?.pickupCode && p.printJob.status !== 'Collected' && (
          <div className="pickup-big">
            <span className="muted small">Show this code at the counter</span>
            <span className="code">{p.printJob.pickupCode}</span>
          </div>
        )}
        <div className="perf" />
        <div className="row between">
          <span className="muted">Amount paid</span>
          <span className="big-price">{rupees(p.amount)}</span>
        </div>
      </div>
      <div className="row wrap no-print">
        <button className="btn primary lg" onClick={() => downloadFile(`/payments/${id}/invoice.pdf`, `receipt-${target?.receiptNo || id}.pdf`).catch((e) => setDlError(e.message))}>
          <Icon name="download" size={18} /> Download PDF receipt
        </button>
        <button className="btn lg" onClick={() => window.print()}>
          <Icon name="printer" size={18} /> Print
        </button>
      </div>
      <ErrorNote error={dlError} />
    </div>
  );
}

/* ---------- Profile (FR-3, C5, D7) ---------- */
export function Profile() {
  const { user, updateUser, logout, login } = useAuth();
  const nav = useNavigate();
  const cafe = useCafe();
  const [form, setForm] = useState({ name: user.name, email: user.email || '' });
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  // Also used after the cafe resets the password: the customer lands here to pick their own
  async function changePassword(e) {
    e.preventDefault();
    setPwMsg('');
    setPwErr('');
    if (pw.next !== pw.confirm) return setPwErr('The new passwords do not match.');
    setPwBusy(true);
    try {
      const r = await api('/auth/change-password', { method: 'POST', body: { current: pw.current, next: pw.next } });
      login(r.token, r.user);
      setPw({ current: '', next: '', confirm: '' });
      setPwMsg('Password changed. Other devices were signed out.');
    } catch (e2) {
      setPwErr(e2.message);
    }
    setPwBusy(false);
  }
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [delErr, setDelErr] = useState('');

  async function save(e) {
    e.preventDefault();
    setMsg('');
    setError('');
    setBusy(true);
    try {
      updateUser(await api('/auth/me', { method: 'PUT', body: form }));
      setMsg('Profile saved.');
    } catch (e2) {
      setError(e2.message);
    }
    setBusy(false);
  }
  async function logoutAll() {
    await api('/auth/logout-all', { method: 'POST' }).catch(() => {});
    logout();
    nav('/login');
  }
  async function deleteAccount() {
    setDelErr('');
    try {
      await api('/auth/me', { method: 'DELETE' });
      logout();
      nav('/login');
    } catch (e) {
      setDelErr(e.message);
    }
  }

  return (
    <div className="stack-lg narrow">
      <div className="row" style={{ gap: 18 }}>
        <span className="avatar lg">{initials(user.name)}</span>
        <div>
          <h1>{user.name}</h1>
          <p className="muted">
            @{user.username}
            {user.mobile ? ` · +91 ${user.mobile}` : ''}
          </p>
        </div>
      </div>
      <form className="card pad-lg stack" onSubmit={save}>
        <h3>Your details</h3>
        <div className="form-grid">
          <label>
            Full name
            <input id="pname" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            <span>
              Email <span className="hint">(receipts are sent here)</span>
            </span>
            <input id="pemail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label>
            <span>
              Username <span className="hint">(used to log in, can't be changed)</span>
            </span>
            <input id="pusername" value={user.username || ''} disabled />
          </label>
          <label>
            <span>
              Mobile number <span className="hint">(for SMS updates, can't be changed)</span>
            </span>
            <input id="pmobile" value={user.mobile || ''} disabled />
          </label>
        </div>
        <ErrorNote error={error} />
        <SuccessNote>{msg}</SuccessNote>
        <div>
          <button className="btn primary" disabled={busy}>
            {busy && <span className="spinner" />} Save changes
          </button>
        </div>
      </form>

      <form className="card pad-lg stack" id="password" onSubmit={changePassword}>
        <h3>Change your password</h3>
        {user.mustChangePassword ? (
          <p className="error" role="alert">
            <Icon name="alert" size={18} />
            <span>The cafe reset your password. Enter the temporary password you were given, then choose your own.</span>
          </p>
        ) : (
          <p className="muted small">At least 4 characters. Changing it signs you out on other devices.</p>
        )}
        <label>
          Current password
          <PasswordInput id="cpcur" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
        </label>
        <div className="form-grid">
          <label>
            New password
            <PasswordInput id="cpnew" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />
          </label>
          <label>
            Repeat new password
            <PasswordInput id="cpnew2" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required />
          </label>
        </div>
        <ErrorNote error={pwErr} />
        <SuccessNote>{pwMsg}</SuccessNote>
        <div>
          <button className="btn" disabled={pwBusy || !pw.current || !pw.next || !pw.confirm}>
            {pwBusy && <span className="spinner" />} Change password
          </button>
        </div>
      </form>

      <div className="card pad-lg stack" id="help">
        <h3>Contact the cafe</h3>
        <div className="stack-sm small">
          {cafe.cafePhone && (
            <a className="row" style={{ gap: 8 }} href={`tel:${cafe.cafePhone}`}>
              <Icon name="phone" size={16} /> {cafe.cafePhone}
            </a>
          )}
          {cafe.cafeAddress && (
            <span className="row muted" style={{ gap: 8 }}>
              <Icon name="pin" size={16} /> {cafe.cafeAddress}
            </span>
          )}
          <span className="row muted" style={{ gap: 8 }}>
            <Icon name="clock" size={16} /> {dayRange(cafe.openDays || [])}, {fmtTime(cafe.openTime || '09:00')} – {fmtTime(cafe.closeTime || '20:00')}
          </span>
        </div>
      </div>

      <div className="card pad-lg stack">
        <h3>Privacy and security</h3>
        <div className="row between wrap">
          <div>
            <strong className="small">Download my data</strong>
            <p className="muted small">A copy of your account, orders and payments.</p>
          </div>
          <button className="btn" onClick={() => downloadFile('/auth/my-data', 'my-data.json').catch((e) => setError(e.message))}>
            <Icon name="download" size={16} /> Download
          </button>
        </div>
        <hr className="divider" />
        <div className="row between wrap">
          <div>
            <strong className="small">Log out on all devices</strong>
            <p className="muted small">Use this if you logged in on a shared computer.</p>
          </div>
          <button className="btn" onClick={logoutAll}>
            <Icon name="logout" size={16} /> Log out everywhere
          </button>
        </div>
        <hr className="divider" />
        <div className="row between wrap">
          <div>
            <strong className="small">Delete my account</strong>
            <p className="muted small">Deletes your documents and personal details. Receipts are kept without your name for tax records.</p>
          </div>
          <button className="btn danger" onClick={() => setDel(true)}>
            <Icon name="trash" size={16} /> Delete account
          </button>
        </div>
        <p className="tiny muted">
          <Link to="/privacy">Privacy policy</Link> · <Link to="/refund-policy">Refund policy</Link>
        </p>
      </div>

      {del && (
        <Modal onClose={() => setDel(false)} label="Delete account">
          <span className="tile tint-coral">
            <Icon name="trash" />
          </span>
          <h2>Delete your account?</h2>
          <p className="muted small">Your uploaded documents and personal details are deleted now. This can't be undone. Orders in progress must be finished first.</p>
          <label>
            Type DELETE to confirm
            <input id="confirmDelete" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </label>
          <ErrorNote error={delErr} />
          <div className="row">
            <button className="btn danger solid grow" disabled={confirmText !== 'DELETE'} onClick={deleteAccount}>
              Delete my account
            </button>
            <button className="btn" onClick={() => setDel(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
