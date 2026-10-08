import type { CalendarConfig, DependencyType, Task } from '../types';
import { addDays, isValidDate } from './date';
import { isWorkingDay, nextWorkingDay } from './calendar';

const EPS = 1e-6;

export interface TaskSchedule {
  id: string;
  isSummary: boolean;
  depth: number;
  /** Durasi dalam hari kerja (bisa pecahan pada mode PERT). */
  duration: number;
  startDate: string;
  endDate: string;
  /** Earliest start/finish (indeks hari kerja, inklusif). */
  es: number;
  ef: number;
  /** Latest start/finish (indeks hari kerja, inklusif). */
  ls: number;
  lf: number;
  /** Total float dalam hari kerja. */
  float: number;
  critical: boolean;
  /** True bila tanggal diturunkan dari predecessor (auto-schedule). */
  auto: boolean;
}

export interface DepEdge {
  pred: string;
  succ: string;
  type: DependencyType;
  lag: number;
}

export interface ScheduleResult {
  valid: boolean;
  errors: string[];
  tasks: Map<string, TaskSchedule>;
  projectStart: string;
  projectEnd: string;
  projectStartIdx: number;
  projectEndIdx: number;
  /** Durasi proyek dalam hari kerja. */
  projectDuration: number;
  criticalIds: string[];
  edges: DepEdge[];
}

/**
 * Peta dua arah antara tanggal dan indeks hari kerja.
 * Indeks hanya bersifat relatif (indeks 0 = hari kerja dasar), yang penting hanya selisihnya.
 */
class WorkIndex {
  private cal: CalendarConfig;
  private base: string;
  private cache = new Map<string, number>();
  private rev: string[] = [];

  constructor(cal: CalendarConfig, base: string) {
    this.cal = cal;
    this.base = nextWorkingDay(cal, base);
    this.cache.set(this.base, 0);
    this.rev[0] = this.base;
  }

  idxOf(date: string): number {
    const hit = this.cache.get(date);
    if (hit !== undefined) return hit;

    if (date >= this.base) {
      let last = this.rev.length - 1;
      let d = this.rev[last];
      let guard = 0;
      while (d < date && guard++ < 200_000) {
        d = addDays(d, 1);
        if (isWorkingDay(this.cal, d)) {
          last++;
          this.rev[last] = d;
          this.cache.set(d, last);
        } else {
          this.cache.set(d, last + 1);
        }
      }
      return this.cache.get(date) ?? 0;
    }

    let d = this.base;
    let countBefore = 0;
    let guard = 0;
    while (d > date && guard++ < 200_000) {
      d = addDays(d, -1);
      if (isWorkingDay(this.cal, d)) countBefore -= 1;
      this.cache.set(d, countBefore);
    }
    return this.cache.get(date) ?? 0;
  }

  dateOf(index: number): string {
    const rounded = Math.round(index);
    if (rounded >= 0) {
      let guard = 0;
      while (this.rev.length <= rounded && guard++ < 200_000) {
        const last = this.rev.length - 1;
        let d = addDays(this.rev[last], 1);
        while (!isWorkingDay(this.cal, d) && guard++ < 200_000) d = addDays(d, 1);
        this.rev.push(d);
      }
      return this.rev[rounded] ?? this.base;
    }
    let d = this.base;
    let found = 0;
    let guard = 0;
    while (found > rounded && guard++ < 200_000) {
      d = addDays(d, -1);
      if (isWorkingDay(this.cal, d)) found -= 1;
    }
    return d;
  }
}

export interface ScheduleOptions {
  /** Fungsi durasi (untuk menghitung ulang dengan estimasi PERT). */
  durationOf?: (task: Task) => number;
  /** Batas atas indeks proyek (untuk pass mundur pada mode PERT). */
  projectEndIdxOverride?: number;
}

