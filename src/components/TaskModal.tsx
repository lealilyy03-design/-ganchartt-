import { useMemo, useState } from 'react';
import type { Dependency, DependencyType, PertEstimate, Priority, Task } from '../types';
import { PRIORITY_LIST, PRIORITY_META, SWATCH_COLORS } from '../types';
import { useProject } from '../store/ProjectContext';
import { computeSchedule } from '../lib/schedule';
import { pertExpected } from '../lib/pert';
import { isValidDate, todayISO } from '../lib/date';
import { workingEndDate } from '../lib/calendar';
import { formatNumber } from '../lib/format';
import { Btn, Field, Icon, Modal } from './ui';
import type { CreateTaskDefaults } from './GanttView';

interface FormState {
  name: string;
  description: string;
  startDate: string;
  duration: string;
  priority: Priority;
  color: string;
  parentId: string | null;
  predecessors: Dependency[];
  resourceIds: string[];
  progress: number;
  pert: { optimistic: string; mostLikely: string; pessimistic: string };
}

function descendantsOf(tasks: Task[], id: string): Set<string> {
  const out = new Set<string>();
  const walk = (target: string) => {
    for (const t of tasks) {
      if (t.parentId === target && !out.has(t.id)) {
        out.add(t.id);
        walk(t.id);
      }
    }
  };
  walk(id);
  return out;
}

function treeOrder(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const roots: Task[] = [];
  const kids = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.parentId && byId.has(t.parentId) && t.parentId !== t.id) {
      const l = kids.get(t.parentId) ?? [];
      l.push(t);
      kids.set(t.parentId, l);
    } else roots.push(t);
  }  const out: Task[] = [];
  const walk = (list: Task[], depth: number) => {
    for (const t of list) {
      const indent = '\u00A0\u00A0\u00A0'.repeat(depth);
      out.push({ ...t, name: `${indent}${depth > 0 ? '└ ' : ''}${t.name}` });
      const c = kids.get(t.id) ?? [];
      if (c.length) walk(c, depth + 1);
    }
  };
  walk(roots, 0);
  return out;
}

