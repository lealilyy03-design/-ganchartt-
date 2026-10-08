import { useMemo, useState } from 'react';
import { useProject } from '../store/ProjectContext';
import {
  addDays,
  addMonths,
  daysInMonth,
  formatDateID,
  isValidDate,
  monthLabel,
  todayISO,
} from '../lib/date';
import {
  countWorkingDays,
  isWeekendDay,
  holidayName,
  workingDaysInMonth,
  workingEndDate,
  DAY_LABELS,
  DAY_LABELS_SHORT,
} from '../lib/calendar';
import { formatNumber } from '../lib/format';
import { Btn, Icon } from './ui';

export function CalendarView() {
  const { state, schedule, toggleWeekendDay, addHoliday, deleteHoliday } = useProject();
  const cal = state.calendar;

  const [cursor, setCursor] = useState(() => todayISO().slice(0, 7));
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayNameInput, setHolidayNameInput] = useState('');
  const [error, setError] = useState('');

  const year = Number(cursor.slice(0, 4));
  const month = Number(cursor.slice(5, 7)) - 1;
  const dim = daysInMonth(year, month);
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const today = todayISO();

  const cells = useMemo(() => {
    const out: { date: string; inMonth: boolean }[] = [];
    for (let i = 0; i < firstDow; i++) {
      const d = addDays(`${year}-${String(month + 1).padStart(2, '0')}-01`, i - firstDow);
      out.push({ date: d, inMonth: false });
    }
    for (let d = 1; d <= dim; d++) {
      out.push({ date: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, inMonth: true });
    }
    while (out.length % 7 !== 0) {
      out.push({ date: addDays(out[out.length - 1].date, 1), inMonth: false });
    }
    return out;
  }, [year, month, dim, firstDow]);

  const projectWorkDays = useMemo(() => {
    if (!schedule.projectStart || !schedule.projectEnd) return 0;
    return countWorkingDays(cal, schedule.projectStart, schedule.projectEnd);
  }, [cal, schedule.projectStart, schedule.projectEnd]);

  const submitHoliday = () => {
    setError('');
    if (!isValidDate(holidayDate)) return setError('Pilih tanggal hari libur yang valid.');
    if (holidayNameInput.trim().length === 0) return setError('Nama hari libur wajib diisi.');
    addHoliday(holidayDate, holidayNameInput.trim());
    setHolidayDate('');
    setHolidayNameInput('');
    return undefined;
  };

  const workPerWeek = 7 - cal.weekendDays.length;

  return (
    <div className="view-pad">
      <div className="cal-grid">
        <div className="panel">
          <div className="panel-head">
            <h2>
              <Icon name="calendar" size={16} /> Pengaturan Akhir Pekan
            </h2>
          </div>
          <p className="hint-line">
            Hari yang ditandai menjadi akhir pekan dan <b>tidak dihitung</b> dalam durasi tugas. Saat ini:{' '}
            <b>{workPerWeek} hari kerja per minggu</b>.
          </p>
          <div className="weekend-row">
            {DAY_LABELS.map((label, i) => {
              const on = cal.weekendDays.includes(i);
              return (
                <button
                  key={label}
                  type="button"
                  className={`day-toggle${on ? ' on' : ''}`}
                  onClick={() => toggleWeekendDay(i)}
                  title={on ? `${label} adalah akhir pekan` : `${label} adalah hari kerja`}
                >
                  <span>{DAY_LABELS_SHORT[i]}</span>
                  <small>{on ? 'Libur' : 'Kerja'}</small>
                </button>
              );
            })}
          </div>

          <div className="panel-sub">
            <h3>
              <Icon name="flag" size={14} /> Hari Libur Khusus
            </h3>
            <div className="holiday-form">
              <input
                className="input"
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
              />
              <input
                className="input"
                placeholder="Nama hari libur"
                value={holidayNameInput}
                onChange={(e) => setHolidayNameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitHoliday()}
              />
              <Btn variant="primary" icon="plus" onClick={submitHoliday}>
                Tambah
              </Btn>
            </div>
            {error && (
              <div className="banner error inline">
                <Icon name="alert" size={15} />
                <div>{error}</div>
              </div>
            )}

            {cal.holidays.length === 0 ? (
              <p className="hint-line">Belum ada hari libur khusus.</p>
            ) : (
              <ul className="holiday-list">
                {cal.holidays.map((h) => (
                  <li key={h.id}>
                    <span className="hol-dot" />
                    <div>
                      <strong>{h.name}</strong>
                      <small>{formatDateID(h.date, 'long')}</small>
                    </div>
                    <button className="icon-btn sm danger" title="Hapus hari libur" onClick={() => deleteHoliday(h.id)}>
                      <Icon name="trash" size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="cal-stats">
            <div className="mini-stat">
              <span> hari kerja proyek</span>
              <b>{formatNumber(projectWorkDays)}</b>
              <small>
                {schedule.projectStart ? `${formatDateID(schedule.projectStart)} → ${formatDateID(schedule.projectEnd)}` : 'belum ada tugas'}
              </small>
            </div>
            <div className="mini-stat">
              <span>Hari libur terdaftar</span>
              <b>{cal.holidays.length}</b>
              <small>berlaku untuk seluruh penjadwalan</small>
            </div>
            <div className="mini-stat">
              <span>Hari kerja bulan ini</span>
              <b>{workingDaysInMonth(cal, year, month)}</b>
              <small>{monthLabel(year, month)}</small>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>
              <Icon name="calendar" size={16} /> Pratinjau Kalender
            </h2>
            <div className="gap8">
              <button className="icon-btn" title="Bulan sebelumnya" onClick={() => setCursor(addMonths(`${cursor}-01`, -1).slice(0, 7))}>
                <Icon name="chevron-right" size={14} className="flip" />
              </button>
              <b className="cal-title">{monthLabel(year, month)}</b>
              <button className="icon-btn" title="Bulan berikutnya" onClick={() => setCursor(addMonths(`${cursor}-01`, 1).slice(0, 7))}>
                <Icon name="chevron-right" size={14} />
              </button>
            </div>
          </div>

          <div className="cal-month">
            <div className="cal-dow">
              {DAY_LABELS_SHORT.map((d, i) => (
                <span key={d} className={cal.weekendDays.includes(i) ? 'we' : ''}>
                  {d}
                </span>
              ))}
            </div>
            <div className="cal-cells">
              {cells.map((c) => {
                const holiday = holidayName(cal, c.date);
                const weekend = isWeekendDay(cal, c.date);
                const cls = [
                  'cal-cell',
                  c.inMonth ? '' : 'out',
                  weekend ? 'we' : '',
                  holiday ? 'hol' : '',
                  c.date === today ? 'today' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <div key={c.date} className={cls} title={holiday ? `${c.date} — ${holiday}` : c.date}>
                    <span>{Number(c.date.slice(8))}</span>
                    {holiday && <small>{holiday}</small>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="legend-row">
            <span className="legend-item"><i className="sw we" /> Akhir pekan ({cal.weekendDays.map((d) => DAY_LABELS_SHORT[d]).join(', ') || '—'})</span>
            <span className="legend-item"><i className="sw hol" /> Hari libur</span>
            <span className="legend-item"><i className="sw prog" /> Hari ini</span>
          </div>
        </div>
      </div>

      <div className="panel note-panel">
        <div className="panel-head">
          <h2>
            <Icon name="clock" size={16} /> Cara Kerja Kalender
          </h2>
        </div>
        <p className="hint-line">
          Durasi tugas selalu dinyatakan dalam <b>hari kerja</b>. Akhir pekan dan hari libur khusus dilewati
          otomatis saat menghitung tanggal selesai, jeda predecessor (lag), serta jalur kritis.
        </p>
        <div className="field">
          <span className="field-label">Contoh perhitungan</span>
          <div className="calc-example">
            Jika tugas mulai <b>{formatDateID(todayISO())}</b> dengan durasi <b>5 hari kerja</b>, maka tanggal
            selesai = <b>{formatDateID(workingEndDate(cal, todayISO(), 5))}</b>.
          </div>
        </div>
      </div>
    </div>
  );
}
