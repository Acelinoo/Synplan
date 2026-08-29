# SYNPLAN — PHASE 14B: AI NATURAL LANGUAGE & ARCHITECTURE AUDIT

**Application**: Synplan — Project Management & Team Collaboration Platform  
**Developer**: Marchelino Kurniawan (Acelino / Acel) — Founder & Fullstack Web Developer | Frontend Specialist  
**Auditor**: Antigravity Agent  
**Date**: 2026-08-29  
**Status**: AUDIT COMPLETE — ROOT CAUSE IDENTIFIED  

---

## 1. Executive Summary & Problem Statement

Pada Phase 14, sistem AI Assistant dirancang untuk menerima perintah bahasa alami (*natural language*). Namun dalam pengujian nyata, prompt bahasa alami sehari-hari seperti:
- *"buatin projek web undangan pernikahan, deadline 1 september"*
- *"di projek Web Undangan Pernikahan tambahkan team marchelino, sarah, dan x"*

mengembalikan respons kegagalan: *"Saya belum memahami instruksi secara spesifik."*

Pengguna mendapati bahwa instruksi tersebut baru bekerja setelah kita menambahkan *keyword parser* / kondisi `if (lower.includes(...))` secara manual. Pola penyelesaian *hardcoded regex/keyword template* ini adalah anti-pattern dan tidak dapat diterima sebagai arsitektur final.

Dokumen ini mendokumentasikan investigasi mendalam terhadap akar masalah teknis pada lapisan LLM Provider, Planner, Context Builder, dan Heuristic Fallback.

---

## 2. Audit Findings & Answers to the 13 Key Questions

| # | Pertanyaan Audit | Temuan Faktual di Codebase | Status / Bukti |
| :--- | :--- | :--- | :--- |
| 1 | **Apakah Gemini benar-benar dipanggil?** | **TIDAK BERHASIL (Gagal dengan HTTP 404).** Endpoint yang dipanggil sebelumnya mengarah ke `models/gemini-1.5-flash` atau `api.openai.com`. Google API menolak dengan pesan: `404: models/gemini-1.5-flash is not found for API version v1beta`. | **FAILED (404)** |
| 2 | **Apakah `AI_API_KEY` digunakan?** | **YA, TETAPI SALAH TARGET.** Kunci API yang tersimpan di `.env` adalah kunci Google Generative Language (`AQ.Ab8RN6L...`), namun variabel `AI_API_URL` di `.env` sempat terisi default OpenAI (`api.openai.com`). | **MISCONFIGURED** |
| 3 | **Apakah Gemini menjadi Primary Planner?** | **TIDAK.** Karena panggilan API ke Google Gemini menghasilkan HTTP 404, fungsi `callExternalAiProvider` mengembalikan `null`. Akibatnya, eksekusi selalu jatuh (*silent fallback*) ke `parseHeuristicIntent`. | **DEGRADED TO FALLBACK** |
| 4 | **Apakah Heuristic Parser dipakai sebelum Gemini?** | **TIDAK SEBELUMNYA, TAPI JATUH SECARA SILENT.** Urutan pemanggilan di `planner.ts` mencoba `callExternalAiProvider` dulu, namun ketika gagal, sistem langsung beralih ke `parseHeuristicIntent` tanpa memberi tahu bahwa mode LLM gagal. | **SILENT FALLBACK** |
| 5 | **Apakah Gemini menerima context Workspace?** | **YA, TETAPI FORMATNYA MINIMAL.** Konteks workspace dimasukkan dalam format JSON ringkas di system prompt, namun tanpa metadata rute dan relasi konteks terbuka. | **PARTIAL** |
| 6 | **Apakah Gemini menerima context Project?** | **HANYA ID DAN NAMA.** Belum menyediakan detail phases, status, dan metadata lengkap ketika user berada di halaman proyek (`/projects/[id]`). | **PARTIAL** |
| 7 | **Apakah Gemini menerima anggota workspace?** | **YA, HANYA NAMA DAN USERID.** Belum ada instruksi semantik resolusi nama (misal: "marchelino" $\rightarrow$ "Acelino / Marchelino Kurniawan"). | **BASIC** |
| 8 | **Apakah Gemini menerima daftar project yang ada?** | **YA.** Daftar nama dan ID proyek dikirimkan. | **PASS** |
| 9 | **Apakah Gemini menerima phases/tasks relevan?** | **BELUM LENGKAP.** Hanya summary proyek yang diberikan tanpa relasi hierarki fase dan tugas. | **INCOMPLETE** |
| 10 | **Bagaimana output Gemini divalidasi?** | Menggunakan `validateAiPlan()` yang memeriksa apakah tipe aksi dikenali. Namun belum mendukung resolusi ketergantungan aksi majemuk (*compound multi-action dependencies*). | **NEEDS UPGRADE** |
| 11 | **Bagaimana nama anggota yang ambigu diselesaikan?** | Diperiksa oleh `resolveWorkspaceMember()`, namun belum ada schema terstruktur dari LLM untuk menandai `needsClarification = true`. | **BASIC** |
| 12 | **Bagaimana multi-action instructions ditangani?** | Pada Heuristic Parser, instruksi majemuk dipecah parsial. Pada LLM belum ada chaining ID (misal: buat project lalu gunakan ID project baru untuk membuat task). | **INCOMPLETE** |
| 13 | **Mengapa prompt valid mengembalikan "I don't fully understand"?** | Karena LLM gagal (404), beralih ke Heuristic Fallback, dan Heuristic Fallback mengandalkan *string matching* kaku (`if (lower.includes("buat project"))`) yang tidak mengenali kata *"buatin"*, *"projek"*, atau *"di projek ... tambahkan team ..."*. | **ROOT CAUSE CONFIRMED** |

