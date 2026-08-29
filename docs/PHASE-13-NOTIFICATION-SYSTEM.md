# SYNPLAN — PHASE 13: NOTIFICATION SYSTEM DOCUMENTATION

**Application**: Synplan — Project Management & Team Collaboration Platform  
**Developer**: Marchelino Kurniawan (Acelino / Acel) — Founder & Fullstack Web Developer | Frontend Specialist  
**Status**: PASS — FULLY IMPLEMENTED & VERIFIED  
**Phase**: Phase 13 (In-App Notification System & Realtime Notification Foundation)  
**Database**: PostgreSQL (Supabase-hosted), Prisma ORM  
**Realtime Transport**: Supabase Realtime Protocol + Browser Multi-Tab Bus (`BroadcastChannel`)  
**Browser Used**: NO  
**Internet Used**: NO  
**Mock Data Added**: NO  
**Schema Changes Made**: NONE (Reused existing production schema)  

---

## 1. Architecture Overview

Phase 13 menghadirkan sistem notifikasi terpusat (*Centralized In-App Notification System*) yang terintegrasi langsung dengan arsitektur Realtime Synplan (Phase 12).

```text
[Business Mutation (Task/Project/Team)]
                    ↓
[Database Persistence (PostgreSQL via Prisma)]
                    ↓
[Notification Creation via notificationService.ts]
                    ↓
[Realtime Event Broadcast (NOTIFICATION_CREATED)]
  ├─ Multi-Tab Bus (BroadcastChannel)
  └─ Supabase WebSocket Cloud Transport
                    ↓
[Recipient Client(s)]
  ├─ TopHeader Notification Bell (Live Unread Badge)
  ├─ Notification Dropdown Popover
  ├─ Dedicated /notifications Page
  └─ Zustand useNotificationStore
```

---

## 2. Notification Data Model

Model `Notification` di `prisma/schema.prisma` berelasi kuat dengan `User` dan `Workspace`:

```prisma
model Notification {
  id          String    @id @default(cuid())
  workspaceId String
  userId      String
  title       String
  description String
  type        String    @default("info") // TASK_ASSIGNED, TASK_STATUS_CHANGED, TEAM_MEMBER_ADDED, etc.
  link        String?
  read        Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, read])
  @@index([workspaceId, createdAt])
}
```

---

## 3. Typed Notification Catalog

Semua notifikasi dikelompokkan secara type-safe melalui TypeScript:

| Kategori | Tipe Notifikasi | Pemicu (Trigger) | Deep Link / Navigasi |
| :--- | :--- | :--- | :--- |
| **Task** | `TASK_ASSIGNED` | Pengguna diberi tugas baru atau assignee berubah | `/tasks?taskId={id}` |
| **Task** | `TASK_STATUS_CHANGED` | Status tugas yang ditugaskan dipindahkan | `/tasks?taskId={id}` |
| **Task** | `TASK_UPDATED` | Detail tugas diubah oleh anggota lain | `/tasks?taskId={id}` |
| **Task** | `TASK_COMMENTED` | Komentar baru pada tugas pengguna | `/tasks?taskId={id}` |
| **Task** | `TASK_MENTIONED` | Pengguna disebut (*mentioned*) dalam tugas/komentar | `/tasks?taskId={id}` |
| **Project** | `PROJECT_MEMBER_ADDED` | Pengguna ditambahkan ke dalam suatu proyek | `/projects/{id}` |
| **Project** | `PROJECT_CREATED` | Proyek baru dibuat dalam squad | `/projects/{id}` |
| **Project** | `PROJECT_UPDATED` | Status atau milestone proyek diperbarui | `/projects/{id}` |
| **Team** | `TEAM_MEMBER_ADDED` | Pengguna diundang masuk ke dalam workspace squad | `/team` |
| **Team** | `TEAM_MEMBER_REMOVED` | Keanggotaan pengguna dicabut dari workspace | `/` |
| **General** | `SYSTEM` | Pengumuman atau sistem alert | Sesuai konteks |

---

## 4. Notification Rules (Direct vs General)

1. **Direct Notification (Personal)**:
   - Notifikasi hanya dikirim kepada user yang **terlibat langsung**.
   - Contoh: Ketika Acel menugaskan tugas ke Budi, hanya Budi yang menerima `TASK_ASSIGNED`. Acel (selaku pembuat) tidak menerima notifikasi untuk dirinya sendiri.
2. **General Activity Isolation (No Spam)**:
   - Pembaruan rutin yang tidak melibatkan user lain secara langsung tidak membuat spam notifikasi personal.
   - Aktivitas workspace umum tetap tercatat di `AuditLog` / *Recent Activity*, namun tidak membebani lonceng notifikasi pengguna lain.

