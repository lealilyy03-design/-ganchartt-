import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  CalendarConfig,
  Dependency,
  Holiday,
  Member,
  PertEstimate,
  Priority,
  ProjectState,
  Task,
} from '../types';
import { computeSchedule, type ScheduleResult } from '../lib/schedule';
import { createSeedState, uid } from '../lib/seed';
import { isValidDate, todayISO } from '../lib/date';

const STORAGE_KEY = 'ganttpro.state.v1';

export interface NewTaskInput {
  name: string;
  description?: string;
  startDate: string;
  duration: number;
  priority?: Priority;
  color?: string;
  parentId?: string | null;
  predecessors?: Dependency[];
  resourceIds?: string[];
  progress?: number;
  pert?: PertEstimate;
}

interface ProjectApi {
  state: ProjectState;
  schedule: ScheduleResult;
  setProjectName: (name: string) => void;
  addTask: (input: NewTaskInput) => string;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  addMember: (input: Omit<Member, 'id'>) => string;
  updateMember: (id: string, patch: Partial<Member>) => void;
  deleteMember: (id: string) => void;
  toggleWeekendDay: (day: number) => void;
  addHoliday: (date: string, name: string) => void;
  deleteHoliday: (id: string) => void;
  replaceState: (next: ProjectState) => void;
  resetDemo: () => void;
}

const ProjectContext = createContext<ProjectApi | null>(null);

const DEFAULT_PERT: PertEstimate = { optimistic: 1, mostLikely: 2, pessimistic: 4 };

function normalizeState(raw: unknown): ProjectState | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.tasks) || !Array.isArray(obj.members) || !obj.calendar) return null;

  const calendar = obj.calendar as CalendarConfig;
  const weekendDays = Array.isArray(calendar.weekendDays)
    ? calendar.weekendDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : [0, 6];
  const holidays: Holiday[] = Array.isArray(calendar.holidays)
    ? calendar.holidays
        .filter((h) => h && typeof h === 'object' && isValidDate((h as Holiday).date))
        .map((h) => ({
          id: String((h as Holiday).id ?? uid('hol')),
          date: (h as Holiday).date,
          name: String((h as Holiday).name ?? 'Hari Libur'),
        }))
    : [];

  const seen = new Set<string>();
  const tasks: Task[] = (obj.tasks as Task[])
    .filter((t) => t && typeof t === 'object' && typeof t.name === 'string')
    .map((t) => {
      let id = String(t.id ?? uid('t'));
      if (seen.has(id)) id = uid('t');
      seen.add(id);
      const duration = Number(t.duration);
      const progress = Number(t.progress);
      return {
        id,
        name: String(t.name),
        description: String(t.description ?? ''),
        startDate: isValidDate(t.startDate) ? t.startDate : todayISO(),
        duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 1,
        priority: (['low', 'medium', 'high', 'urgent'] as Priority[]).includes(t.priority)
          ? t.priority
          : 'medium',
        color: typeof t.color === 'string' ? t.color : '#3b82f6',
        parentId: typeof t.parentId === 'string' && t.parentId !== id ? t.parentId : null,
        predecessors: Array.isArray(t.predecessors)
          ? t.predecessors
              .filter((p) => p && typeof p.taskId === 'string')
              .map((p) => ({
                taskId: String(p.taskId),
                type: p.type === 'SS' ? ('SS' as const) : ('FS' as const),
                lag: Number.isFinite(Number(p.lag)) ? Math.max(0, Math.round(Number(p.lag))) : 0,
              }))
          : [],
        resourceIds: Array.isArray(t.resourceIds) ? t.resourceIds.map(String) : [],
        progress: Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : 0,
        pert: normalizePert(t.pert),
      };
    });

  // Pastikan parentId valid terhadap seluruh id (urutan array bisa acak) dan bebas siklus.
  const idSet = new Set(tasks.map((t) => t.id));
  for (const t of tasks) {
    if (t.parentId && !idSet.has(t.parentId)) t.parentId = null;
  }
  for (const t of tasks) {
    const visited = new Set<string>([t.id]);
    let cur = t.parentId;
    while (cur) {
      if (visited.has(cur)) {
        t.parentId = null;
        break;
      }
      visited.add(cur);
      cur = tasks.find((x) => x.id === cur)?.parentId ?? null;
    }
  }

  const members: Member[] = (obj.members as Member[])
    .filter((m) => m && typeof m === 'object' && typeof m.name === 'string')
    .map((m) => ({
      id: String(m.id ?? uid('m')),
      name: String(m.name),
      email: String(m.email ?? ''),
      role: String(m.role ?? ''),
      salary: Number.isFinite(Number(m.salary)) ? Math.max(0, Number(m.salary)) : 0,
      color: typeof m.color === 'string' ? m.color : '#64748b',
    }));

  const memberIds = new Set(members.map((m) => m.id));
  for (const t of tasks) t.resourceIds = t.resourceIds.filter((r) => memberIds.has(r));

  return {
    projectName: typeof obj.projectName === 'string' && obj.projectName.trim() ? obj.projectName : 'Proyek Baru',
    tasks,
    members,
    calendar: { weekendDays: weekendDays.length > 0 ? weekendDays : [0, 6], holidays },
  };
}

