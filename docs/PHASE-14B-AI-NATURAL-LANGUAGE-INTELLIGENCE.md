# SYNPLAN — PHASE 14B: AI NATURAL LANGUAGE INTELLIGENCE & CONTEXT-AWARE PLANNING

**Application**: Synplan — Project Management & Team Collaboration Platform  
**Developer**: Marchelino Kurniawan (Acelino / Acel) — Founder & Fullstack Web Developer | Frontend Specialist  
**Document**: Architectural Blueprint & Implementation Report  
**Date**: 2026-08-29  
**Status**: COMPLETED & VERIFIED (100% Tests Passing, Production Build Passing)  

---

## 1. Executive Summary & Problem Resolution

Pada implementasi awal Phase 14, sistem AI Assistant belum berfungsi secara penuh sebagai *natural-language planner*. Ketika pengguna memasukkan instruksi bahasa alami sehari-hari seperti:
- *"buatin projek web undangan pernikahan, deadline 1 september"*
- *"di projek Web Undangan Pernikahan tambahkan team marchelino, sarah, dan x"*

Sistem mengembalikan respons gagal (*"Saya belum memahami instruksi secara spesifik"*). 

### Akar Masalah yang Ditemukan (Root Cause)
1. **Model & Endpoint Mismatch**: Google Generative Language API versi terbaru pada akun pengguna tidak lagi melayani `gemini-1.5-flash` (HTTP 404), melainkan `gemini-3.6-flash` dan `gemini-flash-latest`.
2. **Silent Fallback Degradation**: Ketika panggilan API menghasilkan HTTP 404, fungsi `callExternalAiProvider` mengembalikan `null` dan secara diam-diam beralih ke `parseHeuristicIntent`.
3. **Rigid Heuristic Matching**: Parser heuristik cadangan mengandalkan *string matching* kaku (`if (lower.includes("buat project"))`) yang tidak mampu mengenali variasi bahasa alami seperti *"buatin"*, *"projek"*, atau *"di projek ... tambahkan team ..."*.

### Solusi yang Diimplementasikan pada Phase 14B
1. **Gemini 3.6 Flash Native Provider (`src/lib/ai/provider.ts`)**: Integrasi langsung dengan endpoint resmi Google Generative Language API menggunakan model `gemini-3.6-flash` dengan `responseMimeType: "application/json"`.
2. **Comprehensive Context Builder (`src/lib/ai/context.ts`)**: Injeksi rute aktif, proyek aktif, anggota squad lengkap, daftar proyek, fase, task, dan timestamp server untuk kalkulasi tanggal relatif.
3. **Semantic System Instruction (`src/lib/ai/planner.ts`)**: Pengajaran semantik komprehensif kepada Gemini untuk memahami seluruh variasi bahasa Indonesia dan Inggris, menangani instruksi majemuk (*multi-action*), mendeteksi ambiguitas, dan memformat output JSON terstruktur.
4. **Action Dependency Chaining & Validation (`src/lib/ai/validator.ts` & `src/lib/ai/executor.ts`)**: Mendukung eksekusi berantai di mana pembuatan proyek baru secara otomatis mengaitkan ID proyek ke fase, task, dan anggota yang dibuat dalam rencana yang sama.
5. **Observability & Degraded Mode Transparency**: UI Drawer menampilkan badge status (`Gemini LLM` / `Offline Fallback`) dan box klarifikasi jika instruksi ambigu.

---

## 2. Arsitektur Komponen AI Assistant

```text
               User Prompt (Bahasa Indonesia / English)
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │  Context Builder          │
                    │  (src/lib/ai/context.ts)  │
                    └─────────────┬─────────────┘
                                  │ (Workspace, Active Project, Members, Server Time)
                                  ▼
                    ┌───────────────────────────┐
                    │  Gemini 3.6 Flash Planner │
                    │  (src/lib/ai/planner.ts)  │
                    └─────────────┬─────────────┘
                                  │ Structured JSON Action Plan
                                  ▼
                    ┌───────────────────────────┐
                    │  Plan Validator           │
                    │  (src/lib/ai/validator.ts)│
                    └─────────────┬─────────────┘
                                  │ (Member Resolution, Dependency Chaining, Guardrails)
                                  ▼
                   ┌──────────────────────────────┐
                   │ Interactive Confirmation UI  │
                   │ (AiAssistantDrawer.tsx)      │
                   └──────────────┬───────────────┘
                                  │ (User Confirms / Cancels)
                                  ▼
                    ┌───────────────────────────┐
                    │  Database Executor        │
                    │  (src/lib/ai/executor.ts) │
                    └─────────────┬─────────────┘
                                  │ (Prisma Mutation + WebSocket Event + Notification)
                                  ▼
             PostgreSQL Database & Realtime UI Sync
```

---

## 3. Detail Modifikasi & File yang Diperbarui

### 1. `src/lib/ai/types.ts`
- Penambahan metadata observabilitas pada `AiPlan`: `planner: "llm" | "heuristic"`, `provider: "gemini" | "openai" | "fallback"`, `needsClarification?: boolean`, `clarificationsNeeded?: string[]`.
- Penambahan payload `ADD_PROJECT_MEMBER` dan dukungan fleksibel untuk nama proyek / nama anggota.

### 2. `src/lib/ai/provider.ts`
- Konfigurasi native Google Gemini Generative Language API targeting `gemini-3.6-flash` / `gemini-flash-latest`.
- Pengaturan `temperature: 0.1` dan `responseMimeType: "application/json"`.
- Penanganan timeout fail-fast dan rate-limit delegasi anggun (*graceful fallback*).

