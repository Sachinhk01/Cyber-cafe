import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, openFile, downloadFile, rupees, fmtDate } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Status, ErrorNote } from '../components.jsx';

function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setError('');
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

/* ---------- Admin login (FR-4) ---------- */
export function AdminLogin() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const r = await api('/auth/admin/login', { method: 'POST', body: form });
      login(r.token, r.user);
      nav(r.user.role === 'owner' ? '/admin' : '/admin/orders', { replace: true });
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <form className="auth-card card stack" onSubmit={submit}>
      <h1>Admin login</h1>
      <label>
        Email
        <input id="aemail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      </label>
      <label>
        Password
        <input id="apass" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
      </label>
      <ErrorNote error={error} />
      <button className="btn primary">Log in</button>
      <p className="muted small">
        Customer? <Link to="/login">Log in with OTP</Link>
      </p>
    </form>
  );
}

/* ---------- Dashboard (FR-31) ---------- */
export function AdminDashboard() {
  const { data, error } = useLoad(() => api('/admin/stats'));
  if (error) return <ErrorNote error={error} />;
  if (!data) return <p className="muted">Loading…</p>;
  const max = Math.max(1, ...data.daily.map((d) => d.revenue));
  return (
    <div className="stack-lg">
      <h1>Dashboard</h1>
      <div className="stats">
        <Stat label="Revenue today" value={rupees(data.todayRevenue)} />
        <Stat label="Revenue this month" value={rupees(data.monthRevenue)} />
        <Stat label="Orders paid today" value={data.todayOrders} />
        <Stat label="Open orders" value={data.openOrders} link="/admin/orders" />
        <Stat label="Print queue" value={data.printQueue} link="/admin/print" />
      </div>

      <section className="card stack">
        <h3>Daily revenue, last 14 days</h3>
        {data.daily.length === 0 ? (
          <p className="muted small">No payments yet.</p>
        ) : (
          <div className="bars">
            {data.daily.map((d) => (
              <div key={d._id} className="bar-col" title={`${d._id}: ${rupees(d.revenue)}`}>
                <span className="bar-val">{rupees(d.revenue)}</span>
                <div className="bar" style={{ height: `${(d.revenue / max) * 100}%` }} />
                <span className="bar-label">{d._id.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card stack">
        <h3>Orders per service this month</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th className="num">Orders</th>
                <th className="num">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.perService.map((s) => (
                <tr key={s._id}>
                  <td>{s._id}</td>
                  <td className="num">{s.orders}</td>
                  <td className="num">{rupees(s.revenue)}</td>
                </tr>
              ))}
              {data.perService.length === 0 && (
                <tr>
                  <td colSpan="3" className="muted">
                    No paid orders this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const Stat = ({ label, value, link }) => {
  const inner = (
    <>
      <span className="muted small">{label}</span>
      <strong className="stat-val">{value}</strong>
    </>
  );
  return link ? (
    <Link to={link} className="card stat">
      {inner}
    </Link>
  ) : (
    <div className="card stat">{inner}</div>
  );
};

/* ---------- Orders (FR-26, FR-27) ---------- */
export function AdminOrders() {
  const [filters, setFilters] = useState({ status: '', service: '', from: '', to: '' });
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const services = useLoad(() => api('/admin/service-options'));
  const { data, error } = useLoad(() => api(`/admin/orders?${qs}`), [qs]);
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <div className="stack-lg">
      <h1>Orders</h1>
      <div className="row wrap filters">
        <label>
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
        <label>
          Service
          <select id="fservice" value={filters.service} onChange={set('service')}>
            <option value="">All</option>
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
      <ErrorNote error={error} />
      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Service</th>
              <th className="num">Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((o) => (
              <tr key={o._id}>
                <td>{fmtDate(o.createdAt)}</td>
                <td>
                  {o.user?.name}
                  <div className="muted small">{o.user?.mobile}</div>
                </td>
                <td>
                  <Link to={`/admin/orders/${o._id}`}>{o.serviceName}</Link>
                </td>
                <td className="num">{rupees(o.totalAmount)}</td>
                <td>
                  <Status value={o.status} />
                </td>
              </tr>
            ))}
            {data?.length === 0 && (
              <tr>
                <td colSpan="5" className="muted">
                  No orders match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminOrderDetail() {
  const { id } = useParams();
  const { data, error, reload } = useLoad(() => api(`/admin/orders/${id}`), [id]);
  const [status, setStatus] = useState('');
  const [remark, setRemark] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (data) {
      setStatus(data.order.status === 'PendingPayment' ? 'Submitted' : data.order.status);
      setRemark(data.order.remark || '');
    }
  }, [data]);

  if (error) return <ErrorNote error={error} />;
  if (!data) return <p className="muted">Loading…</p>;
  const { order, documents, payments } = data;

  async function save(e) {
    e.preventDefault();
    setMsg('');
    setErr('');
    try {
      await api(`/admin/orders/${id}`, { method: 'PATCH', body: { status, remark } });
      setMsg('Saved. The customer has been notified.');
      reload();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="narrow stack-lg">
      <Link to="/admin/orders" className="small">
        ← All orders
      </Link>
      <div className="section-head">
        <h1>{order.serviceName}</h1>
        <Status value={order.status} />
      </div>
      <div className="card stack">
        <dl className="kv">
          <dt>Customer</dt>
          <dd>
            {order.user?.name} · {order.user?.mobile} {order.user?.email && `· ${order.user.email}`}
          </dd>
          {Object.entries(order.details || {}).map(([k, v]) => (
            <KV key={k} k={k} v={v} />
          ))}
          <dt>Amount</dt>
          <dd>
            {rupees(order.totalAmount)} · <Status value={order.paymentStatus} />
          </dd>
          <dt>Receipt</dt>
          <dd className="code">{order.receiptNo || '-'}</dd>
          <dt>Placed</dt>
          <dd>{fmtDate(order.createdAt)}</dd>
        </dl>
        <h3>Documents</h3>
        {documents.length === 0 && <p className="muted small">No documents (deleted after the retention period, or none required).</p>}
        {documents.map((d) => (
          <button key={d._id} className="link-btn left" onClick={() => openFile(`/files/${d._id}`).catch((e) => setErr(e.message))}>
            {d.label}: {d.originalName}
          </button>
        ))}
        <h3>Payment attempts</h3>
        {payments.map((p) => (
          <div key={p._id} className="small">
            {fmtDate(p.createdAt)} · {rupees(p.amount)} · <Status value={p.status} /> {p.mock && <span className="muted">(test)</span>}
          </div>
        ))}
      </div>

      {order.paymentStatus === 'Paid' ? (
        <form className="card stack" onSubmit={save}>
          <h3>Update status</h3>
          <label>
            Status
            <select id="ostatus" value={status} onChange={(e) => setStatus(e.target.value)}>
              {['Submitted', 'In Progress', 'Completed', 'Rejected'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Remark for the customer
            <textarea id="oremark" rows="3" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="e.g. Application submitted, acknowledgement number 1234" />
          </label>
          <ErrorNote error={err} />
          {msg && <p className="success">{msg}</p>}
          <button className="btn primary">Save and notify customer</button>
        </form>
      ) : (
        <p className="muted">This order is waiting for payment, so it cannot be processed yet.</p>
      )}
    </div>
  );
}

const KV = ({ k, v }) => (
  <>
    <dt>{k}</dt>
    <dd>{v}</dd>
  </>
);

/* ---------- Print queue (FR-21, FR-22) ---------- */
export function AdminPrintQueue() {
  const [status, setStatus] = useState('');
  const { data, error, reload } = useLoad(() => api(`/admin/print-jobs${status ? `?status=${status}` : ''}`), [status]);
  const [err, setErr] = useState('');
  const [codes, setCodes] = useState({});

  async function move(job, next) {
    setErr('');
    try {
      await api(`/admin/print-jobs/${job._id}`, { method: 'PATCH', body: { status: next, pickupCode: codes[job._id] } });
      reload();
    } catch (e) {
      setErr(e.message);
    }
  }

  const visible = status ? data : data?.filter((j) => j.status !== 'Collected');

  return (
    <div className="stack-lg">
      <div className="section-head">
        <h1>Print queue</h1>
        <button className="btn" onClick={reload}>
          Refresh
        </button>
      </div>
      <label className="inline">
        Show
        <select id="pstatus" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Open jobs</option>
          {['Pending', 'Printing', 'Ready', 'Collected'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <ErrorNote error={error || err} />
      {visible?.length === 0 && <p className="muted">Nothing in the queue.</p>}
      <div className="list">
        {visible?.map((j) => (
          <div key={j._id} className="list-row card">
            <div>
              <strong>{j.fileName}</strong>
              <div className="muted small">
                {j.user?.name} · {j.user?.mobile} · {fmtDate(j.paidAt || j.createdAt)}
              </div>
              <div className="small">
                {j.pages} page(s) × {j.copies} copies · {j.colorMode === 'color' ? 'Colour' : 'B&W'} · {j.paperSize} · {rupees(j.price)}
              </div>
              {j.documentId && (
                <button className="link-btn left small" onClick={() => openFile(`/files/${j.documentId}`).catch((e) => setErr(e.message))}>
                  Open file
                </button>
              )}
            </div>
            <div className="row-end wrap">
              <Status value={j.status} />
              {j.status === 'Pending' && (
                <button className="btn" onClick={() => move(j, 'Printing')}>
                  Start printing
                </button>
              )}
              {j.status === 'Printing' && (
                <button className="btn primary" onClick={() => move(j, 'Ready')}>
                  Mark ready
                </button>
              )}
              {j.status === 'Ready' && (
                <>
                  <input
                    id={`code_${j._id}`}
                    className="code-input"
                    placeholder="Pickup code"
                    inputMode="numeric"
                    maxLength={4}
                    value={codes[j._id] || ''}
                    onChange={(e) => setCodes({ ...codes, [j._id]: e.target.value })}
                  />
                  <button className="btn primary" onClick={() => move(j, 'Collected')}>
                    Hand over
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Services CRUD (FR-25) ---------- */
const EMPTY = { name: '', description: '', price: '', requiredDocs: '', detailFields: '', isActive: true };

export function AdminServices() {
  const { data, error, reload } = useLoad(() => api('/services/all'));
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  function edit(s) {
    setEditing(s?._id || 'new');
    setErr('');
    setForm(
      s
        ? { name: s.name, description: s.description, price: s.price, requiredDocs: s.requiredDocs.join(', '), detailFields: s.detailFields.join(', '), isActive: s.isActive }
        : EMPTY
    );
  }

  async function save(e) {
    e.preventDefault();
    setErr('');
    try {
      const body = { ...form, price: Number(form.price) };
      if (editing === 'new') await api('/services', { method: 'POST', body });
      else await api(`/services/${editing}`, { method: 'PUT', body });
      setEditing(null);
      reload();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function remove(s) {
    try {
      await api(`/services/${s._id}`, { method: 'DELETE' });
      reload();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="stack-lg">
      <div className="section-head">
        <h1>Services</h1>
        <button className="btn primary" onClick={() => edit(null)}>
          Add service
        </button>
      </div>
      {editing && (
        <form className="card stack" onSubmit={save}>
          <h3>{editing === 'new' ? 'New service' : 'Edit service'}</h3>
          <label>
            Name
            <input id="sname" value={form.name} onChange={set('name')} required />
          </label>
          <label>
            Description
            <textarea id="sdesc" rows="2" value={form.description} onChange={set('description')} />
          </label>
          <label>
            Price (₹)
            <input id="sprice" type="number" min="0" value={form.price} onChange={set('price')} required />
          </label>
          <label>
            Required documents <span className="muted">(comma separated)</span>
            <input id="sdocs" value={form.requiredDocs} onChange={set('requiredDocs')} placeholder="Aadhaar card, Passport photo" />
          </label>
          <label>
            Details to ask the customer <span className="muted">(comma separated)</span>
            <input id="sfields" value={form.detailFields} onChange={set('detailFields')} placeholder="Phone number" />
          </label>
          <label className="check">
            <input id="sactive" type="checkbox" checked={form.isActive} onChange={set('isActive')} /> Shown to customers
          </label>
          <ErrorNote error={err} />
          <div className="row">
            <button className="btn primary">Save</button>
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <ErrorNote error={error || (!editing && err)} />
      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th className="num">Price</th>
              <th>Documents</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data?.map((s) => (
              <tr key={s._id}>
                <td>{s.name}</td>
                <td className="num">{rupees(s.price)}</td>
                <td className="small">{s.requiredDocs.join(', ') || '-'}</td>
                <td>{s.isActive ? <span className="badge good">Active</span> : <span className="badge muted">Hidden</span>}</td>
                <td className="actions">
                  <button className="link-btn" onClick={() => edit(s)}>
                    Edit
                  </button>
                  {s.isActive && (
                    <button className="link-btn danger" onClick={() => remove(s)}>
                      Hide
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Payments (FR-28) ---------- */
export function AdminPayments() {
  const [status, setStatus] = useState('');
  const { data, error } = useLoad(() => api(`/admin/payments${status ? `?status=${status}` : ''}`), [status]);
  return (
    <div className="stack-lg">
      <h1>Payments</h1>
      <label className="inline">
        Status
        <select id="paystatus" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          <option>Success</option>
          <option>Pending</option>
          <option>Failed</option>
        </select>
      </label>
      <ErrorNote error={error} />
      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Item</th>
              <th className="num">Amount</th>
              <th>Status</th>
              <th>Payment ID</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((p) => (
              <tr key={p._id}>
                <td>{fmtDate(p.createdAt)}</td>
                <td>
                  {p.user?.name}
                  <div className="muted small">{p.user?.mobile}</div>
                </td>
                <td>{p.kind === 'order' ? p.order?.serviceName : `Print: ${p.printJob?.fileName}`}</td>
                <td className="num">{rupees(p.amount)}</td>
                <td>
                  <Status value={p.status} /> {p.mock && <span className="muted small">test</span>}
                </td>
                <td className="code small">{p.razorpayPaymentId || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Customers + monthly report (FR-29, FR-30) ---------- */
export function AdminCustomers() {
  const { data, error } = useLoad(() => api('/admin/customers'));
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [err, setErr] = useState('');
  return (
    <div className="stack-lg">
      <h1>Customers</h1>
      <div className="card row wrap">
        <label>
          Monthly report
          <input id="rmonth" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <button
          className="btn primary"
          onClick={() => downloadFile(`/admin/reports/export?month=${month}`, `cyber-cafe-report-${month}.xlsx`).catch((e) => setErr(e.message))}
        >
          Export to Excel
        </button>
        <ErrorNote error={err} />
      </div>
      <ErrorNote error={error} />
      {data && (
        <>
          <div className="row wrap">
            {data.monthly.map((m) => (
              <div key={m._id} className="card stat small-stat">
                <span className="muted small">New in {m._id}</span>
                <strong className="stat-val">{m.count}</strong>
              </div>
            ))}
          </div>
          <div className="table-wrap card">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Email</th>
                  <th>Joined</th>
                  <th className="num">Payments</th>
                  <th className="num">Total spent</th>
                </tr>
              </thead>
              <tbody>
                {data.customers.map((c) => (
                  <tr key={c._id}>
                    <td>{c.name}</td>
                    <td>{c.mobile}</td>
                    <td>{c.email}</td>
                    <td>{fmtDate(c.createdAt)}</td>
                    <td className="num">{c.payments}</td>
                    <td className="num">{rupees(c.totalSpent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Settings: print rates, retention, staff ---------- */
export function AdminSettings() {
  const settings = useLoad(() => api('/admin/settings'));
  const staff = useLoad(() => api('/admin/staff'));
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [nf, setNf] = useState({ name: '', email: '', password: '' });
  const [staffErr, setStaffErr] = useState('');

  useEffect(() => {
    if (settings.data) setS({ printRates: settings.data.printRates, retentionDays: settings.data.retentionDays });
  }, [settings.data]);

  const setRate = (mode, size) => (e) =>
    setS({ ...s, printRates: { ...s.printRates, [mode]: { ...s.printRates[mode], [size]: e.target.value } } });

  async function save(e) {
    e.preventDefault();
    setMsg('');
    setErr('');
    try {
      await api('/admin/settings', { method: 'PUT', body: s });
      setMsg('Settings saved.');
    } catch (e) {
      setErr(e.message);
    }
  }

  async function addStaff(e) {
    e.preventDefault();
    setStaffErr('');
    try {
      await api('/admin/staff', { method: 'POST', body: nf });
      setNf({ name: '', email: '', password: '' });
      staff.reload();
    } catch (e) {
      setStaffErr(e.message);
    }
  }

  return (
    <div className="narrow stack-lg">
      <h1>Settings</h1>
      <ErrorNote error={settings.error} />
      {s && (
        <form className="card stack" onSubmit={save}>
          <h3>Print rates (₹ per page)</h3>
          <div className="rates">
            <span></span>
            <strong>A4</strong>
            <strong>A3</strong>
            {[
              ['bw', 'Black & white'],
              ['color', 'Colour'],
            ].map(([mode, label]) => (
              <div key={mode} className="rates-row">
                <span>{label}</span>
                {['A4', 'A3'].map((size) => (
                  <input key={size} id={`rate_${mode}_${size}`} type="number" min="0" step="0.5" value={s.printRates[mode][size]} onChange={setRate(mode, size)} />
                ))}
              </div>
            ))}
          </div>
          <label>
            Delete documents this many days after an order is finished
            <input id="retention" type="number" min="1" max="365" value={s.retentionDays} onChange={(e) => setS({ ...s, retentionDays: e.target.value })} />
          </label>
          <ErrorNote error={err} />
          {msg && <p className="success">{msg}</p>}
          <button className="btn primary">Save settings</button>
        </form>
      )}

      <div className="card stack">
        <h3>Staff logins</h3>
        <p className="muted small">Staff can manage orders and the print queue. Only the owner sees revenue, payments, customers and settings.</p>
        {staff.data?.map((u) => (
          <div key={u._id} className="list-row">
            <span>
              {u.name} · {u.email}
            </span>
            <span className="row-end">
              <span className="badge muted">{u.role}</span>
              {u.role === 'staff' && (
                <button className="link-btn danger" onClick={() => api(`/admin/staff/${u._id}`, { method: 'DELETE' }).then(staff.reload)}>
                  Remove
                </button>
              )}
            </span>
          </div>
        ))}
        <form className="stack" onSubmit={addStaff}>
          <div className="row wrap">
            <input id="stname" placeholder="Name" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} />
            <input id="stemail" type="email" placeholder="Email" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} />
            <input id="stpass" type="password" placeholder="Password (8+ characters)" value={nf.password} onChange={(e) => setNf({ ...nf, password: e.target.value })} />
          </div>
          <ErrorNote error={staffErr} />
          <button className="btn">Add staff login</button>
        </form>
      </div>
    </div>
  );
}
