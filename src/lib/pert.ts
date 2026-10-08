import type { CalendarConfig, PertEstimate, ProjectState, Task } from '../types';
import { computeSchedule, traceCriticalChain, type ScheduleResult } from './schedule';

export function pertExpected(p: PertEstimate): number {
  const o = Math.max(0, p.optimistic);
  const m = Math.max(0, p.mostLikely);
  const q = Math.max(0, p.pessimistic);
  return (o + 4 * m + q) / 6;
}

export function pertVariance(p: PertEstimate): number {
  const o = Math.max(0, p.optimistic);
  const q = Math.max(0, p.pessimistic);
  const s = (q - o) / 6;
  return s * s;
}

export interface PertResult {
  schedule: ScheduleResult;
  expected: Map<string, number>;
  variance: Map<string, number>;
  /** Rantai kritis berdasarkan durasi ekspektasi. */
  chain: string[];
  /** Durasi ekspektasi proyek (hari kerja). */
  totalExpected: number;
  /** Varian proyek pada jalur kritis. */
  totalVariance: number;
  /** Deviasi standar proyek. */
  sigma: number;
  /** Batas bawah/atas estimasi selesai proyek (E ± 2σ ≈ 95%). */
  lower: number;
  upper: number;
}

export function computePert(tasks: Task[], cal: CalendarConfig): PertResult {
  const expected = new Map<string, number>();
  const variance = new Map<string, number>();
  for (const t of tasks) {
    expected.set(t.id, pertExpected(t.pert));
    variance.set(t.id, pertVariance(t.pert));
  }

  const schedule = computeSchedule(tasks, cal, {
    durationOf: (t) => Math.max(0.01, expected.get(t.id) ?? t.duration),
  });

  const chain = traceCriticalChain(schedule);
  let totalVariance = 0;
  for (const id of chain) totalVariance += variance.get(id) ?? 0;
  const sigma = Math.sqrt(totalVariance);

  const totalExpected =
    schedule.projectDuration > 0
      ? Math.round((schedule.projectEndIdx - schedule.projectStartIdx + 1) * 100) / 100
      : 0;

  return {
    schedule,
    expected,
    variance,
    chain,
    totalExpected,
    totalVariance: Math.round(totalVariance * 1000) / 1000,
    sigma: Math.round(sigma * 1000) / 1000,
    lower: Math.max(0, Math.round((totalExpected - 2 * sigma) * 100) / 100),
    upper: Math.round((totalExpected + 2 * sigma) * 100) / 100,
  };
}

/** Ringkasan anggaran: total biaya alokasi anggota pada seluruh tugas. */
export function computeBudget(state: ProjectState): number {
  const rate = new Map(state.members.map((m) => [m.id, m.salary / 22]));
  let total = 0;
  for (const t of state.tasks) {
    let taskRate = 0;
    for (const rid of t.resourceIds) taskRate += rate.get(rid) ?? 0;
    total += taskRate * Math.max(0, t.duration);
  }
  return total;
}
