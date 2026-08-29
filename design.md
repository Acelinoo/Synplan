# Synplan Design System & UI Architecture Guidelines

> **Version:** 1.0.0  
> **Status:** Active & Approved  
> **Framework:** Next.js 16 (App Router) + Tailwind CSS + shadcn/ui Primitives + Framer Motion  
> **Design Philosophy:** Neutral + Indigo, Clean, Professional, High-Density, Data-Focused & Anti-Slop  

---

## 1. Brand Identity & Design Direction

**Synplan** adalah platform *Project Management & Team Collaboration SaaS* berbasis alur kerja **Plan → Organize → Execute → Track → Analyze**.

Karakter visual Synplan mengusung perpaduan warna **Neutral** sebagai pondasi antarmuka yang tenang dan terfokus pada data, dipadukan dengan aksen **Indigo** sebagai identitas brand dan pemandu aksi utama (*Primary Action*).

### 🎯 Prinsip Utama
1. **Professional & Calm:** Antarmuka tenang, bersih, dan bebas dari distraksi visual artifisial.
2. **Data-Focused Hierarchy:** Tipografi, warna, dan elevation dioptimalkan agar data proyek, status task, serta metrik performa langsung terbaca dalam hitungan detik.
3. **Enterprise-Grade Recognition:** Umpan balik keberhasilan (task completion & milestone) disampaikan secara elegan dan terukur tanpa animasi murahan (*no slop, no cheesy confetti*).
4. **Strict Component Standardization:** Menggunakan fondasi komponen teruji `shadcn/ui` (`@/components/ui/*`).

---

## 2. Color System & Design Tokens

### 2.1 Dark Mode Palette (Default Product Theme)
Dark mode adalah mode utama untuk platform Synplan guna kenyamanan mata pengguna dalam durasi kerja panjang:

| Token Name | CSS Variable | Hex Code | Deskripsi & Peruntukan |
| :--- | :--- | :--- | :--- |
| **Background Base** | `--color-bg-base` | `#09090B` | Latar belakang canvas utama aplikasi |
| **Sidebar Background** | `--color-sidebar-bg` | `#0E0F12` | Sidebar background (satu tingkat lebih gelap dari base) |
| **Surface Level 1** | `--color-surface-1` | `#111113` | Area konten, table container, topbar |
| **Surface Level 2 / Card** | `--color-bg-elevated` | `#18181B` | Kartu metrik, kanban cards, dialog, slide-overs |
| **Border Default** | `--color-border-default` | `#27272A` | Border kontainer, pemisah section, outline kartu |
| **Border Subtle / Hover** | `--color-border-subtle` | `#222634` | Border halus sekunder & status hover interaktif |
| **Primary Accent** | `--color-accent` | `#6366F1` | Brand Indigo, tombol aksi utama, active indicators |
| **Accent Hover** | `--color-accent-hover` | `#4F46E5` | Hover state tombol primary |
| **Accent Muted Bg** | `--color-accent-muted-bg` | `rgba(99, 102, 241, 0.12)` | Badge aktif, pill filter terpilih, row selection |
| **Text Primary** | `--color-text-primary` | `#FAFAFA` | Headline, judul task, teks kontras tinggi |
| **Text Secondary** | `--color-text-secondary` | `#A1A1AA` | Label, metadata, deskripsi penjelas |
| **Text Muted / Tertiary** | `--color-text-muted` | `#71717A` | Placeholder, breadcrumb non-aktif, icon idle |

---

### 2.2 Light Mode Palette

