export function formatIDR(n: number): string {
  if (!Number.isFinite(n)) return 'Rp 0';
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
}

export function formatCompactIDR(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`;
  if (abs >= 1_000_000) return `Rp ${(n / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  if (abs >= 1_000) return `Rp ${(n / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 0 })} rb`;
  return formatIDR(n);
}

export function formatNumber(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('id-ID', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function formatDuration(n: number): string {
  const v = Math.round(n * 100) / 100;
  return `${formatNumber(v, 2)} hari kerja`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Gaji bulanan -> estimasi biaya per hari kerja (22 hari kerja/bulan). */
export function dailyRate(salary: number): number {
  return salary / 22;
}

export function pluralize(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : plural ?? `${singular}`}`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