export function TaskModal({
  mode,
  taskId,
  defaults,
  onClose,
}: {
  mode: 'create' | 'edit';
  taskId?: string;
  defaults?: CreateTaskDefaults;
  onClose: () => void;
}) {
  const { state, schedule, addTask, updateTask, deleteTask } = useProject();
  const cal = state.calendar;
  const existing = mode === 'edit' ? state.tasks.find((t) => t.id === taskId) : undefined;

  const [form, setForm] = useState<FormState>(() => {
    if (existing) {
      return {
        name: existing.name,
        description: existing.description,
        startDate: existing.startDate,
        duration: String(existing.duration),
        priority: existing.priority,
        color: existing.color,
        parentId: existing.parentId,
        predecessors: existing.predecessors.map((p) => ({ ...p })),
        resourceIds: [...existing.resourceIds],
        progress: existing.progress,
        pert: {
          optimistic: String(existing.pert.optimistic),
          mostLikely: String(existing.pert.mostLikely),
          pessimistic: String(existing.pert.pessimistic),
        },
      };
    }
    const start = defaults?.startDate && isValidDate(defaults.startDate)
      ? defaults.startDate
      : schedule.projectStart && isValidDate(schedule.projectStart)
        ? schedule.projectStart
        : todayISO();
    return {
      name: '',
      description: '',
      startDate: start,
      duration: '1',
      priority: 'medium',
      color: '#3b82f6',
      parentId: defaults?.parentId ?? null,
      predecessors: [],
      resourceIds: [],
      progress: 0,
      pert: { optimistic: '1', mostLikely: '1', pessimistic: '2' },
    };
  });

  const [error, setError] = useState('');

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const excluded = useMemo(() => {
    const setIds = new Set<string>();
    if (taskId) {
      setIds.add(taskId);
      for (const d of descendantsOf(state.tasks, taskId)) setIds.add(d);
    }
    return setIds;
  }, [state.tasks, taskId]);

  const options = useMemo(() => treeOrder(state.tasks), [state.tasks]);

  const currentSched = taskId ? schedule.tasks.get(taskId) : undefined;
  const isSummary = currentSched?.isSummary ?? false;
  const isAuto = currentSched?.auto ?? false;

  const durationNum = Math.max(1, Math.round(Number(form.duration) || 1));
  const endDatePreview = workingEndDate(cal, form.startDate, durationNum);
  const parsedPert = {
    optimistic: Number(form.pert.optimistic),
    mostLikely: Number(form.pert.mostLikely),
    pessimistic: Number(form.pert.pessimistic),
  };
  const pertOk =
    [parsedPert.optimistic, parsedPert.mostLikely, parsedPert.pessimistic].every(
      (n) => Number.isFinite(n) && n >= 0,
    ) &&
    parsedPert.optimistic <= parsedPert.mostLikely &&
    parsedPert.mostLikely <= parsedPert.pessimistic;

  const commit = () => {
    setError('');
    const name = form.name.trim();
    if (!name) return setError('Nama tugas wajib diisi.');
    if (!isSummary && (!isValidDate(form.startDate) || !form.startDate))
      return setError('Tanggal mulai tidak valid.');
    if (!isSummary && durationNum < 1) return setError('Durasi minimal 1 hari kerja.');
    if (!pertOk)
      return setError('Estimasi PERT harus berurutan: Optimistis ≤ Most Likely ≤ Pessimistis.');

    const pert: PertEstimate = {
      optimistic: parsedPert.optimistic,
      mostLikely: parsedPert.mostLikely,
      pessimistic: parsedPert.pessimistic,
    };

    const base: Task = existing
      ? { ...existing }
      : ({
          id: 'tmp',
          name: '',
          description: '',
          startDate: form.startDate,
          duration: durationNum,
          priority: form.priority,
          color: form.color,
          parentId: null,
          predecessors: [],
          resourceIds: [],
          progress: 0,
          pert,
        } as Task);

    const candidate: Task = {
      ...base,
      name,
      description: form.description.trim(),
      startDate: form.startDate,
      duration: durationNum,
      priority: form.priority,
      color: form.color,
      parentId: form.parentId,
      predecessors: form.predecessors,
      resourceIds: form.resourceIds,
      progress: form.progress,
      pert,
    };

    const nextTasks = existing ? state.tasks.map((t) => (t.id === existing.id ? candidate : t)) : [...state.tasks, candidate];

    const check = computeSchedule(nextTasks, cal);
    if (!check.valid) {
      return setError(check.errors.join(' ') || 'Tidak dapat menyimpan: terjadi siklus dependensi.');
    }

    if (existing) {
      updateTask(existing.id, {
        name: candidate.name,
        description: candidate.description,
        startDate: candidate.startDate,
        duration: candidate.duration,
        priority: candidate.priority,
        color: candidate.color,
        parentId: candidate.parentId,
        predecessors: candidate.predecessors,
        resourceIds: candidate.resourceIds,
        progress: candidate.progress,
        pert: candidate.pert,
      });
    } else {
      addTask({
        name: candidate.name,
        description: candidate.description,
        startDate: candidate.startDate,
        duration: candidate.duration,
        priority: candidate.priority,
        color: candidate.color,
        parentId: candidate.parentId,
        predecessors: candidate.predecessors,
        resourceIds: candidate.resourceIds,
        progress: candidate.progress,
        pert: candidate.pert,
      });
    }
    onClose();
  };

  const removeTask = () => {
    if (!existing) return;
    const kids = state.tasks.filter((t) => t.parentId === existing.id).length;
    const msg = kids > 0 ? `Hapus "${existing.name}" beserta ${kids} sub-tugas?` : `Hapus tugas "${existing.name}"?`;
    if (window.confirm(msg)) {
      deleteTask(existing.id);
      onClose();
    }
  };

  const addPredecessor = () => {
    const used = new Set(form.predecessors.map((p) => p.taskId));
    const next = state.tasks.find((t) => !excluded.has(t.id) && !used.has(t.id));
    if (!next) return;
    set('predecessors', [...form.predecessors, { taskId: next.id, type: 'FS', lag: 0 }]);
  };

  const updatePredecessor = (index: number, patch: Partial<Dependency>) =>
    set(
      'predecessors',
      form.predecessors.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    );

  const toggleResource = (id: string) =>
    set(
      'resourceIds',
      form.resourceIds.includes(id)
        ? form.resourceIds.filter((r) => r !== id)
        : [...form.resourceIds, id],
    );

  const title = mode === 'edit' ? 'Edit Tugas' : 'Tambah Tugas';

  return (
    <Modal
      title={title}
      subtitle={existing ? existing.name : 'Lengkapi detail tugas proyek'}
      onClose={onClose}
      width={760}
      footer={
        <div className="modal-foot-inner">
          <div>
            {existing && (
              <Btn variant="danger" icon="trash" onClick={removeTask}>
                Hapus
              </Btn>
            )}
          </div>
          <div className="gap8">
            <Btn variant="ghost" onClick={onClose}>
              Batal
            </Btn>
            <Btn variant="primary" icon="check" onClick={commit}>
              {mode === 'edit' ? 'Simpan Perubahan' : 'Tambah Tugas'}
            </Btn>
          </div>
        </div>
      }
    >
      {error && (
        <div className="banner error inline">
          <Icon name="alert" size={15} />
          <div>{error}</div>
        </div>
      )}

      <Field label="Nama Tugas" required>
        <input
          className="input"
          value={form.name}
          autoFocus
          placeholder="mis. Analisis Kebutuhan"
          onChange={(e) => set('name', e.target.value)}
        />
      </Field>

      <Field label="Deskripsi">
        <textarea
          className="input"
          rows={2}
          value={form.description}
          placeholder="Rincian pekerjaan (opsional)"
          onChange={(e) => set('description', e.target.value)}
        />
      </Field>

      <div className="grid3">
        <Field
          label="Tanggal Mulai"
          hint={isAuto ? 'dihitung otomatis' : undefined}
          required
        >
          <input
            className="input"
            type="date"
            value={isAuto && currentSched ? currentSched.startDate : form.startDate}
            disabled={isAuto || isSummary}
            onChange={(e) => set('startDate', e.target.value)}
          />
        </Field>
        <Field label="Durasi (hari kerja)" hint={isSummary ? 'dihitung dari sub-tugas' : undefined} required>
          <input
            className="input"
            type="number"
            min={1}
            value={isSummary && currentSched ? Math.round(currentSched.duration) : form.duration}
            disabled={isSummary}
            onChange={(e) => set('duration', e.target.value)}
          />
        </Field>
        <Field label="Selesai (perkiraan)">
          <input
            className="input"
            readOnly
            value={
              isSummary && currentSched
                ? currentSched.endDate
                : isAuto && currentSched
                  ? currentSched.endDate
                  : isValidDate(form.startDate)
                    ? endDatePreview
                    : '-'
            }
          />
        </Field>
      </div>

      {isAuto && !isSummary && (
        <p className="hint-line">
          <Icon name="link" size={13} /> Tugas ini dijadwalkan otomatis oleh predecessor. Ubah tanggal
          melalui jeda (lag) pada ketergantungan di bawah.
        </p>
      )}

      <div className="grid3">
        <Field label="Prioritas">
          <select
            className="input"
            value={form.priority}
            onChange={(e) => {
              const p = e.target.value as Priority;
              setForm((f) => ({ ...f, priority: p, color: PRIORITY_META[p].color }));
            }}
          >
            {PRIORITY_LIST.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_META[p].label}
              </option>
            ))}
          </select>
        </Field>

        <div className="field">
          <span className="field-label">Warna Indikator</span>
          <div className="swatch-row">
            {SWATCH_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${form.color === c ? ' active' : ''}`}
                style={{ background: c }}
                onClick={() => set('color', c)}
                title={c}
              />
            ))}
            <input
              type="color"
              className="color-input"
              value={form.color}
              onChange={(e) => set('color', e.target.value)}
              title="Pilih warna lain"
            />
          </div>
        </div>

        <Field label="Tugas Induk (sub-tugas)">
          <select
            className="input"
            value={form.parentId ?? ''}
            onChange={(e) => set('parentId', e.target.value || null)}
          >
            <option value="">— Tugas utama —</option>
            {options
              .filter((t) => !excluded.has(t.id))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </Field>
      </div>

      <section className="form-section">
        <header>
          <span>
            <Icon name="link" size={14} /> Predecessor &amp; Jeda (Lag)
          </span>
          {!isSummary && (
            <Btn icon="plus" onClick={addPredecessor} type="button">
              Tambah
            </Btn>
          )}
        </header>

        {isSummary ? (
          <p className="hint-line">Tugas induk mengikuti rentang sub-tugas, jadi tidak memiliki predecessor.</p>
        ) : form.predecessors.length === 0 ? (
          <p className="hint-line">Belum ada ketergantungan — tugas dimulai sesuai tanggal mulai manual.</p>
        ) : (
          <div className="dep-list">
            {form.predecessors.map((p, i) => (
              <div className="dep-row" key={`${p.taskId}-${i}`}>
                <select
                  className="input"
                  value={p.taskId}
                  onChange={(e) => updatePredecessor(i, { taskId: e.target.value })}
                >
                  {options
                    .filter((t) => !excluded.has(t.id))
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
                <select
                  className="input narrow"
                  value={p.type}
                  title="Tipe ketergantungan"
                  onChange={(e) => updatePredecessor(i, { type: e.target.value as DependencyType })}
                >
                  <option value="FS">FS — Finish to Start</option>
                  <option value="SS">SS — Start to Start</option>
                </select>
                <label className="lag-input" title="Jeda hari kerja">
                  <span>lag</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={p.lag}
                    onChange={(e) =>
                      updatePredecessor(i, { lag: Math.max(0, Math.round(Number(e.target.value) || 0)) })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="icon-btn sm danger"
                  title="Hapus ketergantungan"
                  onClick={() => set('predecessors', form.predecessors.filter((_, idx) => idx !== i))}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            ))}
            <p className="hint-line small">
              <b>FS</b>: tugas mulai setelah predecessor selesai. <b>SS</b>: tugas mulai bersamaan dengan
              predecessor. <b>Lag</b> = jeda hari kerja.
            </p>
          </div>
        )}
      </section>

      <section className="form-section">
        <header>
          <span>
            <Icon name="users" size={14} /> Alokasi Sumber Daya
          </span>
        </header>
        {state.members.length === 0 ? (
          <p className="hint-line">Belum ada anggota tim. Tambahkan lewat tab “Sumber Daya”.</p>
        ) : (
          <div className="chip-list">
            {state.members.map((m) => {
              const active = form.resourceIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`member-chip${active ? ' on' : ''}`}
                  style={active ? { borderColor: m.color, background: `${m.color}1a`, color: m.color } : undefined}
                  onClick={() => toggleResource(m.id)}
                >
                  <span className="dot" style={{ background: m.color }} />
                  {m.name}
                  <small>{m.role}</small>
                  {active && <Icon name="check" size={12} />}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid2">
        <Field label={`Progres — ${form.progress}%`}>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={form.progress}
            className="range"
            onChange={(e) => set('progress', Number(e.target.value))}
          />
        </Field>

        <div className="pert-fields">
          <span className="field-label">
            Estimasi PERT <small className="field-hint">hari kerja</small>
          </span>
          <div className="pert-grid">
            <label title="Optimistis">
              <span>O</span>
              <input
                className="input"
                type="number"
                min={0}
                step={0.5}
                value={form.pert.optimistic}
                onChange={(e) => set('pert', { ...form.pert, optimistic: e.target.value })}
              />
            </label>
            <label title="Most Likely">
              <span>M</span>
              <input
                className="input"
                type="number"
                min={0}
                step={0.5}
                value={form.pert.mostLikely}
                onChange={(e) => set('pert', { ...form.pert, mostLikely: e.target.value })}
              />
            </label>
            <label title="Pessimistis">
              <span>P</span>
              <input
                className="input"
                type="number"
                min={0}
                step={0.5}
                value={form.pert.pessimistic}
                onChange={(e) => set('pert', { ...form.pert, pessimistic: e.target.value })}
              />
            </label>
          </div>
          <small className={`field-hint${pertOk ? '' : ' bad'}`}>
            {pertOk
              ? `E = ${formatNumber(pertExpected(parsedPert), 2)} hari`
              : 'Harus: O ≤ M ≤ P'}
          </small>
        </div>
      </div>
    </Modal>
  );
}
