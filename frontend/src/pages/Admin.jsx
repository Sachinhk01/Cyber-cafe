import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, uploadForm, downloadFile, viewDoc, saveDoc, rupees, fmtDate, fmtDay, orderRef, printRef } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PasswordInput } from '../PasswordInput.jsx';
import {
  Status,
  ErrorNote,
  SuccessNote,
  useLoad,
  useCafe,
  CountUp,
  BackLink,
  Eyebrow,
  Empty,
  Loading,
  Skeleton,
  Modal,
  FileItem,
  Dropzone,
  HeroArt,
  checkFile,
  initials,
} from '../components.jsx';
import { Icon, serviceIcon, serviceTint } from '../icons.jsx';

const CATEGORIES = ['Identity', 'Finance', 'Applications', 'Printing', 'Other'];

/* ---------- Admin login (FR-4, D6) ---------- */
export function AdminLogin() {
  const { login } = useAuth();
  const nav = useNavigate();
  const cafe = useCafe();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api('/auth/admin/login', { method: 'POST', body: form });
      login(r.token, r.user);
      nav(r.user.mustChangePassword ? '/admin/settings#password' : r.user.role === 'owner' ? '/admin' : '/admin/orders', { replace: true });
    } catch (e2) {
      setError(e2.message);
      setBusy(false);
    }
  }
  return (
    <div className="auth">
      <section className="auth-side">
        <span className="brand" style={{ color: '#fff' }}>
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="brand-text">
            <span className="brand-name">{(cafe.cafeName || 'Cyber Cafe').toLowerCase()}</span>
            <span className="brand-sub">Admin desk</span>
          </span>
        </span>
        <div className="stack">
          <Eyebrow plain>For the owner and staff</Eyebrow>
          <h1>Run the counter from one calm screen.</h1>
          <p>Orders, the print queue, payments, refunds and monthly reports for your cafe.</p>
        </div>
        <ul className="auth-points">
          {[
            ['orders', 'Process orders and send finished files'],
            ['printer', 'Move print jobs from queue to pickup'],
            ['download', 'Export monthly reports to Excel'],
          ].map(([i, t], k) => (
            <li key={i} className="rise" style={{ '--i': k + 2 }}>
              <span className="tile sm">
                <Icon name={i} size={18} />
              </span>
              {t}
            </li>
          ))}
        </ul>
        <div className="art auth-art">
          <HeroArt />
        </div>
      </section>
      <section className="auth-main">
        <div className="auth-card">
          <form className="card stack rise" onSubmit={submit}>
            <div className="stack-sm">
              <h2>Admin login</h2>
              <p className="muted">For the cafe owner and staff.</p>
            </div>
            <label>
              Email
              <input id="aemail" type="email" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoFocus />
            </label>
            <label>
              Password
             <PasswordInput id="apass" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />            </label>
            <p className="muted small">
              <Link to="/forgot-password">Forgot your password?</Link>
            </p>
            <ErrorNote error={error} />
            <button className="btn primary lg block" disabled={busy}>
              {busy && <span className="spinner" />} Log in
            </button>
          </form>
          <p className="muted small" style={{ textAlign: 'center' }}>
            Customer? <Link to="/login">Log in with your username</Link>
          </p>
        </div>
      </section>
    </div>
  );
}

const PageHead = ({ eyebrow, title, sub, children }) => (
  <div className="page-head">
    <div>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h1 style={{ marginTop: eyebrow ? 12 : 0 }}>{title}</h1>
      {sub && <p className="lead">{sub}</p>}
    </div>
    {children && <div className="row wrap">{children}</div>}
  </div>
);

