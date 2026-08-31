# SYNPLAN — DISASTER RECOVERY & BUSINESS CONTINUITY ARCHITECTURE

Dokumentasi arsitektur, strategi pencadangan (*backup*), mitigasi risiko, dan prosedur pemulihan bencana (*disaster recovery runbooks*) untuk Synplan.

---

## 1. Executive Summary & Recovery Objectives

Synplan dibangun di atas infrastruktur data terdistribusi berbasis **PostgreSQL** yang di-host melalui **Supabase Cloud**, didukung oleh lapisan abstraksi **Prisma ORM**, lapisan keamanan **Row-Level multi-tenant boundaries**, serta **Application-Level Data Export Engine**.

### Recovery Objectives

| Metric | Target Baseline | PITR (Point-In-Time Recovery) | Deskripsi |
| :--- | :--- | :--- | :--- |
| **RPO (Recovery Point Objective)** | **≤ 24 Jam** | **≤ 2 Menit** | Maksimal kehilangan data yang dapat ditoleransi dalam skenario bencana katastropik. |
| **RTO (Recovery Time Objective)** | **≤ 4 Jam** | **≤ 1 Jam** | Target durasi waktu maksimal untuk memulihkan operasional penuh sistem sejak bencana diidentifikasi. |

> [!NOTE]
> Target RPO ≤ 24 jam adalah kapabilitas bawaan dari *Automated Daily Snapshots* Supabase. Bila add-on PITR diaktifkan pada tier Pro/Enterprise, RPO dapat ditekan hingga dalam hitungan menit melalui *Continuous WAL (Write-Ahead Logging) Archiving*.

---

## 2. Tingkatan Strategi Pencadangan (Backup Tiers)

Synplan mengadopsi pendekatan *defense-in-depth* 3 lapis untuk melindungi data dari penghapusan tidak sengaja (*accidental deletion*), korupsi data (*data corruption*), kegagalan infrastruktur (*hardware/zone failure*), dan insiden keamanan (*ransomware/security breach*):

```
                        SYNPLAN BACKUP ARCHITECTURE
                                     │
      ┌──────────────────────────────┼──────────────────────────────┐
      │                              │                              │
┌─────▼────────────────────────┐ ┌───▼────────────────────────┐ ┌───▼────────────────────────┐
│ 1. Physical Snapshot (Daily) │ │ 2. Continuous WAL (PITR)   │ │ 3. Logical Export (JSON)   │
│ - Supabase Cloud automated   │ │ - Second-level granularity │ │ - Workspace-scoped export  │
│ - 7-30 days retention        │ │ - WAL continuous archiving │ │ - Portable, human-readable │
│ - Full cluster restoration   │ │ - Point-in-time rewind     │ │ - Zero secret leakage      │
└──────────────────────────────┘ └────────────────────────────┘ └────────────────────────────┘
```

### 1. Physical Snapshots (Supabase Automated Daily Backups)
- **Cakupan**: Seluruh skema database PostgreSQL, tabel, indeks, relasi, dan triggers.
- **Frekuensi**: 1 kali per hari (otomatis dijadwalkan pada jam beban rendah UTC).
- **Retensi**: 7 hari (Tier Free/Pro) hingga 30 hari (Tier Enterprise).
- **Keamanan**: Dienkripsi saat *in-transit* (TLS 1.3) dan *at-rest* (AES-256).

### 2. Point-in-Time Recovery (PITR / WAL Archiving)
- **Cakupan**: Arsip *Write-Ahead Log* (WAL) PostgreSQL berkesinambungan.
- **Kemampuan**: Memungkinkan restorasi cluster database ke titik waktu spesifik (misal: 1 detik sebelum script yang salah mengeksekusi DROP atau UPDATE tanpa WHERE).
- **Retensi**: 7 hari hingga 28 hari sesuai konfigurasi instans Supabase.

### 3. Application-Level Logical Backup (`/api/admin/backup/export`)
- **Cakupan**: Data spesifik per workspace dalam format JSON terstandarisasi.
- **Akses**: Terbatas hanya untuk pengguna dengan role `OWNER` atau `ADMIN`.
- **Fitur Khusus**:
  - Multi-tenant boundary verification (100% data isolasi).
  - Sanitasi kredensial otomatis (tanpa password, token session, secret keys, atau OAuth tokens).
  - Verifikasi integritas internal skema.

---

## 3. Disaster Scenarios & Playbooks (Runbooks)

### Skenario A: Accidental Mass Deletion (Human Error)

*Contoh: Administrator tidak sengaja menghapus Proyek atau Task penting yang tidak dapat dibatalkan melalui UI.*

