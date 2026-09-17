# SYNPLAN — FULL PRODUCT, SYSTEM, UX & ARCHITECTURE AUDIT
**Forensic Product, System, UX & Architecture Assessment Prior to 100% Rebuild**  
**Repository:** `Acelinoo/Synplan` | **Production URL:** [https://synplan.vercel.app/](https://synplan.vercel.app/)  
**Audit Date:** September 17, 2026  
**Auditor Persona:** Senior Staff Systems Architect & Lead Security Auditor  
**Audit Scope:** Full Codebase, Database Schema, Authentication, UI/UX, AI Engine, Realtime Infrastructure, & Operational Logic  
**Mode:** AUDIT ONLY (Zero Code Modifications)

---

## 1. Executive Summary

Synplan was engineered through 15 sequential development iterations, claiming "Production-Grade Maturity" and "315/315 Automated Tests Passed" in its internal release notes (`SYNPLAN_FINAL_RELEASE_VALIDATION.md`). However, a first-principles forensic audit of the actual codebase, database schema, and runtime deployment reveals that **Synplan is a fragile prototype with significant architectural debt, cosmetic simulations, and conflicting design systems masked by test harnesses.**

### Key Forensic Findings:
1. **Critical Serverless State Hazard:** Core AI state stores (`src/lib/ai/confirmationStore.ts`, `src/lib/ai/conversationStore.ts`, `src/lib/ai/receiptStore.ts`, and `src/lib/rateLimit.ts`) store state in Node.js process memory (`new Map()`). On Vercel's multi-container serverless architecture, incoming requests hit different ephemeral Lambda instances. Confirmation tokens and conversation context are dropped unpredictably between user clicks.
2. **Cosmetic Simulation & Hardcoded Mock Data:** 
   - Pulse and Reports analytics (`src/app/api/analytics/pulse/route.ts` and `src/app/api/analytics/reports/route.ts`) return static mock velocity trends, turnaround hours, and growth metrics rather than computing them from historical timestamps.
   - The date switcher on `src/app/reports/page.tsx` uses a hardcoded client-side switch statement for Q3 and YTD metrics.
   - Default due dates in `UpcomingDeadlinesWidget.tsx` and `TaskModal.tsx` inject a static string `"2026-09-15"`.
   - The RBAC settings table (`RbacMatrixTable.tsx`) is an uneditable static table masquerading as configuration.
3. **Database Schema & ORM Desynchronization:**
   - Denormalized counter columns on the `Project` model (`prisma/schema.prisma`: `progress`, `totalTasks`, `completedTasks`) are never updated when tasks are created or deleted (`src/app/api/tasks/route.ts`). The API computes them on the fly, rendering the database columns completely desynchronized.
   - `ProjectMember` exists in schema, but project-level permissions are **never evaluated** in `src/lib/authGuard.ts`. Any workspace member has blanket read/write access to all workspace projects.
   - `prisma/migrations/0_init/migration.sql` does not include `Phase`, `Account`, `Session`, or `TaskComment`, proving schema was pushed with unversioned `prisma db push`.
4. **Segregated AI Experience:** Rather than empowering workflows contextually, AI is locked inside a 1,067-line slide-over drawer (`AiAssistantDrawer.tsx`). It serializes an arbitrary slice of recent tasks (capped at 40 in `src/lib/ai/promptBuilder.ts`), blinding the LLM to existing workspace work.
5. **Missing Onboarding & Severe Identity Trap:** There is no landing page, no guest mode, and no onboarding. Direct visitors are immediately bounced to `/login`. If an invited user is removed from their only workspace, `src/lib/authGuard.ts` permanently locks them out with an unrecoverable `403 Forbidden` on every API route.
6. **Design System Schism:** `design.md` mandates an "Indigo + Neutral + shadcn/ui" design system. The code actually uses an "Ocean Blue / Deep Navy" palette (`src/app/globals.css`), while `shadcn/ui` was never installed (only 6 hand-coded primitives exist in `src/components/ui/`).

**Verdict:** A **100% Ground-Up Product Rebuild** is completely justified. Refactoring the current codebase would preserve deep conceptual inconsistencies, data integrity flaws, and architectural anti-patterns.

---

## 2. Current Product Definition

### Current Product Concept
Synplan currently positions itself as an "Autonomous Project Management & Team Collaboration Platform." In reality, it functions as a **multi-tenant Kanban task board paired with an isolated natural-language command bot.**

```
┌─────────────────────────────────────────────────────────────┐
│                      CURRENT SYNPLAN                        │
├──────────────────────────────┬──────────────────────────────┤
│    TRADITIONAL PM (90%)      │      AI ASSISTANT (10%)      │
│  • Workspace CRUD            │  • Slide-out Chat Drawer     │
│  • Project List & Detail     │  • Natural Language CRUD     │
│  • 4-Column Kanban Board     │  • Heuristic Regex Fallback  │
│  • Workload Visualizer       │  • Ephemeral Confirmation    │
│  • Basic Notifications       │  • In-Memory Chat History    │
└──────────────────────────────┴──────────────────────────────┘
```

### Concept Breakdown
- **Workspace:** Multi-tenant container identified by a slug and owned by a single `User`. Holds projects, tasks, members, and notifications.
- **Project:** Container for tasks, grouped optionally under sequential `Phase` records. Has a color tag, description, and deadline.
- **Phase:** Sequential milestone stage within a project (e.g., Planning, Development, QA).
- **Task:** Unit of work with `title`, `description`, `status` (`TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`, `BLOCKED`), `priority` (`LOW`, `MEDIUM`, `HIGH`, `URGENT`), single `assigneeId`, optional `dueDate`, and lightweight `Subtask` items.
- **Team:** Workspace members assigned one of 4 RBAC roles: `OWNER`, `ADMIN`, `MEMBER`, `VIEWER`. Member capacity is computed via a fixed formula: `(activeTasks / 5) * 100` (`src/app/api/team/members/route.ts`).
- **AI:** Side-drawer chat interface capable of parsing Indonesian and English text to invoke backend mutations (`CREATE_PROJECT`, `CREATE_TASK`, `ASSIGN_TASK`, etc.) using Gemini or an internal regex heuristic parser.
- **Notification:** Persisted database record displayed in a dropdown bell or full-page inbox, triggered on task assignments, status changes, and member invites.
- **Settings:** A single vertically stacked settings page displaying workspace slug editing, light/dark theme toggles, JSON workspace export, and a static RBAC reference table.

### Core Job To Be Done (JTBD)
> **The current single primary job:** *"Help a software team lead organize project tasks into Kanban stages, view member task counts, and issue batch creation commands via an AI chatbot."*

**JTBD Evaluation:** **UNCLEAR & CONFLICTED.** Synplan cannot decide whether it is:
1. An autonomous AI planner that generates and runs software roadmaps, or
2. A manual ClickUp/Linear clone for day-to-day agile execution.
Because the AI is separated from the UI workflows, users are forced to choose between manually clicking Kanban buttons or opening a chatbot to type out instructions.

---

## 3. Current User Journey

```
[Direct URL /] ──(No Session)──► [Redirect /login]
                                        │
                         ┌──────────────┴──────────────┐
                         ▼                             ▼
                 [Google OAuth]                 [GitHub OAuth]
                         │                             │
                         └──────────────┬──────────────┘
                                        ▼
                           [Validate / Create User]
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             ▼ (Has Workspace)                                     ▼ (Zero Workspaces)
     [Load Active Workspace]                              [Permanent 403 Lockout Trap]
             │
             ▼
      [Dashboard Overview (/)]
             │
   ┌─────────┼─────────────────────────┬────────────────────────┐
   ▼         ▼                         ▼                        ▼
[Projects] [Tasks / Kanban]       [Team & Capacity]      [Reports / Analytics]
   │         │                         │                        │
   │         ├─► [Drawer Task Detail]  ├─► [Invite Modal]       └─► [Export Modal]
   │         └─► [Create Task Modal]   └─► [Role Dropdown]
   ▼
[Project Detail (/projects/:id)]
   ├─► Overview Tab
   ├─► Tasks Tab (Inline List)
   ├─► Phases Tab (Reorder)
   └─► Team Squad Tab
```

### Detailed Persona Audits

#### 1. First-Time User
- **Experience:** Types `synplan.vercel.app`. Immediately redirected to `/login`. There is **no marketing page, no feature overview, no demo mode, and no onboarding explanation.**
- **Friction:** User must authenticate with Google or GitHub blindly without knowing what Synplan is.
- **Post-Login:** Automatically provisioned with `[Name]'s Workspace` containing empty lists. No setup wizard, no sample project prompt, no tour.

#### 2. Returning User
- **Experience:** Lands on `/`. Sees 4 KPI cards and recent project list.
- **Friction:** If session cookie expires, user gets redirected to `/login?error=session_expired`. If they have multiple workspaces, active workspace selection relies on `localStorage` (`synplan_active_ws`). If cleared, it silently falls back to their first workspace.

#### 3. Workspace Owner vs Workspace Member vs Viewer
- **Owner/Admin:** Can invite members, reorder phases, and download database backups.
- **Member:** Can create and edit tasks, change task status, and update project metadata.
- **Viewer:** Permitted to view dashboard, projects, tasks, and analytics. **Friction:** Viewer sees "+ New Task" and "Create Project" buttons in various UI locations, which only fail upon form submission when the server returns `403 Forbidden`.

#### 4. Project Creator vs Task Assignee
- **Project Creator:** Can configure phases and description.
- **Task Assignee:** **Major Gap:** There is **no "My Tasks" view or filter.** An assignee cannot open Synplan and see their personal daily agenda. They must visually hunt for their avatar across all project Kanban columns or use the global search box.

#### 5. Broken Edge Cases
- **Orphaned Member Lockout:** If an admin invites `developer@example.com`, a `User` record is created without a personal workspace. When that developer logs in, they only belong to the inviter's workspace. If the admin later removes that developer, their account has zero workspaces. The user is now trapped in a permanent `403 Forbidden` loop on `/api/dashboard/summary` and `/api/tasks`.

---

## 4. Current Information Architecture

### Navigation Topology

```
Synplan AppShell (Persistent Container)
├── TopHeader (Global Sticky Header)
│   ├── Mobile Hamburger Toggle
│   ├── Current Route Title Breadcrumb
│   ├── Realtime Connection Status Badge ("LIVE")
│   ├── GlobalSearch (Ctrl+K Trigger)
│   ├── Active Workspace Dropdown Switcher
│   ├── AI Assistant Trigger (Header Icon)
│   ├── Theme Mode Switcher (Light / Dark)
│   ├── Notification Dropdown Popover
│   └── User Profile Menu (Avatar, Role, Sign Out)
├── Sidebar (Left Navigation - Fixed/Collapsible)
│   ├── Brand Identity (Synplan Logo)
│   ├── Primary Navigation Links
│   │   ├── Dashboard Overview (/)
│   │   ├── Projects (/projects)
│   │   ├── Tasks & Kanban (/tasks)
│   │   ├── Calendar (/calendar)
│   │   ├── Team & Squad (/team)
│   │   ├── Reports & Analytics (/reports)
│   │   └── Settings & Security (/settings)
│   └── User Mini Profile Footer
├── Viewport Content Area (Page Router Outlet)
│   ├── [Current Page Component]
├── Global Overlays & Modals
│   ├── CommandPalette Modal (Ctrl+K)
│   ├── AiAssistantDrawer (Right Slide-over)
│   ├── TaskDetailDrawer (Right Slide-over)
│   ├── TaskModal (Dialog)
│   └── InviteMemberModal (Dialog)
```

### Hierarchy & Routing Critique
1. **No Standalone Task URLs:** The route `/tasks/[id]` **does not exist.** Tasks only exist as state within `src/app/tasks/page.tsx` or query param `?taskId=...`. A user cannot send a clean URL like `/tasks/task-123` to a teammate in Slack.
2. **Dual Task Drawer / Modal Conflict:** Synplan has two distinct UI mechanisms to view/edit tasks: `TaskDetailDrawer.tsx` (view & comments) and `TaskModal.tsx` (edit & create). Clicking "Edit" inside the drawer opens a modal over the drawer, creating layered visual clutter.
3. **Redundant Overview vs Projects:** The Dashboard (`/`) and Projects page (`/projects`) display nearly identical data: project progress bars, member avatars, and task completion counts.
4. **Settings Page Bloat:** Settings is a single 55-line file (`src/app/settings/page.tsx`) that vertically dumps workspace name, theme selector, disaster recovery export, and an RBAC table onto one page without sub-tabs.

---

## 5. Current System Architecture

```
                                  CLIENT TIER (Browser)
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Next.js 15.5 AppShell (Client Components / "use client" on ~90% of UI)                │
│ State Management: Zustand (Workspace, Task, AI, UI, Notification, Calendar Stores)    │
│ Custom Cache: apiClient.ts (In-Memory Map, TTL Caching, In-Flight Deduplication)      │
│ Realtime: Supabase WebSocket Client (Broadcast Listener & Presence Tracker)           │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ HTTPS Fetch / WebSocket
                                            ▼
                           SERVERLESS EDGE TIER (Vercel Lambdas)
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Next.js Route Handlers (/api/*) & Security Middleware                                  │
│ Auth Guard: requireAuthGuard.ts (Cookie / Bearer Session Token Verification)           │
│ Input Validation: Zod Schemas (apiValidator.ts)                                        │
│ Realtime Publisher: realtimeServer.ts (Supabase Broadcast Channel Sender)              │
│                                                                                        │
│ ⚠️ SERVERLESS HAZARD (In-Memory Node.js Map Stores):                                   │
│ • confirmationStore.ts (Pending AI Actions)                                           │
│ • conversationStore.ts (Chat Memory)                                                  │
│ • receiptStore.ts      (Execution Undo History)                                       │
│ • rateLimit.ts         (Sliding Window Limiter)                                       │
└───────────────────────────────┬────────────────────────┬───────────────────────────────┘
                                │                        │
         PostgreSQL Direct &    │                        │ Native REST
         PgBouncer Pooling      │                        │
                                ▼                        ▼
┌────────────────────────────────────────┐  ┌────────────────────────────────────────────┐
│      SUPABASE POSTGRESQL DATABASE      │  │        EXTERNAL AI LLM PROVIDERS           │
│  • Prisma ORM 6.4 Client Engine        │  │  • Google Gemini Generative Language API   │
│  • 12 Relational Tables                │  │    (gemini-3.6-flash / v1beta)             │
│  • Supabase Realtime Broadcast Engine  │  │  • OpenAI Completions Fallback (gpt-4o)    │
└────────────────────────────────────────┘  └────────────────────────────────────────────┘
```

### Architectural Breakdown

#### 1. Client-Side Rendering Overuse
Almost every page (`src/app/page.tsx`, `src/app/tasks/page.tsx`, `src/app/projects/page.tsx`, `src/app/team/page.tsx`, `src/app/reports/page.tsx`, `src/app/calendar/page.tsx`, `src/app/settings/page.tsx`) begins with `"use client"`. React Server Components (RSC) are completely unutilized for initial data fetching, resulting in:
- Empty skeleton flashes on every page load.
- Client-side waterfall requests (`getSession()` -> `getDashboardSummary()` -> `getProjects()` -> `getTasks()`).
- High client bundle size (shipping Framer Motion, Zustand, Lucide, and API logic to the browser).

#### 2. Hand-Rolled API Client & Cache
`src/lib/apiClient.ts` implements an in-memory `Map` cache with custom TTLs and manual cache invalidation strings (`apiClient.invalidate("/api/tasks")`). This duplicates functionality standard in modern tools like TanStack Query (React Query) or SWR, leading to stale cache bugs when mutations omit an invalidation call.

#### 3. Realtime Broadcast Overhead
`src/lib/realtimeServer.ts` creates a Supabase client, connects to a channel, broadcasts an event, and immediately destroys the channel (`await supabase.removeChannel(channel)`) on **every single state-changing API request**. This introduces unnecessary connection setup latency on every mutation.

---

## 6. Database Architecture

### Prisma Schema Models Inspection

```
User (id, email, name, avatarUrl, role)
 ├── Account[] (OAuth Provider Link)
 ├── Session[] (Active Session Tokens)
 ├── Workspace[] (Owned Workspaces)
 ├── WorkspaceMember[] (Workspace Memberships & Roles)
 ├── ProjectMember[] (Project-Level Memberships)
 ├── Task[] (Assigned Tasks)
 ├── TaskComment[] (Authored Comments)
 └── Notification[] (Received Notifications)

Workspace (id, name, slug, ownerId, logoUrl)
 ├── WorkspaceMember[]
 ├── Project[]
 │    ├── Phase[]
 │    │    └── Task[]
 │    ├── ProjectMember[]
 │    └── Task[]
 ├── Task[]
 ├── Notification[]
 └── AuditLog[]

Task (id, workspaceId, projectId, phaseId, assigneeId, title, description, status, priority, dueDate, order, tags)
 ├── Subtask[]
 └── TaskComment[]
```

### Forensic Schema Evaluation

| Model | Schema Strengths | Structural Defects & Integrity Risks |
| :--- | :--- | :--- |
| **`User`** | Unique email index, OAuth account cascade. | Has redundant `role` column (`@default(MEMBER)`). User role is properly a property of `WorkspaceMember`. |
| **`Account`** | Composite unique index `[provider, providerAccountId]`. | Safe OAuth credential storage. |
| **`Session`** | Indexed `sessionToken` and `userId`. | Sessions never cleaned up on expiration unless queried; table will accumulate dead sessions over time. |
| **`Workspace`** | Unique slug index, indexed `ownerId`. | Cascade deletes all projects and tasks on workspace deletion. |
| **`WorkspaceMember`** | Composite unique index `[workspaceId, userId]`. | `workloadScore` integer is stored in DB, but the API recalculates it dynamically, leaving this column stale. |
| **`Project`** | Clean index on `[workspaceId, status]`. | **Critical Flaw:** Columns `totalTasks`, `completedTasks`, and `progress` are dead counter caches that desynchronize immediately. |
| **`ProjectMember`** | Composite unique index `[projectId, userId]`. | **Architectural Ghost:** Model exists in DB, but is never checked in authorization logic. |
| **`Phase`** | Indexed on `[projectId, order]`. | Order is an integer; reordering requires multi-row transactional updates susceptible to race conditions. |
| **`Task`** | Multi-column indexes on workspace, status, assignee, and dueDate. | `tags` uses native PostgreSQL `TEXT[]` array without a relational Tag table. No parent task or dependency model. |
| **`Subtask`** | Cascade delete with Task. | Has only `completed` boolean and `title`; no assignee, no due date. |
| **`TaskComment`** | Cascade delete with Task. | Clean structure, but no mention/formatting support. |
| **`Notification`** | Indexed on `[userId, read]`. | Simple structure, but lacks polymorphic grouping or mute preferences. |
| **`AuditLog`** | Rich metadata JSON fields and actor indexing. | Stored in primary operational database; high-volume logging will bloat PostgreSQL storage. |

---

## 7. Authentication & Authorization Audit

### Authentication Flow
1. **OAuth Providers:** Google and GitHub OAuth 2.0 (`src/lib/auth/oauth.ts`).
2. **Session Storage:** Custom database table `Session` storing random 32-byte hex token (`src/lib/auth/session.ts`).
3. **Cookie Attributes:** `synplan_session_token`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=30 days`.
4. **No Native Password / Magic Link:** If Google or GitHub OAuth credentials are not supplied in `.env`, authentication is completely inoperable.

### Authorization & RBAC Analysis
Authorization is governed by `src/lib/authGuard.ts` and `src/lib/permissions.ts`.

```
╔═════════════════════════════════════════════════════════════════════════╗
║                      PERMISSION BOUNDARY MATRIX                         ║
╠══════════════════╦══════════════╦══════════════╦════════════╦═══════════╣
║ Scope / Action   ║    OWNER     ║    ADMIN     ║   MEMBER   ║  VIEWER   ║
╠══════════════════╬══════════════╬══════════════╬════════════╬═══════════╣
║ workspace.delete ║      ✅      ║      ❌      ║     ❌     ║    ❌     ║
║ members.invite   ║      ✅      ║      ✅      ║     ❌     ║    ❌     ║
║ members.remove   ║  ✅ (all)    ║ ✅ (mem/view)║     ❌     ║    ❌     ║
║ projects.create  ║      ✅      ║      ✅      ║     ✅     ║    ❌     ║
║ projects.delete  ║      ✅      ║      ✅      ║     ❌     ║    ❌     ║
║ tasks.create     ║      ✅      ║      ✅      ║     ✅     ║    ❌     ║
║ tasks.delete     ║      ✅      ║      ✅      ║     ✅     ║    ❌     ║
║ tasks.assign     ║      ✅      ║      ✅      ║     ✅     ║    ❌     ║
║ analytics.view   ║      ✅      ║      ✅      ║     ✅     ║    ✅     ║
║ backup.export    ║      ✅      ║      ✅      ║     ❌     ║    ❌     ║
╚══════════════════╩══════════════╩══════════════╩════════════╩═══════════╝
```

### Critical Authorization Flaws:
1. **Middleware Ignores `/api/*` Routes:** `src/middleware.ts` explicitly skips `/api/` routes (`if (!isPublic && !pathname.startsWith("/api/"))`). API authentication relies entirely on individual route handlers remembering to call `requireAuthGuard()`.
2. **Project-Level Role Void:** Synplan has a `ProjectMember` table, but **no route checks project membership**. Any member in Workspace A can delete tasks and edit phases in any project in Workspace A, even if they were never assigned to that project squad.
3. **Broad Member Delete Rights:** Regular `MEMBER` users possess `tasks.delete` permission (`src/lib/permissions.ts`), allowing any squad member to permanently purge tasks created by team leads.
4. **Test Header Bypass Risk:** `src/lib/authGuard.ts` accepts `x-synplan-user-id` to authenticate any user without a session token if `NODE_ENV === "test"`. While guarded by env checks, having identity impersonation code inside the core auth guard is an unnecessary production risk.

---

## 8. Project & Task System Logic

### Project Lifecycle
- **Database Enum:** `PLANNING`, `ACTIVE`, `ON_HOLD`, `COMPLETED`, `ARCHIVED`.
- **Frontend Type:** `"planning" | "active" | "on_hold" | "completed" | "archived"`.
- **Automatic Transitions:** In `src/app/api/tasks/status/route.ts`, when all project tasks reach `DONE`, project status automatically switches to `COMPLETED`. If a task is moved back to `TODO`, project status flips back to `ACTIVE`.

### Task Lifecycle & Statuses
- **Allowed States:** `TODO` $\to$ `IN_PROGRESS` $\to$ `IN_REVIEW` $\to$ `DONE` (and `BLOCKED` in database).
- **The BLOCKED Status Anomaly:** The database schema has `BLOCKED`, but the frontend `src/types/index.ts` defines `TaskStatus` as `"todo" | "in_progress" | "in_review" | "done"`. When the frontend loads a `BLOCKED` task from the API, it explicitly coerces it:
  ```typescript
  status: (task.status?.toLowerCase() === "blocked" ? "in_review" : task.status?.toLowerCase() || "todo") as TaskStatus
  ```
  **Result:** Blocked tasks are visually disguised as "In Review"! Users cannot see what is actually blocked on the Kanban board.

### Milestone Trigger Mathematics Flaw
In `src/app/api/tasks/status/route.ts`:
```typescript
if ([25, 50, 75, 100].includes(progress)) {
  milestoneTriggered = true;
}
```
`progress` is computed as `Math.round((doneTasks / totalTasks) * 100)`.
- If a project has **3 tasks**: Progress steps are 0% $\to$ 33% $\to$ 67% $\to$ 100%. **Milestones at 25%, 50%, and 75% never trigger.**
- If a project has **5 tasks**: Progress steps are 0% $\to$ 20% $\to$ 40% $\to$ 60% $\to$ 80% $\to$ 100%. **Zero intermediate milestones trigger.**
Only projects with task counts divisible by 4 ever fire the 25%, 50%, or 75% celebrations.

### Task Field Deficiencies
- **Missing:** Estimates (story points / hours), start dates, blocker/dependency links, multi-assignees, task watchers, file attachments.
- **Unused:** `Task.tags` is an array of strings in PostgreSQL with zero tag-management UI (no tag manager, color assigner, or tag filter).

---

## 9. Dashboard Audit

The Dashboard (`src/app/page.tsx`) renders:
1. `DashboardHeader`
2. `KpiSummaryGrid` (4 metric cards)
3. `ProjectProgressList` (top 4 projects)
4. `UpcomingDeadlinesWidget` (top 4 tasks due)
5. `RecentActivityFeed` (last 20 audit log rows)

### Critical Dashboard Questions Answered vs Unanswered:

| Question for Daily Work | Answered? | Forensic Evidence / Reality in Code |
| :--- | :---: | :--- |
| **What should I know immediately?** | ⚠️ Partial | Shows high-level project counts, but nothing about the user's specific tasks. |
| **What needs attention?** | ❌ NO | No alert section for blocked work, failed sprints, or critical delays. |
| **What is overdue?** | ❌ NO | `overdueTasks` count is calculated in `/api/dashboard/summary`, but **no overdue task list is rendered on the dashboard.** |
| **What is blocked?** | ❌ NO | Blocked tasks are counted on server, but omitted from dashboard view. |
| **What is upcoming?** | ⚠️ Flawed | Shows upcoming tasks, but tasks with `null` due dates receive a hardcoded fallback string `"2026-09-15"` (`UpcomingDeadlinesWidget.tsx`). |
| **What changed?** | ⚠️ Raw | Shows raw audit log strings ("Created task X", "Updated task Y") rather than a curated team activity feed. |
| **What should I do next?** | ❌ NO | **No "My Tasks" queue.** Zero guidance on what the active user should work on. |

### Technical Defects:
- **Duplicate Data Fetching:** `KpiSummaryGrid` and `RecentActivityFeed` independently trigger `GET /api/dashboard/summary` on initial mount.

---

## 10. Team & Collaboration Audit

### Member Invitation System
In `src/app/api/team/members/route.ts`:
When an admin invites an email:
1. The server checks `prisma.user.findUnique({ where: { email } })`.
2. If not found, it **immediately creates a full `User` record** in PostgreSQL with no password and no credentials.
3. It immediately inserts a `WorkspaceMember` row.
4. **No invitation email is dispatched.** No invite link or cryptographic invitation token is generated.
5. The invited person has no way of knowing they were added unless told out-of-band.

### Workload Score Formula
In `src/app/api/team/members/route.ts`:
```typescript
const computedScore = Math.min(Math.round((activeTasks / 5) * 100), 100);
```
- Workload capacity is hardcoded to assume **5 active tasks = 100% capacity**.
- A user with 4 trivial documentation tasks is marked as `80% Capacity (HIGH)`.
- A user with 1 massive architectural rewrite is marked as `20% Capacity (OPTIMAL)`.
- Task priority, story points, and deadlines are ignored in workload calculations.

### Collaboration Gaps
- **Silent Comments:** Adding a comment on a task (`POST /api/tasks/[id]/comments`) broadcasts a realtime event, but **creates zero database notifications**. If the task assignee is offline, they will never be notified of the comment.
- **No Mentions:** The `@mention` feature exists as a notification enum (`TASK_MENTIONED`), but is never parsed or triggered in task descriptions or comments.

---

## 11. Notification Audit

### Trigger Matrix

| Event | Notification Triggered? | Code Location |
| :--- | :---: | :--- |
| **Task Assigned to Member** | ✅ YES | `src/app/api/tasks/route.ts` |
| **Task Reassigned to Different Member** | ✅ YES | `src/app/api/tasks/[id]/route.ts` |
| **Task Status Changed** | ✅ YES | `src/app/api/tasks/status/route.ts` |
| **Member Added to Workspace** | ✅ YES | `src/app/api/team/members/route.ts` |
| **Task Commented On** | ❌ NO | Missing in `src/app/api/tasks/[id]/comments/route.ts` |
| **User Mentioned in Text** | ❌ NO | Not implemented |
| **Task Overdue Warning** | ❌ NO | No cron or scheduled evaluator |
| **Project Completed** | ❌ NO | Only evaluated in milestone celebration UI |

### Noise & UX Evaluation
- Notifications cannot be filtered by project or priority.
- Notifications lack preference settings (users cannot disable status change spam).
- No external notification channels (no email via Resend/SendGrid, no Slack/Discord webhooks).

---

## 12. Settings Audit

Inspection of `src/app/settings/page.tsx`:

| Settings Section | Operational Status | Reality & Deficiencies |
| :--- | :---: | :--- |
| **Workspace Profile** | ✅ Works | Updates workspace `name` and `slug` in database (`WorkspaceProfileForm.tsx`). |
| **Theme Settings** | ⚠️ Local Only | Saves `synplan_theme` to browser `localStorage` (`ThemeSettingsPanel.tsx`); does not persist to user database profile. |
| **Disaster Recovery** | ⚠️ Partial | JSON export button works (`GET /api/admin/backup/export`), but RPO/RTO metrics shown in the UI are static text. |
| **RBAC Permissions Matrix** | ❌ Placeholder | `RbacMatrixTable.tsx` is a **100% hardcoded static presentation table.** No roles or permissions can be modified. |
| **Security Audit Stream** | ✅ Works | Reads last 20 audit entries from PostgreSQL (`AuditLogStream.tsx`). |
| **User Profile / Account** | ❌ Missing | No place for users to change their display name, avatar, or link new OAuth providers. |
| **Notification Preferences**| ❌ Missing | Non-existent. |
| **AI Settings** | ❌ Missing | Cannot configure API keys, select models (Gemini vs OpenAI), or adjust planner strictness from the UI. |
| **Integrations** | ❌ Missing | Non-existent. |
| **Billing & Plans** | ❌ Missing | Non-existent. |

---

## 13. AI System Audit

### AI Architecture & Provider Layer
Located in `src/lib/ai/`:
- **Primary LLM:** Google Gemini Generative Language API (`gemini-3.6-flash`) called via native REST `fetch` in `provider.ts`.
- **Secondary LLM:** OpenAI Chat Completions endpoint (`gpt-4o-mini`).
- **Heuristic Engine Fallback:** A 24-file in-house deterministic parser (`heuristics/index.ts`) using regular expressions and fuzzy string distance when API keys are absent or rate-limited.

```
User Natural Language Instruction
                │
                ▼
      [AI Planner (planner.ts)]
                │
    ┌───────────┴───────────┐
    ▼ (API Key Present)     ▼ (No Key / Rate Limited / Network Error)
[Google Gemini / OpenAI]  [Heuristic Regex Engine]
    │                       │
    └───────────┬───────────┘
                ▼
    [Raw Plan Generated]
                │
                ▼
    [Plan Validator (validator.ts)]
    (Role Check, Target Entity Snapshots, SHA-256 Fingerprint)
                │
                ▼
    [Pending Confirmation Token Generated]
    (Stored in Process Memory: Map<token, Plan>) ⚠️ SERVERLESS FAILURE POINT
                │
                ▼
    [User Confirms Execution]
                │
                ▼
    [AI Executor (executor.ts)]
    (Sequential Prisma Operations - Non-Atomic)
```

### Critical AI Findings

#### 1. Serverless In-Memory Token & State Loss
`confirmationStore.ts`, `conversationStore.ts`, and `receiptStore.ts` store confirmation tokens, multi-turn history, and undo receipts in module-level `new Map()` objects.
- On Vercel, when a user asks AI to delete or create tasks, Lambda Instance A generates the plan and saves the token in its RAM.
- When the user clicks "Confirm Action", the browser sends `POST /api/ai/execute` with the token. Vercel routes this request to Lambda Instance B.
- Instance B's `pendingConfirmations` map is empty. It returns:
  `400 Bad Request: "Token konfirmasi tidak valid atau tidak ditemukan."`

#### 2. Arbitrary Context Slicing (Blinded LLM)
In `src/lib/ai/promptBuilder.ts`:
```typescript
const serializedTasks = (context.tasks || []).slice(0, 40).map(...);
const serializedPhases = (context.phases || []).slice(0, 30).map(...);
```
The prompt builder truncates workspace tasks to the **first 40 items**. If a workspace has 75 tasks, the LLM is completely unaware of tasks #41 through #75. Asking the AI "What tasks are assigned to Sarah?" returns an incomplete or false answer.

#### 3. Non-Atomic Batch Execution
`src/lib/ai/executor.ts` executes compound action plans in a standard JavaScript `for` loop. If an action plan creates a Project, 2 Phases, and 10 Tasks, and Task #6 fails due to a database constraint, **preceding created entities remain in the database**. The user is left with a corrupt, half-created project.

#### 4. Workflow Isolation (Chatbot Silo)
The AI does not participate contextually in the user's primary workspace views:
- No inline prompt inside the project creation modal.
- No "AI Breakdown" button inside tasks to generate subtasks.
- No automated project risk analysis banner on the project overview.
- AI lives exclusively inside `AiAssistantDrawer.tsx` on the right edge of the screen.

---

## 14. Frontend Architecture

### Component Organization
```
src/
├── app/                  # Next.js App Router Pages & Route Handlers
├── components/           # UI Components
│   ├── ai/               # 3 AI drawer & trigger components
│   ├── calendar/         # Month, Week, Day views
│   ├── common/           # CommandPalette
│   ├── dashboard/        # 5 dashboard widgets
│   ├── kanban/           # KanbanBoard, KanbanColumn, KanbanCard, TaskModal, Drawer
│   ├── layout/           # AppShell, Sidebar, TopHeader, GlobalSearch
│   ├── projects/         # PhaseManager, ProjectCard
│   ├── realtime/         # RealtimeProvider, StatusBadge
│   ├── reports/          # Charts & metrics
│   ├── settings/         # 5 settings forms
│   ├── team/             # MemberCard, WorkloadVisualizer, InviteModal
│   └── ui/               # 6 hand-coded primitives (NO shadcn)
├── hooks/                # Custom React hooks
├── lib/                  # Utilities, AI engine, auth guards, API client
├── store/                # 6 Zustand store definitions
└── types/                # TypeScript interface definitions
```

### Architectural Deficiencies
1. **Severe Client Component Saturation:** The entire UI tree from `AppShell` downwards is client-rendered. This bypasses React 19 / Next.js 15 streaming architecture and increases First Input Delay (FID) on slower mobile devices.
2. **Scattered State Synchronization:** Data is stored across multiple independent Zustand stores: `useWorkspaceStore`, `useTaskStore`, `useUiStore`, `useNotificationStore`, and `useCalendarStore`. When a task is updated, code must manually coordinate updates across `useTaskStore.updateTask()` and `useWorkspaceStore.updateProject()`.
3. **No React Query / SWR:** Mutation rollbacks, caching, deduplication, and window focus refetching are manually re-implemented across 693 lines in `src/lib/apiClient.ts`, creating edge-case synchronization bugs.

---

## 15. UI / UX Audit

### Comprehensive Interface Evaluation

```
┌──────────────────┬────────────┬────────────────────────────────────────────────────────┐
│ UI Dimension     │ Rating     │ Forensic Evidence & Finding                            │
├──────────────────┼────────────┼────────────────────────────────────────────────────────┤
│ Navigation       │ Mediocre   │ Clean sidebar, but lacks deep task URLs (/tasks/[id]). │
│ Typography       │ Good       │ Inter & Geist Mono scales applied cleanly.            │
│ Layout Density   │ Acceptable │ Adequate spacing, but dashboard wastes vertical space. │
│ Components       │ Inconsistent│ 6 custom primitives; raw HTML tags across forms.      │
│ Forms & Inputs   │ Poor       │ No form library (no React Hook Form); manual state.    │
│ Tables & Lists   │ Mediocre   │ List view lacks server-side sorting and multi-select.  │
│ Modals & Drawers │ Poor       │ Stacked drawers create z-index visual trapping.       │
│ Empty States     │ Fair       │ Friendly empty illustrations, but lack useful CTAs.    │
│ Loading Feedback │ Good       │ Shimmer skeletons implemented cleanly across views.    │
│ Error Feedback   │ Inconsistent│ Toasts used well, but API errors often log to console. │
│ Responsive       │ Poor       │ Kanban horizontal scroll breaks on narrow touchscreens.│
└──────────────────┴────────────┴────────────────────────────────────────────────────────┘
```

### Concrete Usability Defects
- **The `"2026-09-15"` Default Due Date:** Creating a task always defaults the due date picker to `2026-09-15` (`TaskModal.tsx`), forcing users to repeatedly re-select dates.
- **Kanban Board Load More Button:** In `src/app/tasks/page.tsx`, tasks > 50 require clicking a "Load More" footer button. Kanban boards should never have pagination footers; they require infinite scroll or virtualized column windowing.
- **Client-Side Filter Illusion:** Filtering by priority or search query in `src/app/tasks/page.tsx` only filters the tasks currently loaded in memory. Unloaded tasks on the server remain invisible.

---

## 16. Design System Audit

### Token Discrepancy Matrix

| Design Attribute | Specified in `design.md` | Actual in `globals.css` | Severity |
| :--- | :--- | :--- | :--- |
| **Brand Concept** | Neutral Base + Indigo Accent | Navy / Dark Slate + Steel Blue Accent | High |
| **Dark Canvas** | `#09090B` (Deep Neutral Zinc) | `#081420` (Dark Nautical Blue) | Medium |
| **Primary Accent** | `#6366F1` (Indigo) | `#2072B8` (Cerulean Blue) | High |
| **Surface Level 2** | `#18181B` (Zinc-900) | `#0E2338` (Navy Slate) | Medium |
| **Border Subtle** | `#222634` (Zinc/Navy Muted) | `#183754` (Steel Blue Outline) | Low |
| **Component Primitives** | "Strict shadcn/ui mandatory" | 6 hand-rolled primitives in `components/ui` | Critical |

### Visual Quality Verdict
While the current interface looks aesthetically decent due to consistent spacing and dark mode colors, it is **built on conflicting visual tokens**. The code deviated from the architectural guidelines during rapid prototyping, resulting in hardcoded Tailwind classes (`bg-[#102A45]`, `border-[#D6E4F0]`) scattered across files.

---

## 17. Performance Audit

### Performance Bottlenecks
1. **Unbounded Database Queries:**
   - `GET /api/projects/[id]` queries all project tasks, subtasks, and assignees without pagination (`take`).
   - `GET /api/calendar/events` fetches all tasks and projects in the workspace without pagination.
2. **Duplicate Dashboard Requests:** Mounting the dashboard triggers two identical calls to `/api/dashboard/summary`.
3. **Heavy Client Bundle:** `framer-motion` (12.4), `@supabase/supabase-js` (2.112), `lucide-react`, and full client-side parsing engines are bundled into client chunks, resulting in significant JavaScript execution time on low-end hardware.
4. **WebSocket Channel Thrashing:** Connecting, sending a broadcast, and disconnecting from Supabase Realtime on every state change adds 100–250ms of network overhead to every mutation.

---

## 18. Security Audit

### Security Posture Summary

```
╔════════════════════════════════════════════════════════════════════════╗
║                      SECURITY AUDIT EVALUATION                         ║
╠══════════════════════════════════════╦═══════════╦═════════════════════╣
║ Security Domain                      ║ Status    ║ Verdict             ║
╠══════════════════════════════════════╬═══════════╬═════════════════════╣
║ CSRF / Origin Verification           ║ SECURE    ║ Handled in MW       ║
║ Session Token Cryptography           ║ SECURE    ║ Crypto 32-byte hex  ║
║ HTTP Security Headers & CSP          ║ SECURE    ║ Strict CSP in MW    ║
║ Multi-Tenant Workspace Isolation     ║ SECURE    ║ Strict WS boundary  ║
║ Server-Side Input Validation         ║ SECURE    ║ Zod on all bodies   ║
║ Project-Level Authorization          ║ AT RISK   ║ Missing in Guard    ║
║ API Route Middleware Protection      ║ AT RISK   ║ Skipped in MW       ║
║ Serverless Rate-Limiting Integrity   ║ AT RISK   ║ In-Memory Map       ║
║ Test Mode Header Impersonation       ║ DEFECT    ║ Header Auth in code ║
╚══════════════════════════════════════╩═══════════╩═════════════════════╝
```

### Architectural Weaknesses
- **No Database Row-Level Security (RLS):** Supabase PostgreSQL is accessed via Prisma using `DATABASE_URL` (superuser connection string) and `DIRECT_URL`. Prisma bypasses Postgres RLS completely. Tenant isolation is enforced exclusively in TypeScript application code. A bug in an API route query immediately risks cross-tenant data leakage.
- **Serverless Rate Limiter Bypass:** Attackers can bypass rate limits by distributing requests across concurrent connections that hit different Vercel Lambda containers.

---

## 19. Accessibility (A11y) Audit

### Deficiencies Identified
1. **Interactive Keyboard Navigation on Kanban Board:** Users cannot drag-and-drop or move tasks between columns using keyboard keys (`Space`/`Enter` + `Arrows`). The Kanban board is unusable for keyboard-only users.
2. **Missing ARIA Roles on Custom Components:** Custom modal dialogs, drawers, and tabs lack appropriate `aria-modal="true"`, `role="dialog"`, and `aria-labelledby` tags.
3. **Color-Only Status Indicators:** Several compact badges render small colored dots without text labels, failing WCAG 2.1 Non-Text Contrast guidelines for color-blind users.

---

## 20. Responsive Behavior

### Viewport Performance
- **Desktop (>1024px):** Fully functional, standard layout.
- **Tablet (768px–1023px):** Sidebar collapses into icon mode. Kanban columns become cramped, forcing horizontal scroll.
- **Mobile (<767px):**
  - Sidebar becomes a slide-out overlay.
  - Kanban board requires horizontal swiping across 4 wide columns, resulting in high interaction friction when trying to drag tasks between columns on a touch screen.
  - The AI Assistant drawer occupies 100% of the screen width, obscuring workspace context while typing commands.

---

## 21. Feature Matrix

| Feature Module | Current State | User Value | Architectural Complexity | Primary Problem | Recommendation |
| :--- | :--- | :---: | :---: | :--- | :---: |
| **Landing Page** | Non-existent | Critical | Low | Direct visitors bounced to `/login` | **REBUILD** |
| **Onboarding Wizard** | Non-existent | High | Medium | First-time users dumped in blank workspace | **REBUILD** |
| **Authentication** | Custom OAuth | High | Medium | No password/magic link; trapped if removed from WS | **REBUILD** |
| **Workspaces** | Basic CRUD | High | Medium | No logo upload; fixed owner transfer | **REBUILD** |
| **Dashboard** | 4 Cards + 3 Lists | High | Medium | Hardcoded velocity; lacks "My Tasks" | **REBUILD** |
| **Projects List** | Grid / List View | High | Medium | Dead progress counter columns in DB | **REBUILD** |
| **Project Overview** | 4 Tabs Detail View | High | High | ProjectMember role ignored by auth guard | **REBUILD** |
| **Phase Management** | Sequential Orders | High | Medium | BOLA fixed, but integer orders fragile | **MODIFY** |
| **Kanban Board** | 4-Column Board | Critical | High | Blocked status coerced; load-more footer | **REBUILD** |
| **Task Detail Drawer** | Right Slide-Over | Critical | High | Duplicate with TaskModal; no direct URL | **REBUILD** |
| **Task Modal** | Floating Dialog | High | Medium | Defaults due date to `"2026-09-15"` | **REBUILD** |
| **Team Management** | Member List | High | Medium | Invitations create users without tokens | **REBUILD** |
| **Workload Visualizer**| Capacity Score | Medium | Low | Hardcoded formula (`activeTasks / 5`) | **REBUILD** |
| **Reports / Analytics**| 3 Charts + Donut | Low | High | **Mock hardcoded telemetry data** | **REMOVE / REBUILD** |
| **Calendar View** | Month/Week/Day | Medium | Medium | Calls task list instead of calendar API | **MODIFY** |
| **Notifications** | In-App Popover | High | Medium | Missing task comment triggers | **REBUILD** |
| **Global Search** | Ctrl+K Modal | High | Medium | Basic ILIKE; no fuzzy relevance ranking | **MODIFY** |
| **Settings Page** | Vertical Stack | High | Low | Hardcoded static RBAC table; no user settings | **REBUILD** |
| **AI Planner & Chat** | Side Drawer | Critical | High | In-memory serverless storage; 40-task limit | **REBUILD** |
| **Realtime Sync** | Supabase Broadcast | High | Medium | Creates/destroys channel on every event | **REBUILD** |
| **Disaster Recovery** | JSON Export | Medium | Low | Export works; RPO/RTO metrics simulated | **MODIFY** |

---

## 22. Technical Debt

### Critical (P0 / P1)
1. **In-Memory Serverless State Partitioning:** `confirmationStore.ts`, `conversationStore.ts`, `receiptStore.ts`, and `rateLimit.ts` use in-memory `Map`. Must be migrated to Redis (Upstash) or PostgreSQL.
2. **Database Counter Desynchronization:** `Project.totalTasks`, `Project.completedTasks`, and `Project.progress` are stale counter columns that desynchronize on every task mutation.
3. **Ghost ProjectMember Authorization:** ProjectMember role is never enforced in security guards, creating an authorization disparity.
4. **Mock Analytics Telemetry:** `/api/analytics/pulse` and `/api/analytics/reports` return hardcoded sprint velocity data.
5. **No Direct Task URLs:** Absence of `/tasks/[id]` prevents deep-linking and team collaboration.
6. **Zero-Workspace Identity Lockout:** Removing a user from their sole workspace permanently locks their account in a `403 Forbidden` loop.

### High (P2)
7. **Client Component Saturation:** Entire app runs client-side; zero React Server Component data fetching.
8. **Hardcoded Date Fallbacks:** `"2026-09-15"` injected into task modals and deadline widgets.
9. **Blocked Status Coercion:** Database `BLOCKED` status is coerced into `in_review` on the frontend.
10. **Silent Invitations:** Team member invite creates active database user without dispatching an invitation email or token.
11. **Orphan Calendar Endpoint:** `/api/calendar/events` exists but is never invoked by the frontend.

### Medium (P3)
12. **Missing Component Standard:** `shadcn/ui` was never scaffolded despite documentation directives.
13. **Design Token Conflict:** Indigo palette in `design.md` conflicts with Navy palette in `globals.css`.
14. **Custom Hand-Rolled API Cache:** `apiClient.ts` custom cache map duplicates React Query / SWR.
15. **Unbounded Detail Queries:** `/api/projects/[id]` fetches all tasks and subtasks in one unbounded array.

### Low (P4)
16. **Dead Code:** `const PHASES = [...]` unused in `src/app/projects/[id]/page.tsx`.
17. **Redundant Enum:** `User.role` redundant with `WorkspaceMember.role`.

---

## 23. Problems That Must Be Solved in Rebuild

1. **Unify the Product Soul:** Blend traditional project management with AI. AI must not be an isolated chatbot; it must be an intelligent co-pilot embedded directly into the workspace (e.g., "Draft Roadmap with AI" button on projects, "Break into Subtasks" button on tasks, "Detect Risks" card on dashboard).
2. **Eliminate Serverless State Partitioning:** Never store ephemeral tokens, chat sessions, or rate-limit records in Node.js memory.
3. **True Single Source of Truth for Data:** Remove denormalized counter caches (`Project.progress`, `Project.totalTasks`). Compute aggregates dynamically via SQL views or transactional triggers.
4. **First-Class Shareable URLs:** Ensure every project, task, modal view, and filter state is deep-linkable via clean URL routes (`/projects/:slug`, `/tasks/:id`).
5. **Real Analytics Engine:** Build real SQL aggregate queries for sprint velocity, cycle time, and completion rates instead of hardcoding mock telemetry.
6. **Robust Onboarding & Public Landing:** Build a dedicated marketing landing page (`/`), automated onboarding wizard, and safe identity recovery for users without workspaces.

---

## 24. Things That Should Be Removed

1. **Remove In-Memory State Maps:** Delete `pendingConfirmations`, `userPendingIndex`, `receiptCache`, `conversationCache`, and in-memory rate-limiter maps.
2. **Remove Hardcoded Analytics:** Delete static velocity arrays (`Wk 31` to `Wk 36`) and static turnaround constants in `/api/analytics/pulse` and `/api/analytics/reports`.
3. **Remove Redundant Columns:** Drop `totalTasks`, `completedTasks`, and `progress` from `Project` model in Prisma. Drop `role` from `User` model.
4. **Remove Fake Settings Panels:** Remove the static uneditable `RbacMatrixTable` and simulated RPO/RTO metrics.
5. **Remove Arbitrary AI Context Limits:** Remove the hardcoded 40-task context truncation in `promptBuilder.ts`.
6. **Remove Hardcoded `"2026-09-15"` Strings:** Strip all hardcoded date fallbacks from widgets and modals.

---

## 25. Things That Should Be Preserved

1. **Multi-Tenant Workspace Model:** The concept of scoped workspace membership (`Workspace` $\leftrightarrow$ `WorkspaceMember` $\leftrightarrow$ `User`) with strict cross-tenant isolation is solid.
2. **Cryptographic Security & CSP Middleware:** The security headers, CSRF validation, and HttpOnly cookie session handling in `src/middleware.ts` are well-crafted and should be retained.
3. **Zod API Validation Schemas:** The comprehensive schema library in `src/lib/validation/schemas.ts` provides robust runtime validation.
4. **Audit Logging Philosophy:** The `AuditLog` structure capturing actor, action, target, IP, and before/after payloads is valuable for compliance and activity tracking.
5. **Micro-Interactions & Visual Cleanliness:** The subtle spotlight cards, count-up animations, and clean dark mode aesthetic represent a strong visual direction when unified.

---

## 26. Things That Should Be Rebuilt

1. **Complete Database Layer:** Redesign schema in Prisma with clean relations, proper enum naming, explicit `TaskDependency` model, invitation token model, and real database migration tracking.
2. **Authentication & Onboarding Flow:** Rebuild auth using Supabase Auth or Auth.js v5, supporting Google, GitHub, Magic Links, and an onboarding wizard for workspace setup.
3. **Task & Project Engine:** Rebuild task management supporting subtasks, task dependencies, multi-assignees, direct URLs (`/tasks/[id]`), and an un-truncated Kanban board.
4. **AI Assistant Infrastructure:** Rebuild AI using the Vercel AI SDK (`ai` package) with streaming tool-calls, Redis-backed session memory, and contextual in-app actions.
5. **Frontend Architecture:** Rebuild using Next.js 15 Server Components (RSC) for initial page loads, TanStack Query for client caching, and genuine `shadcn/ui` primitives.
6. **Settings & Workspace Management:** Rebuild settings with distinct tabs (Profile, Workspace, Squad & Roles, Notifications, AI Config, Integrations).

---

## 27. Proposed Ideal User Workflow

```
[User Has an Initiative / Goal]
               │
               ▼
   [Create Project in Synplan]
               │
   ┌───────────┴───────────┐
   ▼ (Manual Mode)         ▼ (AI Co-Pilot Mode)
[Manual Form & Phases]   [AI Generates Roadmap from Brief]
   │                       │
   │                       ├─ Proposes Delivery Phases
   │                       ├─ Generates Tasks with Estimates
   │                       └─ Identifies Critical Dependencies
   │                               │
   └───────────┬───────────────────┘
               ▼
      [Review & Refine Plan]
               │
               ▼
    [Assign Tasks to Squad]
    (Real capacity visualizer based on active task estimates)
               │
               ▼
         [Execution Phase]
    (Assignee opens "My Tasks" queue on Dashboard)
               │
   ┌───────────┴───────────┐
   ▼                       ▼
[Kanban Board Drag]      [Inline Task Drawer]
(Status updates)         (Checklist, Comments, Blockers)
   │                       │
   └───────────┬───────────┘
               ▼
      [Automated Risk Detection]
(AI scans project daily: detects overdue items, overloaded members, stalled blockers)
               │
               ▼
     [Project Milestone Reached]
(Milestone toast & aggregate velocity telemetry updated)
               │
               ▼
      [Initiative Completed & Archived]
```

---

## 28. Proposed Future Information Architecture

```
Synplan Platform Hierarchy
├── Marketing & Public Tier
│   ├── Landing Page (/)
│   ├── Features & Product Overview (/features)
│   ├── Pricing (/pricing)
│   └── Login & Register (/login)
│
└── Authenticated Workspace Tier (app.synplan.dev / :workspaceSlug)
    ├── Onboarding Flow (/onboarding - if 0 workspaces)
    ├── Global Top Bar (Workspace Switcher, Global Search, Realtime Status, Notifications, User)
    │
    ├── Sidebar Navigation
    │   ├── 1. Overview
    │   │   ├── Dashboard (KPIs, Urgent Blockers, Overdue Feed)
    │   │   └── My Work ("My Tasks" assigned to active user, saved filters)
    │   │
    │   ├── 2. Initiatives
    │   │   ├── Projects (Grid / Table view, status filters)
    │   │   │   └── [Project Slug] (/projects/:slug)
    │   │   │       ├── Roadmap (Timeline / Gantt view)
    │   │   │       ├── Board (Project-scoped Kanban)
    │   │   │       ├── List (Sortable task list)
    │   │   │       └── Squad (Project members & allocations)
    │   │   │
    │   │   └── Tasks Hub (/tasks)
    │   │       ├── Workspace Board (All projects Kanban)
    │   │       ├── List View
    │   │       └── Task Modal/Page (/tasks/:id - Deep linkable)
    │   │
    │   ├── 3. Planning & Coordination
    │   │   ├── Calendar (/calendar - Monthly / Weekly deliverables)
    │   │   ├── Team & Squad (/team - Member roster, invitations, capacity)
    │   │   └── Analytics & Pulse (/analytics - Real velocity, burndown, cycle times)
    │   │
    │   └── 4. Configuration
    │       └── Settings (/settings)
    │           ├── General (Workspace profile, branding, slug)
    │           ├── Members & Roles (Invitations, RBAC permissions)
    │           ├── Notifications (Email & in-app preferences)
    │           ├── AI Configuration (Model selection, API keys, strictness)
    │           ├── Integrations (GitHub, Slack webhooks)
    │           └── Data & Audit (Activity logs, JSON exports)
```

---

## 29. Proposed Future System Architecture

```
                                  FRONTEND CLIENT TIER
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Next.js 15 App Router + React 19                                                       │
│ • React Server Components (RSC) for initial page loads (Zero-waterfall server fetch)   │
│ • Genuine shadcn/ui Component Primitives (Radix UI accessible primitives)              │
│ • TanStack Query v5 (React Query) for client-side caching & optimistic mutations      │
│ • Vercel AI SDK useChat / useCompletion for streaming AI interactions                 │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Server Actions & REST API
                                            ▼
                           SERVERLESS APPLICATION LAYER (Vercel)
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Next.js Route Handlers & Server Actions                                                │
│ • Authentication: Supabase Auth / Auth.js (Session JWT / Cookies)                      │
│ • Authorization Guard: Centralized RBAC + ProjectSquad Authorization                   │
│ • Distributed State & Rate Limiting: Upstash Redis (Tokens, Rate Limits, AI Memory)    │
│ • AI Orchestration: Vercel AI SDK Core (Streaming tool-calling & structured outputs)   │
└───────────────────────┬────────────────────────────────────────┬───────────────────────┘
                        │ Prisma ORM                             │ WebSocket
                        ▼                                        ▼
┌────────────────────────────────────────────────┐  ┌────────────────────────────────────┐
│          SUPABASE POSTGRESQL DATABASE          │  │       SUPABASE REALTIME HUB        │
│ • Strict PostgreSQL Row-Level Security (RLS)   │  │ • Persistent WebSocket Channels    │
│ • Versioned Prisma Migrations                  │  │ • Presence Tracking                │
│ • Dynamic SQL Aggregates & Views               │  │ • Live Notification Broadcasts     │
└────────────────────────────────────────────────┘  └────────────────────────────────────┘
```

---

## 30. Proposed Rebuild Phases

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                SYNPLAN 100% REBUILD ROADMAP                             │
├──────────┬──────────────────────┬───────────────────────────────────────────────────────┤
│ Phase    │ Focus Area           │ Key Deliverables                                      │
├──────────┼──────────────────────┼───────────────────────────────────────────────────────┤
│ PHASE 0  │ Design & Foundation  │ Install genuine shadcn/ui, configure unified tokens,  │
│          │                      │ establish ESLint/Prettier rules, clean package.json   │
├──────────┼──────────────────────┼───────────────────────────────────────────────────────┤
│ PHASE 1  │ Database & Schema    │ Redesign Prisma schema, drop dead counters, add task  │
│          │                      │ dependencies, write initial clean migration           │
├──────────┼──────────────────────┼───────────────────────────────────────────────────────┤
│ PHASE 2  │ Auth & Onboarding    │ Rebuild auth (Google, GitHub, Magic Link), session    │
│          │                      │ handling, onboarding wizard for 0-workspace users     │
├──────────┼──────────────────────┼───────────────────────────────────────────────────────┤
│ PHASE 3  │ App Shell & Layout   │ RSC AppShell, responsive sidebar, breadcrumbs, command│
│          │                      │ palette, public landing page (/)                      │
├──────────┼──────────────────────┼───────────────────────────────────────────────────────┤
│ PHASE 4  │ Workspace & RBAC     │ Workspace CRUD, invite token system, email dispatch,  │
│          │                      │ granular server-authoritative RBAC guard              │
├──────────┼──────────────────────┼───────────────────────────────────────────────────────┤
│ PHASE 5  │ Projects & Phases    │ Dynamic progress aggregation, phase reordering,       │
│          │                      │ project squad membership, project overview view       │
├──────────┼──────────────────────┼───────────────────────────────────────────────────────┤
│ PHASE 6  │ Task Engine & Kanban │ Rebuild Kanban with virtualized columns, standalone   │
│          │                      │ /tasks/[id] URLs, subtasks, blockers, "My Tasks" queue│
├──────────┼──────────────────────┼───────────────────────────────────────────────────────┤
│ PHASE 7  │ Realtime Sync        │ Persistent Supabase Realtime broadcast channels with  │
│          │                      │ automatic TanStack Query cache invalidation           │
├──────────┼──────────────────────┼───────────────────────────────────────────────────────┤
│ PHASE 8  │ AI Co-Pilot System   │ Vercel AI SDK integration, streaming tool-calls,      │
│          │                      │ Upstash Redis session memory, contextual in-app AI    │
├──────────┼──────────────────────┼───────────────────────────────────────────────────────┤
│ PHASE 9  │ Real Analytics Engine│ Real SQL aggregate metrics (burndown, cycle time,     │
│          │                      │ throughput), calendar view connected to calendar API │
├──────────┼──────────────────────┼───────────────────────────────────────────────────────┤
│ PHASE 10 │ Settings & Polish    │ Multi-tab settings (Profile, WS, Roles, AI, Webhooks),│
│          │                      │ accessibility compliance, mobile touch hardening      │
├──────────┼──────────────────────┼───────────────────────────────────────────────────────┤
│ PHASE 11 │ Production Sign-Off  │ E2E Playwright tests, load testing, security scan     │
└──────────┴──────────────────────┴───────────────────────────────────────────────────────┘
```

---

## 31. Risks During Rebuild

1. **Legacy Production Data Migration Risk:** Existing production users on `synplan.vercel.app` have data created under the old unversioned schema. Rebuilding the database requires a clean migration script or data export/import pipeline.
2. **AI Rate Limiting & Latency:** Switching from raw fetch to structured tool-calling with LLMs requires strict token budget management, streaming UX, and robust fallbacks to avoid user-facing timeouts.
3. **Over-Engineering Scope Creep:** Attempting to build full Jira/Linear feature parity (custom fields, sprint estimation poker, complex Gantt dependencies) in V2 risks stalling development. Focus strictly on a cohesive, high-quality core.
4. **Realtime Multi-Tab Race Conditions:** Managing concurrent updates between WebSocket broadcasts and TanStack Query optimistic mutations requires strict timestamp ordering to avoid UI jitter.

---

## 32. Open Questions & Unknowns

1. **Production User Base & Data Preservation:**
   - *Status:* `UNKNOWN / NOT VERIFIED`
   - *Question:* Is there live production data on `https://synplan.vercel.app/` that **must** be migrated, or can the rebuild drop existing tables and start with a clean production database?
2. **AI Provider Strategy:**
   - *Status:* `UNKNOWN / NOT VERIFIED`
   - *Question:* Should Synplan rely primarily on Google Gemini (due to generous free tier limits and high speed) or OpenAI `gpt-4o-mini`? Should users be allowed to bring their own API keys (BYOK)?
3. **Invitation Email Delivery Provider:**
   - *Status:* `UNKNOWN / NOT VERIFIED`
   - *Question:* Which transactional email service (Resend, SendGrid, Postmark) should be configured for member invitation tokens and notifications?
4. **Target UI Theme Preference:**
   - *Status:* `UNKNOWN / NOT VERIFIED`
   - *Question:* Should the rebuild adopt the **Indigo + Slate** palette from `design.md` or the **Ocean Blue / Navy** palette currently in `src/app/globals.css`?

---

## 33. Recommended Next Step

### Immediate Recommended Action:
**Align on Architectural Decisions & Create Rebuild Blueprint**
1. **Decision Gate:** Confirm with product leadership whether existing production database records must be migrated or if a fresh database instance can be provisioned.
2. **Architecture Blueprint Approval:** Formalize the tech stack for V2:
   - Next.js 15 (App Router + RSC + Server Actions)
   - Genuine `shadcn/ui` component library
   - TanStack Query v5 (Data Fetching & Optimistic Updates)
   - Upstash Redis (Distributed Rate Limiting & AI Session State)
   - Vercel AI SDK Core (`ai` package with streaming tool calls)
   - Supabase Auth + PostgreSQL + Supabase Realtime
3. **Initiate Phase 0:** Once approved, proceed to setup clean dependencies, install `shadcn/ui`, and draft the clean Prisma schema without touching production code.
