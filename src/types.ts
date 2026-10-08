export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type DependencyType = 'FS' | 'SS';

export interface Dependency {
  taskId: string;
  type: DependencyType;
  /** Jeda dalam hari kerja. */
  lag: number;
}

export interface PertEstimate {
  optimistic: number;
  mostLikely: number;
  pessimistic: number;
}

export interface Task {
  id: string;
  name: string;
  description: string;
  /** Tanggal mulai manual (YYYY-MM-DD). Hanya berlaku bila tugas tidak punya predecessor. */
  startDate: string;
  /** Durasi dalam hari kerja. */
  duration: number;
  priority: Priority;
  color: string;
  parentId: string | null;
  predecessors: Dependency[];
  resourceIds: string[];
  /** Penyelesaian 0-100. */
  progress: number;
  pert: PertEstimate;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  /** Gaji per bulan (Rp). */
  salary: number;
  color: string;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

export interface CalendarConfig {
  /** 0 = Minggu ... 6 = Sabtu */
  weekendDays: number[];
  holidays: Holiday[];
}

export interface ProjectState {
  projectName: string;
  tasks: Task[];
  members: Member[];
  calendar: CalendarConfig;
}

export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  low: { label: 'Rendah', color: '#94a3b8' },
  medium: { label: 'Sedang', color: '#3b82f6' },
  high: { label: 'Tinggi', color: '#f59e0b' },
  urgent: { label: 'Mendesak', color: '#ef4444' },
};

export const PRIORITY_LIST: Priority[] = ['low', 'medium', 'high', 'urgent'];

export const DEP_LABELS: Record<DependencyType, string> = {
  FS: 'Finish-to-Start (FS)',
  SS: 'Start-to-Start (SS)',
};

export const SWATCH_COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#10b981',
  '#06b6d4',
  '#64748b',
];
