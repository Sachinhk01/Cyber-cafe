import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, uploadForm, openFile, rupees, fmtDate } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Status, ErrorNote, PayButton } from '../components.jsx';

function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    fn()
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, reload: () => setTick((t) => t + 1) };
}

/* ---------- Login / Register (FR-1, FR-2) ---------- */
export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [mode, setMode] = useState('login');
  const [step, setStep] = useState('form');
  const [form, setForm] = useState({ name: '', mobile: '', email: '', otp: '' });
  const [devOtp, setDevOtp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function sendCode(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r =
        mode === 'register'
          ? await api('/auth/register', { method: 'POST', body: { name: form.name, mobile: form.mobile, email: form.email } })
          : await api('/auth/send-otp', { method: 'POST', body: { mobile: form.mobile } });
      setDevOtp(r.devOtp || '');
      setStep('otp');
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  async function verify(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api('/auth/verify-otp', { method: 'POST', body: { mobile: form.mobile, otp: form.otp } });
      login(r.token, r.user);
      nav(loc.state?.from || '/', { replace: true });
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  return (
    <div className="auth-card card">
      <h1>{mode === 'login' ? 'Log in' : 'Create your account'}</h1>
      <p className="muted">Order services, upload documents and send printouts from your phone.</p>
      {step === 'form' ? (
        <form onSubmit={sendCode} className="stack">
          {mode === 'register' && (
            <label>
              Full name
              <input id="name" value={form.name} onChange={set('name')} required />
            </label>
          )}
          <label>
            Mobile number
            <input id="mobile" inputMode="numeric" maxLength={10} placeholder="10-digit number" value={form.mobile} onChange={set('mobile')} required />
          </label>
          {mode === 'register' && (
            <label>
              Email <span className="muted">(for receipts)</span>
              <input id="email" type="email" value={form.email} onChange={set('email')} />
            </label>
          )}
          <ErrorNote error={error} />
          <button className="btn primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send OTP'}
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
            }}
          >
            {mode === 'login' ? 'New here? Create an account' : 'Already registered? Log in'}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="stack">
          <p>
            We sent a 6-digit code to <strong>{form.mobile}</strong>.
          </p>
          {devOtp && <p className="dev-note">Development mode: your code is {devOtp}</p>}
          <label>
            OTP
            <input id="otp" inputMode="numeric" maxLength={6} value={form.otp} onChange={set('otp')} required autoFocus />
          </label>
          <ErrorNote error={error} />
          <button className="btn primary" disabled={busy}>
            {busy ? 'Checking…' : 'Verify and continue'}
          </button>
          <button type="button" className="link-btn" onClick={() => setStep('form')}>
            Change number
          </button>
        </form>
      )}
      <p className="muted small">
        Cafe staff? <Link to="/admin/login">Admin login</Link>
      </p>
    </div>
  );
}