| Token Name | CSS Variable | Hex Code | Deskripsi & Peruntukan |
| :--- | :--- | :--- | :--- |
| **Background Base** | `--color-bg-base` | `#FAFAFA` | Canvas utama aplikasi |
| **Sidebar Background** | `--color-sidebar-bg` | `#F5F5F4` | Sidebar background light mode |
| **Surface / Card** | `--color-surface-1` | `#FFFFFF` | Konten, kartu putih bersih |
| **Border Default** | `--color-border-default` | `#E4E4E7` | Border outline kartu & input field |
| **Border Subtle** | `--color-border-subtle` | `#F4F4F5` | Pemisah antar baris tabel |
| **Primary Accent** | `--color-accent` | `#4F46E5` | Brand Indigo untuk light mode (WCAG AA compliant) |
| **Accent Hover** | `--color-accent-hover` | `#4338CA` | Hover state primary |
| **Accent Muted Bg** | `--color-accent-muted-bg` | `rgba(79, 70, 229, 0.08)` | Badge & background selected item |
| **Text Primary** | `--color-text-primary` | `#18181B` | Headline, judul task |
| **Text Secondary** | `--color-text-secondary` | `#52525B` | Deskripsi, keterangan form |
| **Text Muted / Tertiary** | `--color-text-muted` | `#71717A` | Placeholder, label sekunder |

---

### 2.3 Semantic Workflow & Priority Colors

Warna semantik digunakan untuk mengomunikasikan status alur kerja dan tingkat urgensi secara konsisten:

| Kategori | Status / Priority | Hex Code | Background Tint (Dark) | Background Tint (Light) |
| :--- | :--- | :--- | :--- | :--- |
| **Status** | **Todo** | `#94A3B8` (Slate) | `rgba(148, 163, 184, 0.12)` | `rgba(148, 163, 184, 0.15)` |
| **Status** | **In Progress** | `#3B82F6` (Blue) | `rgba(59, 130, 246, 0.12)` | `rgba(59, 130, 246, 0.12)` |
| **Status** | **In Review** | `#F59E0B` (Amber) | `rgba(245, 158, 11, 0.12)` | `rgba(245, 158, 11, 0.12)` |
| **Status** | **Done** | `#10B981` (Emerald) | `rgba(16, 185, 129, 0.12)` | `rgba(16, 185, 129, 0.12)` |
| **Status** | **Blocked** | `#EF4444` (Red) | `rgba(239, 68, 68, 0.12)` | `rgba(239, 68, 68, 0.12)` |
| **Priority** | **Low** | `#64748B` (Slate) | `rgba(100, 116, 139, 0.1)` | `rgba(100, 116, 139, 0.1)` |
| **Priority** | **Medium** | `#3B82F6` (Blue) | `rgba(59, 130, 246, 0.1)` | `rgba(59, 130, 246, 0.1)` |
| **Priority** | **High** | `#F59E0B` (Amber) | `rgba(245, 158, 11, 0.1)` | `rgba(245, 158, 11, 0.1)` |
| **Priority** | **Urgent** | `#EF4444` (Red) | `rgba(239, 68, 68, 0.15)` | `rgba(239, 68, 68, 0.15)` |

> ⚠️ **Aturan Semantik:** Jangan pernah menampilkan status hanya dengan lingkaran warna polos tanpa teks atau icon deskriptif (A11y & Clarity).

---

## 3. Typography & Spacing Scales

### 3.1 Font Family
- **Sans-Serif (Primary Body & UI):** `Inter`, `Geist Sans`, `-apple-system`, `BlinkMacSystemFont`, `sans-serif`
- **Monospace (Data, Numbers, KPI, Shortcuts):** `JetBrains Mono`, `Geist Mono`, `monospace`

### 3.2 Type Scale
```css
--text-xs: 12px;   /* line-height: 16px; label, badge, timestamp */
--text-sm: 14px;   /* line-height: 20px; table cells, form labels, body text */
--text-base: 16px; /* line-height: 24px; standard paragraphs, card headers */
--text-lg: 18px;   /* line-height: 28px; section headers, modal titles */
--text-xl: 20px;   /* line-height: 28px; major sub-headlines */
--text-2xl: 24px;  /* line-height: 32px; page titles (h1) */
--text-3xl: 30px;  /* line-height: 36px; KPI numbers (font-mono) */
```

### 3.3 Density Spacing Scale (App Interior)
```css
--space-1: 4px;   --space-2: 8px;   --space-3: 12px;
--space-4: 16px;  --space-5: 20px;  --space-6: 24px;  --space-8: 32px;
```
- **Form & Input Padding:** `--space-2` x `--space-3` (8px x 12px)
- **Table Row Height:** `44px` - `48px`
- **Card Padding:** `--space-4` (16px) hingga `--space-6` (24px)
- **Page Container Gutter:** `--space-6` (24px desktop) / `--space-4` (16px mobile)

