import { describe, expect, it } from 'vitest';
import type { CalendarConfig, Task } from '../types';
import {
  addWorkingDays,
  countWorkingDays,
  isWorkingDay,
  workingDayOffset,
  workingEndDate,
} from './calendar';
import { computeSchedule, traceCriticalChain } from './schedule';
import { computePert, pertExpected, pertVariance } from './pert';

// 2026-01-05 = Senin
const SENIN = '2026-01-05';
const cal: CalendarConfig = { weekendDays: [0, 6], holidays: [] };

function task(p: Partial<Task> & { id: string; startDate: string; duration: number }): Task {
  return {
    name: p.id.toUpperCase(),
    description: '',
    priority: 'medium',
    color: '#3b82f6',
    parentId: null,
    predecessors: [],
    resourceIds: [],
    progress: 0,
    pert: {
      optimistic: Math.max(0, p.duration - 1),
      mostLikely: p.duration,
      pessimistic: p.duration + 1,
    },
    ...p,
  };
}

describe('kalender hari kerja', () => {
  it('melewati akhir pekan saat menambah hari kerja', () => {
    expect(addWorkingDays(cal, SENIN, 0)).toBe(SENIN);
    expect(addWorkingDays(cal, SENIN, 5)).toBe('2026-01-12'); // Sen -> Sen berikutnya
    expect(addWorkingDays(cal, '2026-01-09', 1)).toBe('2026-01-12'); // Jumat -> Senin
  });

  it('melewati hari libur khusus', () => {
    const libur: CalendarConfig = {
      ...cal,
      holidays: [{ id: 'h1', date: '2026-01-07', name: 'Hari Libur' }],
    };
    expect(isWorkingDay(libur, '2026-01-07')).toBe(false);
    expect(addWorkingDays(libur, SENIN, 2)).toBe('2026-01-08'); // Rabu dilewati -> Kamis
    expect(workingEndDate(libur, SENIN, 3)).toBe('2026-01-08');
  });

  it('mendukung pengaturan akhir pekan kustom', () => {
    const jumatSabtu: CalendarConfig = { ...cal, weekendDays: [5, 6] };
    expect(isWorkingDay(jumatSabtu, '2026-01-09')).toBe(false); // Jumat
    expect(isWorkingDay(jumatSabtu, '2026-01-11')).toBe(true); // Minggu kerja
    // Sen + 4 hari kerja: Sel, Rab, Kam, (Jum-Sab libur) -> Minggu
    expect(addWorkingDays(jumatSabtu, SENIN, 4)).toBe('2026-01-11');
  });

  it('menghitung hari kerja inklusif dan offset setengah terbuka', () => {
    expect(countWorkingDays(cal, SENIN, '2026-01-11')).toBe(5);
    expect(countWorkingDays(cal, '2026-01-11', SENIN)).toBe(0);
    expect(workingDayOffset(cal, SENIN, '2026-01-12')).toBe(5);
    expect(workingDayOffset(cal, '2026-01-12', SENIN)).toBe(-5);
    expect(workingDayOffset(cal, SENIN, SENIN)).toBe(0);
  });
});

