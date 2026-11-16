const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

export const getToken = () => localStorage.getItem('token');

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: payload });
  } catch {
    throw new Error('Cannot reach the server. Check that the backend is running.');
  }
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
  if (res.status === 401 && token) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.dispatchEvent(new Event('auth:expired')); // AuthProvider logs out and the page redirects to login
  }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

// Upload with progress (NFR: uploads show progress)
export function uploadForm(path, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', BASE + path);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* not json */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data?.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Cannot reach the server. Check your connection.'));
    xhr.send(form);
  });
}

async function fetchBlob(path) {
  let res;
  try {
    res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${getToken()}` } });
  } catch {
    throw new Error('Cannot reach the server. Check your connection.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'Could not open the file.');
  }
  return res.blob();
}

// Private files need the auth header, so fetch them and open as a blob
export async function openFile(path) {
  const win = window.open('', '_blank');
  try {
    const url = URL.createObjectURL(await fetchBlob(path));
    if (win) win.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    win?.close();
    throw e;
  }
}

export async function downloadFile(path, filename) {
  const url = URL.createObjectURL(await fetchBlob(path));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'file';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Stored documents: view in a new tab, or save to the device (A1 / F3 / customer "save back")
export const viewDoc = (id) => openFile(`/files/${id}`);
export const saveDoc = (id, name) => downloadFile(`/files/${id}?download=1`, name);

export const rupees = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const fmtDate = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
export const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const shortDay = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '');
export const orderRef = (o) => o?.orderNo || (o?._id ? 'CC-' + String(o._id).slice(-5).toUpperCase() : '');
export const printRef = (j) => j?.jobNo || (j?._id ? 'PR-' + String(j._id).slice(-5).toUpperCase() : '');
