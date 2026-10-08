import { useMemo, useState } from 'react';
import type { Member } from '../types';
import { useProject } from '../store/ProjectContext';
import { computeBudget } from '../lib/pert';
import { dailyRate, formatCompactIDR, formatIDR, formatNumber } from '../lib/format';
import { Avatar, Btn, EmptyState, Field, Icon, Modal } from './ui';

interface MemberDraft {
  name: string;
  email: string;
  role: string;
  salary: string;
  color: string;
}

const EMPTY_DRAFT: MemberDraft = { name: '', email: '', role: '', salary: '', color: '#3b82f6' };

export function ResourcesView() {
  const { state, addMember, updateMember, deleteMember, updateTask } = useProject();
  const [draft, setDraft] = useState<MemberDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [allocFor, setAllocFor] = useState<string | null>(null);
  const [error, setError] = useState('');

  const budget = useMemo(() => computeBudget(state), [state]);

  const stats = useMemo(() => {
    const map = new Map<string, { tasks: number; days: number }>();
    for (const t of state.tasks) {
      for (const rid of t.resourceIds) {
        const cur = map.get(rid) ?? { tasks: 0, days: 0 };
        cur.tasks += 1;
        cur.days += Math.max(0, Math.round(t.duration));
        map.set(rid, cur);
      }
    }
    return map;
  }, [state.tasks]);

  const openNew = () => {
    setDraft({ ...EMPTY_DRAFT });
    setEditingId(null);
    setError('');
  };

  const openEdit = (m: Member) => {
    setDraft({ name: m.name, email: m.email, role: m.role, salary: String(m.salary), color: m.color });
    setEditingId(m.id);
    setError('');
  };

  const save = () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return setError('Nama anggota wajib diisi.');
    if (draft.email && !/^\S+@\S+\.\S+$/.test(draft.email.trim())) return setError('Format email tidak valid.');
    const salary = Math.max(0, Number(draft.salary) || 0);
    if (editingId) {
      updateMember(editingId, { name, email: draft.email.trim(), role: draft.role.trim(), salary, color: draft.color });
    } else {
      addMember({ name, email: draft.email.trim(), role: draft.role.trim(), salary, color: draft.color });
      if (!allocFor) setAllocFor(null);
    }
    setDraft(null);
    setEditingId(null);
    setError('');
  };

  const remove = (m: Member) => {
    const used = stats.get(m.id)?.tasks ?? 0;
    const msg =
      used > 0
        ? `Hapus "${m.name}"? Anggota akan dilepas dari ${used} tugas.`
        : `Hapus anggota "${m.name}"?`;
    if (window.confirm(msg)) {
      deleteMember(m.id);
      if (allocFor === m.id) setAllocFor(null);
    }
  };

  const allocMember = state.members.find((m) => m.id === allocFor) ?? null;

  const toggleAllocation = (taskId: string) => {
    if (!allocMember) return;
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const has = task.resourceIds.includes(allocMember.id);
    updateTask(taskId, {
      resourceIds: has
        ? task.resourceIds.filter((r) => r !== allocMember.id)
        : [...task.resourceIds, allocMember.id],
    });
  };

  return (
    <div className="view-pad">
      <div className="toolbar">
        <div className="toolbar-group">
          <Btn variant="primary" icon="plus" onClick={openNew}>
            Tambah Anggota
          </Btn>
        </div>
        <div className="toolbar-stats">
          <span className="stat">
            <b>{state.members.length}</b> anggota
          </span>
          <span className="stat">
            <b>{formatCompactIDR(state.members.reduce((s, m) => s + m.salary, 0))}</b> /bulan
          </span>
          <span className="stat">
            <b>{formatCompactIDR(budget)}</b> estimasi biaya proyek
          </span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>
            <Icon name="users" size={16} /> Anggota Tim
          </h2>
          <span className="muted">Gaji harian dihitung dari gaji bulanan ÷ 22 hari kerja</span>
        </div>

        {state.members.length === 0 ? (
          <EmptyState
            icon="users"
            title="Belum ada anggota"
            description="Daftarkan anggota tim (nama, email, peran, gaji) untuk mengalokasikan ke tugas."
            action={
              <Btn variant="primary" icon="plus" onClick={openNew}>
                Tambah Anggota
              </Btn>
            }
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Anggota</th>
                <th>Peran</th>
                <th className="num">Gaji /bulan</th>
                <th className="num">Biaya /hari</th>
                <th className="num">Tugas</th>
                <th className="num">Alokasi (hari kerja)</th>
                <th className="act">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {state.members.map((m) => {
                const s = stats.get(m.id) ?? { tasks: 0, days: 0 };
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="member-cell">
                        <Avatar name={m.name} color={m.color} size={30} />
                        <div>
                          <strong>{m.name}</strong>
                          <small>{m.email || '—'}</small>
                        </div>
                      </div>
                    </td>
                    <td>{m.role || '—'}</td>
                    <td className="num">{formatIDR(m.salary)}</td>
                    <td className="num">{formatIDR(dailyRate(m.salary))}</td>
                    <td className="num">{s.tasks}</td>
                    <td className="num">{formatNumber(s.days)}</td>
                    <td className="act">
                      <button
                        className="icon-btn sm"
                        title="Kelola alokasi tugas"
                        onClick={() => setAllocFor(allocFor === m.id ? null : m.id)}
                      >
                        <Icon name="link" size={14} />
                      </button>
                      <button className="icon-btn sm" title="Edit anggota" onClick={() => openEdit(m)}>
                        <Icon name="pencil" size={13} />
                      </button>
                      <button className="icon-btn sm danger" title="Hapus anggota" onClick={() => remove(m)}>
                        <Icon name="trash" size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>
            <Icon name="link" size={16} /> Alokasi Anggota ke Tugas
          </h2>
          {allocMember && <span className="muted">Sedang mengalokasikan: <b>{allocMember.name}</b></span>}
        </div>

        {state.members.length === 0 || state.tasks.length === 0 ? (
          <p className="hint-line">Pastikan sudah ada anggota dan tugas terlebih dahulu.</p>
        ) : (
          <>
            <div className="chip-list">
              {state.members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`member-chip${allocFor === m.id ? ' on' : ''}`}
                  style={allocFor === m.id ? { borderColor: m.color, background: `${m.color}1a`, color: m.color } : undefined}
                  onClick={() => setAllocFor(allocFor === m.id ? null : m.id)}
                >
                  <span className="dot" style={{ background: m.color }} />
                  {m.name}
                  <small>{stats.get(m.id)?.tasks ?? 0} tugas</small>
                </button>
              ))}
            </div>

            {allocMember ? (
              <ul className="alloc-list">
                {state.tasks.map((t) => {
                  const on = t.resourceIds.includes(allocMember.id);
                  return (
                    <li key={t.id}>
                      <label className={`alloc-item${on ? ' on' : ''}`}>
                        <input type="checkbox" checked={on} onChange={() => toggleAllocation(t.id)} />
                        <span className="task-dot" style={{ background: t.color }} />
                        <span className="alloc-name">{t.name}</span>
                        <span className="alloc-meta">{t.duration} hari</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="hint-line">Pilih anggota untuk mulai mengalokasikan tugas.</p>
            )}
          </>
        )}
      </div>

      {draft && (
        <Modal
          title={editingId ? 'Edit Anggota' : 'Tambah Anggota'}
          onClose={() => setDraft(null)}
          width={520}
          footer={
            <div className="modal-foot-inner">
              <span />
              <div className="gap8">
                <Btn variant="ghost" onClick={() => setDraft(null)}>
                  Batal
                </Btn>
                <Btn variant="primary" icon="check" onClick={save}>
                  Simpan
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
          <Field label="Nama Lengkap" required>
            <input className="input" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <div className="grid2">
            <Field label="Email">
              <input
                className="input"
                type="email"
                placeholder="nama@perusahaan.id"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </Field>
            <Field label="Peran">
              <input
                className="input"
                placeholder="mis. Backend Developer"
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid2">
            <Field label="Gaji per Bulan (Rp)" required>
              <input
                className="input"
                type="number"
                min={0}
                step={100000}
                placeholder="mis. 12000000"
                value={draft.salary}
                onChange={(e) => setDraft({ ...draft, salary: e.target.value })}
              />
            </Field>
            <div className="field">
              <span className="field-label">Warna Avatar</span>
              <div className="swatch-row">
                {['#3b82f6', '#10b981', '#ec4899', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444', '#64748b'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`swatch${draft.color === c ? ' active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setDraft({ ...draft, color: c })}
                  />
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
