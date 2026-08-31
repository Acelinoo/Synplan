# SYNPLAN — SECOND OPINION REMEDIATION 1 VERIFICATION REPORT

**Project:** Synplan — Production SaaS Autonomous Project Management System  
**Lead Engineer / Architect:** Marchelino Kurniawan (Acelino)  
**Verification Auditor:** Independent Senior Staff / Security & Production QA Audit  
**Date:** September 1, 2026  
**Scope:** Adversarial code-level & behavioral verification of 7 Remediation 1 fixes (SEC-01, UX-01, FE-01, RT-01, SEC-02, DATA-01, FE-02) and re-evaluation of deferred P3 items.  
**Final Verdict:** `🟢 VERIFIED`

---

## 1. Executive Summary

Audit verifikasi independen kedua (**Second Verification Audit**) telah dilakukan secara *adversarial* terhadap seluruh perubahan kode yang dihasilkan selama **Remediation 1**.

Verifikasi ini tidak hanya mengandalkan kelulusan automated tests, melainkan melakukan *code tracing*, analisis alur otorisasi, pengujian skenario serangan konseptual, pemeriksaan *race conditions*, serta pengecekan *side-effects* pada state machine Zustand dan middleware.

### Ringkasan Hasil Verifikasi
- **7 Target Remediation Fixes:** Seluruhnya **100% TERVERIFIKASI (`VERIFIED FIX`)** menyelesaikan akar masalah (*root cause*) tanpa membuka celah keamanan baru.
- **Regresi Material (P0/P1/P2):** **0 DITEMUKAN**.
- **Kualitas Test Suite (`30/30`):** 19 Strong Tests (63.3%), 11 Medium Tests (36.7%), 0 Weak Tests (0%).
- **Integritas Build & Kompilasi:** TypeScript 0 errors, ESLint 0 warnings/errors, Next.js production build 40/40 static & dynamic routes lulus kompilasi.

---

## 2. Verification Matrix