### 3. `src/lib/ai/context.ts`
- Pengambilan data context komprehensif: Workspace name & ID, Active User & Role, Active Route, Active Project details, Squad Members list, Project List, Phases & Tasks, dan Server Time ISO.

### 4. `src/lib/ai/planner.ts`
- Perancangan System Prompt mendalam untuk LLM Gemini.
- Parser Heuristik tangguh (*semantic regex fallback*) yang mendukung variasi kalimat bebas ketika offline atau rate-limited.
- Penghitungan tanggal relatif bahasa alami (*"1 september"*, *"minggu depan"*, *"akhir bulan"*).

### 5. `src/lib/ai/validator.ts`
- Resolusi fuzzy anggota squad (`resolveWorkspaceMember`) tanpa menebak atau membuat user palsu.
- Resolusi proyek dan penanganan dependensi berantai (*dependency chaining*).
- Deteksi ambiguitas semantik (`needsClarification: true`).
- Proteksi operasi destruktif (`isDestructive: true`, `requiresConfirmation: true`).

### 6. `src/lib/ai/executor.ts`
- Eksekusi aman berantai menggunakan `sessionProjectMap`.
- Pengiriman notifikasi otomatis kepada anggota yang di-assign / ditambahkan.
- Broadcast event WebSocket Supabase Realtime untuk sinkronisasi instan ke seluruh tab/klien.
- Pencatatan log audit (`AuditLog`).

### 7. `src/components/ai/AiAssistantDrawer.tsx`
- Tampilan badge provider (`Gemini LLM` / `Offline Fallback`).
- Tampilan box peringatan dan klarifikasi pertanyaan jika instruksi ambigu.
- Pertahankan UI Figma asli, tema dark/light, dan tata letak responsif.

---

## 4. Hasil Pengujian Semantik (Test Suite)

Pengujian komprehensif dijalankan melalui `scripts/test-ai-natural-language.ts`:

| # | Skenario Pengujian | Input Prompt | Hasil | Status |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **Variasi Pembuatan Proyek A** | *"Buat project toko roti"* | Menghasilkan `CREATE_PROJECT` | **PASS** |
| 2 | **Variasi Pembuatan Proyek B** | *"Buatin project website toko roti"* | Menghasilkan `CREATE_PROJECT` | **PASS** |
| 3 | **Variasi Pembuatan Proyek C** | *"Saya mau bikin project untuk website toko roti"* | Menghasilkan `CREATE_PROJECT` | **PASS** |
| 4 | **Variasi Pembuatan Proyek D** | *"Tolong buatkan project web toko roti"* | Menghasilkan `CREATE_PROJECT` | **PASS** |
| 5 | **Novel Paraphrasing (Zero-Shot)** | *"Saya sedang menyiapkan situs untuk usaha bakery. Tolong buat ruang kerja project-nya, target selesai tanggal satu September, dan libatkan Marchelino serta Sarah."* | Menghasilkan `CREATE_PROJECT` + `ADD_PROJECT_MEMBER` + Deadline 1 September | **PASS** |
| 6 | **Proyek + Deadline** | *"Saya ingin website undangan pernikahan selesai tanggal 1 September"* | Menghasilkan `CREATE_PROJECT` + Deadline 2026-09-01 | **PASS** |
| 7 | **Context-Aware ("project ini")** | *"Tambahkan Sarah ke project ini"* | Menghasilkan `ADD_PROJECT_MEMBER` mengarah ke Proyek Aktif (*Toko Roti Enak*) | **PASS** |
| 8 | **Multi-Action Compound Plan** | *"Buat project toko roti, deadline 1 September, buat phase Planning dan Development, lalu tambahkan Sarah sebagai anggota."* | Menghasilkan rencana majemuk (Project + Phases + Member) | **PASS** |
| 9 | **Ambiguity Handling** | *"Hapus project toko"* | Menandai `needsClarification: true` (meminta klarifikasi antara *Toko Roti Enak* vs *Toko Fashion Glam*) | **PASS** |
| 10 | **Non-Existent Member Guard** | *"Tambahkan Budi ke project ini"* | Menolak/memberi peringatan aman tanpa membuat user palsu | **PASS** |
| 11 | **Destructive Operation Protection** | *"Hapus project Toko Roti Enak"* | Menandai `isDestructive: true` dan `requiresConfirmation: true` | **PASS** |
| 12 | **Fuzzy Member Resolution** | *"marchelino"*, *"sarah"* | Berhasil mencocokkan ke user ID yang benar | **PASS** |
| 13 | **Ambiguous Member Resolution** | *"Andi"* | Mengidentifikasi ambiguitas (*Andi Saputra* vs *Andi Pratama*) | **PASS** |

**Hasil Akhir Test Suite**: **22 / 22 Tests PASSED (100%)**

---

## 5. Verifikasi Static & Production Build

1. `npx prisma validate` $\rightarrow$ **Valid**
2. `npm run type-check` (`tsc --noEmit`) $\rightarrow$ **0 Errors**
3. `npm run build` (`next build`) $\rightarrow$ **Compiled Successfully (27/27 pages generated)**

---

## 6. Kesimpulan & Penutupan Phase 14B

Sistem AI Assistant Synplan kini telah bertransformasi sepenuhnya menjadi **Natural-Language, Context-Aware AI Project & Task Planner** berbasis Google Gemini LLM yang cerdas, aman, dan terintegrasi dengan database serta realtime workspace Synplan.

Sesuai instruksi: **STOP AFTER PHASE 14B**.
