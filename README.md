# GanttPro — Manajemen Proyek Berbasis Gantt Chart

Aplikasi manajemen proyek lengkap dengan **Gantt Chart interaktif**, penjadwalan **CPM (Critical Path Method)**, analisis **PERT**, manajemen sumber daya, dan kalender kerja.
Dibangun dengan **React + Vite + TypeScript**; seluruh data disimpan di **LocalStorage** browser — tanpa server dan tanpa database.

## Fitur

### 1. Manajemen Tugas
- Tambah / edit / hapus tugas dan **sub-tugas** (struktur parent-child, bisa dilipat)
- **Durasi dalam hari kerja**, tanggal mulai, tanggal selesai dihitung otomatis
- **Prioritas** (Rendah → Mendesak) dan **warna indikator** bebas pilih (10 swatch + color picker)
- Progres penyelesaian per tugas (0–100%)

### 2. Predecessor & Tampilan Timeline
- Hubungan antar tugas: **Finish-to-Start (FS)** dan **Start-to-Start (SS)**
- **Jeda hari kerja (lag)** per relasi, mendukung multiple predecessor
- Grafik Gantt: sumbu hari/minggu/bulan, strip akhir pekan & hari libur, penanda "Hari Ini"
- **Panah ketergantungan** antar bar (merah untuk jalur kritis)
- **Seret bar** untuk memindah jadwal, **tarik tepi bar** untuk mengubah durasi (snap ke hari kerja)
- Tugas berpredecessor dijadwalkan **otomatis**; tugas induk mengikuti rentang sub-tugas

### 3. Sumber Daya
- Pendaftaran anggota tim: **nama, email, peran, gaji/bulan**
- **Alokasi anggota ke tugas** (lewat form tugas atau panel alokasi)
- Beban kerja per anggota (jumlah tugas & total hari kerja) dan estimasi biaya proyek (gaji ÷ 22 hari kerja)

### 4. Kalender Proyek
- Pengaturan **akhir pekan** fleksibel (aktifkan/nonaktifkan tiap hari)
- **Hari libur khusus** (tanggal + nama), berlaku untuk seluruh perhitungan penjadwalan
- Pratinjau bulan dengan penanda akhir pekan, hari libur, dan hari ini

### 5. Analisis Proyek
- **Jalur Kritis (CPM)**: pass maju & pass mundur → ES/EF/LS/LF, total float, daftar tugas float = 0, plus deteksi "hampir kritis" (float ≤ 2)
- **Diagram PERT**: jaringan bertahap, node berisi estimasi **O / M / P**, durasi ekspektasi **E = (O + 4M + P)/6** dan varian **σ² = ((P − O)/6)²**, jalur kritis disorot
- Ringkasan durasi ekspektasi proyek, σ, dan rentang selesai **E ± 2σ (≈95%)**

## Menjalankan

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # typecheck + build produksi
npm test           # 16 unit test logika penjadwalan
```

Saat dibuka pertama kali, aplikasi dimuat dengan **proyek contoh** ("Implementasi Sistem Informasi Kepegawaian", 21 tugas, 4 anggota). Gunakan tombol **⟳** di header untuk mengembalikan data contoh, serta **⬇ / ⬆** untuk ekspor/impor seluruh data proyek dalam format JSON.

## Struktur Proyek

```
src/
├── types.ts                  # Model data (Task, Member, Calendar, Prioritas)
├── lib/
│   ├── date.ts               # Utilitas tanggal (format Indonesia)
│   ├── calendar.ts           # Hari kerja: weekend, holiday, offset hari kerja
│   ├── schedule.ts           # Mesin CPM: forward/backward pass + jalur kritis
│   ├── pert.ts               # Ekspektasi/varian PERT + analisis rantai kritis
│   ├── seed.ts               # Data proyek contoh
│   └── engine.test.ts        # 16 unit test
├── store/ProjectContext.tsx  # State global + persistensi LocalStorage
└── components/
    ├── GanttView.tsx         # Tabel tugas + chart + panah dependensi + drag
    ├── TaskModal.tsx         # Form CRUD tugas, predecessor/resource/PERT
    ├── ResourcesView.tsx     # Anggota tim + alokasi
    ├── CalendarView.tsx      # Akhir pekan + hari libur
    ├── AnalysisView.tsx      # Jalur kritis + tabel PERT
    └── PertDiagram.tsx       # Diagram jaringan PERT (SVG)
```

## Rumus yang Dipakai

| Konsep | Rumus |
|---|---|
| Tanggal selesai | `mulai + (durasi − 1) hari kerja` (lewati weekend & libur) |
| FS + lag | `ES_succ ≥ EF_pred + 1 + lag` (hari kerja) |
| SS + lag | `ES_succ ≥ ES_pred + lag` |
| Total float | `LS − ES` — tugas **kritis** bila float = 0 |
| Durasi ekspektasi PERT | `E = (O + 4M + P) / 6` |
| Varian PERT | `σ² = ((P − O) / 6)²`, deviasi proyek `σ = √Σσ²` pada jalur kritis |

## Lisensi

MIT
