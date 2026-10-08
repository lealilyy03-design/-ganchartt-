import type { CalendarConfig } from '../types';
import { addDays, dayOfWeek, isValidDate } from './date';

export const DAY_LABELS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const DAY_LABELS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const DEFAULT_WEEKEND_DAYS = [0, 6];

export function holidayMap(cal: CalendarConfig): Map<string, string> {
  const m = new Map<string, string>();
  for (const h of cal.holidays) m.set(h.date, h.name);
  return m;
}

export function isWeekendDay(cal: CalendarConfig, date: string): boolean {
  return cal.weekendDays.includes(dayOfWeek(date));
}

export function holidayName(cal: CalendarConfig, date: string): string | undefined {
  for (const h of cal.holidays) if (h.date === date) return h.name;
  return undefined;
}

export function isHoliday(cal: CalendarConfig, date: string): boolean {
  return holidayName(cal, date) !== undefined;
}

export function isWorkingDay(cal: CalendarConfig, date: string): boolean {
  return !isWeekendDay(cal, date) && !isHoliday(cal, date);
}

/** Geser tanggal ke hari kerja berikutnya (bila sudah hari kerja, dikembalikan apa adanya). */
export function nextWorkingDay(cal: CalendarConfig, date: string): string {
  let d = date;
  for (let i = 0; i < 3660; i++) {
    if (isWorkingDay(cal, d)) return d;
    d = addDays(d, 1);
  }
  return date;
}

export function prevWorkingDay(cal: CalendarConfig, date: string): string {
  let d = date;
  for (let i = 0; i < 3660; i++) {
    if (isWorkingDay(cal, d)) return d;
    d = addDays(d, -1);
  }
  return date;
}

/**
 * Tambah `n` hari kerja dari `date`.
 * Bila `date` bukan hari kerja, geser dulu ke hari kerja terdekat ke arah tujuan.
 */
export function addWorkingDays(cal: CalendarConfig, date: string, n: number): string {
  const step = n >= 0 ? 1 : -1;
  let d = step > 0 ? nextWorkingDay(cal, date) : prevWorkingDay(cal, date);
  for (let i = 0; i < Math.abs(n); i++) {
    d = addDays(d, step);
    d = step > 0 ? nextWorkingDay(cal, d) : prevWorkingDay(cal, d);
  }
  return d;
}

/** Jumlah hari kerja inklusif di antara dua tanggal (bila `to` < `from` menghasilkan 0). */
export function countWorkingDays(cal: CalendarConfig, from: string, to: string): number {
  if (!isValidDate(from) || !isValidDate(to) || to < from) return 0;
  let count = 0;
  let d = from;
  while (d <= to) {
    if (isWorkingDay(cal, d)) count++;
    d = addDays(d, 1);
  }
  return count;
}

/**
 * Offset hari kerja dari `from` ke `to` pada interval setengah-terbuka [from, to).
 * Menghasilkan bilangan positif bila `to` setelah `from`.
 */
export function workingDayOffset(cal: CalendarConfig, from: string, to: string): number {
  if (!isValidDate(from) || !isValidDate(to) || from === to) return 0;
  if (to < from) return -workingDayOffset(cal, to, from);
  let count = 0;
  let d = from;
  while (d < to) {
    if (isWorkingDay(cal, d)) count++;
    d = addDays(d, 1);
  }
  return count;
}

/** Akhir tugas: start + (durasi - 1) hari kerja. */
export function workingEndDate(cal: CalendarConfig, start: string, duration: number): string {
  return addWorkingDays(cal, start, Math.max(0, Math.round(duration)) - 1);
}

export function workingDaysInMonth(cal: CalendarConfig, year: number, month: number): number {
  const dim = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  let count = 0;
  for (let d = 1; d <= dim; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (isWorkingDay(cal, iso)) count++;
  }
  return count;
}
