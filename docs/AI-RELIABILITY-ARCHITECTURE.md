# SYNPLAN — AI RELIABILITY & AGENT ARCHITECTURE BLUEPRINT

**Application**: Synplan — Project Management & Team Collaboration Platform  
**Developer**: Marchelino Kurniawan (Acelino / Acel) — Founder & Fullstack Web Developer | Frontend Specialist  
**Document Type**: Engineering Architecture Specification & Implementation Blueprint  
**Status**: ARCHITECTURE APPROVED — READY FOR CORE IMPLEMENTATION  

---

## 1. Executive Summary & Design Principles

Tujuan dari arsitektur ini adalah mentransformasi sistem AI Synplan dari model sederhana (*Prompt $\rightarrow$ AI $\rightarrow$ DB*) menjadi **Deterministic, Observable, Secure, and Verified Agent Pipeline**:

```text
User Natural Language Input
            │
            ▼
┌────────────────────────────────────────────────────────┐
│ 1. AI Semantic Planner (Gemini 3.6 Flash / Fallback)  │
│    Outputs strictly typed Action Plan with text refs   │
└───────────────────────────┬────────────────────────────┘
                            │ Action Plan (No raw DB IDs)
                            ▼
┌────────────────────────────────────────────────────────┐
│ 2. Context & Conversation State Resolver               │
│    Resolves Workspace, Active Route, Active Project,   │
│    and Multi-Turn Conversation Continuity              │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 3. Deterministic Entity & Date Resolver                │
│    Fuzzy member matching, project resolution, dates    │
│    *Zero-Hallucination Policy & Ambiguity Detection*   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 4. Deterministic Parameter & Registry Validator        │
│    Validates against centralized Action Registry       │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 5. Server-Side RBAC & Workspace Permission Layer       │
│    Strict isolation, role hierarchy (OWNER/ADMIN/MEM)  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 6. Risk Classifier & Interactive Confirmation Gate     │
│    LOW (Direct) / MEDIUM & HIGH (Requires Confirmation)│
└───────────────────────────┬────────────────────────────┘
                            │ User Confirms
                            ▼
┌────────────────────────────────────────────────────────┐
│ 7. Centralized Execution Engine                        │
│    Sequential dependency chaining & Idempotency        │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 8. Post-Execution Database Verification Layer          │
│    Queries PostgreSQL to verify actual state changes   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 9. Realtime Broadcast, Notification & Audit Log        │
│    Supabase WebSocket + In-App Notifications + Log     │
└────────────────────────────────────────────────────────┘
```

---

## 2. Centralized Action Registry Specification

Semua aksi AI didefinisikan secara terpusat pada `src/lib/ai/registry/` dengan metadata lengkap:

| Action Type | Risk Level | Required Role | Required Params | Dependency Outputs |
| :--- | :--- | :--- | :--- | :--- |
| `CREATE_PROJECT` | **MEDIUM** | `MEMBER` | `name` | `projectId`, `projectName` |
| `UPDATE_PROJECT` | **MEDIUM** | `MEMBER` | `projectId` / `projectName` | `projectId` |
| `DELETE_PROJECT` | **HIGH** | `ADMIN` / `OWNER` | `projectId` / `projectName` | - |
| `CREATE_PHASE` | **MEDIUM** | `MEMBER` | `name`, `projectId` | `phaseId` |
| `UPDATE_PHASE` | **MEDIUM** | `MEMBER` | `phaseId` | `phaseId` |
| `DELETE_PHASE` | **HIGH** | `MEMBER` | `phaseId` | - |
| `CREATE_TASK` | **MEDIUM** | `MEMBER` | `title`, `projectId` | `taskId` |
| `UPDATE_TASK` | **MEDIUM** | `MEMBER` | `taskId` | `taskId` |
| `DELETE_TASK` | **HIGH** | `MEMBER` | `taskId` | - |
| `ASSIGN_TASK` | **MEDIUM** | `MEMBER` | `taskId`, `userId` | `assignmentVerified` |
| `ADD_MEMBER` | **MEDIUM** | `MEMBER` | `projectId`, `userId` | `memberVerified` |
| `REMOVE_MEMBER` | **HIGH** | `ADMIN` / `OWNER` | `projectId`, `userId` | - |

---

## 3. Entity & Ambiguity Resolution Matrix

