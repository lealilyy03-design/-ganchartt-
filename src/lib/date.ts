export type DateStr = string; // YYYY-MM-DD

const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const DAY_NAMES_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function isValidDate(s: string | null | undefined): boolean {
  if (!s || !ISO_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISODate(d);
}

/** Selisih hari kalender: hasil positif bila `to` setelah `from`. */
export function diffDays(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

export function dayOfWeek(s: string): number {
  return parseDate(s).getUTCDay();
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function formatDateID(s: string, style: 'long' | 'medium' | 'short' = 'medium'): string {
  if (!isValidDate(s)) return s || '-';
  const d = parseDate(s);
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const dow = DAY_NAMES[d.getUTCDay()];
  if (style === 'long') return `${dow}, ${day} ${MONTHS[d.getUTCMonth()]} ${year}`;
  if (style === 'short') return `${day} ${MONTHS_SHORT[d.getUTCMonth()]} ${String(year).slice(2)}`;
  return `${day} ${MONTHS_SHORT[d.getUTCMonth()]} ${year}`;
}

export function dayLabel(s: string): string {
  if (!isValidDate(s)) return '';
  const d = parseDate(s);
  return `${DAY_NAMES_SHORT[d.getUTCDay()]} ${d.getUTCDate()}`;
}

export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month]} ${year}`;
}

export function startOfMonth(s: string): DateStr {
  const d = parseDate(s);
  return toISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function addMonths(s: string, n: number): DateStr {
  const d = parseDate(s);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const dim = daysInMonth(target.getUTCFullYear(), target.getUTCMonth());
  target.setUTCDate(Math.min(d.getUTCDate(), dim));
  return toISODate(target);
}
