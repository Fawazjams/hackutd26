// Formatting helpers. No numbers are invented here; everything formats data passed in.
export const HOURS = 168;
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function hourLabel(h) {
  const hh = Math.max(0, Math.min(HOURS, h));
  if (hh >= HOURS) return 'Sun 24:00';
  const whole = Math.floor(hh);
  return `${DAYS[Math.floor(whole / 24)]} ${String(whole % 24).padStart(2, '0')}:00`;
}

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat('en-US');

export const money = (v) => usd0.format(Math.round(v));
export const money2 = (v) => usd2.format(v);
export const num = (v) => int.format(v);
export const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Short name for tight spaces: "CRAC-2 compressor replacement" -> "CRAC-2 compressor". */
export function shortName(name) {
  return name.replace(/\s*\((row [A-D])\)/i, ' · $1').replace(/ replacement$/i, '');
}