1. **Member Resolution**:
   - Jika input `"marchel"` $\rightarrow$ cari di `WorkspaceMember`. Jika cocok tunggal ke `"Marchelino Kurniawan"` $\rightarrow$ bind `userId: usr_xxx`.
   - Jika input `"andi"` dan terdapat `"Andi Saputra"` & `"Andi Pratama"` $\rightarrow$ status `NEEDS_CLARIFICATION`, jangan menebak.
   - Jika input `"budi"` dan tidak ada di workspace $\rightarrow$ status `NEEDS_CLARIFICATION` / warning: *"Anggota Budi tidak ditemukan di workspace ini."* (Dilarang membuat ID palsu seperti `usr_budi`).
2. **Project Resolution**:
   - Jika input mengacu ke `"project ini"` atau user sedang membuka rute `/projects/[id]`, resolve ke `context.currentProjectId`.
   - Jika nama project memiliki multi-match, minta klarifikasi.
3. **Date Resolution**:
   - Parser deterministik mengubah `"1 September"`, `"minggu depan"`, `"besok"`, `"akhir bulan"` menjadi format ISO `YYYY-MM-DD` berdasarkan tanggal server saat ini.

---

## 4. Execution, Idempotency & Verification Workflow

1. **Idempotency**: Setiap plan memiliki `planId` dan `idempotencyKey`. Eksekusi berulang dengan key yang sama akan mengembalikan hasil eksekusi sebelumnya tanpa membuat data ganda di database.
2. **Sequential Dependency Binding**:
   - Saat `CREATE_PROJECT` dieksekusi, database menghasilkan `project.id = "prj_abc"`.
   - Aksi berikutnya dalam plan yang sama (`ADD_MEMBER`, `CREATE_PHASE`, `CREATE_TASK`) otomatis menggunakan `projectId: "prj_abc"`.
3. **Post-Execution Verification**:
   - Setelah Prisma query dijalankan, sistem melakukan verifikasi ke database (`prisma.project.findUnique`, `prisma.task.findUnique`). Hanya jika data terverifikasi di PostgreSQL, sistem menandai `action.verified = true`.

---

## 5. File Structure to Create / Modify

```text
src/lib/ai/
├── registry/
│   ├── index.ts              # Central Action Registry & Action Definitions
│   ├── projectActions.ts     # CREATE, UPDATE, DELETE PROJECT
│   ├── taskActions.ts        # CREATE, UPDATE, DELETE, ASSIGN TASK
│   └── phaseActions.ts       # CREATE, UPDATE, DELETE PHASE
├── types.ts                  # Enriched schemas, states, and plan interfaces
├── provider.ts               # Google Gemini 3.6 Flash LLM Provider
├── context.ts                # Server-side workspace & route context builder
├── planner.ts                # AI Planner with System Prompt & Fallback
├── entityResolver.ts         # Deterministic fuzzy member & project resolver
├── dateResolver.ts           # Natural date normalization engine
├── permissions.ts            # Server-side RBAC privilege validator
├── validator.ts              # Parameter, registry & ambiguity validator
├── idempotency.ts            # Duplicate execution prevention
├── verifier.ts               # Post-execution DB state verifier
├── conversationState.ts      # Multi-turn context & session state
├── featureFlags.ts           # AI feature toggles
└── executor.ts               # Centralized execution & rollback engine
```

---

## 6. UI Integration & Visual Preservation

- **Modal `ProjectModal.tsx`**:
  - Tampilan pilihan awal: `✨ Create with AI (Recommended)` vs `Create Manually`.
  - AI Mode: Natural Language Textarea + Suggestion Chips + Structured Preview + Conversational Refinement.
  - Manual Mode: 100% form manual existing yang sudah berjalan.
  - **Zero UI Redesign**: Seluruh style, CSS token, border, radius, dan tipografi Figma dipertahankan secara murni.

---

## 7. 100+ Golden Test Suite Specification (`scripts/test-ai-golden-suite.ts`)

Mencakup 100 skenario pengujian otomatis yang mencakup:
- Variasi bahasa alami (Formal, Gaul, Campuran ID/EN)
- Pembuatan proyek + tanggal + multi-anggota
- Pembuatan task + penugasan task
- Multi-action compound plans
- Ambiguities (member & project)
- Unknown member protections (zero fake IDs)
- Unauthorized actions (RBAC checks)
- Conversational context retention across turns
- Idempotency & Post-Execution Verification
