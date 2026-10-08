import type { CalendarConfig, Member, ProjectState, Task } from '../types';
import { addDays, dayOfWeek, todayISO } from './date';
import { addWorkingDays, DEFAULT_WEEKEND_DAYS } from './calendar';

let seq = 0;
export function uid(prefix = 'id'): string {
  seq += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}${seq.toString(36)}${rand}`;
}

function mondayOfWeek(today: string): string {
  const dow = dayOfWeek(today);
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(today, -back);
}

export function createSeedState(): ProjectState {
  const seedStart = mondayOfWeek(todayISO());

  const baseCalendar: CalendarConfig = {
    weekendDays: [...DEFAULT_WEEKEND_DAYS],
    holidays: [],
  };
  const cutiDate = addWorkingDays(baseCalendar, seedStart, 12);
  const year = Number(seedStart.slice(0, 4));
  const calendar: CalendarConfig = {
    weekendDays: [...DEFAULT_WEEKEND_DAYS],
    holidays: [
      { id: 'hol-cuti', date: cutiDate, name: 'Cuti Bersama Perusahaan' },
      { id: 'hol-natal', date: `${year}-12-25`, name: 'Hari Raya Natal' },
      { id: 'hol-tahunbaru', date: `${year + 1}-01-01`, name: 'Tahun Baru Masehi' },
    ],
  };

  const W = (offset: number) => addWorkingDays(baseCalendar, seedStart, offset);

  const members: Member[] = [
    { id: 'm-andi', name: 'Andi Pratama', email: 'andi.pratama@contoh.id', role: 'Project Manager', salary: 18_000_000, color: '#3b82f6' },
    { id: 'm-budi', name: 'Budi Santoso', email: 'budi.santoso@contoh.id', role: 'Backend Developer', salary: 14_000_000, color: '#10b981' },
    { id: 'm-citra', name: 'Citra Lestari', email: 'citra.lestari@contoh.id', role: 'Frontend Designer', salary: 13_000_000, color: '#ec4899' },
    { id: 'm-dewi', name: 'Dewi Anggraini', email: 'dewi.anggraini@contoh.id', role: 'QA Engineer', salary: 12_000_000, color: '#f59e0b' },
  ];

  type Seed = Partial<Task> & { id: string; name: string; startDate: string; duration: number };
  const t = (s: Seed): Task => ({
    description: '',
    priority: 'medium',
    color: '#3b82f6',
    parentId: null,
    predecessors: [],
    resourceIds: [],
    progress: 0,
    pert: { optimistic: Math.max(1, s.duration - 1), mostLikely: s.duration, pessimistic: s.duration + 2 },
    ...s,
  });

  const tasks: Task[] = [
    t({ id: 't-analysis', name: 'Analisis & Perencanaan', startDate: W(0), duration: 6, priority: 'high', color: '#8b5cf6' }),
    t({
      id: 't-wawancara',
      name: 'Wawancara Stakeholder',
      startDate: W(0),
      duration: 2,
      parentId: 't-analysis',
      priority: 'medium',
      color: '#3b82f6',
      resourceIds: ['m-andi'],
      progress: 100,
      pert: { optimistic: 1, mostLikely: 2, pessimistic: 4 },
    }),
    t({
      id: 't-srs',
      name: 'Penyusunan Dokumen SRS',
      startDate: W(3),
      duration: 3,
      parentId: 't-analysis',
      priority: 'high',
      color: '#3b82f6',
      predecessors: [{ taskId: 't-wawancara', type: 'FS', lag: 1 }],
      resourceIds: ['m-andi'],
      progress: 40,
      pert: { optimistic: 2, mostLikely: 3, pessimistic: 6 },
    }),
    t({
      id: 't-approval',
      name: 'Persetujuan Rencana Proyek',
      startDate: W(6),
      duration: 1,
      priority: 'urgent',
      color: '#f59e0b',
      predecessors: [{ taskId: 't-analysis', type: 'FS', lag: 2 }],
      resourceIds: ['m-andi'],
      pert: { optimistic: 1, mostLikely: 1, pessimistic: 3 },
    }),
    t({ id: 't-design', name: 'Fase Desain', startDate: W(7), duration: 6, priority: 'high', color: '#ec4899' }),
    t({
      id: 't-ui',
      name: 'Wireframe & Desain UI/UX',
      startDate: W(7),
      duration: 3,
      parentId: 't-design',
      priority: 'high',
      color: '#ec4899',
      predecessors: [{ taskId: 't-approval', type: 'FS', lag: 1 }],
      resourceIds: ['m-citra'],
      pert: { optimistic: 2, mostLikely: 3, pessimistic: 5 },
    }),
    t({
      id: 't-db',
      name: 'Desain Database & Kontrak API',
      startDate: W(7),
      duration: 3,
      parentId: 't-design',
      priority: 'medium',
      color: '#06b6d4',
      predecessors: [{ taskId: 't-approval', type: 'FS', lag: 1 }],
      resourceIds: ['m-budi'],
      pert: { optimistic: 2, mostLikely: 3, pessimistic: 7 },
    }),
    t({ id: 't-dev', name: 'Fase Pengembangan', startDate: W(10), duration: 10, priority: 'urgent', color: '#10b981' }),
    t({
      id: 't-devops',
      name: 'Setup Environment & CI/CD',
      startDate: W(10),
      duration: 1,
      parentId: 't-dev',
      priority: 'medium',
      color: '#64748b',
      predecessors: [{ taskId: 't-design', type: 'FS', lag: 1 }],
      resourceIds: ['m-budi'],
      pert: { optimistic: 1, mostLikely: 1, pessimistic: 2 },
    }),
    t({
      id: 't-backend',
      name: 'Pengembangan Backend API',
      startDate: W(11),
      duration: 5,
      parentId: 't-dev',
      priority: 'urgent',
      color: '#10b981',
      predecessors: [{ taskId: 't-devops', type: 'SS', lag: 0 }],
      resourceIds: ['m-budi'],
      pert: { optimistic: 4, mostLikely: 5, pessimistic: 9 },
    }),
    t({
      id: 't-frontend',
      name: 'Pengembangan Frontend',
      startDate: W(11),
      duration: 5,
      parentId: 't-dev',
      priority: 'high',
      color: '#3b82f6',
      predecessors: [{ taskId: 't-devops', type: 'FS', lag: 0 }],
      resourceIds: ['m-citra'],
      pert: { optimistic: 3, mostLikely: 5, pessimistic: 10 },
    }),
    t({
      id: 't-integrasi',
      name: 'Integrasi Modul',
      startDate: W(17),
      duration: 3,
      parentId: 't-dev',
      priority: 'high',
      color: '#8b5cf6',
      predecessors: [
        { taskId: 't-backend', type: 'FS', lag: 1 },
        { taskId: 't-frontend', type: 'FS', lag: 1 },
      ],
      resourceIds: ['m-budi', 'm-citra'],
      pert: { optimistic: 2, mostLikely: 3, pessimistic: 5 },
    }),
    t({ id: 't-testing', name: 'Fase Pengujian', startDate: W(20), duration: 7, priority: 'high', color: '#84cc16' }),
    t({
      id: 't-unit',
      name: 'Pengujian Unit',
      startDate: W(16),
      duration: 2,
      parentId: 't-testing',
      priority: 'medium',
      color: '#84cc16',
      predecessors: [{ taskId: 't-backend', type: 'FS', lag: 0 }],
      resourceIds: ['m-dewi'],
      pert: { optimistic: 1, mostLikely: 2, pessimistic: 3 },
    }),
    t({
      id: 't-inttest',
      name: 'Pengujian Integrasi',
      startDate: W(20),
      duration: 2,
      parentId: 't-testing',
      priority: 'high',
      color: '#84cc16',
      predecessors: [{ taskId: 't-integrasi', type: 'FS', lag: 0 }],
      resourceIds: ['m-dewi'],
      pert: { optimistic: 1, mostLikely: 2, pessimistic: 4 },
    }),
    t({
      id: 't-uat',
      name: 'User Acceptance Test (UAT)',
      startDate: W(23),
      duration: 3,
      parentId: 't-testing',
      priority: 'urgent',
      color: '#f97316',
      predecessors: [
        { taskId: 't-unit', type: 'FS', lag: 0 },
        { taskId: 't-inttest', type: 'FS', lag: 1 },
      ],
      resourceIds: ['m-dewi', 'm-andi'],
      pert: { optimistic: 2, mostLikely: 3, pessimistic: 5 },
    }),
    t({ id: 't-launch', name: 'Fase Peluncuran', startDate: W(28), duration: 3, priority: 'urgent', color: '#ef4444' }),
    t({
      id: 't-deploy',
      name: 'Deploy & Go-Live',
      startDate: W(28),
      duration: 1,
      parentId: 't-launch',
      priority: 'urgent',
      color: '#ef4444',
      predecessors: [{ taskId: 't-uat', type: 'FS', lag: 2 }],
      resourceIds: ['m-budi'],
      pert: { optimistic: 1, mostLikely: 1, pessimistic: 3 },
    }),
    t({ id: 't-handover', name: 'Dokumentasi & Pelatihan', startDate: W(21), duration: 5, priority: 'low', color: '#64748b' }),
    t({
      id: 't-doc',
      name: 'Dokumentasi Teknis',
      startDate: W(21),
      duration: 2,
      parentId: 't-handover',
      priority: 'low',
      color: '#64748b',
      predecessors: [{ taskId: 't-integrasi', type: 'FS', lag: 1 }],
      resourceIds: ['m-budi'],
      pert: { optimistic: 1, mostLikely: 2, pessimistic: 4 },
    }),
    t({
      id: 't-train',
      name: 'Pelatihan Pengguna',
      startDate: W(24),
      duration: 2,
      parentId: 't-handover',
      priority: 'medium',
      color: '#f59e0b',
      predecessors: [{ taskId: 't-uat', type: 'FS', lag: 1 }],
      resourceIds: ['m-andi', 'm-dewi'],
      pert: { optimistic: 1, mostLikely: 2, pessimistic: 4 },
    }),
  ];

  return {
    projectName: 'Implementasi Sistem Informasi Kepegawaian',
    tasks,
    members,
    calendar,
  };
}
