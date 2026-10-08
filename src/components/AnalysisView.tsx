import { useMemo, useState } from 'react';
import type { Task } from '../types';
import { useProject } from '../store/ProjectContext';
import { computePert } from '../lib/pert';
import { formatDateID } from '../lib/date';
import { formatNumber } from '../lib/format';
import { Avatar, Btn, EmptyState, Icon } from './ui';
import { PertDiagram } from './PertDiagram';

export function AnalysisView({
  onEditTask,
  onGoToGantt,
}: {
  onEditTask: (id: string) => void;
  onGoToGantt: () => void;
}) {
  const { state, schedule } = useProject();
  const [tab, setTab] = useState<'critical' | 'pert'>('critical');

  const pert = useMemo(() => computePert(state.tasks, state.calendar), [state.tasks, state.calendar]);

  const taskById = useMemo(() => new Map(state.tasks.map((t) => [t.id, t])), [state.tasks]);

  const criticalTasks = useMemo(
    () =>
      schedule.criticalIds
        .map((id) => taskById.get(id))
        .filter((t): t is Task => !!t)
        .sort((a, b) => (schedule.tasks.get(a.id)?.es ?? 0) - (schedule.tasks.get(b.id)?.es ?? 0)),
    [schedule, taskById],
  );

  const nearCritical = useMemo(
    () =>
      state.tasks
        .filter((t) => {
          const s = schedule.tasks.get(t.id);
          return s && !s.isSummary && !s.critical && s.float > 0 && s.float <= 2;
        })
        .sort((a, b) => (schedule.tasks.get(a.id)!.float ?? 0) - (schedule.tasks.get(b.id)!.float ?? 0)),
    [state.tasks, schedule],
  );

  const pertNodes = useMemo(
    () => state.tasks.filter((t) => !(schedule.tasks.get(t.id)?.isSummary ?? false)),
    [state.tasks, schedule.tasks],
  );

  if (state.tasks.length === 0) {
    return (
      <div className="view-pad">
        <EmptyState
          icon="target"
          title="Belum ada data untuk dianalisis"
          description="Tambahkan tugas terlebih dahulu untuk melihat jalur kritis dan diagram PERT."
          action={
            <Btn variant="primary" icon="plus" onClick={onGoToGantt}>
              Buka Gantt Chart
            </Btn>
          }
        />
      </div>
    );
  }

  const predLabel = (task: Task) => {
    if (task.predecessors.length === 0) return '—';
    return task.predecessors
      .map((p) => {
        const name = taskById.get(p.taskId)?.name ?? '?';
        return `${name} (${p.type}${p.lag > 0 ? `+${p.lag}` : ''})`;
      })
      .join(', ');
  };

  return (
    <div className="view-pad">
      <div className="toolbar">
        <div className="segmented big">
          <button className={tab === 'critical' ? 'active' : ''} onClick={() => setTab('critical')} type="button">
            <Icon name="target" size={14} /> Jalur Kritis
          </button>
          <button className={tab === 'pert' ? 'active' : ''} onClick={() => setTab('pert')} type="button">
            <Icon name="network" size={14} /> Diagram PERT
          </button>
        </div>
        <div className="toolbar-stats">
          <span className="stat muted">Metode: Critical Path Method (CPM) dengan kalender hari kerja</span>
        </div>
      </div>

      {!schedule.valid && (
        <div className="banner error">
          <Icon name="alert" size={16} />
          <div>
            <b>Analisis belum akurat: </b>
            {schedule.errors.join(' ')}
          </div>
        </div>
      )}

      {tab === 'critical' ? (
        <>
          <div className="cards">
            <div className="card">
              <span className="card-label">Durasi proyek</span>
              <b className="card-value">{formatNumber(schedule.projectDuration)}</b>
              <small>hari kerja</small>
            </div>
            <div className="card">
              <span className="card-label">Mulai — Selesai</span>
              <b className="card-value small">
                {schedule.projectStart ? formatDateID(schedule.projectStart, 'short') : '-'} →{' '}
                {schedule.projectEnd ? formatDateID(schedule.projectEnd, 'short') : '-'}
              </b>
              <small>rentang proyek</small>
            </div>
            <div className="card crit">
              <span className="card-label">Tugas pada jalur kritis</span>
              <b className="card-value">{criticalTasks.length}</b>
              <small>dari {state.tasks.length} tugas — float = 0</small>
            </div>
            <div className="card">
              <span className="card-label">Hampir kritis</span>
              <b className="card-value">{nearCritical.length}</b>
              <small>float ≤ 2 hari kerja</small>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>
                <Icon name="target" size={16} /> Jalur Kritis (Float = 0)
              </h2>
              <Btn icon="gantt" onClick={onGoToGantt}>
                Sorot di Gantt
              </Btn>
            </div>

            {criticalTasks.length === 0 ? (
              <p className="hint-line">Tidak ada tugas kritis — semua tugas memiliki kelonggaran waktu.</p>
            ) : (
              <ol className="chain-line">
                {criticalTasks.map((t, i) => (
                  <li key={t.id}>
                    {i > 0 && <span className="arrow">→</span>}
                    <button type="button" className="chain-node" onClick={() => onEditTask(t.id)}>
                      <span className="task-dot" style={{ background: t.color }} />
                      {t.name}
                      <small>{t.duration} hr</small>
                    </button>
                  </li>
                ))}
              </ol>
            )}

            <table className="table">
              <thead>
                <tr>
                  <th>Tugas</th>
                  <th>Predecessor</th>
                  <th className="num">Durasi</th>
                  <th>Mulai</th>
                  <th>Selesai</th>
                  <th className="num">Float</th>
                  <th>Anggota</th>
                  <th className="act" />
                </tr>
              </thead>
              <tbody>
                {criticalTasks.map((t) => {
                  const s = schedule.tasks.get(t.id)!;
                  const members = t.resourceIds
                    .map((id) => state.members.find((m) => m.id === id))
                    .filter((m): m is NonNullable<typeof m> => !!m);
                  return (
                    <tr key={t.id} className="row-crit">
                      <td>
                        <span className="cell-task">
                          <span className="task-dot" style={{ background: t.color }} />
                          <strong>{t.name}</strong>
                        </span>
                      </td>
                      <td className="muted">{predLabel(t)}</td>
                      <td className="num">{formatNumber(s.duration)}</td>
                      <td>{formatDateID(s.startDate, 'short')}</td>
                      <td>{formatDateID(s.endDate, 'short')}</td>
                      <td className="num crit-text">{formatNumber(s.float)}</td>
                      <td>
                        <span className="avatars">
                          {members.slice(0, 3).map((m) => (
                            <Avatar key={m.id} name={m.name} color={m.color} size={20} />
                          ))}
                        </span>
                      </td>
                      <td className="act">
                        <button className="icon-btn sm" title="Edit tugas" onClick={() => onEditTask(t.id)}>
                          <Icon name="pencil" size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {nearCritical.length > 0 && (
              <>
                <div className="panel-sub">
                  <h3>
                    <Icon name="clock" size={14} /> Hampir Kritis (float ≤ 2 hari kerja)
                  </h3>
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Tugas</th>
                      <th>Predecessor</th>
                      <th className="num">Durasi</th>
                      <th>Mulai</th>
                      <th>Selesai</th>
                      <th className="num">Float</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nearCritical.map((t) => {
                      const s = schedule.tasks.get(t.id)!;
                      return (
                        <tr key={t.id}>
                          <td>
                            <button type="button" className="link-btn" onClick={() => onEditTask(t.id)}>
                              <span className="task-dot" style={{ background: t.color }} />
                              {t.name}
                            </button>
                          </td>
                          <td className="muted">{predLabel(t)}</td>
                          <td className="num">{formatNumber(s.duration)}</td>
                          <td>{formatDateID(s.startDate, 'short')}</td>
                          <td>{formatDateID(s.endDate, 'short')}</td>
                          <td className="num warn-text">{formatNumber(s.float)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="cards">
            <div className="card">
              <span className="card-label">Durasi ekspektasi (E)</span>
              <b className="card-value">{formatNumber(pert.totalExpected, 1)}</b>
              <small>hari kerja</small>
            </div>
            <div className="card">
              <span className="card-label">Standar deviasi (σ)</span>
              <b className="card-value">{formatNumber(pert.sigma, 2)}</b>
              <small>varian total {formatNumber(pert.totalVariance, 2)}</small>
            </div>
            <div className="card crit">
              <span className="card-label">Estimasi selesai proyek</span>
              <b className="card-value small">
                {formatNumber(pert.lower, 1)} — {formatNumber(pert.upper, 1)}
              </b>
              <small>hari kerja (E ± 2σ ≈ 95%)</small>
            </div>
            <div className="card">
              <span className="card-label">Panjang jalur kritis PERT</span>
              <b className="card-value">{pert.chain.length}</b>
              <small>tugas pada jalur</small>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>
                <Icon name="network" size={16} /> Diagram Jaringan PERT
              </h2>
              <span className="muted">Klik node untuk mengubah estimasi O / M / P</span>
            </div>

            {pert.chain.length > 0 && (
              <div className="chain-line flat">
                {pert.chain.map((id, i) => {
                  const t = taskById.get(id);
                  if (!t) return null;
                  return (
                    <span key={id} className="chain-seq">
                      {i > 0 && <span className="arrow">→</span>}
                      <button type="button" className="chain-node crit" onClick={() => onEditTask(id)}>
                        <span className="task-dot" style={{ background: t.color }} />
                        {t.name}
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            <PertDiagram
              nodes={pertNodes}
              edges={schedule.edges}
              schedule={pert.schedule}
              expected={pert.expected}
              variance={pert.variance}
              chain={pert.chain}
              onNodeClick={onEditTask}
            />

            <table className="table">
              <thead>
                <tr>
                  <th>Tugas</th>
                  <th className="num">Optimistis (O)</th>
                  <th className="num">Most Likely (M)</th>
                  <th className="num">Pessimistis (P)</th>
                  <th className="num">E = (O+4M+P)/6</th>
                  <th className="num">Varian σ²</th>
                  <th className="act" />
                </tr>
              </thead>
              <tbody>
                {pertNodes.map((t) => (
                  <tr key={t.id} className={pert.chain.includes(t.id) ? 'row-crit' : undefined}>
                    <td>
                      <span className="cell-task">
                        <span className="task-dot" style={{ background: t.color }} />
                        <strong>{t.name}</strong>
                      </span>
                    </td>
                    <td className="num">{formatNumber(t.pert.optimistic, 1)}</td>
                    <td className="num">{formatNumber(t.pert.mostLikely, 1)}</td>
                    <td className="num">{formatNumber(t.pert.pessimistic, 1)}</td>
                    <td className="num strong">{formatNumber(pert.expected.get(t.id) ?? 0, 2)}</td>
                    <td className="num">{formatNumber(pert.variance.get(t.id) ?? 0, 2)}</td>
                    <td className="act">
                      <button className="icon-btn sm" title="Ubah estimasi" onClick={() => onEditTask(t.id)}>
                        <Icon name="pencil" size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