### 3.4 Radius Tokens
```css
--radius-sm: 4px;    /* badges, small tags, sub-elements */
--radius-md: 6px;    /* inputs, buttons, dropdown items */
--radius-card: 10px;  /* kanban cards, metric cards */
--radius-panel: 14px; /* slide-overs, command palette, dialog modals */
--radius-full: 9999px;/* user avatars, pill badges only */
```

---

## 4. Curated React Bits UI Guidelines (`reactbits.dev`)

Untuk memberikan sentuhan estetika premium tanpa menghasilkan *AI-slop*, komponen visual interaktif dibatasi pada pustaka React Bits terkurasi berikut:

### 1. Spotlight Cards (`SpotlightCard`)
- **Implementasi:** Digunakan pada Kartu Ringkasan Proyek di Dashboard, Kartu Metrik KPI, dan Kartu Task Kanban saat di-hover.
- **Visual:** Efek gradien sorot radial halus (`rgba(99, 102, 241, 0.15)`) yang mengikuti posisi kursor dengan radius `300px` dan blur natural.

### 2. Animated Background Grid (`GridDistortion` / `SubtleAnimatedGrid`)
- **Implementasi:** Background canvas subtle pada dashboard overview dan hero landing page.
- **Konfigurasi:** Warna garis `#27272A` (opacity 0.25 pada dark mode, 0.4 pada light mode), gerakan pergeseran sangat lambat (durasi > 30s) agar tidak mengalihkan fokus kerja.

### 3. Magnet Buttons (`MagnetButton`)
- **Implementasi:** Tombol *Primary Action* utama (misal: `+ New Task`, `Create Project`, `Invite Member`).
- **Interaksi:** Menarik tombol sedikit ke arah kursor dalam radius 30px dengan pegas halus (*spring physics damping 15*).

### 4. Decrypted Text / CountUp (`DecryptedText` / `CountUp`)
- **Implementasi:** Efek pemuatan angka total task, presentase penyelesaian proyek (misal: `87%`), dan judul heading halaman dashboard saat awal dibuka.

### 5. Micro-Feedback Alert System
- **Implementasi:** Transisi visual saat task bergeser ke status `DONE` (border glow emerald halus selama 600ms) dan banner apresiasi non-intrusif saat proyek mencapai 100% penyelesaian.

---

## 5. Anti-Slop & UI Governance Directives

> ⛔ **ATURAN MUTLAK KUALITAS DESAIN (ZERO-SLOP POLICY):**

1. **Mandatory Shadcn/UI:** Semua komponen UI wajib diturunkan dari primitif `shadcn/ui` (`@/components/ui/*`). Dilarang membuat tag raw HTML `<button>`, `<input>`, `<select>` polos tanpa standardisasi.
2. **Dilarang Pure Black & Navy:**
   - ❌ DILARANG: `#000000` (Pure Black) atau `#0F172A` (Tailwind Navy generic).
   - ✅ WAJIB: Gunakan Obsidian Dark `#09090B` dan `#111113`.
3. **Dilarang Gradient Text pada Headline:**
   - ❌ DILARANG: `bg-clip-text text-transparent bg-gradient-to-r` pada teks judul h1/h2.
   - ✅ WAJIB: Gunakan warna solid kontras tinggi `#FAFAFA` (Dark) atau `#18181B` (Light).
4. **Dilarang Efek Visual Murahan:**
   - ❌ DILARANG: Kursor custom AI berkedip yang lambat, partikel animasi melayang di seluruh layar, efek teks glitch/cyberpunk berlebihan, dan ledakan confetti heboh.
5. **Dilarang Deeply Nested Cards:**
   - ❌ DILARANG: Kartu di dalam kartu lebih dari 2 tingkat kedalaman (*nested card syndrome*).
6. **Dilarang Arbitrary Rounded-2xl:**
   - ❌ DILARANG: Menggunakan `rounded-2xl` / `rounded-3xl` pada seluruh elemen app UI. Gunakan scale radius terstruktur di Seksi 3.4.
