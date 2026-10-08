import { useEffect, useMemo, useRef, useState } from 'react';
import type { CalendarConfig, Task } from '../types';
import { PRIORITY_META } from '../types';
import { useProject } from '../store/ProjectContext';
import {
  addDays,
  dayOfWeek,
  diffDays,
  isValidDate,
  monthLabel,
  startOfMonth,
  daysInMonth,
  todayISO,
} from '../lib/date';
import { addWorkingDays, countWorkingDays, holidayName, isWeekendDay, workingDayOffset } from '../lib/calendar';
import { Avatar, Btn, EmptyState, Icon } from './ui';

export type Zoom = 'day' | 'week' | 'month';
export const ZOOM_PX: Record<Zoom, number> = { day: 34, week: 12, month: 4.6 };
export const ROW_H = 36;
export const HEADER_H = 58;
export const LEFT_W = 470;

export interface CreateTaskDefaults {
  parentId?: string | null;
  startDate?: string;
}

interface Row {
  task: Task;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
}

type DragMode = 'move' | 'resize-r' | 'resize-l';
interface DragInfo {
  id: string;
  mode: DragMode;
  startX: number;
  origStart: string;
  origDuration: number;
  moved: boolean;
  preview: { startDate: string; duration: number };
}

function shiftWorking(cal: CalendarConfig, date: string, approxCalendarDays: number): string {
  if (approxCalendarDays === 0) return date;
  const target = addDays(date, approxCalendarDays);
  const delta = workingDayOffset(cal, date, target);
  return addWorkingDays(cal, date, delta);
}