---

## 5. Security & Isolation Model

- **Server-Side Authorization (`requireAuthGuard`)**:
  - `GET /api/notifications`: Secara ketat membatasi query ke `userId === auth.userId` dan `workspaceId === auth.workspaceId`. Tidak mempercayai input `userId` dari request body atau client.
  - `PATCH /api/notifications`: Memvalidasi kepemilikan notifikasi sebelum mengubah status `read: true`. Mencegah serangan IDOR (*Insecure Direct Object References*).
- **Tenant Isolation**:
  - Pengguna di Workspace A tidak dapat membaca atau menerima broadcast notifikasi milik Workspace B.

---

## 6. API Endpoints

### 6.1 `GET /api/notifications`
- **Query Params**: `filter=all|unread|read`, `limit=50`
- **Response**:
  ```json
  {
    "success": true,
    "data": [...],
    "unreadCount": 3
  }
  ```

### 6.2 `PATCH /api/notifications`
- **Mark Single Read**: `{ "id": "notif_123" }`
- **Mark All Read**: `{ "markAll": true }`
- **Realtime Trigger**: Membroadcast `NOTIFICATION_READ` atau `NOTIFICATIONS_READ_ALL` ke seluruh tab pengguna yang aktif.

---

## 7. In-App User Interface

1. **TopHeader Bell Dropdown**:
   - Lonceng notifikasi dengan badge penghitung unread realtime.
   - Popover cepat menampilkan 10 notifikasi terbaru dengan ikon kontekstual.
   - Tombol "Mark all read" untuk menandai semua terbaca dalam satu klik.
   - Tombol "View all notifications" mengarah ke `/notifications`.
2. **Dedicated `/notifications` Page**:
   - Tiga tab filter: **All**, **Unread**, dan **Read**.
   - Skeleton loading state saat data sedang dimuat (Phase 10 compliant).
   - Empty state informatif jika tidak ada notifikasi.
   - Navigasi instan ke entity terkait saat kartu notifikasi diklik.

---

## 8. Test Suite & Validation Results

Pengujian otomatis dijalankan melalui `scripts/test-notification-system.ts`:

```text
================================================================================
SYNPLAN — PHASE 13: NOTIFICATION SYSTEM TEST SUITE
================================================================================
--- 1. Task Assigned Direct Notification ---
  [PASS] Task assigned notification recipient matches assignee (User B)
  [PASS] Notification has valid deep link for TaskDetailDrawer
--- 2. Unassigned Task Evaluation ---
  [PASS] Unassigned task does NOT generate direct personal notification to users
--- 3. Team Member Added Notification ---
  [PASS] Team member invitation generates typed TEAM_MEMBER_ADDED notification
--- 4. User Isolation & RBAC Scoping ---
  [PASS] User A receives 0 notifications designated for User B
  [PASS] User B receives exactly their 2 authorized notifications
--- 5. Workspace Isolation ---
  [PASS] Workspace Beta is isolated and receives 0 notifications from Workspace Alpha
--- 6. Store Insertion & Realtime Unread Count ---
  [PASS] Unread count correctly evaluates to 2 when 2 unread notifications are added
  [PASS] Notification list contains 2 items
--- 7. Mark as Read ---
  [PASS] Notification notif_task_01 marked as read = true
  [PASS] Unread count decremented from 2 to 1
--- 8. Mark All as Read ---
  [PASS] Mark all as read resets unreadCount to 0
  [PASS] All notification records have read = true
--- 9. Duplicate Event Protection ---
  [PASS] Store prevents duplicate notification entries with identical ID
--- 10. Realtime Event Delivery Structure ---
  [PASS] Event type matches NOTIFICATION_CREATED protocol
  [PASS] Payload preserves complete notification metadata
--- 11. Entity Routing & Deep Link Mapping ---
  [PASS] All notification types resolve to valid internal routes
--- 12. Multi-Tab Realtime Synchronization ---
  [PASS] Tab 2 initializes with unreadCount = 2
  [PASS] Tab 2 synchronizes mark-read via realtime broadcast without refresh
  [PASS] Tab 2 synchronizes mark-all-read via realtime broadcast without refresh
================================================================================
NOTIFICATION SYSTEM TEST RESULTS: 20/20 TESTS PASSED (100%)
================================================================================
```

---

## 9. Rekomendasi Phase Berikutnya

- **Phase 14**: Integrasi eksternal (Telegram Bot Notifications / Browser Push Notifications) di atas fondasi `notificationService.ts` yang sudah terbangun kokoh.