describe('penjadwalan CPM', () => {
  const A = task({ id: 'a', startDate: SENIN, duration: 3 });

  it('Finish-to-Start: tugas berikutnya mulai setelah predecessor selesai', () => {
    const B = task({
      id: 'b',
      startDate: SENIN,
      duration: 2,
      predecessors: [{ taskId: 'a', type: 'FS', lag: 0 }],
    });
    const res = computeSchedule([A, B], cal);
    expect(res.valid).toBe(true);
    expect(res.tasks.get('a')!.startDate).toBe(SENIN);
    expect(res.tasks.get('a')!.endDate).toBe('2026-01-07'); // Rabu
    expect(res.tasks.get('b')!.startDate).toBe('2026-01-08'); // Kamis
    expect(res.tasks.get('b')!.endDate).toBe('2026-01-09'); // Jumat
    expect(res.tasks.get('b')!.auto).toBe(true);
    expect(res.tasks.get('b')!.duration).toBe(2);
  });

  it('FS + lag menambah hari kerja jeda', () => {
    const B = task({
      id: 'b',
      startDate: SENIN,
      duration: 2,
      predecessors: [{ taskId: 'a', type: 'FS', lag: 2 }],
    });
    const res = computeSchedule([A, B], cal);
    expect(res.tasks.get('b')!.startDate).toBe('2026-01-12'); // Rabu + 3 hari kerja
  });

  it('Start-to-Start + lag mulai bersamaan dengan predecessor', () => {
    const B = task({
      id: 'b',
      startDate: SENIN,
      duration: 4,
      predecessors: [{ taskId: 'a', type: 'SS', lag: 1 }],
    });
    const res = computeSchedule([A, B], cal);
    expect(res.tasks.get('b')!.startDate).toBe('2026-01-06'); // Selasa
    expect(res.tasks.get('b')!.endDate).toBe('2026-01-09'); // Jumat
  });

  it('menandai jalur kritis (float 0) dan tugas paralel berfloat', () => {
    const P = task({ id: 'p', startDate: SENIN, duration: 5 });
    const Q = task({ id: 'q', startDate: SENIN, duration: 2 });
    const res = computeSchedule([P, Q], cal);
    expect(res.valid).toBe(true);
    expect(res.projectDuration).toBe(5);
    expect(res.tasks.get('p')!.critical).toBe(true);
    expect(res.tasks.get('p')!.float).toBe(0);
    expect(res.tasks.get('q')!.critical).toBe(false);
    expect(res.tasks.get('q')!.float).toBe(3);
    expect(res.criticalIds).toEqual(['p']);
    expect(traceCriticalChain(res)).toEqual(['p']);
  });

  it('menghitung float pada rantai bertingkat', () => {
    // X (5 hari) -> Z (2 hari); Y (1 hari) paralel dari awal
    const X = task({ id: 'x', startDate: SENIN, duration: 5 });
    const Z = task({
      id: 'z',
      startDate: SENIN,
      duration: 2,
      predecessors: [{ taskId: 'x', type: 'FS', lag: 0 }],
    });
    const Y = task({ id: 'y', startDate: SENIN, duration: 1 });
    const res = computeSchedule([X, Z, Y], cal);
    expect(res.tasks.get('x')!.float).toBe(0);
    expect(res.tasks.get('z')!.float).toBe(0);
    expect(res.tasks.get('y')!.float).toBe(6);
    expect(res.criticalIds).toEqual(['x', 'z']);
    expect(traceCriticalChain(res)).toEqual(['x', 'z']);
  });

  it('mendeteksi siklus dependensi', () => {
    const X = task({ id: 'x', startDate: SENIN, duration: 2, predecessors: [{ taskId: 'y', type: 'FS', lag: 0 }] });
    const Y = task({ id: 'y', startDate: SENIN, duration: 2, predecessors: [{ taskId: 'x', type: 'FS', lag: 0 }] });
    const res = computeSchedule([X, Y], cal);
    expect(res.valid).toBe(false);
    expect(res.errors.join(' ')).toMatch(/siklus/i);
    // fallback: tanggal manual tetap ditampilkan
    expect(res.tasks.get('x')!.startDate).toBe(SENIN);
    expect(res.criticalIds).toEqual([]);
  });

  it('tugas induk mengikuti rentang sub-tugas', () => {
    const parent = task({ id: 'p', startDate: SENIN, duration: 1 });
    const child = task({ id: 'c', startDate: '2026-01-07', duration: 2, parentId: 'p' });
    const res = computeSchedule([parent, child], cal);
    const s = res.tasks.get('p')!;
    expect(s.isSummary).toBe(true);
    expect(s.startDate).toBe('2026-01-07');
    expect(s.endDate).toBe('2026-01-08');
    expect(s.duration).toBe(2);
    expect(res.tasks.get('c')!.isSummary).toBe(false);
  });

  it('mengekspansi predecessor tugas induk ke seluruh sub-tugas', () => {
    const parent = task({ id: 'p', startDate: SENIN, duration: 1 });
    const c1 = task({ id: 'c1', startDate: SENIN, duration: 2, parentId: 'p' });
    const c2 = task({ id: 'c2', startDate: '2026-01-07', duration: 2, parentId: 'p' });
    const next = task({
      id: 'n',
      startDate: SENIN,
      duration: 1,
      predecessors: [{ taskId: 'p', type: 'FS', lag: 0 }],
    });
    const res = computeSchedule([parent, c1, c2, next], cal);
    expect(res.tasks.get('p')!.endDate).toBe('2026-01-08');
    expect(res.tasks.get('n')!.startDate).toBe('2026-01-09');
  });

  it('menghormati hari libur saat pass maju', () => {
    const libur: CalendarConfig = { ...cal, holidays: [{ id: 'h1', date: '2026-01-08', name: 'Libur' }] };
    const B = task({
      id: 'b',
      startDate: SENIN,
      duration: 2,
      predecessors: [{ taskId: 'a', type: 'FS', lag: 0 }],
    });
    const res = computeSchedule([A, B], libur);
    expect(res.tasks.get('b')!.startDate).toBe('2026-01-09'); // Kamis libur -> Jumat
    // A: Sen-Sel-Rab, B: Jum + Sen berikutnya (Sab/Ming libur) => 5 hari kerja total
    expect(res.projectDuration).toBe(5);
  });
});

describe('analisis PERT', () => {
  it('menghitung durasi ekspektasi dan varian', () => {
    expect(pertExpected({ optimistic: 2, mostLikely: 4, pessimistic: 10 })).toBeCloseTo(28 / 6, 6);
    expect(pertVariance({ optimistic: 2, mostLikely: 4, pessimistic: 10 })).toBeCloseTo((8 / 6) ** 2, 6);
  });

  it('jalur kritis PERT mengikuti durasi ekspektasi, bukan durasi rencana', () => {
    const A = task({
      id: 'a',
      startDate: SENIN,
      duration: 3,
      pert: { optimistic: 1, mostLikely: 3, pessimistic: 21 },
    });
    const B = task({
      id: 'b',
      startDate: SENIN,
      duration: 10,
      pert: { optimistic: 3, mostLikely: 3, pessimistic: 3 },
    });
    const res = computePert([A, B], cal);
    expect(res.expected.get('a')).toBeCloseTo((1 + 12 + 21) / 6, 6); // 5.67
    expect(res.expected.get('b')).toBe(3);
    expect(res.chain).toEqual(['a']);
    expect(res.sigma).toBeGreaterThan(0);
    expect(res.upper).toBeGreaterThan(res.lower);
  });

  it('menyusun rantai kritis pada proyek berantai', () => {
    const A = task({ id: 'a', startDate: SENIN, duration: 3, pert: { optimistic: 2, mostLikely: 3, pessimistic: 4 } });
    const B = task({
      id: 'b',
      startDate: SENIN,
      duration: 2,
      predecessors: [{ taskId: 'a', type: 'FS', lag: 0 }],
      pert: { optimistic: 1, mostLikely: 2, pessimistic: 7 },
    });
    const res = computePert([A, B], cal);
    expect(res.schedule.valid).toBe(true);
    expect(res.chain).toEqual(['a', 'b']);
    expect(res.totalVariance).toBeCloseTo(((4 - 2) / 6) ** 2 + ((7 - 1) / 6) ** 2, 3);
  });
});
