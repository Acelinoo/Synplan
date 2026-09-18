# SYNPLAN 2.0 — ZERO-TO-PRODUCTION REBUILD AUDIT (`REBUILD_AUDIT.md`)

## 1. Executive Assessment
This audit maps the current state of Synplan as part of the Zero-to-Production complete architectural rebuild.
The goal is to eliminate legacy technical debt, establish clear domain boundaries, optimize serverless database queries on the new Neon PostgreSQL instance (`us-east-2`), and ensure high-density operational UX with strict tenant isolation.

---

## 2. Infrastructure & Database Schema Mapping
* **Database Provider**: Neon PostgreSQL Serverless (`us-east-2.aws.neon.tech`).
* **Connection Routing**:
  - `DATABASE_URL`: Connection pooler endpoint (`-pooler.c-7.us-east-2.aws.neon.tech`) for application workloads.
  - `DIRECT_URL`: Direct TCP connection (`ep-weathered-wildflower-b5maq0mv.c-7.us-east-2.aws.neon.tech`) for migrations and DDL operations.
* **ORM**: Prisma 6.4.1.
* **Core Domain Models**:
  - **Identity & Tenancy**: `User`, `Account`, `Session`, `Workspace`, `WorkspaceMember`.
  - **Work Engine**: `Project`, `ProjectMember`, `Phase`, `Milestone`, `Task`, `Subtask`, `TaskDependency`, `TaskComment`.
  - **Operations & Security**: `AuditLog`, `Notification`, `AutomationRule`.
  - **AI Workflow Execution**: `AiConfirmationSession`, `AiExecutionReceipt`, `AiConversation`.

### Database Architecture Decision:
- **Keep**: The relational schema has sound cascade rules (`onDelete: Cascade`), appropriate unique constraints (`workspaceId_userId`, `projectId_order`), and comprehensive indexes on high-frequency lookup columns (`workspaceId`, `projectId`, `status`, `dueDate`).
- **Prisma Query Strategy**: Avoid deep recursive `include` trees (e.g. `include: { tasks: { include: { subtasks, dependencies, comments, assignee } } }`). Use projection `select` to serialize only fields required for specific views.

---

## 3. Existing API Surface & Route Hierarchy

| Route | Method | Purpose | Optimization Target |
| :--- | :---: | :--- | :--- |
| `/api/auth/session` | GET | Validates session token and returns active user & workspaces | Deduplicated with 5s memory SWR cache |
| `/api/dashboard/summary` | GET | Aggregated KPI counts for current workspace | Computed via SQL `count()`, avoiding entity serialization |
| `/api/projects` | GET, POST | Project directory and creation | Paginated with `limit: 20`, order by `updatedAt` |
| `/api/projects/[id]` | GET, PATCH, DELETE | Project workspace entity and lifecycle | View-specific task hydration; cascade deletion |
| `/api/tasks` | GET, POST | Task management with Board/List/Table support | Bounded query with dynamic sorting (`sort=deadline`) |
| `/api/tasks/[id]` | GET, PATCH, DELETE | Individual task operations | Atomic status transitions; dependency cascade |
| `/api/team/members` | GET, POST, DELETE | Team directory and invitations | Workload score aggregated in database query |
| `/api/activity` | GET | Workspace audit log timeline | Cursor pagination with `take: 25`, actor projection |
| `/api/notifications` | GET, PATCH, DELETE | User-scoped notification center | Strict `userId` isolation; read/unread filtering |
| `/api/workspaces` | GET, POST | Workspace tenancy management | RBAC-guarded |

---

## 4. Frontend Architecture Audit

### Client vs. Server Component Boundaries
* **Server Components**:
  - Global Root Shell (`src/app/layout.tsx`): Establishes font tokens, theme provider, and viewport metadata.
  - Dashboard Page Composition (`src/app/page.tsx`): Composes independent widgets without bundling unnecessary client logic in the page wrapper.
* **Client Components**:
  - `Sidebar.tsx`: Handles mobile drawer toggle, collapsed mode, and workspace dropdown popovers.
  - `TopHeader.tsx`: Manages presence badges, user profile dropdown, and theme toggling.
  - `TaskBoardView.tsx`: Manages Kanban drag-and-drop interactions and status transitions.
  - `TaskDetailDrawer.tsx`: Manages interactive task attribute editing, subtask completion, and comments.

### State Management & Hydration
* **Zustand Stores**:
  - `useWorkspaceStore`: Tracks `activeWorkspace`, `currentUser`, and pre-hydrated `isWorkspaceValidated`.
  - `useUiStore`: Tracks sidebar toggle, command palette modal state, and active theme.
  - `useTaskStore`: Manages optimistic task updates for immediate drag-and-drop feedback.
  - `useNotificationStore`: Manages real-time unread badges and notification center items.
* **Anti-Pattern Removed**:
  - Previously, widgets remained locked in skeleton loading state because `isWorkspaceValidated` was initialized to `false`. Initializing from `localStorage` (`getInitialWorkspace()`) allows parallel queries to fire immediately on mount.

---

## 5. Performance Bottlenecks & Network Latency Realities
1. **Physical Network Latency (US-East-2 to Client)**:
   - Connecting from Southeast Asia to Neon DB in Ohio (`us-east-2`) introduces ~250ms–350ms of network latency per TCP round-trip.
   - Any endpoint with sequential database queries (e.g. check auth -> check workspace -> check permission -> query data) inherently accumulates 1.5s–3.0s of physical transmission latency.
2. **Mitigation Strategy**:
   - Keep client shell visible instantly using pre-hydrated local state.
   - Fire independent widget requests in parallel rather than serial waterfalls.
   - Employ SWR client caching (3–5 seconds) to prevent redundant queries on rapid route switching.

---

## 6. Code Reorganization & Cleanup Strategy
1. **Dependencies**: 100% verified lean runtime (`@prisma/client`, `@supabase/supabase-js`, `class-variance-authority`, `clsx`, `framer-motion`, `lucide-react`, `next`, `react`, `react-dom`, `tailwind-merge`, `zod`, `zustand`). Zero bloat.
2. **Obsolete Components**: Verified removed from the tree.
3. **Database Portability**: Fully compatible with both Neon PostgreSQL and Supabase PostgreSQL.
