import { useRef, useState } from 'react';
import { useProject } from './store/ProjectContext';
import { GanttView, type CreateTaskDefaults } from './components/GanttView';
import { TaskModal } from './components/TaskModal';
import { ResourcesView } from './components/ResourcesView';
import { CalendarView } from './components/CalendarView';
import { AnalysisView } from './components/AnalysisView';
import { Icon, type IconName } from './components/ui';
import { formatNumber } from './lib/format';

type Tab = 'gantt' | 'resources' | 'calendar' | 'analysis';

type ModalState =
  | { mode: 'create'; defaults: CreateTaskDefaults }
  | { mode: 'edit'; taskId: string }
  | null;

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'gantt', label: 'Gantt Chart', icon: 'gantt' },
  { id: 'resources', label: 'Sumber Daya', icon: 'users' },
  { id: 'calendar', label: 'Kalender Proyek', icon: 'calendar' },
  { id: 'analysis', label: 'Analisis', icon: 'target' },
];

export default function App() {
  const { state, schedule, setProjectName, replaceState, resetDemo } = useProject();
  const [tab, setTab] = useState<Tab>('gantt');
  const [modal, setModal] = useState<ModalState>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const openCreate = (defaults: CreateTaskDefaults = {}) => setModal({ mode: 'create', defaults });
  const openEdit = (taskId: string) => setModal({ mode: 'edit', taskId });

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.projectName.replace(/[^\w-]+/g, '_').toLowerCase() || 'proyek'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        replaceState(JSON.parse(String(reader.result)));
        window.alert('Data proyek berhasil diimpor.');
      } catch (e) {
        window.alert(`Gagal mengimpor data: ${(e as Error).message}`);
      }
    };
    reader.readAsText(file);
  };

  const confirmReset = () => {
    if (window.confirm('Kembalikan seluruh data ke proyek contoh? Perubahan Anda akan hilang.')) {
      resetDemo();
      setTab('gantt');
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-logo">
            <Icon name="gantt" size={18} />
          </span>
          <span className="brand-name">GanttPro</span>
        </div>

        <input
          key={state.projectName}
          className="project-name"
          defaultValue={state.projectName}
          title="Nama proyek (klik untuk edit)"
          aria-label="Nama proyek"
          onBlur={(e) => setProjectName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />

        <div className="topbar-stats">
          <span className="stat muted">
            <Icon name="clock" size={13} /> {formatNumber(schedule.projectDuration)} hari kerja
          </span>
          <span className="stat crit">
            <Icon name="target" size={13} /> {formatNumber(schedule.criticalIds.length)} kritis
          </span>
        </div>

        <div className="topbar-actions">
          <button className="icon-btn" title="Ekspor data proyek (JSON)" onClick={exportJson}>
            <Icon name="download" size={15} />
          </button>
          <button className="icon-btn" title="Impor data proyek (JSON)" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={15} />
          </button>
          <button className="icon-btn" title="Reset ke proyek contoh" onClick={confirmReset}>
            <Icon name="reset" size={15} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} size={15} />
            {t.label}
            {t.id === 'analysis' && schedule.criticalIds.length > 0 && (
              <span className="tab-badge crit">{schedule.criticalIds.length}</span>
            )}
            {t.id === 'gantt' && <span className="tab-badge">{state.tasks.length}</span>}
          </button>
        ))}
        <div className="tabs-spacer" />
        <button type="button" className="tab-cta" onClick={() => openCreate({ startDate: schedule.projectStart || undefined })}>
          <Icon name="plus" size={14} /> Tugas
        </button>
      </nav>

      <main className="main">
        {tab === 'gantt' && <GanttView onEditTask={openEdit} onCreateTask={openCreate} />}
        {tab === 'resources' && <ResourcesView />}
        {tab === 'calendar' && <CalendarView />}
        {tab === 'analysis' && <AnalysisView onEditTask={openEdit} onGoToGantt={() => setTab('gantt')} />}
      </main>

      {modal && (
        <TaskModal
          mode={modal.mode}
          taskId={modal.mode === 'edit' ? modal.taskId : undefined}
          defaults={modal.mode === 'create' ? modal.defaults : undefined}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