export function computeSchedule(
  tasks: Task[],
  cal: CalendarConfig,
  opts: ScheduleOptions = {},
): ScheduleResult {
  const durationOf = opts.durationOf ?? ((t: Task) => Math.max(1, t.duration));
  const errors: string[] = [];
  const byId = new Map<string, Task>();
  for (const t of tasks) {
    if (!byId.has(t.id)) byId.set(t.id, t);
  }

  // --- Struktur pohon parent-child -------------------------------------
  const children = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.parentId && t.parentId !== t.id && byId.has(t.parentId)) {
      const list = children.get(t.parentId) ?? [];
      list.push(t);
      children.set(t.parentId, list);
    } else if (t.parentId && !byId.has(t.parentId)) {
      errors.push(`Induk dari "${t.name}" tidak ditemukan; tugas diperlakukan sebagai tugas utama.`);
    }
  }
  const isSummary = (t: Task) => (children.get(t.id)?.length ?? 0) > 0;

  const depthCache = new Map<string, number>();
  const depthOf = (t: Task): number => {
    const memo = depthCache.get(t.id);
    if (memo !== undefined) return memo;
    let depth = 0;
    let cur: Task | undefined = t;
    const seen = new Set<string>([t.id]);
    while (cur?.parentId) {
      const p: Task | undefined = byId.get(cur.parentId);
      if (!p || seen.has(p.id)) {
        if (p && seen.has(p.id)) errors.push(`Struktur sub-tugas membentuk siklus pada "${p.name}".`);
        break;
      }
      seen.add(p.id);
      depth++;
      cur = p;
    }
    depthCache.set(t.id, depth);
    return depth;
  };

  const leaves = tasks.filter((t) => !isSummary(t));
  const leafIds = new Set(leaves.map((t) => t.id));

  // --- Ekspansi predecessor summary -> daun di bawahnya ------------------
  const collectLeaves = (id: string, seen = new Set<string>()): string[] => {
    if (seen.has(id)) return [];
    seen.add(id);
    const t = byId.get(id);
    if (!t) return [];
    const kids = children.get(id);
    if (!kids || kids.length === 0) return [id];
    return kids.flatMap((k) => collectLeaves(k.id, seen));
  };

  const edges: DepEdge[] = [];
  let graphValid = true;
  for (const t of leaves) {
    for (const p of t.predecessors) {
      if (!byId.has(p.taskId)) {
        errors.push(`Predecessor pada "${t.name}" tidak ditemukan dan diabaikan.`);
        continue;
      }
      if (p.taskId === t.id) {
        errors.push(`"${t.name}" tidak boleh menjadi predecessor dirinya sendiri.`);
        graphValid = false;
        continue;
      }
      const lag = Number.isFinite(p.lag) ? Math.max(0, Math.round(p.lag)) : 0;
      for (const predLeaf of collectLeaves(p.taskId)) {
        if (predLeaf === t.id) {
          errors.push(`Siklus dependensi terdeteksi pada tugas "${t.name}".`);
          graphValid = false;
          continue;
        }
        edges.push({ pred: predLeaf, succ: t.id, type: p.type, lag });
      }
    }
  }

  // --- Topological sort --------------------------------------------------
  const predEdges = new Map<string, DepEdge[]>();
  const succEdges = new Map<string, DepEdge[]>();
  const indegree = new Map<string, number>();
  for (const id of leafIds) indegree.set(id, 0);
  for (const e of edges) {
    const pl = predEdges.get(e.succ) ?? [];
    pl.push(e);
    predEdges.set(e.succ, pl);
    const sl = succEdges.get(e.pred) ?? [];
    sl.push(e);
    succEdges.set(e.pred, sl);
    indegree.set(e.succ, (indegree.get(e.succ) ?? 0) + 1);
  }

  const order: string[] = [];
  const queue = leaves.filter((t) => (indegree.get(t.id) ?? 0) === 0).map((t) => t.id);
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of succEdges.get(id) ?? []) {
      const next = (indegree.get(e.succ) ?? 0) - 1;
      indegree.set(e.succ, next);
      if (next === 0) queue.push(e.succ);
    }
  }
  if (order.length !== leaves.length) {
    graphValid = false;
    errors.push('Siklus dependensi terdeteksi. Jadwal otomatis dinonaktifkan sampai siklus diperbaiki.');
  }

  // --- Tanggal dasar & index ---------------------------------------------
  let baseDate = '';
  for (const t of tasks) {
    if (isValidDate(t.startDate) && (!baseDate || t.startDate < baseDate)) baseDate = t.startDate;
  }
  if (!baseDate) baseDate = nextWorkingDay(cal, new Date().toISOString().slice(0, 10));
  const wi = new WorkIndex(cal, baseDate);

  const snappedStart = (t: Task) =>
    isValidDate(t.startDate) ? nextWorkingDay(cal, t.startDate) : wi.dateOf(0);

  // --- Pass maju -----------------------------------------------------------
  const es = new Map<string, number>();
  const ef = new Map<string, number>();

  const forwardId = graphValid ? order : leaves.map((t) => t.id);
  for (const id of forwardId) {
    const t = byId.get(id)!;
    const dur = Math.max(0.01, durationOf(t));
    const preds = graphValid ? predEdges.get(id) ?? [] : [];
    let start: number;
    if (preds.length === 0) {
      start = wi.idxOf(snappedStart(t));
    } else {
      start = -Infinity;
      for (const e of preds) {
        const pEs = es.get(e.pred)!;
        const pEf = ef.get(e.pred)!;
        const constraint = e.type === 'FS' ? pEf + 1 + e.lag : pEs + e.lag;
        start = Math.max(start, constraint);
      }
    }
    es.set(id, start);
    ef.set(id, start + dur - 1);
  }

  const leafIdsArr = leaves.map((t) => t.id);
  let projectStartIdx = leafIdsArr.length > 0 ? Math.min(...leafIdsArr.map((id) => es.get(id)!)) : 0;
  let projectEndIdx =
    opts.projectEndIdxOverride ?? (leafIdsArr.length > 0 ? Math.max(...leafIdsArr.map((id) => ef.get(id)!)) : 0);
  if (leafIdsArr.length === 0) {
    projectStartIdx = 0;
    projectEndIdx = 0;
  }

  // --- Pass mundur ----------------------------------------------------------
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();

  if (graphValid) {
    for (const id of [...order].reverse()) {
      const dur = Math.max(0.01, durationOf(byId.get(id)!));
      let latestFinish = Infinity;
      for (const e of succEdges.get(id) ?? []) {
        const sLs = ls.get(e.succ)!;
        if (e.type === 'FS') {
          latestFinish = Math.min(latestFinish, sLs - 1 - e.lag);
        } else {
          latestFinish = Math.min(latestFinish, sLs - e.lag + dur - 1);
        }
      }
      if (!Number.isFinite(latestFinish)) latestFinish = projectEndIdx;
      lf.set(id, latestFinish);
      ls.set(id, latestFinish - dur + 1);
    }
  } else {
    for (const id of leafIdsArr) {
      es.set(id, es.get(id)!);
      lf.set(id, ef.get(id)!);
      ls.set(id, es.get(id)!);
    }
  }

  // --- Susun hasil (daun dulu, lalu summary dari bawah ke atas) -------------
  const result = new Map<string, TaskSchedule>();
  const criticalIds: string[] = [];

  for (const t of leaves) {
    const id = t.id;
    const dur = Math.max(0.01, durationOf(t));
    const start = es.get(id)!;
    const finish = ef.get(id)!;
    const latestStart = ls.get(id)!;
    const latestFinish = lf.get(id)!;
    let fl = latestStart - start;
    if (Math.abs(fl) < EPS) fl = 0;
    const critical = graphValid && fl <= EPS;
    const schedule: TaskSchedule = {
      id,
      isSummary: false,
      depth: depthOf(t),
      duration: dur,
      startDate: wi.dateOf(start),
      endDate: wi.dateOf(finish),
      es: start,
      ef: finish,
      ls: latestStart,
      lf: latestFinish,
      float: fl,
      critical,
      auto: (predEdges.get(id)?.length ?? 0) > 0,
    };
    result.set(id, schedule);
    if (critical) criticalIds.push(id);
  }

  const byDepth = [...tasks].sort((a, b) => depthOf(b) - depthOf(a));
  for (const t of byDepth) {
    if (!isSummary(t)) continue;
    const kids = children.get(t.id)!;
    let kEs = Infinity;
    let kEf = -Infinity;
    let kLs = Infinity;
    let kLf = -Infinity;
    let kFloat = Infinity;
    let any = false;
    let anyCritical = false;
    for (const k of kids) {
      const s = result.get(k.id);
      if (!s) continue;
      any = true;
      kEs = Math.min(kEs, s.es);
      kEf = Math.max(kEf, s.ef);
      kLs = Math.min(kLs, s.ls);
      kLf = Math.max(kLf, s.lf);
      kFloat = Math.min(kFloat, s.float);
      if (s.critical) anyCritical = true;
    }
    if (!any) continue;
    result.set(t.id, {
      id: t.id,
      isSummary: true,
      depth: depthOf(t),
      duration: kEf - kEs + 1,
      startDate: wi.dateOf(kEs),
      endDate: wi.dateOf(kEf),
      es: kEs,
      ef: kEf,
      ls: kLs,
      lf: kLf,
      float: kFloat,
      critical: graphValid && anyCritical,
      auto: false,
    });
  }

  criticalIds.sort((a, b) => {
    const sa = result.get(a)!;
    const sb = result.get(b)!;
    return sa.es - sb.es || sa.ef - sb.ef;
  });

  const hasTasks = leaves.length > 0;
  return {
    valid: graphValid,
    errors: [...new Set(errors)],
    tasks: result,
    projectStart: hasTasks ? wi.dateOf(projectStartIdx) : '',
    projectEnd: hasTasks ? wi.dateOf(projectEndIdx) : '',
    projectStartIdx,
    projectEndIdx,
    projectDuration: hasTasks ? Math.round((projectEndIdx - projectStartIdx + 1) * 100) / 100 : 0,
    criticalIds,
    edges,
  };
}

/** Telusuri rantai kritis dari akhir proyek ke awal (untuk diagram PERT). */
export function traceCriticalChain(result: ScheduleResult): string[] {
  const endTasks = result.criticalIds.filter((id) => {
    const s = result.tasks.get(id);
    return s && Math.round(s.ef) === Math.round(result.projectEndIdx);
  });
  if (endTasks.length === 0) return [];

  const predsOf = new Map<string, string[]>();
  for (const e of result.edges) {
    const list = predsOf.get(e.succ) ?? [];
    list.push(e.pred);
    predsOf.set(e.succ, list);
  }

  const chain: string[] = [];
  const seen = new Set<string>();
  let current = endTasks.sort((a, b) => (result.tasks.get(b)!.float ?? 0) - (result.tasks.get(a)!.float ?? 0))[0];
  while (current && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    const preds = (predsOf.get(current) ?? []).filter((p) => {
      const s = result.tasks.get(p);
      return s && s.critical;
    });
    if (preds.length === 0) break;
    preds.sort((a, b) => result.tasks.get(b)!.es - result.tasks.get(a)!.es);
    current = preds[0];
  }
  return chain.reverse();
}