/* ---------- Dashboard (FR-6, FR-7) ---------- */
export function Dashboard() {
  const { user } = useAuth();
  const services = useLoad(() => api('/services'));
  const orders = useLoad(() => api('/orders'));
  const prints = useLoad(() => api('/print'));

  return (
    <div className="stack-lg">
      <section>
        <h1>Hi {user.name.split(' ')[0]}</h1>
        <p className="muted">Pick a service to start, or send a file to print.</p>
      </section>

      <section>
        <div className="section-head">
          <h2>Services</h2>
          <Link className="btn" to="/print">
            Print a document
          </Link>
        </div>
        <ErrorNote error={services.error} />
        <div className="grid">
          {services.data?.map((s) => (
            <Link key={s._id} to={`/services/${s._id}`} className="card service">
              <div className="service-top">
                <strong>{s.name}</strong>
                <span className="price">{s.price ? rupees(s.price) : 'Free'}</span>
              </div>
              <p className="muted small">{s.description}</p>
              {s.requiredDocs.length > 0 && <p className="small">Needs: {s.requiredDocs.join(', ')}</p>}
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2>My orders</h2>
        <ErrorNote error={orders.error} />
        {orders.data?.length === 0 && <p className="muted">No orders yet.</p>}
        <div className="list">
          {orders.data?.map((o) => (
            <Link key={o._id} to={`/orders/${o._id}`} className="list-row">
              <div>
                <strong>{o.serviceName}</strong>
                <div className="muted small">{fmtDate(o.createdAt)}</div>
              </div>
              <div className="row-end">
                <span>{rupees(o.totalAmount)}</span>
                <Status value={o.status} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2>My print jobs</h2>
        <ErrorNote error={prints.error} />
        {prints.data?.length === 0 && <p className="muted">No print jobs yet.</p>}
        <div className="list">
          {prints.data?.map((j) => (
            <PrintRow key={j._id} job={j} onChange={prints.reload} />
          ))}
        </div>
      </section>
    </div>
  );
}

function PrintRow({ job, onChange }) {
  return (
    <div className="list-row">
      <div>
        <strong>{job.fileName}</strong>
        <div className="muted small">
          {job.pages} page(s) × {job.copies} · {job.colorMode === 'color' ? 'Colour' : 'B&W'} · {job.paperSize} · {fmtDate(job.createdAt)}
        </div>
        {job.pickupCode && (
          <div className="small">
            Pickup code: <strong className="code">{job.pickupCode}</strong>
          </div>
        )}
      </div>
      <div className="row-end">
        <span>{rupees(job.price)}</span>
        <Status value={job.status} />
        {job.paymentStatus !== 'Paid' && <PayButton kind="print" id={job._id} amount={job.price} onDone={onChange} label="Pay" />}
      </div>
    </div>
  );
}

/* ---------- Service ordering (FR-9..13) ---------- */
export function ServiceOrder() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: service, error: loadError } = useLoad(() => api(`/services/${id}`), [id]);
  const [files, setFiles] = useState({});
  const [details, setDetails] = useState({});
  const [step, setStep] = useState('fill');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);

  if (loadError) return <ErrorNote error={loadError} />;
  if (!service) return <p className="muted">Loading…</p>;

  function check(e) {
    e.preventDefault();
    setError('');
    for (let i = 0; i < service.requiredDocs.length; i++) {
      const f = files[i];
      if (!f) return setError(`Upload ${service.requiredDocs[i]}.`);
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(f.type)) return setError(`${f.name}: use PDF, JPG or PNG.`);
      if (f.size > 10 * 1024 * 1024) return setError(`${f.name} is larger than 10 MB.`);
    }
    setStep('review');
  }

  async function submit() {
    setError('');
    const form = new FormData();
    form.append('serviceId', service._id);
    form.append('details', JSON.stringify(details));
    service.requiredDocs.forEach((_, i) => form.append(`doc_${i}`, files[i]));
    try {
      setProgress(0);
      const order = await uploadForm('/orders', form, setProgress);
      nav(`/orders/${order._id}`, { replace: true });
    } catch (e) {
      setError(e.message);
      setProgress(null);
    }
  }

  return (
    <div className="narrow stack-lg">
      <Link to="/" className="small">
        ← All services
      </Link>
      <div>
        <h1>{service.name}</h1>
        <p className="muted">{service.description}</p>
        <p className="price big">{service.price ? rupees(service.price) : 'Free'}</p>
      </div>

      {step === 'fill' ? (
        <form className="card stack" onSubmit={check}>
          {service.requiredDocs.length > 0 && <h3>Upload documents</h3>}
          {service.requiredDocs.map((label, i) => (
            <label key={label}>
              {label}
              <input id={`doc_${i}`} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFiles({ ...files, [i]: e.target.files[0] })} />
            </label>
          ))}
          {service.detailFields.length > 0 && <h3>Your details</h3>}
          {service.detailFields.map((f) => (
            <label key={f}>
              {f}
              <input id={`field_${f}`} value={details[f] || ''} onChange={(e) => setDetails({ ...details, [f]: e.target.value })} required />
            </label>
          ))}
          <p className="muted small">PDF, JPG or PNG, up to 10 MB each. Documents are deleted automatically after your order is finished.</p>
          <ErrorNote error={error} />
          <button className="btn primary">Review order</button>
        </form>
      ) : (
        <div className="card stack">
          <h3>Review your order</h3>
          <dl className="kv">
            <dt>Service</dt>
            <dd>{service.name}</dd>
            {service.requiredDocs.map((label, i) => (
              <FragmentKV key={label} k={label} v={files[i]?.name} />
            ))}
            {service.detailFields.map((f) => (
              <FragmentKV key={f} k={f} v={details[f]} />
            ))}
            <dt>Total</dt>
            <dd>
              <strong>{rupees(service.price)}</strong>
            </dd>
          </dl>
          {progress !== null && (
            <div className="progress" aria-label="Upload progress">
              <div style={{ width: `${progress}%` }} />
            </div>
          )}
          <ErrorNote error={error} />
          <div className="row">
            <button className="btn primary" disabled={progress !== null} onClick={submit}>
              {progress !== null ? `Uploading ${progress}%` : 'Confirm and continue to payment'}
            </button>
            <button className="btn" disabled={progress !== null} onClick={() => setStep('fill')}>
              Edit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const FragmentKV = ({ k, v }) => (
  <>
    <dt>{k}</dt>
    <dd>{v}</dd>
  </>
);

/* ---------- Order detail + tracking (FR-17, FR-23) ---------- */
const STEPS = ['Submitted', 'In Progress', 'Completed'];

export function OrderDetail() {
  const { id } = useParams();
  const { data, error, reload } = useLoad(() => api(`/orders/${id}`), [id]);
  const [fileError, setFileError] = useState('');
  if (error) return <ErrorNote error={error} />;
  if (!data) return <p className="muted">Loading…</p>;
  const { order, documents, payments } = data;
  const paid = payments.find((p) => p.status === 'Success');
  const stepIndex = STEPS.indexOf(order.status);

  return (
    <div className="narrow stack-lg">
      <Link to="/" className="small">
        ← Home
      </Link>
      <div className="section-head">
        <h1>{order.serviceName}</h1>
        <Status value={order.status} />
      </div>

      {order.paymentStatus !== 'Paid' ? (
        <div className="card stack">
          <strong>Payment pending</strong>
          <p className="muted small">
            {order.paymentStatus === 'Failed'
              ? 'Your last payment did not go through. Your documents are saved, so you can pay again now.'
              : 'Your documents are uploaded. Pay to submit the order.'}
          </p>
          <PayButton kind="order" id={order._id} amount={order.totalAmount} onDone={reload} />
        </div>
      ) : order.status === 'Rejected' ? (
        <div className="card notice bad">This order was rejected.{order.remark && ` Reason: ${order.remark}`}</div>
      ) : (
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i <= stepIndex ? 'done' : ''}>
              {s}
            </li>
          ))}
        </ol>
      )}

      {order.remark && order.status !== 'Rejected' && <div className="card notice">Note from the cafe: {order.remark}</div>}

      <div className="card stack">
        <h3>Details</h3>
        <dl className="kv">
          {Object.entries(order.details || {}).map(([k, v]) => (
            <FragmentKV key={k} k={k} v={v} />
          ))}
          <dt>Amount</dt>
          <dd>{rupees(order.totalAmount)}</dd>
          <dt>Placed on</dt>
          <dd>{fmtDate(order.createdAt)}</dd>
        </dl>
        <h3>Documents</h3>
        {documents.length === 0 && <p className="muted small">No documents (or they were deleted after the retention period).</p>}
        {documents.map((d) => (
          <button key={d._id} className="link-btn left" onClick={() => openFile(`/files/${d._id}`).catch((e) => setFileError(e.message))}>
            {d.label}: {d.originalName}
          </button>
        ))}
        <ErrorNote error={fileError} />
      </div>

      {paid && (
        <Link className="btn" to={`/receipts/${paid._id}`}>
          View receipt
        </Link>
      )}
    </div>
  );
}

/* ---------- Printing (FR-19..22) ---------- */
export function PrintPage() {
  const nav = useNavigate();
  const rates = useLoad(() => api('/print/rates'));
  const [file, setFile] = useState(null);
  const [opts, setOpts] = useState({ copies: 1, colorMode: 'bw', paperSize: 'A4' });
  const [job, setJob] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const set = (k) => (e) => setOpts({ ...opts, [k]: e.target.value });

  const copies = Math.max(1, Math.min(100, parseInt(opts.copies, 10) || 1));
  const price = useMemo(() => {
    if (!rates.data || !job) return null;
    return rates.data[opts.colorMode][opts.paperSize] * job.pages * copies;
  }, [rates.data, job, opts, copies]);

  async function uploadFile(e) {
    e.preventDefault();
    if (!file) return setError('Choose a file to print.');
    setError('');
    const form = new FormData();
    form.append('file', file);
    Object.entries(opts).forEach(([k, v]) => form.append(k, v));
    try {
      setProgress(0);
      setJob(await uploadForm('/print', form, setProgress));
    } catch (e) {
      setError(e.message);
    }
    setProgress(null);
  }

  async function saveOptions() {
    const updated = await api(`/print/${job._id}`, { method: 'PATCH', body: { ...opts, copies } });
    setJob(updated);
    return updated;
  }

  return (
    <div className="narrow stack-lg">
      <div>
        <h1>Print a document</h1>
        <p className="muted">Upload your file, choose options and pay. Collect it at the counter with your pickup code.</p>
      </div>
      <div className="card stack">
        {!job ? (
          <form onSubmit={uploadFile} className="stack">
            <label>
              File (PDF, JPG or PNG)
              <input id="printfile" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files[0])} />
            </label>
            {progress !== null && (
              <div className="progress">
                <div style={{ width: `${progress}%` }} />
              </div>
            )}
            <ErrorNote error={error} />
            <button className="btn primary" disabled={progress !== null}>
              {progress !== null ? `Uploading ${progress}%` : 'Upload'}
            </button>
          </form>
        ) : (
          <div className="stack">
            <p>
              <strong>{job.fileName}</strong> · {job.pages} page(s)
            </p>
            <div className="row wrap">
              <label>
                Copies
                <input id="copies" type="number" min="1" max="100" value={opts.copies} onChange={set('copies')} />
              </label>
              <label>
                Colour
                <select id="colorMode" value={opts.colorMode} onChange={set('colorMode')}>
                  <option value="bw">Black & white</option>
                  <option value="color">Colour</option>
                </select>
              </label>
              <label>
                Paper
                <select id="paperSize" value={opts.paperSize} onChange={set('paperSize')}>
                  <option value="A4">A4</option>
                  <option value="A3">A3</option>
                </select>
              </label>
            </div>
            {rates.data && (
              <p className="muted small">
                {rupees(rates.data[opts.colorMode][opts.paperSize])} per page × {job.pages} page(s) × {copies} copies
              </p>
            )}
            <p className="price big">{rupees(price)}</p>
            <ErrorNote error={error} />
            <PayAfterSave key={`${opts.colorMode}-${opts.paperSize}-${copies}`} save={saveOptions} jobId={job._id} amount={price} onError={setError} onDone={() => nav('/')} />
            <button className="link-btn left" onClick={() => setJob(null)}>
              Upload a different file
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Saves the chosen options first, then opens payment
function PayAfterSave({ save, jobId, amount, onDone, onError }) {
  const [ready, setReady] = useState(null);
  if (ready) return <PayButton kind="print" id={jobId} amount={ready.price} onDone={onDone} />;
  return (
    <button
      className="btn primary"
      onClick={async () => {
        try {
          setReady(await save());
        } catch (e) {
          onError(e.message);
        }
      }}
    >
      Confirm options · {rupees(amount)}
    </button>
  );
}

/* ---------- Receipts (FR-8, FR-18) ---------- */
export function Receipts() {
  const { data, error } = useLoad(() => api('/payments/mine'));
  return (
    <div className="narrow stack-lg">
      <h1>Payments and receipts</h1>
      <ErrorNote error={error} />
      {data?.length === 0 && <p className="muted">No payments yet.</p>}
      <div className="list">
        {data?.map((p) => {
          const item = p.kind === 'order' ? p.order?.serviceName : `Print: ${p.printJob?.fileName}`;
          const row = (
            <>
              <div>
                <strong>{item}</strong>
                <div className="muted small">{fmtDate(p.createdAt)}</div>
              </div>
              <div className="row-end">
                <span>{rupees(p.amount)}</span>
                <Status value={p.status} />
              </div>
            </>
          );
          return p.status === 'Success' ? (
            <Link key={p._id} className="list-row" to={`/receipts/${p._id}`}>
              {row}
            </Link>
          ) : (
            <div key={p._id} className="list-row">
              {row}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Receipt() {
  const { id } = useParams();
  const { data: p, error } = useLoad(() => api(`/payments/${id}/receipt`), [id]);
  if (error) return <ErrorNote error={error} />;
  if (!p) return <p className="muted">Loading…</p>;
  const target = p.order || p.printJob;
  return (
    <div className="narrow stack-lg">
      <Link to="/receipts" className="small no-print">
        ← All receipts
      </Link>
      <div className="card receipt stack">
        <div className="section-head">
          <h2>Cyber Cafe</h2>
          <span className="muted">Receipt</span>
        </div>
        <dl className="kv">
          <dt>Receipt no.</dt>
          <dd className="code">{target?.receiptNo}</dd>
          <dt>Date</dt>
          <dd>{fmtDate(target?.paidAt || p.updatedAt)}</dd>
          <dt>Customer</dt>
          <dd>
            {p.user.name} · {p.user.mobile}
          </dd>
          <dt>Item</dt>
          <dd>
            {p.order
              ? p.order.serviceName
              : `Printing: ${p.printJob.fileName} (${p.printJob.pages} pages × ${p.printJob.copies}, ${p.printJob.colorMode === 'color' ? 'colour' : 'B&W'}, ${p.printJob.paperSize})`}
          </dd>
          {p.printJob?.pickupCode && (
            <>
              <dt>Pickup code</dt>
              <dd className="code">{p.printJob.pickupCode}</dd>
            </>
          )}
          <dt>Payment ID</dt>
          <dd className="code small">{p.razorpayPaymentId}</dd>
          <dt>Amount paid</dt>
          <dd>
            <strong>{rupees(p.amount)}</strong>
          </dd>
        </dl>
      </div>
      <button className="btn no-print" onClick={() => window.print()}>
        Print or save as PDF
      </button>
    </div>
  );
}

/* ---------- Profile (FR-3) ---------- */
export function Profile() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({ name: user.name, email: user.email || '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  async function save(e) {
    e.preventDefault();
    setMsg('');
    setError('');
    try {
      updateUser(await api('/auth/me', { method: 'PUT', body: form }));
      setMsg('Profile saved.');
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div className="narrow stack-lg">
      <h1>Profile</h1>
      <form className="card stack" onSubmit={save}>
        <label>
          Full name
          <input id="pname" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          Mobile number
          <input id="pmobile" value={user.mobile} disabled />
        </label>
        <label>
          Email
          <input id="pemail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <ErrorNote error={error} />
        {msg && <p className="success">{msg}</p>}
        <button className="btn primary">Save</button>
      </form>
    </div>
  );
}