function normalizePert(raw: unknown): PertEstimate {
  const r = (raw ?? {}) as Partial<PertEstimate>;
  const optimistic = Number(r.optimistic);
  const mostLikely = Number(r.mostLikely);
  const pessimistic = Number(r.pessimistic);
  return {
    optimistic: Number.isFinite(optimistic) && optimistic >= 0 ? optimistic : DEFAULT_PERT.optimistic,
    mostLikely: Number.isFinite(mostLikely) && mostLikely >= 0 ? mostLikely : DEFAULT_PERT.mostLikely,
    pessimistic: Number.isFinite(pessimistic) && pessimistic >= 0 ? pessimistic : DEFAULT_PERT.pessimistic,
  };
}

function loadState(): ProjectState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const normalized = normalizeState(parsed);
      if (normalized) return normalized;
    }
  } catch {
    // abaikan data rusak, pakai seed
  }
  return createSeedState();
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProjectState>(() => loadState());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // kuota penuh / private mode: abaikan
    }
  }, [state]);

  const schedule = useMemo(
    () => computeSchedule(state.tasks, state.calendar),
    [state.tasks, state.calendar],
  );

  const setProjectName = useCallback((name: string) => {
    setState((s) => ({ ...s, projectName: name.trim() || 'Proyek Baru' }));
  }, []);

  const addTask = useCallback((input: NewTaskInput) => {
    const id = uid('t');
    setState((s) => ({
      ...s,
      tasks: [
        ...s.tasks,
        {
          id,
          name: input.name.trim() || 'Tugas Baru',
          description: input.description ?? '',
          startDate: input.startDate,
          duration: Math.max(1, Math.round(input.duration)),
          priority: input.priority ?? 'medium',
          color: input.color ?? '#3b82f6',
          parentId: input.parentId ?? null,
          predecessors: input.predecessors ?? [],
          resourceIds: input.resourceIds ?? [],
          progress: input.progress ?? 0,
          pert: input.pert ?? { optimistic: 1, mostLikely: Math.max(1, input.duration), pessimistic: Math.max(2, input.duration + 2) },
        },
      ],
    }));
    return id;
  }, []);

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch, id } : t)),
    }));
  }, []);

  const deleteTask = useCallback((id: string) => {
    setState((s) => {
      const doomed = new Set<string>();
      const collect = (target: string) => {
        if (doomed.has(target)) return;
        doomed.add(target);
        for (const child of s.tasks) if (child.parentId === target) collect(child.id);
      };
      collect(id);
      return {
        ...s,
        tasks: s.tasks
          .filter((t) => !doomed.has(t.id))
          .map((t) => ({
            ...t,
            predecessors: t.predecessors.filter((p) => !doomed.has(p.taskId)),
          })),
      };
    });
  }, []);

  const addMember = useCallback((input: Omit<Member, 'id'>) => {
    const id = uid('m');
    setState((s) => ({ ...s, members: [...s.members, { ...input, id }] }));
    return id;
  }, []);

  const updateMember = useCallback((id: string, patch: Partial<Member>) => {
    setState((s) => ({
      ...s,
      members: s.members.map((m) => (m.id === id ? { ...m, ...patch, id } : m)),
    }));
  }, []);

  const deleteMember = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      members: s.members.filter((m) => m.id !== id),
      tasks: s.tasks.map((t) => ({ ...t, resourceIds: t.resourceIds.filter((r) => r !== id) })),
    }));
  }, []);

  const toggleWeekendDay = useCallback((day: number) => {
    setState((s) => {
      const has = s.calendar.weekendDays.includes(day);
      const weekendDays = has
        ? s.calendar.weekendDays.filter((d) => d !== day)
        : [...s.calendar.weekendDays, day].sort((a, b) => a - b);
      return { ...s, calendar: { ...s.calendar, weekendDays } };
    });
  }, []);

  const addHoliday = useCallback((date: string, name: string) => {
    setState((s) => {
      if (!isValidDate(date)) return s;
      const holidays = s.calendar.holidays.filter((h) => h.date !== date);
      holidays.push({ id: uid('hol'), date, name: name.trim() || 'Hari Libur' });
      holidays.sort((a, b) => (a.date < b.date ? -1 : 1));
      return { ...s, calendar: { ...s.calendar, holidays } };
    });
  }, []);

  const deleteHoliday = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      calendar: { ...s.calendar, holidays: s.calendar.holidays.filter((h) => h.id !== id) },
    }));
  }, []);

  const replaceState = useCallback((next: ProjectState) => {
    const normalized = normalizeState(next);
    if (!normalized) throw new Error('Format data tidak valid.');
    setState(normalized);
  }, []);

  const resetDemo = useCallback(() => setState(createSeedState()), []);

  const api = useMemo<ProjectApi>(
    () => ({
      state,
      schedule,
      setProjectName,
      addTask,
      updateTask,
      deleteTask,
      addMember,
      updateMember,
      deleteMember,
      toggleWeekendDay,
      addHoliday,
      deleteHoliday,
      replaceState,
      resetDemo,
    }),
    [
      state,
      schedule,
      setProjectName,
      addTask,
      updateTask,
      deleteTask,
      addMember,
      updateMember,
      deleteMember,
      toggleWeekendDay,
      addHoliday,
      deleteHoliday,
      replaceState,
      resetDemo,
    ],
  );

  return <ProjectContext.Provider value={api}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectApi {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject harus dipakai di dalam ProjectProvider');
  return ctx;
}