7. **Format Mata Uang Rupiah (IDR):**
   - Bilangan besar: `Rp X,XX M` (Miliar), `Rp X,XX Jt` (Juta), `Rp XXX Rb` (Ribu).

---

## 6. App Shell & Navigation Anatomy

```text
┌───────────────────────────┬────────────────────────────────────────────────────────┐
│ [Logo] Synplan            │ [Breadcrumb] Workspace > Projects > Website Redesign  │
│ [Workspace Selector ▾]    │                                 [⌘K] [🔔] [Avatar ▾]   │
├───────────────────────────┼────────────────────────────────────────────────────────┤
│ 📊 Dashboard              │                                                        │
│ 📁 Projects               │   PAGE HEADER (Title + Primary Action Button)          │
│ 📋 Tasks (Kanban / List)  ├────────────────────────────────────────────────────────┤
│ 📅 Calendar               │                                                        │
│ 👥 Team & Workload        │   MAIN CONTENT AREA (Scrollable, max-width: 1440px)    │
│ 📈 Reports & Analytics    │   - KPI Grid (Spotlight Cards)                         │
│                           │   - Kanban Board Columns (Drag & Drop)                 │
│ ⚙️ Workspace Settings     │   - Slide-over Details Drawer                          │
│                           │                                                        │
└───────────────────────────┴────────────────────────────────────────────────────────┘
```

- **Sidebar:** Lebar `260px` saat expanded, `64px` saat collapsed (icon-rail dengan tooltip Radix).
- **Topbar:** Tinggi tetap `56px`, sticky top, backdrop blur `8px`, border bottom `1px solid var(--color-border-default)`.
- **Command Palette (`⌘K`):** Modal pencarian cepat terpusat (`max-width: 560px`) dengan keyboard navigation instan.
- **Detail Slide-over:** Drawer samping kanan (`width: 480px`, max `92vw`) untuk melihat dan mengedit detail task secara inline tanpa meninggalkan papan.

---

## 7. Component State Matrix & A11y

| Komponen | Default | Hover | Active / Focus-Visible | Disabled | Loading / Skeleton |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Primary Button** | Indigo `#6366F1` | Indigo `#4F46E5`, `-1px` translateY | Ring 2px `#818CF8`, offset 2px | Opacity 40%, cursor not-allowed | Spinner 16px menggantikan ikon |
| **Secondary Button** | Surface `#18181B`, border `#27272A` | Background `#222634` | Ring 2px `#6366F1` | Opacity 40% | Spinner dengan label tersembunyi |
| **Input / Search** | Surface `#111113`, border `#27272A` | Border `#3F3F46` | Border `#6366F1`, Ring 1px `#6366F1` | Opacity 50%, bg sunken | Skeleton bar |
| **Kanban Card** | Surface `#18181B`, border `#27272A` | Border `#3F3F46`, shadow-md | Border `#6366F1`, scale `1.01` saat drag | Opacity 60% | Skeleton card (120px) |
| **Nav Item** | Text `#A1A1AA`, transparent bg | Text `#FAFAFA`, bg `rgba(255,255,255,0.04)` | Text `#FAFAFA`, bg accent-muted, left bar | N/A | Skeleton line |

### Kontras & Aksesibilitas (WCAG 2.1 AA)
- Rasio kontras teks utama (`#FAFAFA` di `#09090B`): **18.2:1** (Lolos AAA).
- Rasio kontras teks sekunder (`#A1A1AA` di `#09090B`): **7.8:1** (Lolos AAA).
- Rasio kontras warna primary Indigo (`#6366F1` di `#09090B`): **5.4:1** (Lolos AA).
- Semua elemen interaktif memiliki `focus-visible` ring outline untuk navigasi keyboard.

---

## 8. Kesimpulan & Status Otoritas

File `design.md` ini merupakan **Single Source of Truth (SSOT)** arsitektur visual untuk platform **Synplan**. Setiap pembuatan komponen frontend, styling Tailwind, dan tata letak halaman pada tahapan selanjutnya **WAJIB** tunduk pada spesifikasi yang tertulis di dalam dokumen ini.