export function GanttView({
  onEditTask,
  onCreateTask,
}: {
  onEditTask: (id: string) => void;
  onCreateTask: (defaults: CreateTaskDefaults) => void;
}) {
  const { state, schedule, updateTask, deleteTask } = useProject();
  const cal = state.calendar;

  const [zoom, setZoom] = useState<Zoom>('day');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [highlightCritical, setHighlightCritical] = useState(true);
  const [drag, setDrag] = useState<{ id: string; startDate?: string; duration?: number } | null>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const suppressClickRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const didInitScroll = useRef(false);

  const px = ZOOM_PX[zoom];
  const today = todayISO();

  // ---------------------------------------------------------------- baris
  const rows = useMemo(() => {
    const byId = new Map(state.tasks.map((t) => [t.id, t]));
    const roots: Task[] = [];
    const kids = new Map<string, Task[]>();
    for (const t of state.tasks) {
      if (t.parentId && byId.has(t.parentId) && t.parentId !== t.id) {
        const list = kids.get(t.parentId) ?? [];
        list.push(t);
        kids.set(t.parentId, list);
      } else {
        roots.push(t);
      }
    }
    const out: Row[] = [];
    const walk = (list: Task[], depth: number) => {
      for (const t of list) {
        const children = kids.get(t.id) ?? [];
        const isCollapsed = collapsed.has(t.id);
        out.push({ task: t, depth, hasChildren: children.length > 0, collapsed: isCollapsed });
        if (children.length > 0 && !isCollapsed) walk(children, depth + 1);
      }
    };
    walk(roots, 0);
    return out;
  }, [state.tasks, collapsed]);

  // ------------------------------------------------------------ sumbu waktu
  const range = useMemo(() => {
    const valid = state.tasks
      .map((t) => schedule.tasks.get(t.id)?.startDate)
      .filter((d): d is string => !!d && isValidDate(d));
    let minStart = schedule.projectStart && isValidDate(schedule.projectStart) ? schedule.projectStart : today;
    for (const d of valid) if (d < minStart) minStart = d;
    let maxEnd = schedule.projectEnd && isValidDate(schedule.projectEnd) ? schedule.projectEnd : today;
    if (maxEnd < today) maxEnd = today;
    if (minStart > today) minStart = today;

    let start = addDays(minStart, -4);
    let end = addDays(maxEnd, 8);

    if (zoom === 'month') {
      start = startOfMonth(start);
      const [ey, em] = end.split('-').map(Number);
      end = `${ey}-${String(em).padStart(2, '0')}-${String(daysInMonth(ey, em - 1)).padStart(2, '0')}`;
    } else {
      const anchor = cal.weekendDays.length > 0 ? Math.min(...cal.weekendDays) : 0;
      while (dayOfWeek(start) !== anchor) start = addDays(start, -1);
      while (dayOfWeek(end) !== (anchor + 6) % 7) end = addDays(end, 1);
    }

    const minDays = zoom === 'day' ? 35 : zoom === 'week' ? 91 : 175;
    let days = diffDays(start, end) + 1;
    if (days < minDays) {
      end = addDays(end, minDays - days);
      days = diffDays(start, end) + 1;
    }
    return { start, end, days };
  }, [schedule, state.tasks, today, zoom, cal.weekendDays]);

  const timelineWidth = range.days * px;

  const dayCells = useMemo(
    () =>
      Array.from({ length: range.days }, (_, i) => {
        const date = addDays(range.start, i);
        return {
          date,
          weekend: isWeekendDay(cal, date),
          holiday: holidayName(cal, date),
          monthStart: date.slice(8) === '01',
          isToday: date === today,
        };
      }),
    [range.start, range.days, cal, today],
  );

  const monthSegments = useMemo(() => {
    const segs: { label: string; from: number; to: number }[] = [];
    for (let i = 0; i < range.days; i++) {
      const d = addDays(range.start, i);
      const label = monthLabel(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1);
      const last = segs[segs.length - 1];
      if (last && last.label === label) last.to = i + 1;
      else segs.push({ label, from: i, to: i + 1 });
    }
    return segs;
  }, [range.start, range.days]);

  const rowIndexById = useMemo(() => new Map(rows.map((r, i) => [r.task.id, i])), [rows]);

  // --------------------------------------------------------------- panah
  const links = useMemo(() => {
    const out: {
      key: string;
      d: string;
      critical: boolean;
      label?: string;
      lx: number;
      ly: number;
    }[] = [];
    for (const e of schedule.edges) {
      const pi = rowIndexById.get(e.pred);
      const si = rowIndexById.get(e.succ);
      if (pi === undefined || si === undefined) continue;
      const ps = schedule.tasks.get(e.pred);
      const ss = schedule.tasks.get(e.succ);
      if (!ps || !ss) continue;

      const x1 =
        (e.type === 'FS'
          ? diffDays(range.start, ps.endDate) + 1
          : diffDays(range.start, ps.startDate)) * px;
      const x2 = diffDays(range.start, ss.startDate) * px - 6;
      const y1 = pi * ROW_H + ROW_H / 2;
      const y2 = si * ROW_H + ROW_H / 2;
      const tight = x2 <= x1 + 16;
      const d = tight
        ? `M ${x1} ${y1} H ${x1 + 9} V ${y2} H ${Math.max(0, x2 - 14)} L ${x2} ${y2}`
        : `M ${x1} ${y1} H ${x2 - 14} V ${y2} H ${x2}`;
      const critical = ps.critical && ss.critical;
      out.push({
        key: `${e.pred}->${e.succ}-${e.type}-${e.lag}`,
        d,
        critical,
        label: e.lag > 0 ? `+${e.lag}` : undefined,
        lx: (x1 + x2) / 2,
        ly: (y1 + y2) / 2,
      });
    }
    return out;
  }, [schedule, rowIndexById, range.start, px]);

  // ------------------------------------------------------------- drag bar
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      if (Math.abs(dx) > 3) d.moved = true;
      if (!d.moved) return;
      const shift = Math.round(dx / px);
      if (d.mode === 'move') {
        d.preview = { startDate: shiftWorking(cal, d.origStart, shift), duration: d.origDuration };
      } else if (d.mode === 'resize-r') {
        const origEnd = addWorkingDays(cal, d.origStart, d.origDuration - 1);
        const newEnd = shiftWorking(cal, origEnd, shift);
        d.preview = {
          startDate: d.origStart,
          duration: Math.max(1, countWorkingDays(cal, d.origStart, newEnd)),
        };
      } else {
        const origEnd = addWorkingDays(cal, d.origStart, d.origDuration - 1);
        let newStart = shiftWorking(cal, d.origStart, shift);
        if (newStart > origEnd) newStart = origEnd;
        d.preview = {
          startDate: newStart,
          duration: Math.max(1, countWorkingDays(cal, newStart, origEnd)),
        };
      }
      setDrag({ id: d.id, startDate: d.preview.startDate, duration: d.preview.duration });
    };

    const up = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d) return;
      if (d.moved) {
        // cegah click setelah drag membuka form edit
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
        updateTask(d.id, { startDate: d.preview.startDate, duration: d.preview.duration });
      }
      // bila tidak bergerak, biarkan event click pada bar yang membuka form edit
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [px, cal, updateTask]);

  const startDrag = (e: React.MouseEvent, task: Task, mode: DragMode) => {
    const s = schedule.tasks.get(task.id);
    if (!s || s.isSummary || s.auto) return;
    e.preventDefault();
    e.stopPropagation();
    const origStart = s.startDate;
    const origDuration = Math.max(1, Math.round(s.duration));
    dragRef.current = {
      id: task.id,
      mode,
      startX: e.clientX,
      origStart,
      origDuration,
      moved: false,
      preview: { startDate: origStart, duration: origDuration },
    };
    setDrag({ id: task.id, startDate: origStart, duration: origDuration });
  };

  const onBarClick = (task: Task) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onEditTask(task.id);
  };

  // ----------------------------------------------------------- scroll init
  useEffect(() => {
    if (didInitScroll.current || !scrollRef.current) return;
    didInitScroll.current = true;
    const el = scrollRef.current;
    const base = schedule.projectStart && isValidDate(schedule.projectStart) ? schedule.projectStart : today;
    const anchor = base < today && today < range.end ? today : base;
    el.scrollLeft = Math.max(0, diffDays(range.start, anchor) * ZOOM_PX.day - 220);
  }, [schedule.projectStart, today, range.start, range.end]);

  const scrollToToday = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, diffDays(range.start, today) * px - 240), behavior: 'smooth' });
  };

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmDelete = (task: Task) => {
    const kids = state.tasks.filter((t) => t.parentId === task.id).length;
    const msg = kids > 0 ? `Hapus "${task.name}" beserta ${kids} sub-tugas?` : `Hapus tugas "${task.name}"?`;
    if (window.confirm(msg)) deleteTask(task.id);
  };

  const renderStripes = (height: number, withToday: boolean) => (
    <div className="stripes" style={{ height }}>
      {dayCells.map((c, i) => (
        <div
          key={c.date}
          className={`daycol${c.weekend ? ' we' : ''}${c.holiday ? ' hol' : ''}${c.monthStart ? ' mstart' : ''}`}
          style={{ left: i * px, width: px }}
          title={c.holiday ? `${c.date} — ${c.holiday}` : undefined}
        />
      ))}
      {withToday && today >= range.start && today <= range.end && (
        <div className="today-line" style={{ left: diffDays(range.start, today) * px }} />
      )}
    </div>
  );

  if (state.tasks.length === 0) {
    return (
      <div className="view-pad">
        <EmptyState
          icon="gantt"
          title="Belum ada tugas"
          description="Mulai dengan menambahkan tugas utama untuk proyek Anda."
          action={
            <Btn variant="primary" icon="plus" onClick={() => onCreateTask({ startDate: todayISO() })}>
              Tambah Tugas Pertama
            </Btn>
          }
        />
      </div>
    );
  }

  const scheduleIssues = schedule.errors;

  return (
    <div className="gantt-view">
      <div className="toolbar">
        <div className="toolbar-group">
          <Btn variant="primary" icon="plus" onClick={() => onCreateTask({ startDate: schedule.projectStart || todayISO() })}>
            Tugas Baru
          </Btn>
          <Btn icon="clock" onClick={scrollToToday}>
            Hari Ini
          </Btn>
        </div>

        <div className="toolbar-group">
          <div className="segmented">
            {(['day', 'week', 'month'] as Zoom[]).map((z) => (
              <button
                key={z}
                className={zoom === z ? 'active' : ''}
                onClick={() => setZoom(z)}
                type="button"
              >
                {z === 'day' ? 'Hari' : z === 'week' ? 'Minggu' : 'Bulan'}
              </button>
            ))}
          </div>
          <label className={`check-pill${highlightCritical ? ' on' : ''}`} title="Sorot jalur kritis pada grafik">
            <input
              type="checkbox"
              checked={highlightCritical}
              onChange={(e) => setHighlightCritical(e.target.checked)}
            />
            <Icon name="target" size={14} />
            Jalur Kritis
          </label>
        </div>

        <div className="toolbar-stats">
          <span className="stat">
            <b>{state.tasks.length}</b> tugas
          </span>
          <span className="stat">
            <b>{schedule.projectDuration}</b> hari kerja
          </span>
          <span className="stat crit">
            <b>{schedule.criticalIds.length}</b> jalur kritis
          </span>
          <span className="stat muted">
            {schedule.projectStart} → {schedule.projectEnd}
          </span>
        </div>
      </div>

      {scheduleIssues.length > 0 && (
        <div className={`banner ${schedule.valid ? 'warn' : 'error'}`}>
          <Icon name="alert" size={16} />
          <div>
            <b>{schedule.valid ? 'Peringatan penjadwalan: ' : 'Jadwal otomatis nonaktif: '}</b>
            {scheduleIssues.join(' ')}
          </div>
        </div>
      )}

      <div className="gantt-scroll" ref={scrollRef}>
        <div className="gantt-grid" style={{ width: LEFT_W + timelineWidth }}>
          {/* header */}
          <div className="gantt-head" style={{ height: HEADER_H }}>
            <div className="gantt-head-left" style={{ width: LEFT_W }}>
              <span className="col-name">Tugas</span>
              <span className="col-dur">Durasi</span>
              <span className="col-prio">Prioritas</span>
              <span className="col-anggota">Anggota</span>
              <span className="col-act" />
            </div>
            <div className="gantt-head-right" style={{ width: timelineWidth }}>
              {renderStripes(HEADER_H, true)}
              <div className="months-row">
                {monthSegments.map((m) => (
                  <div key={`${m.label}-${m.from}`} className="month-seg" style={{ width: (m.to - m.from) * px }}>
                    {m.label}
                  </div>
                ))}
              </div>
              <div className="days-row">
                {dayCells.map((c, i) => {
                  const dow = dayOfWeek(c.date);
                  const num = Number(c.date.slice(8));
                  const show =
                    zoom === 'day'
                      ? true
                      : zoom === 'week'
                        ? dow === 1 || num === 1
                        : num === 1;
                  return (
                    <div
                      key={c.date}
                      className={`day-cell${c.weekend ? ' we' : ''}${c.holiday ? ' hol' : ''}${c.isToday ? ' now' : ''}`}
                      style={{ left: i * px, width: px }}
                    >
                      {show && <span>{num}</span>}
                    </div>
                  );
                })}
              </div>
              {today >= range.start && today <= range.end && (
                <div className="today-flag" style={{ left: diffDays(range.start, today) * px }}>
                  Hari Ini
                </div>
              )}
            </div>
          </div>

          {/* body */}
          <div className="gantt-body" style={{ height: rows.length * ROW_H }}>
            <div className="body-stripes" style={{ left: LEFT_W, width: timelineWidth, top: 0 }}>
              {renderStripes(rows.length * ROW_H, true)}
            </div>

            <div className="gantt-links" style={{ left: LEFT_W, width: timelineWidth, height: rows.length * ROW_H }}>
              <svg width={timelineWidth} height={rows.length * ROW_H}>
                <defs>
                  <marker id="arw" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                    <path d="M0,0 L7,3.5 L0,7 z" fill="#94a3b8" />
                  </marker>
                  <marker id="arw-c" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                    <path d="M0,0 L7,3.5 L0,7 z" fill="#dc2626" />
                  </marker>
                </defs>
                {links.map((l) => (
                  <g key={l.key}>
                    <path
                      d={l.d}
                      fill="none"
                      stroke={l.critical ? '#dc2626' : '#94a3b8'}
                      strokeWidth={l.critical ? 1.8 : 1.3}
                      strokeDasharray={l.label ? '4 3' : undefined}
                      markerEnd={l.critical ? 'url(#arw-c)' : 'url(#arw)'}
                    />
                    {l.label && (
                      <text x={l.lx} y={l.ly - 4} className="lag-label" textAnchor="middle">
                        {l.label}
                      </text>
                    )}
                  </g>
                ))}
              </svg>
            </div>

            {rows.map((row, i) => {
              const task = row.task;
              const preview = drag && drag.id === task.id ? drag : null;
              const sched = schedule.tasks.get(task.id);
              if (!sched) return null;

              const startDate = preview?.startDate ?? sched.startDate;
              const duration = preview?.duration ?? Math.round(sched.duration);
              const endDate =
                preview?.duration !== undefined
                  ? addWorkingDays(cal, startDate, duration - 1)
                  : sched.endDate;
              const left = diffDays(range.start, startDate) * px;
              const width = Math.max(6, (diffDays(startDate, endDate) + 1) * px);
              const draggable = !sched.isSummary && !sched.auto;
              const priority = PRIORITY_META[task.priority];
              const resources = task.resourceIds
                .map((id) => state.members.find((m) => m.id === id))
                .filter((m): m is NonNullable<typeof m> => !!m);

              return (
                  <div
                    key={task.id}
                    className={`gantt-row${sched.isSummary ? ' summary' : ''}${sched.critical && highlightCritical ? ' is-critical' : ''}${i % 2 ? ' odd' : ''}`}
                    style={{ height: ROW_H }}
                  >
                  <div className="gantt-row-left" style={{ width: LEFT_W }}>
                    <div className="row-indent" style={{ marginLeft: 6 + row.depth * 15 }}>
                      {row.hasChildren ? (
                        <button
                          type="button"
                          className="chev"
                          onClick={() => toggleCollapse(task.id)}
                          title={row.collapsed ? 'Buka' : 'Tutup'}
                        >
                          <Icon name={row.collapsed ? 'chevron-right' : 'chevron-down'} size={13} />
                        </button>
                      ) : (
                        <span className="chev-spacer" />
                      )}
                      <span className="task-dot" style={{ background: task.color }} />
                    </div>

                    <button type="button" className="task-name" onClick={() => onEditTask(task.id)} title={`${task.name} — ${startDate} s/d ${endDate}`}>
                      <span className="task-name-text">{task.name}</span>
                      {sched.critical && highlightCritical && (
                        <span className="crit-flag" title="Jalur kritis">
                          <Icon name="flag" size={12} />
                        </span>
                      )}
                      {sched.auto && (
                        <span className="auto-mark" title="Dijadwalkan otomatis dari predecessor">
                          <Icon name="link" size={11} />
                        </span>
                      )}
                    </button>

                    <span className="col-dur val">{Math.round(duration)} hari</span>
                    <span className="col-prio val">
                      <span className="prio-chip" style={{ color: priority.color, background: `${priority.color}1f` }}>
                        {priority.label}
                      </span>
                    </span>
                    <span className="col-anggota val avatars">
                      {resources.slice(0, 3).map((m) => (
                        <Avatar key={m.id} name={m.name} color={m.color} size={20} />
                      ))}
                      {resources.length > 3 && <span className="avatar more">+{resources.length - 3}</span>}
                    </span>
                    <span className="col-act val actions">
                      <button
                        type="button"
                        className="icon-btn sm"
                        title="Tambah sub-tugas"
                        onClick={() => {
                          if (row.collapsed) toggleCollapse(task.id);
                          onCreateTask({ parentId: task.id, startDate: addWorkingDays(cal, sched.endDate, 1) });
                        }}
                      >
                        <Icon name="plus" size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn sm"
                        title="Edit tugas"
                        onClick={() => onEditTask(task.id)}
                      >
                        <Icon name="pencil" size={13} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn sm danger"
                        title="Hapus tugas"
                        onClick={() => confirmDelete(task)}
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    </span>
                  </div>

                  <div className="gantt-row-right" style={{ width: timelineWidth }}>
                    <div
                      className={`bar${sched.critical && highlightCritical ? ' critical' : ''}${preview ? ' dragging' : ''}${draggable ? '' : ' locked'}`}
                      style={{ left, width, background: task.color }}
                      onMouseDown={(e) => (draggable ? startDrag(e, task, 'move') : undefined)}
                      onClick={() => onBarClick(task)}
                      title={
                        draggable
                          ? `${task.name}\n${startDate} → ${endDate} (${duration} hari kerja)\nSeret untuk memindahkan`
                          : sched.isSummary
                            ? `${task.name} (tugas induk — mengikuti sub-tugas)`
                            : `${task.name} (dijadwalkan otomatis oleh predecessor)`
                      }
                    >
                      <div className="bar-progress" style={{ width: `${Math.min(100, task.progress)}%` }} />
                      {width > 70 && <span className="bar-label">{task.name}</span>}
                      {draggable && (
                        <>
                          <i
                            className="handle l"
                            onMouseDown={(e) => startDrag(e, task, 'resize-l')}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <i
                            className="handle r"
                            onMouseDown={(e) => startDrag(e, task, 'resize-r')}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </>
                      )}
                      {task.progress > 0 && task.progress < 100 && width > 46 && (
                        <span className="bar-progress-label">{task.progress}%</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="gantt-legend">
        <span className="legend-item"><i className="sw crit" /> Jalur kritis</span>
        <span className="legend-item"><i className="sw we" /> Akhir pekan</span>
        <span className="legend-item"><i className="sw hol" /> Hari libur</span>
        <span className="legend-item"><i className="sw prog" /> Progres tugas</span>
        <span className="legend-item dim">Seret bar untuk memindah • tarik tepi bar untuk ubah durasi</span>
      </div>
    </div>
  );
}