/* ---------- Dashboard (FR-31) ---------- */
export function AdminDashboard() {
  const { user } = useAuth();
  const { data, error } = useLoad(() => api('/admin/stats'));
  if (error) return <ErrorNote error={error} />;
  if (!data)
    return (
      <div className="stack-lg">
        <div className="skeleton title" />
        <Skeleton rows={4} />
      </div>
    );
  const max = Math.max(1, ...data.daily.map((d) => d.revenue));
  const svcMax = Math.max(1, ...data.perService.map((s) => s.orders));
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const hour = new Date().getHours();
  const alerts = [
    data.cancelRequests > 0 && ['undo', 'tint-butter', `${data.cancelRequests} cancellation request${data.cancelRequests > 1 ? 's' : ''} waiting`, 'Approve and refund, or decline.', '/admin/orders?cancel=1'],
    data.rejectedUnrefunded > 0 && ['alert', 'tint-coral', `${data.rejectedUnrefunded} rejected order${data.rejectedUnrefunded > 1 ? 's' : ''} not refunded`, 'Open the order and refund the customer.', '/admin/orders?status=Rejected'],
    data.refundsDue > 0 && ['wallet', 'tint-coral', `${data.refundsDue} double payment${data.refundsDue > 1 ? 's' : ''} to refund`, 'A customer paid twice for the same item.', '/admin/payments'],
    data.failedNotifications > 0 && ['bell', 'tint-lavender', `${data.failedNotifications} SMS / email not delivered`, 'Check your SMS and email settings, then retry.', '/admin/activity?tab=messages'],
  ].filter(Boolean);

  return (
    <div className="stack-xl">
      <PageHead eyebrow={today} title={`${hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}, ${user.name.split(' ')[0]}`} sub="Here's how the counter is doing today.">
        <Link className="btn" to="/admin/print">
          <Icon name="printer" size={18} /> Print queue
        </Link>
        <Link className="btn primary" to="/admin/orders">
          <Icon name="orders" size={18} /> Open orders
        </Link>
      </PageHead>

      {alerts.length > 0 && (
        <div className="cols-2">
          {alerts.map(([icon, tint, title, sub, to], i) => (
            <Link key={title} to={to} className="card lift alert-card rise" style={{ '--i': i }}>
              <span className={`tile ${tint}`}>
                <Icon name={icon} />
              </span>
              <div>
                <strong>{title}</strong>
                <div className="muted small">{sub}</div>
              </div>
              <Icon name="arrowRight" size={18} className="go" />
            </Link>
          ))}
        </div>
      )}

      <div className="stats">
        <Stat i={0} feature icon="rupee" label="Revenue today" value={data.todayRevenue} money />
        <Stat i={1} icon="wallet" tint="tint-lavender" label="This month" value={data.monthRevenue} money />
        <Stat i={2} icon="check" tint="tint-mint" label="Orders paid today" value={data.todayOrders} />
        <Stat i={3} icon="orders" tint="tint-sky" label="Open orders" value={data.openOrders} link="/admin/orders" />
        <Stat i={4} icon="printer" tint="tint-butter" label="Print queue" value={data.printQueue} link="/admin/print" />
      </div>

      <div className="split">
        <section className="card pad-lg stack">
          <div className="card-head">
            <h3>Daily revenue</h3>
            <span className="muted small">Last 14 days, after refunds</span>
          </div>
          {data.daily.length === 0 ? (
            <Empty icon="rupee" title="No payments yet">
              Revenue shows here once customers start paying.
            </Empty>
          ) : (
            <div className="bars">
              {data.daily.map((d, i) => (
                <div key={d._id} className="bar-col" title={`${d._id}: ${rupees(d.revenue)}`}>
                  <span className="bar-val">{rupees(d.revenue)}</span>
                  <div className="bar" style={{ height: `${(d.revenue / max) * 100}%`, '--i': i }} />
                  <span className="bar-label">{`${d._id.slice(8)}/${d._id.slice(5, 7)}`}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="card pad-lg stack">
          <div className="card-head">
            <h3>Orders per service</h3>
            <span className="muted small">This month</span>
          </div>
          {data.perService.length === 0 ? (
            <Empty icon="briefcase" title="No paid orders this month" />
          ) : (
            <div className="hbars">
              {data.perService.map((s, i) => (
                <div key={s._id} className="hbar">
                  <span>{s._id}</span>
                  <span className="small">
                    <strong>{s.orders}</strong> <span className="muted">· {rupees(s.revenue)}</span>
                  </span>
                  <span className="track">
                    <span className="fill" style={{ width: `${(s.orders / svcMax) * 100}%`, animationDelay: `${i * 60}ms` }} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, link, icon, tint = '', money, feature, i = 0 }) {
  const inner = (
    <>
      <div className="row between">
        <span className="label">{label}</span>
        <span className={`tile sm ${tint}`}>
          <Icon name={icon} size={18} />
        </span>
      </div>
      <span className="num">
        {money && '₹'}
        <CountUp value={value} />
      </span>
    </>
  );
  const cls = `card stat rise ${feature ? 'feature' : ''} ${link ? 'lift' : ''}`;
  return link ? (
    <Link to={link} className={cls} style={{ '--i': i }}>
      {inner}
    </Link>
  ) : (
    <div className={cls} style={{ '--i': i }}>
      {inner}
    </div>
  );
}

/* ---------- Orders (FR-26, FR-27) ---------- */
export function AdminOrders() {
  const initial = Object.fromEntries(new URLSearchParams(window.location.search));
  const [filters, setFilters] = useState({ status: initial.status || '', service: '', from: '', to: '', q: '', cancel: initial.cancel || '' });
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, q })), 300);
    return () => clearTimeout(t);
  }, [q]);
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const services = useLoad(() => api('/admin/service-options'));
  const { data, error } = useLoad(() => api(`/admin/orders?${qs}`), [qs]);
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="stack-lg">
      <PageHead eyebrow="Keeping things moving" title="Orders" sub="Open an order to view documents, update its status, send finished files and message the customer.">
        {hasFilters && (
          <button
            className="btn ghost"
            onClick={() => {
              setQ('');
              setFilters({ status: '', service: '', from: '', to: '', q: '', cancel: '' });
            }}
          >
            <Icon name="x" size={16} /> Clear filters
          </button>
        )}
      </PageHead>
      <div className="card pad stack">
        <div className="row wrap" style={{ alignItems: 'flex-end' }}>
          <label className="grow" style={{ minWidth: 220 }}>
            Search
            <div className="search" style={{ minWidth: 0 }}>
              <Icon name="search" size={18} />
              <input id="oq" placeholder="Order no., name, mobile, reference" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </label>
          <label style={{ minWidth: 170 }}>
            Status
            <select id="fstatus" value={filters.status} onChange={set('status')}>
              <option value="">All paid</option>
              {['Submitted', 'In Progress', 'Completed', 'Rejected', 'PendingPayment'].map((s) => (
                <option key={s} value={s}>
                  {s === 'PendingPayment' ? 'Awaiting payment' : s}
                </option>
              ))}
            </select>
          </label>
          <label style={{ minWidth: 200 }}>
            Service
            <select id="fservice" value={filters.service} onChange={set('service')}>
              <option value="">All services</option>
              {services.data?.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            From
            <input id="ffrom" type="date" value={filters.from} onChange={set('from')} />
          </label>
          <label>
            To
            <input id="fto" type="date" value={filters.to} onChange={set('to')} />
          </label>
        </div>
        <div className="pills" style={{ alignSelf: 'flex-start' }}>
          <button className={!filters.cancel ? 'on' : ''} onClick={() => setFilters({ ...filters, cancel: '' })}>
            All
          </button>
          <button className={filters.cancel ? 'on' : ''} onClick={() => setFilters({ ...filters, cancel: '1' })}>
            Cancellation requests
          </button>
        </div>
      </div>
      <ErrorNote error={error} />
      {!data && !error && <Skeleton rows={5} />}
      {data && (
        <div className="card table-card fade">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Placed</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((o) => (
                  <tr key={o._id}>
                    <td>
                      <div className="cell-main">
                        <span className={`tile sm ${serviceTint(o.serviceName)}`}>
                          <Icon name={serviceIcon(o.serviceName)} size={17} />
                        </span>
                        <div>
                          <Link to={`/admin/orders/${o._id}`}>{o.serviceName}</Link>
                          <div className="sub code">{orderRef(o)}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {o.user?.name}
                      <div className="sub">{o.user?.mobile}</div>
                    </td>
                    <td className="small nowrap">{fmtDate(o.createdAt)}</td>
                    <td className="num strong">{o.totalAmount > 0 ? rupees(o.totalAmount) : 'Free'}</td>
                    <td>
                      <div className="row wrap" style={{ gap: 6 }}>
                        <Status value={o.status} />
                        {o.cancelRequest?.status === 'Requested' && <Status value="Requested" label="Cancel requested" />}
                        {o.paymentStatus === 'Refunded' && <Status value="Refunded" />}
                      </div>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan="5">
                      <Empty icon="search" title="No orders match these filters" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const toDateInput = (d) => (d ? new Date(new Date(d).getTime() + 330 * 60000).toISOString().slice(0, 10) : '');

export function AdminOrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const isOwner = user.role === 'owner';
  const { data, error, setData } = useLoad(() => api(`/admin/orders/${id}`), [id]);
  const [form, setForm] = useState({ status: '', remark: '', referenceNo: '', expectedBy: '', refund: true });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [fileErr, setFileErr] = useState('');
  const [resultFiles, setResultFiles] = useState([]);
  const [resultLabel, setResultLabel] = useState('');
  const [resultProgress, setResultProgress] = useState(null);
  const [decision, setDecision] = useState({ note: '' });

  useEffect(() => {
    if (data) {
      const o = data.order;
      setForm({ status: o.status, remark: o.remark || '', referenceNo: o.referenceNo || '', expectedBy: toDateInput(o.expectedBy), refund: true });
    }
  }, [data]);

  if (error)
    return (
      <div className="narrow stack">
        <BackLink to="/admin/orders">All orders</BackLink>
        <ErrorNote error={error} />
      </div>
    );
  if (!data) return <Loading />;
  const { order, documents, payments, nextStatuses, service } = data;
  const isPaid = ['Paid', 'Refunded'].includes(order.paymentStatus);
  const uploads = documents.filter((d) => d.kind !== 'result');
  const results = documents.filter((d) => d.kind === 'result');
  const cr = order.cancelRequest || {};
  const rejecting = form.status === 'Rejected' && order.paymentStatus === 'Paid' && order.totalAmount > 0;

  async function save(e) {
    e.preventDefault();
    setMsg('');
    setErr('');
    setBusy(true);
    try {
      const body = { status: form.status, remark: form.remark, referenceNo: form.referenceNo, expectedBy: form.expectedBy || '' };
      if (rejecting && isOwner && form.refund) body.refund = true;
      setData(await api(`/admin/orders/${id}`, { method: 'PATCH', body }));
      setMsg('Saved. The customer has been notified.');
    } catch (e2) {
      setErr(e2.message);
    }
    setBusy(false);
  }

  async function sendResults(e) {
    e.preventDefault();
    setFileErr('');
    if (!resultFiles.length) return setFileErr('Choose a file to send.');
    const fd = new FormData();
    resultFiles.forEach((f) => fd.append('files', f));
    fd.append('label', resultLabel);
    try {
      setResultProgress(0);
      setData(await uploadForm(`/admin/orders/${id}/results`, fd, setResultProgress));
      setResultFiles([]);
      setResultLabel('');
    } catch (e2) {
      setFileErr(e2.message);
    }
    setResultProgress(null);
  }

  async function removeResult(docId) {
    setFileErr('');
    try {
      setData(await api(`/admin/orders/${id}/results/${docId}`, { method: 'DELETE' }));
    } catch (e2) {
      setFileErr(e2.message);
    }
  }

  async function decide(approve) {
    setErr('');
    setBusy(true);
    try {
      setData(await api(`/admin/orders/${id}/cancel-decision`, { method: 'POST', body: { approve, note: decision.note } }));
      setMsg(approve ? 'Order cancelled and refunded. The customer has been notified.' : 'Request declined. The customer has been notified.');
    } catch (e2) {
      setErr(e2.message);
    }
    setBusy(false);
  }

  return (
    <div className="stack-lg">
      <BackLink to="/admin/orders">All orders</BackLink>
      <div className="page-head">
        <div className="row top" style={{ gap: 18 }}>
          <span className={`tile lg ${serviceTint(order.serviceName)}`}>
            <Icon name={serviceIcon(order.serviceName)} size={26} />
          </span>
          <div className="stack-sm">
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="chip code">{orderRef(order)}</span>
              <Status value={order.status} />
              <Status value={order.paymentStatus} />
              {order.referenceNo && (
                <span className="chip">
                  <Icon name="hash" size={13} /> {order.referenceNo}
                </span>
              )}
            </div>
            <h1>{order.serviceName}</h1>
            <p className="muted small">
              Placed {fmtDate(order.createdAt)}
              {order.expectedBy && ` · expected by ${fmtDay(order.expectedBy)}`}
            </p>
          </div>
        </div>
        <div className="stack-xs right">
          <span className="muted small">Amount</span>
          <span className="big-price">{order.totalAmount > 0 ? rupees(order.totalAmount) : 'Free'}</span>
        </div>
      </div>

      {cr.status === 'Requested' && (
        <div className="card pad-lg stack" style={{ borderColor: '#f3e2b3', background: '#fffdf6' }}>
          <div className="card-title">
            <span className="tile tint-butter">
              <Icon name="undo" />
            </span>
            <div>
              <h3>The customer asked to cancel</h3>
              <p className="small">
                “{cr.reason}” <span className="muted">· {fmtDate(cr.at)}</span>
              </p>
            </div>
          </div>
          {isOwner ? (
            <>
              <label>
                Note to the customer (optional)
                <input id="decisionNote" value={decision.note} onChange={(e) => setDecision({ note: e.target.value })} placeholder="e.g. Work had already started" />
              </label>
              <div className="row wrap">
                <button className="btn primary" disabled={busy} onClick={() => decide(true)}>
                  <Icon name="check" size={16} /> Approve and refund {order.totalAmount > 0 ? rupees(order.totalAmount) : ''}
                </button>
                <button className="btn" disabled={busy} onClick={() => decide(false)}>
                  Decline
                </button>
              </div>
            </>
          ) : (
            <p className="muted small">Only the owner can approve a cancellation (it refunds the customer).</p>
          )}
        </div>
      )}

      <div className="split wide-side">
        <div className="stack">
          <div className="card pad-lg stack">
            <div className="row">
              <span className="avatar">{initials(order.user?.name)}</span>
              <div className="grow">
                <strong>{order.user?.name}</strong>
                <div className="muted small">
                  {order.user?.mobile && <a href={`tel:${order.user.mobile}`}>{order.user.mobile}</a>}
                  {order.user?.email && ` · ${order.user.email}`}
                </div>
              </div>
              {order.user?.mobile && (
                <a className="btn sm" href={`tel:${order.user.mobile}`}>
                  <Icon name="phone" size={15} /> Call
                </a>
              )}
            </div>
            {Object.keys(order.details || {}).length > 0 && (
              <dl className="kv">
                {Object.entries(order.details || {}).map(([k, v]) => (
                  <KV key={k} k={k} v={v} />
                ))}
              </dl>
            )}
            <dl className="kv">
              <dt>Receipt</dt>
              <dd className="code">{order.receiptNo || '-'}</dd>
              <dt>Agreed to terms</dt>
              <dd>{order.agreedToTermsAt ? fmtDate(order.agreedToTermsAt) : '-'}</dd>
            </dl>
          </div>

          <div className="card pad-lg stack">
            <div className="card-head">
              <h3>Customer's documents</h3>
              <span className="muted small">{uploads.length} file{uploads.length === 1 ? '' : 's'}</span>
            </div>
            {uploads.length === 0 && <p className="muted small">No documents (none required, or deleted after the retention period).</p>}
            <div className="files">
              {uploads.map((d) => (
                <FileItem key={d._id} doc={d} onError={setFileErr} />
              ))}
            </div>
            <p className="tiny muted">Opening or downloading a document is recorded in the activity log.</p>
          </div>

          <div className="card pad-lg stack">
            <div className="card-head">
              <div>
                <h3>Files for the customer</h3>
                <p className="muted small">Send the finished work (typed resume, acknowledgement slip, policy PDF). The customer downloads it from their order.</p>
              </div>
            </div>
            <div className="files">
              {results.map((d) => (
                <FileItem
                  key={d._id}
                  doc={d}
                  tone="result"
                  onError={setFileErr}
                  extra={
                    <button className="btn sm ghost" title="Remove" aria-label="Remove file" onClick={() => removeResult(d._id)}>
                      <Icon name="trash" size={15} />
                    </button>
                  }
                />
              ))}
            </div>
            {isPaid ? (
              <form className="stack-sm" onSubmit={sendResults}>
                <Dropzone
                  compact
                  id="resultFile"
                  label={resultFiles.length ? `${resultFiles.length} file${resultFiles.length > 1 ? 's' : ''} chosen` : 'Choose the finished file'}
                  file={resultFiles[0]}
                  onFile={(f) => {
                    const p = checkFile(f);
                    if (p) return setFileErr(p);
                    setFileErr('');
                    setResultFiles((cur) => [...cur, f].slice(0, 5));
                  }}
                />
                {resultFiles.length > 1 && <p className="tiny muted">{resultFiles.map((f) => f.name).join(', ')}</p>}
                <div className="row wrap">
                  <input id="resultLabel" className="grow" style={{ minWidth: 200 }} placeholder="Name shown to the customer, e.g. Acknowledgement slip" value={resultLabel} onChange={(e) => setResultLabel(e.target.value)} />
                  <button className="btn primary" disabled={resultProgress !== null || !resultFiles.length}>
                    {resultProgress !== null ? <span className="spinner" /> : <Icon name="send" size={16} />} Send to customer
                  </button>
                  {resultFiles.length > 0 && (
                    <button type="button" className="btn ghost" onClick={() => setResultFiles([])}>
                      Clear
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <p className="muted small">Available after the customer pays.</p>
            )}
            <ErrorNote error={fileErr} />
          </div>

          <div className="card pad-lg stack">
            <h3>Payment attempts</h3>
            {payments.length === 0 && <p className="muted small">No payment attempts yet.</p>}
            {payments.map((p) => (
              <div key={p._id} className="row wrap small" style={{ gap: 10 }}>
                <Status value={p.status} />
                <strong>{rupees(p.amount)}</strong>
                <span className="muted">{fmtDate(p.createdAt)}</span>
                {p.mock && <span className="chip">test</span>}
                {p.duplicate && <Status value="PendingPayment" label="Paid twice" />}
                {p.refund?.status === 'Processed' && <span className="muted">refunded {rupees(p.refund.amount)}</span>}
              </div>
            ))}
          </div>
        </div>

        <aside className="stack">
          {isPaid ? (
            <form className="card pad-lg stack" onSubmit={save}>
              <h3>Update order</h3>
              <div className="stack-sm">
                <strong className="small">Status</strong>
                <div className="pills">
                  {[order.status, ...nextStatuses].map((s) => (
                    <button type="button" key={s} className={form.status === s ? 'on' : ''} onClick={() => setForm({ ...form, status: s })}>
                      {s === order.status ? `${s} (now)` : s}
                    </button>
                  ))}
                </div>
                {nextStatuses.length === 0 && <span className="tiny muted">This status is final.</span>}
              </div>
              <label>
                <span>
                  Reference / acknowledgement no. <span className="hint">(shown to the customer)</span>
                </span>
                <input id="oref" value={form.referenceNo} onChange={(e) => setForm({ ...form, referenceNo: e.target.value })} placeholder="e.g. URN 1234-5678" />
              </label>
              <label>
                Expected ready date
                <input id="oexp" type="date" value={form.expectedBy} onChange={(e) => setForm({ ...form, expectedBy: e.target.value })} />
              </label>
              <label>
                Note for the customer
                <textarea id="oremark" rows="3" value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} placeholder="e.g. Submitted on the portal, you'll get an SMS from UIDAI" />
              </label>
              {rejecting && (
                <div className="note warn" style={{ display: 'block' }}>
                  {isOwner ? (
                    <label className="check">
                      <input id="orefund" type="checkbox" checked={form.refund} onChange={(e) => setForm({ ...form, refund: e.target.checked })} />
                      <span>
                        Reject <strong>and refund {rupees(order.totalAmount)}</strong> to the customer now
                      </span>
                    </label>
                  ) : (
                    <span className="small">Rejecting doesn't refund. The owner will refund it (it shows on their dashboard).</span>
                  )}
                </div>
              )}
              <ErrorNote error={err} />
              <SuccessNote>{msg}</SuccessNote>
              <button className="btn primary lg block" disabled={busy}>
                {busy ? <span className="spinner" /> : <Icon name="bell" size={18} />} Save and notify customer
              </button>
              {order.status === 'Rejected' && order.paymentStatus === 'Paid' && order.totalAmount > 0 && isOwner && (
                <button type="button" className="btn danger block" disabled={busy} onClick={() => api(`/admin/orders/${id}`, { method: 'PATCH', body: { status: 'Rejected', refund: true } }).then(setData).then(() => setMsg('Refunded.')).catch((e2) => setErr(e2.message))}>
                  <Icon name="undo" size={16} /> Refund {rupees(order.totalAmount)} now
                </button>
              )}
            </form>
          ) : (
            <div className="note warn">
              <Icon name="clock" size={18} />
              <span>This order is waiting for payment, so it can't be processed yet.</span>
            </div>
          )}

          <div className="card pad-lg stack">
            <h3>History</h3>
            {order.history?.length ? (
              <ol className="timeline">
                {[...order.history].reverse().map((h, i) => (
                  <li key={i}>
                    <div className="t-head">
                      <span>{h.status === 'PendingPayment' ? 'Created' : h.status}</span>
                      <span className="t-meta">{fmtDate(h.at)}</span>
                    </div>
                    {h.note && <div className="t-note">{h.note}</div>}
                    <div className="t-meta">{h.by}</div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted small">No history yet.</p>
            )}
          </div>

          {service?.steps?.length > 0 && (
            <details className="acc">
              <summary>
                <Icon name="list" size={18} />
                <strong className="small">Procedure shown to the customer</strong>
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

/* ---------- Print queue (FR-21, FR-22, A1, F3) ---------- */
const LANES = [
  ['Pending', 'Waiting', 'clock', 'tint-butter'],
  ['Printing', 'Printing', 'printer', 'tint-sky'],
  ['Ready', 'Ready for pickup', 'check', 'tint-mint'],
];

export function AdminPrintQueue() {
  const [showCollected, setShowCollected] = useState(false);
  const { data, error, reload } = useLoad(() => api(`/admin/print-jobs${showCollected ? '?status=Collected' : ''}`), [showCollected]);
  const [err, setErr] = useState('');
  const [codes, setCodes] = useState({});
  const [moving, setMoving] = useState(null);

  // Refresh every 30 seconds so new paid jobs show up without a reload
  useEffect(() => {
    const t = setInterval(reload, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCollected]);

  async function move(job, next) {
    setErr('');
    setMoving(job._id);
    try {
      await api(`/admin/print-jobs/${job._id}`, { method: 'PATCH', body: { status: next, pickupCode: codes[job._id] } });
      reload();
    } catch (e) {
      setErr(e.message);
    }
    setMoving(null);
  }

  const jobCard = (j, i) => (
    <div key={j._id} className="card job rise" style={{ '--i': i }}>
      <div className="row between top">
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.fileName}</strong>
          <span className="tiny muted code">{printRef(j)}</span>
        </div>
        <strong>{rupees(j.price)}</strong>
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        <span className="chip">
          {j.pages} pg × {j.copies}
        </span>
        <span className="chip">{j.colorMode === 'color' ? 'Colour' : 'B&W'}</span>
        <span className="chip">{j.paperSize}</span>
      </div>
      <div className="muted small">
        {j.user?.name} · {j.user?.mobile}
        <br />
        Paid {fmtDate(j.paidAt || j.createdAt)}
      </div>
      {j.documentId ? (
        <div className="row">
          <button className="btn sm grow" onClick={() => viewDoc(j.documentId).catch((e) => setErr(e.message))}>
            <Icon name="eye" size={15} /> View
          </button>
          <button className="btn sm grow" onClick={() => saveDoc(j.documentId, j.documentName || j.fileName).catch((e) => setErr(e.message))}>
            <Icon name="download" size={15} /> Download
          </button>
        </div>
      ) : (
        <span className="tiny muted">File deleted after the retention period.</span>
      )}
      {j.status === 'Pending' && (
        <button className="btn primary block" disabled={moving === j._id} onClick={() => move(j, 'Printing')}>
          <Icon name="printer" size={16} /> Start printing
        </button>
      )}
      {j.status === 'Printing' && (
        <div className="row">
          <button className="btn primary grow" disabled={moving === j._id} onClick={() => move(j, 'Ready')}>
            <Icon name="check" size={16} /> Mark ready
          </button>
          <button className="btn ghost" title="Back to waiting" disabled={moving === j._id} onClick={() => move(j, 'Pending')}>
            <Icon name="undo" size={16} />
          </button>
        </div>
      )}
      {j.status === 'Ready' && (
        <div className="row">
          <input
            id={`code_${j._id}`}
            className="grow code"
            placeholder="Pickup code"
            aria-label="Customer's pickup code"
            inputMode="numeric"
            maxLength={4}
            value={codes[j._id] || ''}
            onChange={(e) => setCodes({ ...codes, [j._id]: e.target.value.replace(/\D/g, '') })}
          />
          <button className="btn accent" disabled={moving === j._id || (codes[j._id] || '').length < 4} onClick={() => move(j, 'Collected')}>
            Hand over
          </button>
        </div>
      )}
      {j.status === 'Collected' && <Status value="Collected" />}
    </div>
  );

  return (
    <div className="stack-lg">
      <PageHead eyebrow="Print services" title="Print queue" sub="Paid print jobs. Ask for the customer's 4-digit pickup code before handing over.">
        <button className={`btn ${showCollected ? 'primary' : ''}`} onClick={() => setShowCollected(!showCollected)}>
          {showCollected ? 'Back to open jobs' : 'Show collected'}
        </button>
        <button className="btn" onClick={reload}>
          <Icon name="refresh" size={16} /> Refresh
        </button>
      </PageHead>
      <ErrorNote error={error || err} />
      {!data && !error && <Skeleton rows={3} />}
      {data &&
        (showCollected ? (
          data.length === 0 ? (
            <Empty icon="printer" title="No collected jobs yet" />
          ) : (
            <div className="svc-grid">{data.map(jobCard)}</div>
          )
        ) : (
          <div className="board">
            {LANES.map(([key, label, icon, tint]) => {
              const jobs = data.filter((j) => j.status === key);
              return (
                <section key={key} className="lane">
                  <div className="lane-head">
                    <span className="row" style={{ gap: 10 }}>
                      <span className={`tile sm ${tint}`}>
                        <Icon name={icon} size={16} />
                      </span>
                      {label}
                    </span>
                    <span className="count">{jobs.length}</span>
                  </div>
                  {jobs.length === 0 && <div className="lane-empty">Nothing here</div>}
                  {jobs.map(jobCard)}
                </section>
              );
            })}
          </div>
        ))}
    </div>
  );
}

/* ---------- Services CRUD (FR-25, A2) ---------- */
const EMPTY = {
  name: '',
  category: 'Identity',
  description: '',
  price: '',
  processingTime: '',
  processingDays: '',
  requiredDocs: '',
  detailFields: '',
  steps: '',
  included: '',
  notIncluded: '',
  notes: '',
  terms: '',
  isActive: true,
};

export function AdminServices() {
  const { data, error, reload } = useLoad(() => api('/services/all'));
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  function edit(s) {
    setEditing(s?._id || 'new');
    setErr('');
    setMsg('');
    setForm(
      s
        ? {
            name: s.name,
            category: s.category || 'Other',
            description: s.description,
            price: s.price,
            processingTime: s.processingTime || '',
            processingDays: s.processingDays || '',
            requiredDocs: s.requiredDocs.join(', '),
            detailFields: s.detailFields.join(', '),
            steps: (s.steps || []).join('\n'),
            included: (s.included || []).join('\n'),
            notIncluded: (s.notIncluded || []).join('\n'),
            notes: s.notes || '',
            terms: s.terms || '',
            isActive: s.isActive,
          }
        : EMPTY
    );
  }

  async function save(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const body = { ...form, price: Number(form.price), processingDays: Number(form.processingDays) || 0 };
      if (editing === 'new') await api('/services', { method: 'POST', body });
      else await api(`/services/${editing}`, { method: 'PUT', body });
      setMsg(`"${form.name}" saved.`);
      setEditing(null);
      reload();
    } catch (e2) {
      setErr(e2.message);
    }
    setBusy(false);
  }

  async function remove(s) {
    setErr('');
    setMsg('');
    try {
      const r = await api(`/services/${s._id}`, { method: 'DELETE' });
      setMsg(r.deleted ? `"${s.name}" was deleted.` : `"${s.name}" has orders, so it was hidden instead of deleted. Old orders stay readable.`);
      setConfirmId(null);
      reload();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function toggle(s) {
    setErr('');
    setMsg('');
    try {
      await api(`/services/${s._id}`, { method: 'PUT', body: { ...s, isActive: !s.isActive } });
      reload();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div className="stack-lg">
      <PageHead eyebrow="For the everyday" title="Services" sub="What customers can order: price, procedure, documents, what's included and the terms they agree to.">
        <button className="btn primary" onClick={() => edit(null)}>
          <Icon name="plus" size={18} /> Add service
        </button>
      </PageHead>
      <ErrorNote error={error || (!editing && err)} />
      <SuccessNote>{msg}</SuccessNote>
      {!data && !error && <Skeleton rows={6} kind="card" />}
      {data?.length === 0 && <Empty icon="briefcase" title="No services yet" action={<button className="btn primary sm" onClick={() => edit(null)}>Add your first service</button>} />}
      <div className="svc-grid">
        {data?.map((s, i) => (
          <div key={s._id} className="card svc-card rise" style={{ '--i': i, opacity: s.isActive ? 1 : 0.7 }}>
            <div className="top">
              <span className={`tile ${serviceTint(s.name)}`}>
                <Icon name={serviceIcon(s.name)} size={20} />
              </span>
              <div className="row" style={{ gap: 6 }}>
                <span className="chip">{s.category || 'Other'}</span>
                {s.isActive ? <Status value="Completed" label="Shown" /> : <Status value="Refunded" label="Hidden" />}
              </div>
            </div>
            <div className="stack-xs">
              <h3>{s.name}</h3>
              <p>{s.description}</p>
              <span className="tiny muted">
                {s.requiredDocs.length} document{s.requiredDocs.length === 1 ? '' : 's'} · {(s.steps || []).length} step{(s.steps || []).length === 1 ? '' : 's'}
                {s.processingTime ? ` · ${s.processingTime}` : ''}
                {!(s.steps || []).length && <strong style={{ color: 'var(--bad)' }}> · add the procedure</strong>}
              </span>
            </div>
            <div className="foot">
              <span className="price-from">
                <strong>{s.price ? rupees(s.price) : 'Free'}</strong>
              </span>
              <div className="actions">
                <button className="btn sm" onClick={() => edit(s)}>
                  <Icon name="pencil" size={14} /> Edit
                </button>
                <button className="btn sm ghost" onClick={() => toggle(s)} title={s.isActive ? 'Hide from customers' : 'Show to customers'}>
                  <Icon name={s.isActive ? 'eye' : 'plus'} size={14} /> {s.isActive ? 'Hide' : 'Show'}
                </button>
                {confirmId === s._id ? (
                  <button className="btn sm danger" onClick={() => remove(s)}>
                    Confirm
                  </button>
                ) : (
                  <button className="btn sm ghost" aria-label="Delete" title="Delete" onClick={() => setConfirmId(s._id)}>
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <Modal wide onClose={() => setEditing(null)} busy={busy} label="Service">
          <form className="stack" onSubmit={save}>
            <h2>{editing === 'new' ? 'New service' : 'Edit service'}</h2>
            <div className="form-grid">
              <label className="full">
                Name
                <input id="sname" value={form.name} onChange={set('name')} required />
              </label>
              <label>
                Category
                <select id="scat" value={form.category} onChange={set('category')}>
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Price (₹)
                <input id="sprice" type="number" min="0" value={form.price} onChange={set('price')} required />
              </label>
              <label>
                <span>
                  Processing time <span className="hint">(shown, e.g. 1-2 days)</span>
                </span>
                <input id="stime" value={form.processingTime} onChange={set('processingTime')} placeholder="Same day" />
              </label>
              <label>
                <span>
                  Days to complete <span className="hint">(sets the expected date)</span>
                </span>
                <input id="sdays" type="number" min="0" max="365" value={form.processingDays} onChange={set('processingDays')} />
              </label>
              <label className="full">
                Short description
                <textarea id="sdesc" rows="2" value={form.description} onChange={set('description')} />
              </label>
              <label>
                <span>
                  Required documents <span className="hint">(comma separated)</span>
                </span>
                <input id="sdocs" value={form.requiredDocs} onChange={set('requiredDocs')} placeholder="Aadhaar card, Passport photo" />
              </label>
              <label>
                <span>
                  Details to ask <span className="hint">(comma separated)</span>
                </span>
                <input id="sfields" value={form.detailFields} onChange={set('detailFields')} placeholder="Phone number" />
              </label>
              <label className="full">
                <span>
                  Steps <span className="hint">(one per line, shown before the customer uploads)</span>
                </span>
                <textarea id="ssteps" rows="4" value={form.steps} onChange={set('steps')} placeholder={'Upload your documents\nWe check and call you if something is missing\nWe submit the application'} />
              </label>
              <label>
                <span>
                  Included <span className="hint">(one per line)</span>
                </span>
                <textarea id="sinc" rows="3" value={form.included} onChange={set('included')} placeholder="Form filling" />
              </label>
              <label>
                <span>
                  Not included <span className="hint">(e.g. government fees)</span>
                </span>
                <textarea id="snot" rows="3" value={form.notIncluded} onChange={set('notIncluded')} placeholder="Government fee (Rs 107, paid separately)" />
              </label>
              <label className="full">
                Good to know
                <textarea id="snotes" rows="2" value={form.notes} onChange={set('notes')} />
              </label>
              <label className="full">
                <span>
                  Terms <span className="hint">(the customer must agree before paying)</span>
                </span>
                <textarea id="sterms" rows="3" value={form.terms} onChange={set('terms')} />
              </label>
              <label className="check full">
                <input id="sactive" type="checkbox" checked={form.isActive} onChange={set('isActive')} /> Shown to customers
              </label>
            </div>
            <ErrorNote error={err} />
            <div className="row">
              <button className="btn primary" disabled={busy}>
                {busy && <span className="spinner" />} Save service
              </button>
              <button type="button" className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ---------- Payments (FR-28) ---------- */
export function AdminPayments() {
  const [status, setStatus] = useState('');
  const { data, error, reload } = useLoad(() => api(`/admin/payments${status ? `?status=${status}` : ''}`), [status]);
  const [refunding, setRefunding] = useState(null);
  const [err, setErr] = useState('');
  return (
    <div className="stack-lg">
      <PageHead eyebrow="Nice and straightforward" title="Payments" sub="Every transaction, with PDF receipts and refunds.">
        <div className="pills" role="tablist">
          {[
            ['', 'All'],
            ['Success', 'Paid'],
            ['Pending', 'Pending'],
            ['Failed', 'Failed'],
          ].map(([v, l]) => (
            <button key={l} role="tab" aria-selected={status === v} className={status === v ? 'on' : ''} onClick={() => setStatus(v)}>
              {l}
            </button>
          ))}
        </div>
      </PageHead>
      <ErrorNote error={error || err} />
      {refunding && (
        <RefundForm
          payment={refunding}
          onClose={() => setRefunding(null)}
          onDone={() => {
            setRefunding(null);
            reload();
          }}
        />
      )}
      {!data && !error && <Skeleton rows={5} />}
      {data && (
        <div className="card table-card fade">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Item</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                  <th>Payment ID</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p._id}>
                    <td className="small nowrap">{fmtDate(p.createdAt)}</td>
                    <td>
                      {p.user?.name}
                      <div className="sub">{p.user?.mobile}</div>
                    </td>
                    <td>
                      {p.kind === 'order' ? p.order?.serviceName : `Print: ${p.printJob?.fileName}`}
                      <div className="sub code">{p.kind === 'order' ? orderRef(p.order) : printRef(p.printJob)}</div>
                    </td>
                    <td className="num strong">{rupees(p.amount)}</td>
                    <td>
                      <div className="row wrap" style={{ gap: 6 }}>
                        <Status value={p.status} />
                        {p.mock && <span className="chip">test</span>}
                        {p.duplicate && <Status value="PendingPayment" label="Paid twice" />}
                      </div>
                      {p.refund?.status === 'Processed' && <div className="sub">Refunded {rupees(p.refund.amount)}</div>}
                      {p.refund?.status === 'Failed' && <div className="sub" style={{ color: 'var(--bad)' }}>Refund failed</div>}
                    </td>
                    <td className="code tiny">{p.razorpayPaymentId || '-'}</td>
                    <td>
                      <div className="actions">
                        {p.status === 'Success' && (
                          <button className="btn sm" onClick={() => downloadFile(`/admin/payments/${p._id}/invoice.pdf`, `receipt-${p._id}.pdf`).catch((e) => setErr(e.message))}>
                            <Icon name="download" size={14} /> PDF
                          </button>
                        )}
                        {p.status === 'Success' && p.amount > 0 && p.refund?.status !== 'Processed' && (
                          <button className="btn sm danger" onClick={() => setRefunding(p)}>
                            Refund
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan="7">
                      <Empty icon="wallet" title="No payments here yet" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function RefundForm({ payment, onClose, onDone }) {
  const [amount, setAmount] = useState(String(payment.amount));
  const [reason, setReason] = useState(payment.duplicate ? 'Paid twice' : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api(`/admin/payments/${payment._id}/refund`, { method: 'POST', body: { amount: Number(amount), reason } });
      onDone();
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  }
  const item = payment.kind === 'order' ? payment.order?.serviceName : `Print: ${payment.printJob?.fileName}`;
  return (
    <Modal onClose={onClose} busy={busy} label="Refund">
      <form className="stack" onSubmit={submit}>
        <span className="tile tint-coral">
          <Icon name="undo" />
        </span>
        <h2>Refund {payment.user?.name}</h2>
        <p className="muted small">
          {item} · paid {rupees(payment.amount)} on {fmtDate(payment.paidAt || payment.createdAt)}. The money goes back to the customer's original payment method through Razorpay
          {payment.mock ? ' (test payment, so nothing is sent)' : ''}.
        </p>
        <label>
          Amount (₹)
          <input id="ramount" type="number" min="1" max={payment.amount} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label>
          Reason (sent to the customer)
          <input id="rreason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Order rejected: document unclear" />
        </label>
        <ErrorNote error={err} />
        <div className="row">
          <button className="btn primary grow" disabled={busy}>
            {busy ? (
              <>
                <span className="spinner" /> Refunding…
              </>
            ) : (
              `Refund ${rupees(amount)}`
            )}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- Customers + monthly report (FR-29, FR-30) ---------- */
export function AdminCustomers() {
  const { data, error } = useLoad(() => api('/admin/customers'));
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [resetFor, setResetFor] = useState(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetErr, setResetErr] = useState('');
  const [resetDone, setResetDone] = useState(null);
  const shown = data?.customers.filter((c) => `${c.name} ${c.username || ''} ${c.mobile || ''} ${c.email || ''}`.toLowerCase().includes(q.trim().toLowerCase()));

  async function exportXlsx() {
    setErr('');
    setBusy(true);
    try {
      await downloadFile(`/admin/reports/export?month=${month}`, `cyber-cafe-report-${month}.xlsx`);
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  }

  function closeReset() {
    setResetFor(null);
    setResetDone(null);
    setResetErr('');
  }

  async function doReset() {
    setResetErr('');
    setResetBusy(true);
    try {
      setResetDone(await api(`/admin/customers/${resetFor._id}/reset-password`, { method: 'POST' }));
    } catch (e) {
      setResetErr(e.message);
    }
    setResetBusy(false);
  }

  return (
    <div className="stack-lg">
      <PageHead eyebrow="People" title="Customers" sub="Everyone who signed up, what they spent, and a monthly Excel report.">
        <input id="rmonth" type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Report month" style={{ width: 'auto' }} />
        <button className="btn primary" onClick={exportXlsx} disabled={busy}>
          {busy ? <span className="spinner" /> : <Icon name="download" size={18} />} Export to Excel
        </button>
      </PageHead>
      <ErrorNote error={error || err} />
      {!data && !error && <Skeleton rows={5} />}
      {data && (
        <>
          {data.monthly.length > 0 && (
            <div className="stats">
              {data.monthly.slice(0, 6).map((m, i) => (
                <div key={m._id} className="card stat rise" style={{ '--i': i }}>
                  <span className="label">{new Date(m._id + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
                  <span className="num">
                    <CountUp value={m.count} /> <span className="small muted">new</span>
                  </span>
                  <span className="muted small">{m.active || 0} paying customers</span>
                </div>
              ))}
            </div>
          )}
          <div className="section-head">
            <h2>All customers</h2>
            <div className="search">
              <Icon name="search" size={18} />
              <input id="csearch" placeholder="Search name, username or mobile" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
            </div>
          </div>
          <div className="card table-card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Mobile</th>
                    <th>Email</th>
                    <th>Joined</th>
                    <th className="num">Payments</th>
                    <th className="num">Total spent</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => (
                    <tr key={c._id}>
                      <td>
                        <div className="cell-main">
                          <span className="avatar">{initials(c.name)}</span>
                          <strong>{c.name}</strong>
                        </div>
                      </td>
                      <td>{c.username || <span className="muted">-</span>}</td>
                      <td>{c.mobile || <span className="muted">-</span>}</td>
                      <td className="small">{c.email || <span className="muted">-</span>}</td>
                      <td className="small nowrap">{fmtDay(c.createdAt)}</td>
                      <td className="num">{c.payments}</td>
                      <td className="num strong">{rupees(c.totalSpent)}</td>
                      <td>
                        {c.username && !c.deletedAt && (
                          <button className="btn sm" onClick={() => setResetFor(c)}>
                            <Icon name="key" size={14} /> Reset password
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan="8">
                        <Empty icon="users" title={q ? 'No customer matches that search' : 'No customers yet'} />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {resetFor && (
        <Modal onClose={closeReset} busy={resetBusy} label="Reset password">
          <span className="tile tint-butter">
            <Icon name="key" />
          </span>
          {!resetDone ? (
            <>
              <h2>Reset password for {resetFor.name}?</h2>
              <p className="muted small">
                We make a temporary password for <strong>{resetFor.username}</strong> and sign them out on every device. Give it to the customer at the counter or on the phone. They will choose their own password after they log in.
              </p>
              <ErrorNote error={resetErr} />
              <div className="row">
                <button className="btn primary grow" onClick={doReset} disabled={resetBusy}>
                  {resetBusy && <span className="spinner" />} Make temporary password
                </button>
                <button className="btn" onClick={closeReset} disabled={resetBusy}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <h2>Temporary password ready</h2>
              <p className="muted small">Username: <strong>{resetDone.username}</strong></p>
              <p className="dev-note" style={{ fontSize: '1.3rem', letterSpacing: 1, textAlign: 'center' }}>
                <strong>{resetDone.tempPassword}</strong>
              </p>
              <p className="muted small">This is shown only once. Close this window and it is gone, so tell the customer now.</p>
              <button className="btn primary block" onClick={closeReset}>Done</button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

/* ---------- Activity log + failed messages (D8, E4) ---------- */
const ACTION_LABEL = {
  'document.viewed': ['eye', 'Viewed a document'],
  'document.downloaded': ['download', 'Downloaded a document'],
  'order.status': ['orders', 'Changed order status'],
  'order.updated': ['pencil', 'Updated an order'],
  'order.result-uploaded': ['send', 'Sent files to customer'],
  'order.result-removed': ['trash', 'Removed a sent file'],
  'order.cancel-approved': ['undo', 'Approved cancellation'],
  'order.cancel-declined': ['x', 'Declined cancellation'],
  'payment.refunded': ['wallet', 'Refunded'],
  'print.status': ['printer', 'Moved a print job'],
  'service.created': ['plus', 'Added a service'],
  'service.updated': ['pencil', 'Edited a service'],
  'service.hidden': ['eye', 'Hid a service'],
  'service.deleted': ['trash', 'Deleted a service'],
  'settings.updated': ['settings', 'Changed settings'],
  'staff.added': ['users', 'Added staff'],
  'staff.removed': ['users', 'Removed staff'],
  'password.changed': ['key', 'Changed password'],
  'password.reset': ['key', 'Reset a customer password'],
  'login.locked': ['lock', 'Login locked'],
  'backup.downloaded': ['database', 'Downloaded a backup'],
};

export function AdminActivity() {
  const initialTab = new URLSearchParams(window.location.search).get('tab') === 'messages' ? 'messages' : 'log';
  const [tab, setTab] = useState(initialTab);
  const [filter, setFilter] = useState('');
  const log = useLoad(() => api(`/admin/audit${filter ? `?action=${filter}` : ''}`), [filter]);
  const msgs = useLoad(() => api('/admin/notifications'));
  const [retry, setRetry] = useState({ busy: false, msg: '', err: '' });

  async function retryAll() {
    setRetry({ busy: true, msg: '', err: '' });
    try {
      const r = await api('/admin/notifications/retry', { method: 'POST' });
      setRetry({ busy: false, msg: `Tried ${r.tried}. Still failing: ${r.stillFailing}.`, err: '' });
      msgs.reload();
    } catch (e) {
      setRetry({ busy: false, msg: '', err: e.message });
    }
  }

  return (
    <div className="stack-lg">
      <PageHead eyebrow="Who did what" title="Activity" sub="Every document opened, status changed, refund and settings change, plus messages that couldn't be delivered." />
      <div className="tabs-line">
        <button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>
          Activity log
        </button>
        <button className={tab === 'messages' ? 'on' : ''} onClick={() => setTab('messages')}>
          Undelivered messages {msgs.data?.length > 0 && <span className="count">{msgs.data.length}</span>}
        </button>
      </div>

      {tab === 'log' && (
        <div className="stack fade">
          <div className="pills" style={{ alignSelf: 'flex-start' }}>
            {[
              ['', 'All'],
              ['document', 'Documents'],
              ['order', 'Orders'],
              ['payment', 'Refunds'],
              ['print', 'Print'],
              ['service', 'Services'],
              ['settings', 'Settings'],
              ['staff', 'Staff'],
            ].map(([v, l]) => (
              <button key={l} className={filter === v ? 'on' : ''} onClick={() => setFilter(v)}>
                {l}
              </button>
            ))}
          </div>
          <ErrorNote error={log.error} />
          {!log.data && !log.error && <Skeleton rows={6} />}
          {log.data && (
            <div className="card table-card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Who</th>
                      <th>What</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {log.data.map((a) => {
                      const [icon, label] = ACTION_LABEL[a.action] || ['activity', a.action];
                      return (
                        <tr key={a._id}>
                          <td className="small nowrap">{fmtDate(a.at)}</td>
                          <td>
                            {a.actorName}
                            <div className="sub">{a.actorRole}</div>
                          </td>
                          <td>
                            <span className="row nowrap" style={{ gap: 8 }}>
                              <Icon name={icon} size={16} /> {label}
                            </span>
                          </td>
                          <td className="small">
                            {a.targetType === 'order' && a.targetId ? <Link to={`/admin/orders/${a.targetId}`}>{a.summary}</Link> : a.summary}
                          </td>
                        </tr>
                      );
                    })}
                    {log.data.length === 0 && (
                      <tr>
                        <td colSpan="4">
                          <Empty icon="activity" title="Nothing recorded yet" />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'messages' && (
        <div className="stack fade">
          <div className="row wrap between">
            <p className="muted small">Failed SMS and emails are retried automatically every 10 minutes, up to 3 times.</p>
            <button className="btn" onClick={retryAll} disabled={retry.busy || !msgs.data?.length}>
              {retry.busy ? <span className="spinner" /> : <Icon name="refresh" size={16} />} Retry all now
            </button>
          </div>
          <SuccessNote>{retry.msg}</SuccessNote>
          <ErrorNote error={retry.err || msgs.error} />
          {!msgs.data && !msgs.error && <Skeleton rows={3} />}
          {msgs.data && (
            <div className="card table-card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>To</th>
                      <th>Message</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {msgs.data.map((n) => (
                      <tr key={n._id}>
                        <td className="small nowrap">{fmtDate(n.createdAt)}</td>
                        <td>
                          {n.user?.name || '-'}
                          <div className="sub">
                            {n.channel.toUpperCase()} · {n.to}
                          </div>
                        </td>
                        <td className="small">
                          {n.subject}
                          <div className="sub" style={{ color: 'var(--bad)' }}>
                            {n.lastError}
                          </div>
                        </td>
                        <td>
                          <Status value={n.status} />
                          <div className="sub">{n.attempts} tries</div>
                        </td>
                      </tr>
                    ))}
                    {msgs.data.length === 0 && (
                      <tr>
                        <td colSpan="4">
                          <Empty icon="checkCircle" title="All messages delivered" />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Settings: cafe, hours, print rates, privacy, refunds, staff, password, backup ---------- */
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function AdminSettings() {
  const { user, login } = useAuth();
  const cafe = useCafe();
  const isOwner = user.role === 'owner';
  const settings = useLoad(() => (isOwner ? api('/admin/settings') : Promise.resolve(null)));
  const staff = useLoad(() => (isOwner ? api('/admin/staff') : Promise.resolve([])));
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [nf, setNf] = useState({ name: '', email: '', password: '' });
  const [staffErr, setStaffErr] = useState('');
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);

  useEffect(() => {
    if (settings.data) {
      const d = settings.data;
      setS({
        printRates: d.printRates,
        retentionDays: d.retentionDays,
        cafeName: d.cafeName,
        cafePhone: d.cafePhone,
        cafeAddress: d.cafeAddress,
        openTime: d.openTime,
        closeTime: d.closeTime,
        openDays: d.openDays,
        heroImage: d.heroImage,
        refundPolicy: d.refundPolicy,
      });
    }
  }, [settings.data]);
  useEffect(() => {
    if (window.location.hash === '#password') setTimeout(() => document.getElementById('password')?.scrollIntoView({ behavior: 'smooth' }), 200);
  }, []);

  const setRate = (mode, size) => (e) => setS({ ...s, printRates: { ...s.printRates, [mode]: { ...s.printRates[mode], [size]: e.target.value } } });
  const f = (k) => (e) => setS({ ...s, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setMsg('');
    setErr('');
    try {
      await api('/admin/settings', { method: 'PUT', body: s });
      setMsg('Settings saved.');
      cafe.reload?.();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function addStaff(e) {
    e.preventDefault();
    setStaffErr('');
    try {
      await api('/admin/staff', { method: 'POST', body: nf });
      setNf({ name: '', email: '', password: '' });
      staff.reload();
    } catch (e2) {
      setStaffErr(e2.message);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwMsg('');
    setPwErr('');
    if (pw.next !== pw.confirm) return setPwErr('The new passwords do not match.');
    try {
      const r = await api('/auth/change-password', { method: 'POST', body: { current: pw.current, next: pw.next } });
      login(r.token, r.user);
      setPw({ current: '', next: '', confirm: '' });
      setPwMsg('Password changed. Other devices were signed out.');
    } catch (e2) {
      setPwErr(e2.message);
    }
  }

  async function backup() {
    setBackupBusy(true);
    setErr('');
    try {
      await downloadFile('/admin/backup/download', `cyber-cafe-backup-${new Date().toISOString().slice(0, 10)}.json.gz.enc`);
    } catch (e2) {
      setErr(e2.message);
    }
    setBackupBusy(false);
  }

  return (
    <div className="stack-lg" style={{ maxWidth: 980 }}>
      <PageHead eyebrow="Your cafe" title="Settings" sub={isOwner ? 'Cafe details, opening hours, prices, privacy, refunds, staff and backups.' : 'Your password.'} />
      {user.mustChangePassword && (
        <div className="note bad">
          <Icon name="key" size={18} />
          <span>
            <strong>Change your password now.</strong> You are using the default or a weak password, so anyone could log in as you.
          </span>
        </div>
      )}
      <ErrorNote error={settings.error} />
      {isOwner && !s && !settings.error && <Skeleton rows={3} />}
      {isOwner && s && (
        <form className="stack" onSubmit={save}>
          <div className="card pad-lg stack">
            <h3>Cafe details</h3>
            <div className="form-grid">
              <label>
                Cafe name
                <input id="cname" value={s.cafeName} onChange={f('cafeName')} required />
              </label>
              <label>
                Phone (for "Talk to our team")
                <input id="cphone" value={s.cafePhone} onChange={f('cafePhone')} placeholder="+91 98765 43210" />
              </label>
              <label className="full">
                Address
                <input id="caddr" value={s.cafeAddress} onChange={f('cafeAddress')} placeholder="Shop no., street, area, city" />
              </label>
              <label>
                Opens at
                <input id="copen" type="time" value={s.openTime} onChange={f('openTime')} />
              </label>
              <label>
                Closes at
                <input id="cclose" type="time" value={s.closeTime} onChange={f('closeTime')} />
              </label>
              <div className="full stack-sm">
                <strong className="small" style={{ color: 'var(--ink-2)' }}>
                  Open on
                </strong>
                <div className="day-pick">
                  {DAY_SHORT.map((d, i) => (
                    <button
                      type="button"
                      key={d}
                      className={s.openDays.includes(i) ? 'on' : ''}
                      onClick={() => setS({ ...s, openDays: s.openDays.includes(i) ? s.openDays.filter((x) => x !== i) : [...s.openDays, i].sort() })}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <label className="full">
                <span>
                  Banner photo link <span className="hint">(optional https:// image of your cafe; leave empty for the illustration)</span>
                </span>
                <input id="chero" value={s.heroImage} onChange={f('heroImage')} placeholder="https://…" />
              </label>
            </div>
          </div>

          <div className="card pad-lg stack">
            <h3>Print rates (₹ per page)</h3>
            <div className="rates">
              <span></span>
              <strong className="small">A4</strong>
              <strong className="small">A3</strong>
              {[
                ['bw', 'Black & white'],
                ['color', 'Colour'],
              ].map(([mode, label]) => (
                <div key={mode} style={{ display: 'contents' }}>
                  <span className="small">{label}</span>
                  {['A4', 'A3'].map((size) => (
                    <input key={size} id={`rate_${mode}_${size}`} type="number" min="0" step="0.5" value={s.printRates[mode][size]} onChange={setRate(mode, size)} aria-label={`${label} ${size}`} />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="card pad-lg stack">
            <h3>Privacy and refunds</h3>
            <label>
              Delete customer documents this many days after an order is finished
              <input id="retention" type="number" min="1" max="365" value={s.retentionDays} onChange={f('retentionDays')} style={{ maxWidth: 160 }} />
            </label>
            <label>
              <span>
                Refund policy <span className="hint">(shown before payment and on the public refund page)</span>
              </span>
              <textarea id="refundPolicy" rows="5" value={s.refundPolicy} onChange={f('refundPolicy')} />
            </label>
          </div>
          <ErrorNote error={err} />
          <SuccessNote>{msg}</SuccessNote>
          <div>
            <button className="btn primary lg">Save settings</button>
          </div>
        </form>
      )}

      <form className="card pad-lg stack" id="password" onSubmit={changePassword}>
        <h3>Change your password</h3>
        <p className="muted small">At least 10 characters with letters and numbers. Changing it signs you out on other devices.</p>
        <div className="form-grid">
          <label className="full">
            Current password
            <PasswordInput id="pcur" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
          </label>
          <label>
            New password
            <PasswordInput id="pnew" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required />
          </label>
          <label>
            Repeat new password
            <PasswordInput id="pnew2" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required />
          </label>
        </div>
        <ErrorNote error={pwErr} />
        <SuccessNote>{pwMsg}</SuccessNote>
        <div>
          <button className="btn">
            <Icon name="key" size={16} /> Change password
          </button>
        </div>
      </form>

      {isOwner && (
        <div className="card pad-lg stack">
          <h3>Staff logins</h3>
          <p className="muted small">Staff can manage orders and the print queue. Only the owner sees revenue, payments, customers, activity and settings.</p>
          <div className="rows">
            {staff.data?.map((u) => (
              <div key={u._id} className="order-row">
                <span className="avatar">{initials(u.name)}</span>
                <div className="grow">
                  <strong>{u.name}</strong>
                  <div className="muted small">{u.email}</div>
                </div>
                <div className="end">
                  <Status value={u.role === 'owner' ? 'Submitted' : 'Refunded'} label={u.role === 'owner' ? 'Owner' : 'Staff'} />
                  {u.role === 'staff' && (
                    <button
                      className="btn sm danger"
                      onClick={() =>
                        api(`/admin/staff/${u._id}`, { method: 'DELETE' })
                          .then(staff.reload)
                          .catch((e) => setStaffErr(e.message))
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <form className="stack-sm" onSubmit={addStaff}>
            <h4>Add a staff login</h4>
            <div className="cols-3">
              <input id="stname" placeholder="Name" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} aria-label="Staff name" />
              <input id="stemail" type="email" placeholder="Email" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} aria-label="Staff email" />
              <PasswordInput id="stpass" placeholder="Password (10+ letters & numbers)" value={nf.password} onChange={(e) => setNf({ ...nf, password: e.target.value })} aria-label="Staff password" />
            </div>
            <ErrorNote error={staffErr} />
            <div>
              <button className="btn">
                <Icon name="plus" size={16} /> Add staff login
              </button>
            </div>
          </form>
        </div>
      )}

      {isOwner && (
        <div className="card pad-lg stack">
          <div className="card-head">
            <div>
              <h3>Backup</h3>
              <p className="muted small">
                Download an encrypted copy of the database and keep it somewhere safe (not on the server). It opens only with your FILE_ENCRYPTION_KEY. Uploaded files are not inside it: back up the uploads disk too.
              </p>
            </div>
            <button className="btn" onClick={backup} disabled={backupBusy}>
              {backupBusy ? <span className="spinner" /> : <Icon name="database" size={16} />} Download backup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
