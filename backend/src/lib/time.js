// All "today" / "this month" maths is done in India time, so reports are right
// even when the server runs in UTC (Render, Railway, etc.).
const IST_OFFSET_MS = 330 * 60 * 1000; // UTC+05:30

const toIst = (d) => new Date(d.getTime() + IST_OFFSET_MS);
const fromIstParts = (y, m, day = 1) => new Date(Date.UTC(y, m, day) - IST_OFFSET_MS);

export function startOfDayIst(d = new Date()) {
  const x = toIst(d);
  return fromIstParts(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
}

export function startOfMonthIst(d = new Date()) {
  const x = toIst(d);
  return fromIstParts(x.getUTCFullYear(), x.getUTCMonth(), 1);
}

// "2026-11" -> { from, to } covering that whole month in IST
export function monthRangeIst(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(month || '');
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  if (mo < 0 || mo > 11) return null;
  return { from: fromIstParts(y, mo, 1), to: fromIstParts(y, mo + 1, 1) };
}

// "2026-11-09" -> start of that day in IST (or null)
export function dayStartIst(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  if (!m) return null;
  return fromIstParts(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export const DAY_MS = 86400000;