| ID | Original Finding | Target File | Verification Result | Status | Evidence & Code Reference |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Phase Reorder BOLA / Authorization Override | `src/app/api/phases/reorder/route.ts` | Alur otorisasi kini mengambil `project.workspaceId` otoritatif dari database. Request dengan `workspaceId` bertentangan langsung di-*reject* `400 Bad Request`. Phase IDs diverifikasi eksklusif terhadap `projectId`. | **VERIFIED FIX** | [`reorder/route.ts:L23-L69`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/app/api/phases/reorder/route.ts#L23-L69): Celah BOLA ditutup permanen; spoofing ditolak sebelum transaksi. |
| **UX-01** | Kanban 50-Task Truncation | `src/app/tasks/page.tsx` | Ditambahkan pagination bertahap dengan kontrol *Load More*, deduplikasi ID berbasis `Set`, tracking total task, dan handling realtime event tanpa duplikasi kartu di Zustand store. | **VERIFIED FIX** | [`tasks/page.tsx:L216-L270`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/app/tasks/page.tsx#L216-L270): Mendukung pemuatan dataset >50 task secara mulus dengan ID deduplication. |
| **FE-01** | Optimistic UI Without Rollback on Failure | `src/components/kanban/KanbanCard.tsx`<br>`TaskDetailDrawer.tsx` | State awal (`prevStatus`, `prevCompletedAt`, `prevSubtasks`) disimpan sebelum mutasi optimistik. Pada kegagalan API atau throw exception, state di-*rollback* seketika dan toast `danger` dimunculkan. | **VERIFIED FIX** | [`KanbanCard.tsx:L53-L103`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/components/kanban/KanbanCard.tsx#L53-L103): Rollback mengembalikan kartu ke kolom asal dan mengembalikan subtask checklist. |
| **RT-01** | Realtime Disconnect / Reconnect Data Stale | `src/lib/realtime.ts`<br>`tasks/page.tsx`<br>`projects/page.tsx`<br>`team/page.tsx`<br>`TopHeader.tsx` | Saat WebSocket bertransisi `RECONNECTING -> CONNECTED`, listener `onReconnect` memicu `apiClient.invalidate()` dan *fresh server refetch* pada semua tampilan aktif. Listener memiliki fungsi cleanup tanpa memory leak. | **VERIFIED FIX** | [`realtime.ts:L158-L167`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/lib/realtime.ts#L158-L167) & [`tasks/page.tsx:L293-L299`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/app/tasks/page.tsx#L293-L299): Data offline di-refresh seketika saat reconnect. |
| **SEC-02** | Expired Session Infinite Redirect Trap | `src/middleware.ts`<br>`TopHeader.tsx`<br>`src/app/login/page.tsx` | Middleware memberikan *bypass* untuk URL login dengan parameter `error`, `expired=true`, atau `force=true`. Client secara proaktif menghapus cookie basi dan `localStorage` saat sesi database tidak valid. | **VERIFIED FIX** | [`middleware.ts:L77-L84`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/middleware.ts#L77-L84) & [`TopHeader.tsx:L95-L103`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/components/layout/TopHeader.tsx#L95-L103): Redirect loop tereliminasi 100%. |
| **DATA-01** | Non-Member Assignee Silently Dropped to Null | `src/app/api/tasks/route.ts`<br>`tasks/[id]/route.ts` | Assignee non-member kini ditolak secara eksplisit dengan `400 Bad Request` dan pesan error deskriptif, bukan lagi di-*drop* diam-diam. Assignee `null` tetap diperbolehkan untuk tugas *unassigned*. | **VERIFIED FIX** | [`tasks/route.ts:L217-L238`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/app/api/tasks/route.ts#L217-L238): Integritas relasi penugasan anggota terjamin di level database. |
| **FE-02** | Workspace Transition Stale State Bleeding | `src/store/useWorkspaceStore.ts`<br>`useTaskStore.ts`<br>Pages | Saat `setActiveWorkspace` dipanggil, `tasks`, `projects`, dan `members` langsung di-*reset* ke `[]`. Response API asinkron dari workspace lama dibuang jika workspace telah berganti saat request berjalan. | **VERIFIED FIX** | [`useWorkspaceStore.ts:L82-L91`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/store/useWorkspaceStore.ts#L82-L91) & [`tasks/page.tsx:L233-L235`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/app/tasks/page.tsx#L233-L235): Kebocoran data antar-tenant di frontend tereliminasi. |

---

## 3. Adversarial Deep-Dive per Remediation Item

### 3.1. SEC-01 — Phase Reorder BOLA & Authorization
- **Traced Flow:**
  $$\text{Client Request} \to \text{ReorderPhasesSchema} \to \text{DB Project Lookup} \to \text{Workspace Spoof Guard} \to \text{requireAuthGuard} \to \text{Phase IDs Ownership Check} \to \text{Transaction}$$
- **Skenario Penyerangan 1 (Cross-Workspace Project Reordering):**
  Attacker di Workspace A mengirim `projectId: "proj_in_ws_b"`. Server membaca `project.workspaceId = "ws_b"`. Auth guard `requireAuthGuard(req, "phases.update", "ws_b")` mendeteksi bahwa penyerang bukan anggota Workspace B $\to$ **DITOLAK (403 Forbidden)** pada baris 46.
- **Skenario Penyerangan 2 (Payload WorkspaceId Spoofing):**
  Attacker mengirim `projectId: "proj_in_ws_b"` dan `workspaceId: "ws_a"`. Server membandingkan `workspaceId !== project.workspaceId` $\to$ **DITOLAK (400 Bad Request)** pada baris 33.
- **Skenario Penyerangan 3 (Foreign Phase Injection):**
  Attacker mengirim `projectId: "proj_a1"`, tetapi menyisipkan `id: "phase_from_proj_a2"` dalam `phaseOrders`. Query `prisma.phase.findMany({ where: { id: { in: phaseIds }, projectId: "proj_a1" } })` hanya mengembalikan 1 phase $\to$ `existingPhases.length !== phaseIds.length` $\to$ **DITOLAK (400 Bad Request)** pada baris 61.
- **Skenario Penyerangan 4 (Duplicate Phase IDs):**
  Attacker mengirim `phaseOrders` berisi ID duplikat `["phase_1", "phase_1"]`. `findMany` dengan `in` mengembalikan 1 baris unik, sehingga panjangnya tidak cocok dengan `phaseIds.length` (2) $\to$ **DITOLAK (400 Bad Request)**.

---

### 3.2. UX-01 — Kanban Pagination & Data Lifecycle
- **Traced Lifecycle:**
  1. *Initial Load:* Mengambil halaman 1 (50 tasks). Menghitung `hasMore` dan `totalTasksCount`.
  2. *Load More:* Mengambil halaman 2. Memfilter task baru terhadap `existingIds` via `Set` lookup $O(1)$. Menggabungkan array dan mengupdate `page = 2`.
  3. *Realtime Mutations:* Saat `TASK_CREATED` tiba, `useTaskStore.addTask` memeriksa keberadaan ID duplikat sebelum melakukan prepend ke store.
  4. *Drag & Drop:* Mengubah status lokal melalui `moveTaskStatus` yang memodifikasi elemen dalam store berdasarkan `taskId` terlepas dari halaman berapa task tersebut dimuat.
- **Nuansa Perilaku (Expected Design):**
  Filter pencarian di dalam halaman Kanban melakukan pencarian pada seluruh task yang saat ini telah dimuat di memori klien. Untuk pencarian global di seluruh workspace lintas halaman, pengguna dapat menggunakan search bar global di Top Header (`/api/search`).

---

### 3.3. FE-01 — Optimistic Rollback State Machine
- **Traced Flow:**
  - Status awal: `task.status = "todo"`, `task.completedAt = undefined`.
  - User memindahkan task ke `"in_progress"` $\to$ `moveTaskStatus(task.id, "in_progress")` berjalan seketika di frontend.
  - Skenario API Rejection (HTTP 400/403/500 atau timeout):
    - `res.success` bernilai `false` atau masuk blok `catch (err)`.
    - Eksekusi `moveTaskStatus(task.id, prevStatus, prevCompletedAt)` mengembalikan kartu ke kolom `"todo"`, menghapus `completedAt`, dan memperbarui timestamp.
    - Toast visual `variant: "danger"` memberitahukan kegagalan kepada pengguna.
  - Skenario Subtask Checklist:
    - `prevSubtasks` disimpan sebelum mutasi.
    - Jika `apiClient.updateTask` gagal, `updateTask(task.id, { subtasks: prevSubtasks })` memulihkan checklist semula.

---

### 3.4. RT-01 — Realtime Reconnection & Resync
- **Traced Scenario (Offline State Recovery):**
  - Klien A memegang `Task 1 = TODO`. Koneksi WebSocket putus $\to$ State beralih ke `RECONNECTING`.
  - Pengguna B (di tab/komputer lain) mengubah `Task 1 = DONE`. Database terupdate.
  - Koneksi Klien A pulih $\to$ `realtimeClient.setState("CONNECTED")`.
  - Karena `wasReconnecting === true`, seluruh `reconnectListeners` dieksekusi:
    - Di `tasks/page.tsx`: `apiClient.invalidate("/api/tasks")` $\to$ `loadTasks(1, false)` mengambil data segar dari API $\to$ `Task 1` otomatis berpindah ke kolom `DONE`.
    - Di `projects/page.tsx`: `loadProjects()` dijalankan.
    - Di `team/page.tsx`: `loadMembers()` dijalankan.
    - Di `TopHeader.tsx`: `loadNotifs()` dijalankan.
  - Listener pendaftaran menggunakan `Set` dan di-*cleanup* saat *unmount*, mencegah kebocoran memori.

---

### 3.5. SEC-02 — Expired Session Handling
- **Traced Scenario:**
  - Cookie `synplan_session_token` ada, namun record di PostgreSQL telah kedaluwarsa.
  - Klien memuat aplikasi $\to$ `TopHeader` memanggil `/api/auth/session` $\to$ API mengembalikan `authenticated: false`.
  - `TopHeader` mengeksekusi:
    ```ts
    document.cookie = "synplan_session_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    localStorage.removeItem("synplan_active_ws");
    router.push("/login?error=session_expired");
    ```
  - `middleware.ts` mendeteksi `isForceLogin = true` karena `error` param ada $\to$ Mengizinkan navigasi ke `/login` tanpa me-redirect kembali ke `/`.
  - Halaman login merender notifikasi ramah: *"Sesi login Anda telah berakhir. Silakan masuk kembali."*

---

### 3.6. DATA-01 — Explicit Non-Member Assignee Validation
- **Traced Verification:**
  - Request `POST /api/tasks` dengan `assigneeId = "usr_foreign"` (anggota workspace lain).
  - Server mengeksekusi `prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: targetWorkspaceId, userId: assigneeId } } })`.
  - Karena user tidak terdaftar dalam workspace tersebut, query menghasilkan `null`.
  - Server mengembalikan `400 Bad Request`: `Assignee 'usr_foreign' is not a valid member of this workspace` dan melepaskan *idempotency lock*.
  - Assignee `null` atau `""` diizinkan dan menghasilkan `validAssigneeId = null` (unassigned task).

---

### 3.7. FE-02 — Workspace State Isolation
- **Traced Scenario (Fast Workspace Transition $A \to B \to C$):**
  - Klien berada di Workspace A, memicu `loadTasks(activeWsId = "ws_a")`.
  - Pengguna segera beralih ke Workspace B $\to$ `setActiveWorkspace(ws_b)` dipanggil:
    - `useTaskStore.resetWorkspaceTasks()` mengosongkan `tasks: []`, `selectedTaskId: null`.
    - `useWorkspaceStore` mengosongkan `projects: []` dan `members: []`.
  - Saat respons jaringan Workspace A tiba terlambat:
    ```ts
    if (useWorkspaceStore.getState().activeWorkspace?.id !== activeWsId && activeWsId) {
      return; // Discard stale response
    }
    ```
  - Karena `activeWorkspace.id` ("ws_b") $\neq$ `activeWsId` ("ws_a"), respons dibuang seketika dan data Workspace A tidak pernah bocor ke Workspace B.

---

## 4. Test Quality Assessment

Analisis terhadap 30 unit assertion di dalam `scripts/test-second-opinion-remediation-1.ts`:

| Kategori Kualitas | Jumlah Test | Persentase | Karakteristik Pengujian |
| :--- | :---: | :---: | :--- |
| **Strong Tests** | 19 / 30 | **63.3%** | Mengeksekusi mutasi langsung pada database PostgreSQL lokal, memvalidasi atomic transaction, compound index lookups, dan full state-rollback restoration. |
| **Medium Tests** | 11 / 30 | **36.7%** | Menguji integrasi state machine Zustand, deduplikasi array ID, dan parsing parameter URL middleware. |
| **Weak Tests** | 0 / 30 | **0.0%** | Tidak ada test yang hanya melakukan regex/string matching dangkal atau file check palsu. |

---

## 5. Re-Evaluation of Deferred P3 Findings

Pemeriksaan ulang terhadap 6 temuan yang dialokasikan di luar Remediation 1:

| Finding ID | Domain | Initial Scope | Verification Status | Re-evaluated Severity | Rationale & Remediation Requirement |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AI-01** | AI / Automation | Plan Task Dependency Ordering | Valid (Non-blocking) | **P3** | AI menghasilkan task berurutan dengan integer order dan phase ID. Dependency DAG belum ditegakkan di database (fitur lanjutan). |
| **CONC-01** | Database / Concurrency | Last-Write-Wins Task Update | Valid (Standard LWW) | **P3** | Mutasi task menggunakan standar database LWW. Belum ada version column (`ETag` / `version: Int`). Bukan bug fungsional untuk mayoritas SaaS SMB. |
| **API-01** | Security / Network | IPv6 Subnet Prefix Rate Limit | Valid (Hardening) | **P3** | Rate limiter mencatat exact IP string. Di lingkungan Cloudflare/Vercel edge, proteksi L7 DDoS menangani rotasi subnet IPv6. |
| **AUTH-01** | Security / Auth | Multi-Device Global Session Invalidation | Valid (Feature) | **P3** | `POST /api/auth/logout` menghapus sesi spesifik perangkat. Opsi *"Keluar dari semua perangkat"* merupakan fitur penambahan lanjutan. |
| **SEC-03** | Security / Storage | SVG / File Upload Sanitization | Forward-looking | **P3** | Aplikasi saat ini tidak memiliki endpoint upload multipart binary (hanya URL string). CSP header telah aktif di middleware. |
| **HYG-01** | Code Hygiene | Production Console Log Stripping | Valid (Hygiene) | **P3** | Dev log di `realtime.ts` telah dibungkus `if (this.isDev)`. Tersisa beberapa `console.warn` di `catch` blocks yang dapat di-strip via minifier. |

---

## 6. Regression Findings & New Bugs Check

- **P0 / P1 / P2 Regressions:** **0 Ditemukan**.
- **Edge Cases / Minor Nuances (P3):**
  1. *In-Page Search on Paginated Kanban:* Pencarian di toolbar Kanban memfilter task yang saat ini telah dimuat. Task di luar 50 item pertama baru muncul setelah menekan *Load More* atau melalui pencarian global header.
  2. *Lightweight Edge Middleware:* Middleware Next.js memeriksa keberadaan token cookie di edge; validasi kedaluwarsa database dilakukan di client/API endpoint untuk mempertahankan performa edge tanpa latensi database.

---

## 7. Top 5 Remaining Risks

1. **Database Connection Saturation under Extreme Load:** Database connection pooler (PgBouncer) harus dikonfigurasi pada production cluster saat beban simultan tinggi.
2. **LLM Provider Outage / Rate Limits:** Jika Google Gemini / OpenAI API mengalami degradasi, AI Assistant akan mengembalikan response gracefully sesuai timeout validator yang sudah ada.
3. **Multi-Tab Session Desync on Password Reset:** Pengguna yang mengganti kredensial di satu tab memerlukan refresh pada tab lain untuk memperbarui cookie.
4. **Client-Side Memory on Massive Workspaces (>1,000 tasks):** Pagination saat ini membatasi 50 per batch; jika pengguna menekan "Load More" 20x berturut-turut (1,000 DOM nodes), virtualisasi list dapat dipertimbangkan di masa mendatang.
5. **Realtime WebSocket Reconnection Storm:** Jika server Supabase restart, ratusan klien akan memicu `onReconnect` bersamaan; API caching layer dan rate limiter yang ada melindungi dari overload.

---

## 8. Final Verdict

```
╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║  FINAL VERDICT: 🟢 VERIFIED                                              ║
║                                                                          ║
║  • All 7 targeted fixes (SEC-01, UX-01, FE-01, RT-01, SEC-02,            ║
║    DATA-01, FE-02) are verified to eliminate root causes.                ║
║  • Zero material regressions introduced.                                 ║
║  • Codebase is type-safe (0 TS errors), clean (0 lints), and passes      ║
║    full production build (40/40 routes).                                 ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```