#### Prosedur Pemulihan:
1. **Identifikasi Titik Waktu Kejadian**:
   - Buka `GET /api/audit` atau query tabel `AuditLog` untuk mengidentifikasi timestamp pasti terjadinya mutasi perusak.
2. **Eksekusi PITR (Point-in-Time Recovery)**:
   - Akses Supabase Management Console $\to$ Database $\to$ Backups $\to$ Point in Time.
   - Tentukan waktu pemulihan: **1 menit sebelum timestamp AuditLog insiden**.
   - Supabase akan membuat instans basis data baru (*restored instance*) pada titik waktu tersebut.
3. **Ekstraksi & Re-impor Data Spesifik**:
   - Hubungkan connection string sementara ke instans hasil restore.
   - Ekstrak baris data yang terhapus melalui logical export script.
   - Sisipkan kembali entitas tersebut ke basis data produksi utama tanpa menimpa perubahan data pengguna lain yang terjadi setelahnya.
4. **Verifikasi Integritas Data**:
   - Jalankan `GET /api/health/data-consistency` untuk memastikan seluruh relasi referensial tetap konsisten.

---

### Skenario B: Cloud Zone Outage / Database Cluster Failure

*Contoh: Data center cloud provider mengalami downtime masal atau kegagalan hardware yang tidak terpulihkan.*

#### Prosedur Pemulihan (Disaster Recovery Failover):
1. **Aktivasi Standby / Baru di Region Alternatif**:
   - Buat database instans baru di region terdekat (misal: Singapore `ap-southeast-1` atau Tokyo `ap-northeast-1`).
2. **Restorasi Snapshot Terakhir**:
   - Restore snapshot harian terakhir atau pg_dump backup ke instans baru.
3. **Penerapan Schema Migrations**:
   ```bash
   pnpm exec prisma db push
   ```
4. **Pembaruan Environment Variables**:
   - Perbarui `DATABASE_URL` dan `DIRECT_URL` pada production hosting environment (misal: Vercel Dashboard).
5. **Redeploy & Warmup**:
   - Trigger production deployment ulang untuk memperbarui koneksi pool.
   - Jalankan automated health checks:
     - `GET /api/health/data-consistency`
     - `GET /api/health/disaster-recovery`

---

### Skenario C: Credential Leak or Compromise

*Contoh: Database password atau Service Role Key terindikasi bocor ke publik.*

#### Prosedur Mitigasi Darurat:
1. **Rotasi Kredensial di Supabase**:
   - Masuk ke Supabase Settings $\to$ Database $\to$ Reset Database Password.
   - Masuk ke API Settings $\to$ Generate new `service_role` key.
2. **Pembaruan Secrets di Server**:
   - Perbarui `DATABASE_URL`, `DIRECT_URL`, dan `SUPABASE_SERVICE_ROLE_KEY` pada provider hosting (Vercel).
3. **Terminasi Sesi Pengguna Aktif**:
   - Hapus seluruh entri pada tabel `Session` di database untuk memaksa re-autentikasi seluruh user:
     ```sql
     DELETE FROM "Session";
     ```
4. **Audit Log Inspection**:
   - Tinjau seluruh log aktivitas di `AuditLog` untuk mengidentifikasi apakah ada akses tak wajar sebelum kredensial dirotasi.

---

## 4. Keamanan & Sanitasi Data Backup (Zero Secret Leak)

Dalam mengimplementasikan pencadangan di Synplan, aturan keselamatan data berikut **wajib** dipatuhi:

1. **Dilarang Mengekspor Rahasia Otentikasi**:
   - Objek `User` yang diekspor hanya memuat: `id`, `name`, `email`, `avatarUrl`, `role`, `createdAt`.
   - Data `Session.sessionToken`, `Account.accessToken`, `Account.refreshToken`, `Account.idToken` **dilarang keras** dimasukkan ke dalam file export JSON.
2. **Isolasi Multi-Tenant Mutlak**:
   - Ekspor backup pada workspace A secara matematis dilarang memuat baris data dari workspace B.
3. **Audit Trail Pencadangan**:
   - Setiap kali aksi pencadangan dijalankan oleh admin, sistem wajib mencatat entri audit `BACKUP_EXPORT` lengkap dengan IP address dan Request ID.

---

## 5. Matriks Pengujian & Verifikasi Kesiapan (Readiness Checks)

Kesiapan pemulihan bencana Synplan diverifikasi secara berkala melalui test suite otomatis:
- `scripts/test-phase6-disaster-recovery.ts` (Non-destructive multi-tenant verification, integrity checks, RBAC gating, dan health status).
- `scripts/test-phase5-data-integrity.ts` (Validasi konsistensi referensial dan isolasi workspace).