---

## 3. Root Cause Analysis

### Akar Masalah 1: Model Name & Endpoint Versioning pada Google Generative Language API
Berdasarkan hasil probe langsung melalui `scripts/diagnose-gemini.ts` terhadap endpoint resmi Google AI:
```json
--- Available Models for this API Key ---
[
  "models/gemini-2.5-flash",
  "models/gemini-2.5-pro",
  "models/gemini-flash-latest",
  "models/gemini-pro-latest",
  "models/gemini-3.6-flash"
]
```
Google API versi terbaru telah memperbarui model name menjadi `gemini-2.5-flash` / `gemini-3.6-flash` / `gemini-flash-latest`. Panggilan ke `gemini-1.5-flash` menghasilkan respons:
`404: models/gemini-1.5-flash is not found for API version v1beta`.

### Akar Masalah 2: Silent Fallback Tanpa Observabilitas
Ketika `fetch()` ke Google Gemini menghasilkan 404, `callExternalAiProvider` mengembalikan `null`. Kode `generateAiPlan` langsung mengeksekusi `parseHeuristicIntent` tanpa menandai bahwa AI sedang beroperasi dalam mode degraded (*heuristic fallback*).

### Akar Masalah 3: Ketergantungan Heuristic Fallback pada String Templates
Ketika fallback berjalan, fungsi `parseHeuristicIntent` menggunakan `lower.includes("buat project")`. Variasi alami bahasa manusia seperti *"buatin projek"*, *"saya ingin membikin website..."*, atau *"di projek X tambahkan anggota Y dan Z"* gagal dikenali karena tidak ada kondisi `if-else` yang cocok.

---

## 4. Architectural Transformation Plan (Phase 14B)

Untuk mengubah AI Assistant menjadi genuinely **natural-language, context-aware AI project planner**, berikut langkah-langkah yang akan diimplementasikan:

1. **Native Multi-Model LLM Adapter (`src/lib/ai/provider.ts`)**:
   - Mendukung model Gemini aktif: `gemini-2.5-flash`, `gemini-3.6-flash`, `gemini-flash-latest` dengan payload native `generateContent` dan OpenAI-compatible.
   - Fallback otomatis ke model berikutnya jika model spesifik mengalami *rate limit* atau *deprecated*.
   - Logging diagnostik yang jelas jika terjadi kegagalan jaringan.
2. **Context Builder Generasi Baru (`src/lib/ai/context.ts`)**:
   - Mengumpulkan data Workspace, Active User, Current Route (`pathname`), Active Project (termasuk Phases & Tasks), Squad Members, dan Timestamp server terkini.
3. **Structured System Prompt & Schema Definition (`src/lib/ai/planner.ts`)**:
   - Merancang System Prompt komprehensif yang menginstruksikan Gemini untuk:
     - Mengidentifikasi niat pengguna (*intent recognition*) secara semantik dalam Bahasa Indonesia dan English.
     - Menyusun *Structured Action Plan* (`CREATE_PROJECT`, `ADD_PROJECT_MEMBER`, `CREATE_PHASE`, `CREATE_TASK`, `ASSIGN_TASK`, `UPDATE_PROJECT`, `UPDATE_TASK`, `DELETE_PROJECT`, `DELETE_TASK`).
     - Menyelesaikan referensi kontekstual (misal: *"project ini"* $\rightarrow$ `currentProjectId`, *"saya"* $\rightarrow$ `currentUserId`).
     - Menghitung tanggal relatif berdasarkan tanggal server hari ini (*"1 september"*, *"minggu depan"*, *"akhir bulan"*).
     - Menandai `needsClarification: true` jika perintah ambigu (misal: terdapat 2 proyek bernama serupa atau nama anggota ambigu).
4. **Action Dependency Chaining & Validator (`src/lib/ai/validator.ts` & `src/lib/ai/executor.ts`)**:
   - Mengizinkan aksi majemuk berantai (misal: `CREATE_PROJECT` $\rightarrow$ menghasilkan project ID baru yang langsung di-binding ke `ADD_PROJECT_MEMBER` dan `CREATE_TASK`).
   - Verifikasi izin ketat (*server authorization*), deduplikasi, dan proteksi aksi destruktif (*requiresConfirmation*).
5. **Observability & Degraded Mode Transparency**:
   - Hasil perencanaan AI menyertakan metadata: `planner: "llm" | "heuristic"`, `provider: "gemini" | "fallback"`, `needsClarification: boolean`.
6. **Robust Fallback Heuristics**:
   - Heuristic Engine tetap dipertahankan hanya sebagai cadangan offline, namun diperluas secara semantik dan diberi label transparan `[FALLBACK MODE]`.
7. **Semantic Test Suite (`scripts/test-ai-natural-language.ts`)**:
   - Menguji berbagai variasi kalimat bebas, parafrase bahasa Indonesia/Inggris, perintah majemuk, penanganan ambiguitas, dan resolusi tanggal.
