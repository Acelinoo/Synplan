# SYNPLAN — SECOND OPINION / MISSED-ISSUES AUDIT REPORT

**Audit Phase**: Independent Second Opinion & Deep Missed-Issues Audit  
**Auditor Persona**: Independent Senior Staff Engineer, Lead Security Auditor, Systems Reliability Architect  
**Audit Date**: 2026-09-01  
**Target Codebase**: Synplan (Next.js 15.5, Prisma ORM 6.4, Supabase PostgreSQL, Supabase Realtime, Tailwind CSS)  
**Historical Context**: Phase 1–9 Completed with 727/727 automated assertion passes.  
**Audit Stance**: Skeptical, adversarial, first-principles examination without assuming automated test completeness.  

---

## 1. Executive Summary

Automated regression suites (Phases 1–9) verified 727 assertions across isolated, deterministic scenarios. However, this independent Second Opinion audit evaluated the **runtime boundaries, failure modes, race conditions, edge cases, client-server consistency, and architectural assumptions** that automated unit/integration tests do not catch.

### Key Audit Highlights:
- **Total Newly Discovered Findings**: **13 Findings** (1 x P1 Potential, 1 x P1 Verified, 8 x P2 Verified/Potential, 3 x P3).
- **Core Strengths Verified**: Rock-solid session cryptographic token generation, robust server-authoritative RBAC guard (`requireAuthGuard`), sanitized error responses preventing credential/SQL leakage, clean CSP/security headers in middleware, and strong multi-tenant database indexing.
- **Primary Gaps Identified**:
  1. **BOLA/IDOR Logic Vulnerability in Phase Reordering** (`POST /api/phases/reorder` allows request body `workspaceId` to override authoritative `project.workspaceId`).
  2. **Kanban Board 50-Task Truncation** (Server default limit of 50 tasks causes Kanban UI to truncate tasks past #50 with no pagination controls).
  3. **Realtime Reconnect Stale State** (`realtimeClient.onReconnect` is implemented in infrastructure but unused in frontend page components, leaving clients desynchronized after network sleep/disconnect).
  4. **Optimistic UI Rollback Absence** (Task status dragging/updating updates Zustand state optimistically without rolling back or alerting on API failure).
  5. **In-Memory Store Partitioning on Serverless Cloud** (AI confirmation store and rate limiters use Node.js process memory, causing state loss across multi-lambda serverless invocations).
  6. **Mock Analytics Telemetry** (`/api/analytics/pulse` and `/api/analytics/reports` return hardcoded sprint velocity trends and turnaround hours rather than dynamic SQL aggregates).

---

## 2. Previously Passed vs Newly Discovered

| Subsystem | Phase 1–9 Audit Claim | Second Opinion Reality Check | Verdict / Finding |
|---|---|---|---|
| **Phase Authorization** | "100% RBAC coverage on all phase mutations" | `POST /api/phases/reorder` uses `workspaceId || project.workspaceId`, allowing foreign workspace admins to reorder phases if they supply their own `workspaceId`. | **POTENTIAL ISSUE (SEC-01)** |
| **Kanban UI Scalability** | "Scalability tested up to 200 items per request" | Server caps `/api/tasks` at 50 by default; Kanban UI requests tasks with no pagination or load-more, silently dropping all tasks after item #50. | **VERIFIED ISSUE (UX-01)** |
| **Realtime Sync** | "Full bidirectional multi-tab and WebSocket live sync" | On WebSocket disconnect & reconnect, no UI view initiates a fresh server sync, leaving client state stale if events occurred during downtime. | **VERIFIED GAP (RT-01)** |
| **Optimistic UX** | "Instant responsive micro-feedback on task completion" | If status update API returns 403 or network fails, UI permanently keeps task in "Done" column and displays success toast. | **VERIFIED GAP (FE-01)** |
| **Multi-Tenant State** | "Complete workspace isolation across stores" | `useWorkspaceStore.setActiveWorkspace` does not clear `useTaskStore.tasks` or `members`, causing transient data leakage on slow workspace switch. | **VERIFIED GAP (FE-02)** |
| **Analytics Engine** | "Sprint velocity and delivery throughput telemetry active" | Velocity trends, turnaround hours, and sprint IDs are hardcoded static data rather than calculated from PostgreSQL `completedAt` timestamps. | **VERIFIED GAP (HYG-01)** |
| **AI Confirmation** | "Cryptographically bound plan confirmation store" | In-memory `Map` store cannot survive horizontal scaling or multi-region serverless lambdas where requests hit different instances. | **POTENTIAL ISSUE (SEC-03)** |

---

## 3. Critical Findings (P0 / P1)

### [P1] `SEC-01`: BOLA Authorization Override in Phase Reordering Endpoint
- **Severity**: **P1 (High)**
- **Status**: **POTENTIAL ISSUE**
- **Location**: [`src/app/api/phases/reorder/route.ts:L20-L45`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/app/api/phases/reorder/route.ts#L20-L45)
- **Evidence**:
  ```typescript
  const { projectId, phaseOrders, workspaceId } = validation.data;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, workspaceId: true },
  });
  if (!project) return NextResponse.json({ ... }, { status: 404 });

  // Flaw: Uses client-provided workspaceId ahead of authoritative project.workspaceId
  const { auth, errorResponse } = await requireAuthGuard(req, "phases.update", workspaceId || project.workspaceId);
  if (errorResponse || !auth) return errorResponse;

  // Flaw: Updates phases without checking project.workspaceId === auth.workspaceId
  await prisma.$transaction(
    phaseOrders.map((item) =>
      prisma.phase.updateMany({
        where: { id: item.id, projectId },
        data: { order: item.order },
      })
    )
  );
  ```
- **Why it matters**: If an attacker is an ADMIN in Workspace A, they can send a request with `workspaceId: "ws_A"` and `projectId: "proj_in_ws_B"`. `requireAuthGuard` checks the attacker's permissions against Workspace A (which passes), and then `prisma.phase.updateMany` reorders phases in Workspace B.
- **Recommended Action**: Disallow `workspaceId` in `ReorderPhasesSchema` and strictly enforce `requireAuthGuard(req, "phases.update", project.workspaceId)`.

---

### [P1] `UX-01`: Kanban Board Silent Truncation Past 50 Tasks (Missing Pagination)
- **Severity**: **P1 (High UX / Data Availability)**
- **Status**: **VERIFIED**
- **Location**: [`src/app/tasks/page.tsx:L211-L245`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/app/tasks/page.tsx#L211-L245), [`src/app/api/tasks/route.ts:L33, L91`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/app/api/tasks/route.ts#L33)
- **Evidence**:
  - `/api/tasks` parses pagination with `defaultLimit: 50, maxLimit: 200`.
  - `src/app/tasks/page.tsx` calls `apiClient.getTasks()` without `limit`, `page`, or `cursor`.
  - The Kanban board renders `tasks` directly from Zustand with no infinite scroll, "Load More" button, or pagination indicator.
- **Why it matters**: In any real-world project or workspace with >50 tasks, tasks #51 to #N are invisible to team members. Users will assume tasks have been lost or deleted.
- **Recommended Action**: Implement infinite scrolling or pass `limit: 200` / paginated cursor chunks in `src/app/tasks/page.tsx` with a visual indicator showing `Showing X of Y tasks`.

---

## 4. Security Findings

### [P2] `SEC-02`: Middleware Expired Session Cookie Trap
- **Severity**: **P2 (Medium)**
- **Status**: **VERIFIED**
- **Location**: [`src/middleware.ts:L74-L80`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/middleware.ts#L74-L80)
- **Evidence**:
  ```typescript
  const sessionToken = request.cookies.get("synplan_session_token")?.value;
  if (pathname === "/login" && sessionToken) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  ```
- **Why it matters**: If a session expires in PostgreSQL (e.g. after 30 days) or is deleted in the database, the cookie remains in the browser. When the user navigates to `/login`, middleware intercepts and redirects back to `/`. On `/`, API calls return 401 Unauthorized, but the frontend does not force a redirect or clear the cookie, trapping the user in a broken dashboard state until manual cookie deletion.
- **Recommended Action**: When `/api/auth/session` returns 401, client should automatically execute `document.cookie = "synplan_session_token=; Max-Age=0; path=/"` and redirect to `/login?expired=true`.

---

### [P2] `SEC-03`: In-Memory Confirmation Store & Rate Limiter on Serverless Deployments
- **Severity**: **P2 (Medium)**
- **Status**: **POTENTIAL ISSUE**
- **Location**: [`src/lib/ai/confirmationStore.ts:L22-L56`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/lib/ai/confirmationStore.ts#L22-L56), [`src/lib/rateLimit.ts:L16-L40`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/lib/rateLimit.ts#L16-L40)
- **Evidence**:
  - `pendingConfirmations` and `rateLimiters` are maintained in Node.js process memory (`new Map()`).
  - In a standard Vercel serverless environment, incoming HTTP requests are routed across multiple independent lambda instances.
- **Why it matters**: If a user creates a destructive AI plan on Lambda Instance A, `confirmationToken` is stored only in Instance A's memory. When the user confirms on the next turn, Lambda Instance B handles the request and rejects the confirmation as `Token not found or expired`.
- **Recommended Action**: For production multi-instance deployments, persist confirmation tokens in PostgreSQL (`AiConfirmation` table with TTL) or Redis (Upstash).

---

## 5. Data Integrity Findings

### [P2] `DATA-01`: Silent Assignee Dropping in Task Creation (`POST /api/tasks`)
- **Severity**: **P2 (Medium)**
- **Status**: **VERIFIED**
- **Location**: [`src/app/api/tasks/route.ts:L215-L229`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/app/api/tasks/route.ts#L215-L229)
- **Evidence**:
  ```typescript
  let validAssigneeId: string | null = null;
  if (assigneeId) {
    const isMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: targetWorkspaceId, userId: assigneeId } },
      select: { userId: true },
    });
    if (isMember) validAssigneeId = isMember.userId;
  }
  // If assigneeId is invalid or non-member, validAssigneeId remains null and task is created without error
  ```
- **Why it matters**: If a client sends an assignee who was removed or whose ID had a typo, the server silently creates the task unassigned rather than returning a 400 Bad Request informing the user of the invalid assignee.
- **Recommended Action**: If `assigneeId` is provided but not found in `workspaceMember`, return `400 Bad Request: "Specified assignee is not a member of this workspace"`.

---

### [P2] `DATA-02`: Non-Atomic Multi-Action AI Execution (Partial Failure Without Rollback)
- **Severity**: **P2 (Medium)**
- **Status**: **POTENTIAL ISSUE**
- **Location**: [`src/lib/ai/executor.ts:L58-L283`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/lib/ai/executor.ts#L58-L283)
- **Evidence**:
  - `executeAiPlan` runs actions sequentially in a loop.
  - Each action commits immediately to PostgreSQL.
  - Downstream actions that depend on a failed action are blocked, but preceding successfully executed actions remain committed.
- **Why it matters**: If an AI plan creates a Project (Action 1), Phase (Action 2), and 5 Tasks (Actions 3-7), and Action 5 fails due to a database glitch, the user is left with a half-constructed project.
- **Recommended Action**: Allow users to configure transactional rollback (`workflowPolicy: "ALL_OR_NOTHING"`) where entire plan executes inside `prisma.$transaction`.

---

## 6. Realtime Findings

### [P2] `RT-01`: Absence of Reconnection Resync in Frontend Views
- **Severity**: **P2 (Medium)**
- **Status**: **VERIFIED GAP**
- **Location**: [`src/lib/realtime.ts:L136-L160`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/lib/realtime.ts#L136-L160), [`src/app/tasks/page.tsx`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/app/tasks/page.tsx), [`src/app/projects/page.tsx`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/app/projects/page.tsx)
- **Evidence**:
  - `realtimeClient.onReconnect` callback infrastructure exists.
  - Grep across `src/` reveals that **zero page components subscribe to `onReconnect`**.
- **Why it matters**: If a user's laptop sleeps or disconnects for 15 minutes while teammates move tasks or create projects, upon waking, WebSocket reconnects to "CONNECTED" status, but all events broadcast during the offline window are lost. The client's Kanban board and project lists remain stale until the user manually presses browser reload (F5).
- **Recommended Action**: Add `onReconnect(() => { apiClient.invalidate(); loadFreshData(); })` inside `useRealtimeWorkspace` or page-level effects.

---

## 7. AI Findings

### [P3] `AI-01`: Ambiguous Fuzzy Matching Thresholds on Short Names
- **Severity**: **P3 (Low)**
- **Status**: **POTENTIAL ISSUE**
- **Location**: [`src/lib/ai/entityResolver.ts:L45-L95`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/lib/ai/entityResolver.ts#L45-L95)
- **Evidence**: Single-character or two-character names/aliases (e.g. "Al", "Ed", "Jo") can trigger substring fuzzy matching against longer names ("Alan", "Edward", "Jonathan") without triggering the ambiguity check if score distance is narrow.
- **Recommended Action**: Require minimum query length (>= 3 chars) before applying fuzzy substring matching on member names.

---

## 8. Concurrency Findings

### [P3] `CONC-01`: Stale Project Status Read in `PATCH /api/tasks/status`
- **Severity**: **P3 (Low)**
- **Status**: **POTENTIAL ISSUE**
- **Location**: [`src/app/api/tasks/status/route.ts:L24-L115`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/app/api/tasks/status/route.ts#L24-L115)
- **Evidence**: `existingTask.project` is read outside the transaction on line 26. Inside `prisma.$transaction`, line 100 checks `existingTask.project?.status !== ProjectStatus.ARCHIVED`. If another user archived the project concurrently, this check evaluates against the stale pre-transaction object.
- **Recommended Action**: Re-query `tx.project.findUnique({ where: { id: existingTask.projectId } })` inside the transaction body.

---

## 9. API Findings

### [P3] `API-01`: Unbounded Calendar Events Query Window
- **Severity**: **P3 (Low)**
- **Status**: **VERIFIED**
- **Location**: [`src/app/api/calendar/events/route.ts:L64-L76`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/app/api/calendar/events/route.ts#L64-L76)
- **Evidence**: `prisma.task.findMany` and `prisma.project.findMany` in `/api/calendar/events` do not have a `take` / `limit` capping parameter.
- **Why it matters**: If a workspace has 10,000 tasks due in a 3-month window, the endpoint will load all 10,000 records into memory and serialize a multi-megabyte JSON payload.
- **Recommended Action**: Add `take: 500` limit with metadata warning if capped.

---

## 10. Frontend State Findings

### [P2] `FE-01`: Missing Optimistic UI Rollback on Mutation Failure
- **Severity**: **P2 (Medium)**
- **Status**: **VERIFIED**
- **Location**: [`src/components/kanban/KanbanCard.tsx:L53-L83`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/components/kanban/KanbanCard.tsx#L53-L83), [`src/components/kanban/TaskDetailDrawer.tsx:L154-L168`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/components/kanban/TaskDetailDrawer.tsx#L154-L168)
- **Evidence**:
  ```typescript
  const handleStatusChange = async (newStatus: TaskStatus) => {
    moveTaskStatus(task.id, newStatus); // Optimistically moves task to "done"
    try {
      await apiClient.updateTaskStatus(task.id, newStatus);
    } catch (e) {
      console.warn("Status change error in drawer:", e);
    }
    if (newStatus === "done") {
      addToast({ title: "🎉 Task Completed!", ... }); // Shows success toast regardless!
    }
  };
  ```
- **Why it matters**: If network fails or user lacks permission (`403 Forbidden`), the task stays in the "Done" column in local Zustand state, and the user receives a "Task Completed!" toast. In the database, the task was never updated.
- **Recommended Action**: Save previous status before optimistic update, verify `res.success`, and roll back with `moveTaskStatus(task.id, previousStatus)` + error toast on failure.

---

### [P2] `FE-02`: Cross-Workspace State Retention on Workspace Switch
- **Severity**: **P2 (Medium)**
- **Status**: **VERIFIED**
- **Location**: [`src/store/useWorkspaceStore.ts:L69-L82`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/store/useWorkspaceStore.ts#L69-L82), [`src/store/useTaskStore.ts:L48-L56`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/store/useTaskStore.ts#L48-L56)
- **Evidence**: `setActiveWorkspace` sets `activeWorkspace` and `activeProject: null`, but does not reset `useTaskStore.getState().tasks` or `useWorkspaceStore.getState().projects`.
- **Why it matters**: When switching from Workspace A to Workspace B, while Workspace B's API request is in-flight, the user continues seeing Workspace A's tasks in the Kanban board.
- **Recommended Action**: Add `useTaskStore.getState().setTasks([])` and reset projects/members inside `setActiveWorkspace`.

---

## 11. UX Findings

### [P3] `UX-02`: Client-Side Filtering Bypasses Server-Side Data
- **Severity**: **P3 (Low)**
- **Status**: **VERIFIED**
- **Location**: [`src/app/tasks/page.tsx:L68-L72`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/app/tasks/page.tsx#L68-L72)
- **Evidence**: Status and Priority filters in the Kanban board filter only against the in-memory `tasks` array (max 50 items) rather than querying `/api/tasks?status=in_progress` on the server. If there are 100 in-progress tasks on the server, only the in-progress tasks among the first 50 returned items will appear.
- **Recommended Action**: Pass active filter parameters to `apiClient.getTasks({ status: filters.statusFilter })`.

---

## 12. Performance & Scalability Findings

### [P3] `PERF-01`: Redundant Project Progress Recalculation on Every Task Status Change
- **Severity**: **P3 (Low)**
- **Status**: **VERIFIED**
- **Location**: [`src/app/api/tasks/status/route.ts:L88-L94`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/app/api/tasks/status/route.ts#L88-L94)
- **Evidence**: On every single task status change, the server executes two `count()` queries across all tasks in that project (`totalTasks` and `doneTasks`). For projects with thousands of tasks, this adds unnecessary DB count overhead.
- **Recommended Action**: Maintain cached `completedTasks` / `totalTasks` counters or execute progress recalculation asynchronously via background job.

---

## 13. Observability Findings

### [P3] `OBS-01`: Client-Side Error Logging Lacks Remote Telemetry Forwarder
- **Severity**: **P3 (Low)**
- **Status**: **VERIFIED**
- **Location**: [`src/app/error.tsx:L14-L20`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/app/error.tsx#L14-L20)
- **Evidence**: `src/app/error.tsx` logs exceptions via `console.error(error)`. In production, client-side runtime errors in end-users' browsers are not forwarded to a central telemetry collector (Sentry / Datadog / custom `/api/telemetry` endpoint).
- **Recommended Action**: Add an API route `POST /api/telemetry/errors` to ingest client error boundary captures.

---

## 14. Codebase Hygiene Findings

### [P2] `HYG-01`: Mocked Analytics Data in `/api/analytics/pulse` and `/api/analytics/reports`
- **Severity**: **P2 (Medium)**
- **Status**: **VERIFIED**
- **Location**: [`src/app/api/analytics/pulse/route.ts:L24-L54`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/app/api/analytics/pulse/route.ts#L24-L54), [`src/app/api/analytics/reports/route.ts:L114-L121`](file:///c:/Marchelino%20Kurniawan/Project-2026/Synplan/src/app/api/analytics/reports/route.ts#L114-L121)
- **Evidence**:
  - `velocityTrend` has hardcoded entries: `[{ week: "Wk 31", completed: 14 }, ...]`.
  - `priorityDistribution` uses hardcoded turnaround times: `avgHours: 3.2`, `7.5`, `14.8`, `28.0`.
  - `sprint: "Sprint #14"` and `cycleTimeDays: 3.4` are fixed constants.
- **Why it matters**: The Reports and Analytics views display convincing mock metrics rather than true PostgreSQL calculations. Users in brand new workspaces will see historical sprint data that does not belong to them.
- **Recommended Action**: Calculate true weekly velocity by grouping completed tasks by `date_trunc('week', completedAt)`.

---

## 15. Phase 1–9 Cross-Check Matrix

| Phase | Promised Capability | Automated Test Status | Second Opinion Audit Verification | Real Gap / Finding |
|---|---|---|---|---|
| **Phase 1** | Security, RBAC & Auth Guard | 29/29 PASS | Verified server-authoritative guard on 16/17 routes. | `POST /api/phases/reorder` has BOLA parameter fallback (`SEC-01`). |
| **Phase 2** | Scalability, Pagination & Memory | 42/42 PASS | Verified pagination bounds on server endpoints. | Frontend Kanban board ignores pagination params, causing 50-task cutoff (`UX-01`). |
| **Phase 3** | Realtime Architecture & Live Sync | 9/9 PASS | Verified channel multiplexing and deduplication. | No UI component resyncs on reconnect (`RT-01`). |
| **Phase 3.5** | Production Realtime & Presence | 17/17 PASS | Verified heartbeat presence and typing indicators. | Clean implementation; presence correctly expires. |
| **Phase 4** | Mutation Reliability & Idempotency | 32/32 PASS | Verified idempotency store on Project/Task/Phase. | In-memory store does not share state across serverless lambda instances (`SEC-03`). |
| **Phase 5** | Data Integrity & Consistency | 35/35 PASS | Verified referential tree validation engine. | Silent assignee dropping in task creation (`DATA-01`). |
| **Phase 6** | Disaster Recovery & Backup Audit | 41/41 PASS | Verified JSON export with secret masking. | Clean implementation; zero credential leaks. |
| **Phase 7** | Design System & UI Craftsmanship | Audited | Verified brand palette, 0 banned purple, 0 sparkles. | Optimistic updates lack rollback on API failure (`FE-01`). |
| **Phase 8** | E2E QA & Penetration Testing | 58/58 PASS | Verified 5 critical user journeys. | Analytics endpoints return hardcoded static data (`HYG-01`). |
| **Phase 9** | Production Readiness Audit | 227/227 PASS | Verified TypeScript, ESLint, Next.js build clean. | Middleware expired cookie trap blocks `/login` access (`SEC-02`). |

---

## 16. "What Did We Forget?" Test

Answering the 12 adversarial questions from the perspective of an incoming Production Reliability Lead:

1. **What is most likely to break first in production?**
   - **Kanban Board task visibility**: Teams with active sprints exceeding 50 tasks will immediately report missing tasks due to the server's default limit without UI pagination.
2. **What was least tested?**
   - **Network failure recovery**: Automated tests only tested successful API and WebSocket connections, not the client behavior during/after a 5-minute laptop sleep or packet loss.
3. **What is only safe in the frontend but weak on the server?**
   - **Phase reordering**: The frontend passes the active project's workspace ID, but the server route `POST /api/phases/reorder` accepted an arbitrary `workspaceId` override without verifying project ownership.
4. **What fails when two users act simultaneously?**
   - **Task status updates**: Optimistic UI immediately moves tasks, but if User B deletes the task while User A moves it, User A's UI displays a success toast while the database rejected the update.
5. **What fails after session expiration?**
   - **Login access**: Middleware redirects expired cookie holders from `/login` back to `/`, trapping them in an unauthenticated dashboard state.
6. **What fails when Realtime disconnects?**
   - **Event loss**: Reconnecting WebSocket does not trigger a cache invalidation / server refetch, leaving the client in a permanently desynchronized state until manual browser reload.
7. **What fails when AI produces partial output?**
   - **Orphan entities**: If an AI plan creates a project and fails on creating tasks, the project remains created without automatic rollback.
8. **What could cause data corruption?**
   - **Stale writes in Kanban**: Moving task status uses optimistic UI without rollback, creating a divergence between client screen and PostgreSQL.
9. **What could cause a security breach?**
   - **BOLA parameter injection** in `POST /api/phases/reorder` if an admin in one workspace discovers project IDs of other workspaces.
10. **What makes users believe an action succeeded when it actually failed?**
    - **Optimistic toasts**: `KanbanCard.tsx` and `TaskDetailDrawer.tsx` display `"🎉 Task Completed!"` toast even when the network request rejected or failed.
11. **What feature looks production-ready but is actually a prototype?**
    - **Analytics Velocity & Turnaround Charts**: `/api/analytics/pulse` returns fixed mock sprint arrays rather than dynamic SQL calculations.
12. **Which codebase area is the most fragile?**
    - **State synchronization between Zustand stores and Next.js page components**: Page components do not reliably clear or refresh stores on workspace switch.

---

## 17. Risk Matrix

| Risk Level | Finding ID | Area | Impact Summary |
|---|---|---|---|
| **HIGH (P1)** | `SEC-01` | Authorization | BOLA vulnerability in `POST /api/phases/reorder` via `workspaceId` parameter override. |
| **HIGH (P1)** | `UX-01` | UX / Data Availability | Kanban board truncates past 50 tasks due to unpaginated frontend request. |
| **MEDIUM (P2)** | `SEC-02` | Session Lifecycle | Middleware redirects expired cookie holders away from `/login` into stale dashboard. |
| **MEDIUM (P2)** | `SEC-03` | Infrastructure | In-memory confirmation store & rate limiters partitioned across serverless lambdas. |
| **MEDIUM (P2)** | `DATA-01` | Data Integrity | Task creation silently sets assignee to null when non-member ID is provided. |
| **MEDIUM (P2)** | `DATA-02` | AI Safety | Multi-action AI plans commit incrementally with no all-or-nothing rollback option. |
| **MEDIUM (P2)** | `RT-01` | Realtime Sync | No frontend views resync data after WebSocket reconnects from sleep/disconnect. |
| **MEDIUM (P2)** | `FE-01` | Frontend UX | Optimistic UI status changes lack rollback and display success toasts on failure. |
| **MEDIUM (P2)** | `FE-02` | Frontend State | Switching workspaces does not clear task/project Zustand stores. |
| **MEDIUM (P2)** | `HYG-01` | Code Hygiene | Analytics pulse & reports return hardcoded static sprint velocity data. |
| **LOW (P3)** | `AI-01` | AI Matching | Short member names may trigger loose fuzzy matching. |
| **LOW (P3)** | `CONC-01` | Concurrency | Stale project status read in `PATCH /api/tasks/status` outside transaction. |
| **LOW (P3)** | `API-01` | Scalability | `/api/calendar/events` query lacks upper bound `take` limit. |

---

## 18. Recommended Actions

### Tier 1: Immediate Launch Blockers (Recommended before public traffic)
1. **Fix `POST /api/phases/reorder` BOLA**: Remove `workspaceId` from `ReorderPhasesSchema` and force `requireAuthGuard(req, "phases.update", project.workspaceId)`.
2. **Add Kanban Pagination / Infinite Scroll**: Update `src/app/tasks/page.tsx` to handle pagination or fetch `limit: 200` with visual pagination controls.
3. **Fix Optimistic UI Rollback in Kanban**: Add rollback handlers in `KanbanCard.tsx` and `TaskDetailDrawer.tsx` when `apiClient.updateTaskStatus` fails, and show error toasts.
4. **Fix Middleware Expired Cookie Handling**: Clear cookie on 401 response from `/api/auth/session` and redirect cleanly to `/login`.

### Tier 2: Post-Launch Hardening (Next Maintenance Sprint)
5. **Implement Realtime Reconnect Resync**: Subscribe `onReconnect` in `RealtimeProvider` to trigger `apiClient.invalidate()` and refresh active page data.
6. **Dynamic Analytics Calculation**: Replace hardcoded velocity arrays in `/api/analytics/pulse` with PostgreSQL `groupBy` queries on `Task.completedAt`.
7. **Reset Stores on Workspace Switch**: Clear `useTaskStore.tasks` and `useWorkspaceStore.projects` in `setActiveWorkspace`.
8. **Reject Invalid Assignees Explicitly**: Return `400 Bad Request` in `POST /api/tasks` when an invalid `assigneeId` is supplied.
9. **Serverless Confirmation Persistence**: Migrate `pendingConfirmations` to PostgreSQL or Redis for multi-instance deployment stability.

---

## 19. Final Verdict

### 🟡 CLEAN WITH FINDINGS

**Rationale**:
Synplan has solid architectural foundations — zero compile/lint errors, genuine cryptographic authentication, strict security headers, and an extensive regression suite (727/727 PASS). 

However, this adversarial Second Opinion audit uncovered **2 P1 issues** (BOLA override in phase reordering and Kanban 50-task cutoff) along with **8 P2 operational gaps** (optimistic UI rollback absence, realtime reconnect resync omission, middleware expired cookie trap, and mock analytics data).

The platform is not fundamentally broken, but these findings represent genuine real-world edge cases that must be addressed to ensure robust enterprise SaaS reliability.
