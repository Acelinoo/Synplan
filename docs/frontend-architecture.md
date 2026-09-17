# Synplan 2.0 — Frontend Architecture & Information Architecture Blueprint

## Status: Complete & Authoritative (Phase 6A)

---

## 1. Executive Summary & Design Principles

Synplan 2.0 has established an authoritative, multi-tenant, fully tested PostgreSQL backend covering Work Engines, State Machines, Dependencies, Subtasks, Multi-View query adapters, Domain Events, Realtime infrastructure, Authoritative Audit Logging, and Workflow Automation.

Phase 6A establishes the **Frontend Information Architecture (IA)** and **Application Shell** directly on top of these backend capabilities. 

### Core Architectural Axioms
1. **The Backend Domain Layer is Authoritative**: State machines, role permissions, project memberships, dependency enforcement, and automation reside on the server. The frontend never reinvents or bypasses domain rules.
2. **Deterministic Information Architecture**: The product is organized around actionable work streams, not arbitrary tool dashboards. Navigation flows intuitively: Workspace Context → Work Orientation (My Work) → Project Delivery (Multi-View) → Team Collaboration → Activity & Audit.
3. **Zero Synthetic / Fake Client State**: All task metrics, KPI counters, activities, and notifications are server-derived from PostgreSQL via typed API endpoints. No hardcoded mock multipliers, fake counters, or client-side synthetic broadcast injections.
4. **Distinctive, Controlled, High-Density Aesthetics**: Synplan avoids generic SaaS templates, noisy AI gradients, excessive card nestings, and purple/neon gimmicks. The interface remains information-dense, fast, accessible, and purpose-built for high-velocity engineering and product teams.

---

## 2. Information Architecture (IA) Hierarchy

The application hierarchy is divided into **Global Workspace Context** and **Scoped Project Context**:

```text
Global Context (Workspace Scoped)
├── Workspace Selector & Settings (Top Header)
├── My Work (Personal Cockpit: Overdue, Due Today, Upcoming, High Priority, Blocked)
├── Projects (Index, Lifecycle Management, Health Signals, Phase Overview)
├── Tasks (Global Work Engine Explorer: Board, List, Table)
├── Activity (Authoritative AuditLog Timeline with Actor & Entity Context)
├── Notifications / Inbox (Database-backed Events & System Alerts)
├── Team & Capacity (Workload Distribution, RBAC Management, Project Assignments)
└── Settings (Workspace Profile, Members, RBAC Matrix, Automations, DR)

Scoped Project Context (/projects/[id])
├── Overview (Project Metadata, Progress Velocity, Health Signals, Phase Roadmap)
├── Board View (Multi-Column Task State Machine Workflow)
├── List View (Grouped, Multi-Sort Density Task View)
├── Table View (High-Density Tabular Grid with Subtasks & Dependency Metrics)
├── Activity Stream (Project-Scoped Authoritative AuditLog)
└── Project Settings (Metadata, Lifecycle Status, Membership & Roles)
```

---

## 3. Route Hierarchy

The canonical route structure for Synplan 2.0:

| Route Path | Type | Authority / Backend Domain | Purpose |
| :--- | :--- | :--- | :--- |
| `/login` | Public Auth | `AuthDomainService` | OAuth (GitHub, Google) & Custom Session |
| `/` | Authenticated | `DashboardSummary` | Workspace pulse, KPIs, upcoming deadlines, recent audit |
| `/my-work` | Authenticated | `MyWorkService` | Personal work cockpit (Due today, blocked, high priority) |
| `/projects` | Authenticated | `ProjectDomainService` | Project directory, health badges, target dates |
| `/projects/[id]` | Authenticated | `ProjectDomainService` & `MultiViewAdapter` | Single project hub (Overview, Board, List, Table, Activity) |
| `/tasks` | Authenticated | `TaskDomainService` & `MultiViewAdapter` | Cross-project multi-view explorer |
| `/activity` | Authenticated | `ActivityService` (`AuditLog`) | Complete workspace activity audit trail |
| `/notifications` | Authenticated | `NotificationService` | User notifications, read/unread filters |
| `/team` | Authenticated | `WorkspaceService` | Team roster, workload score visualizer, invitations |
| `/settings` | Authenticated | `WorkspaceService` & `AutomationService` | Workspace configuration, RBAC matrix, Automations |
| `/calendar` | Authenticated | `CalendarService` | Chronological date matrix for schedules |
| `/reports` | Authenticated | `AnalyticsService` | Real velocity metrics and sprint completion rates |

---

## 4. Application Shell Architecture

The App Shell (`src/components/layout/AppShell.tsx`) provides a unified, stable frame for all authenticated workflows:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ TopHeader                                                                             │
│ [Brand] [Workspace Switcher] [Global Search (Cmd+K)]  [Realtime Badge] [Notif] [User]  │
├───────────────────┬────────────────────────────────────────────────────────────────────┤
│ Sidebar           │ Main Content Viewport                                              │
│ ├── Dashboard     │                                                                    │
│ ├── My Work       │  [Page Header / Breadcrumbs]                                       │
│ ├── Projects      │  ────────────────────────────────────────────────────────────────  │
│ ├── Tasks         │                                                                    │
│ ├── Activity      │  [Domain Presentation: Multi-View / Form / Audit Grid]             │
│ ├── Team          │                                                                    │
│ └── Settings      │                                                                    │
│                   │                                                                    │
├───────────────────┴────────────────────────────────────────────────────────────────────┤
│ Modals & Drawers Layer: [CommandPalette] [TaskDetailDrawer] [TaskModal] [AiAssistant]  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

- **TopHeader**: Hosts active workspace context, workspace switching, real-time connection status (`RealtimeStatusBadge`), global keyboard command trigger (`CommandPalette` with `Ctrl+K`), notification inbox dropdown, theme toggle, and user profile/auth controls.
- **Sidebar**: Collapsible navigation rail with active route indicator, responsive mobile backdrop, workspace switcher, and user presence/role footer.
- **Main Viewport**: Clean scroll container with standard responsive horizontal padding (`p-4 sm:p-6 lg:p-8`) bounded to `max-w-[1440px]`.
- **Overlay Shell Layer**: Unified command palette, task modal, slide-out task detail drawer, accessible toast container, and the non-intrusive floating AI assistant drawer.

---

## 5. Workspace Context Architecture

1. **Resolution Hierarchy**:
   - `localStorage("synplan_active_ws")` acts as client-side persistent preference.
   - On shell hydration, `TopHeader` invokes `apiClient.getSession()`.
   - The backend validates session credentials and returns authoritative user workspaces.
   - If the stored workspace belongs to the user, it is confirmed. If stale, the primary workspace is deterministically selected.
   - Once resolved, `isWorkspaceValidated` is set to `true`, unlocking downstream query fetches across dashboard, projects, and tasks.
2. **Request Context Injection**:
   - Every outbound API call via `src/lib/apiClient.ts` injects the `x-synplan-workspace-id` HTTP header.
   - Server-side domain guards (`verifyUserWorkspaceAccess`) enforce isolation.
3. **Workspace Switching Isolation**:
   - Triggering `setActiveWorkspace(nextWs)` cleanses scoped client stores (`useTaskStore.resetWorkspaceTasks()`, resets `projects` and `members`), updates `localStorage`, and updates the realtime channel subscription to `workspace:${nextWs.id}`.

---

## 6. Project Context Architecture

Project pages (`/projects/[id]`) explicitly anchor user attention within the workspace hierarchy:
- **Header**: Project Title, slug, lifecycle status (`ACTIVE`, `PLANNING`, `ON_HOLD`, `COMPLETED`, `ARCHIVED`), deadline, and real-time health indicator (`ON_TRACK`, `AT_RISK`, `OFF_TRACK`).
- **Tab Navigation**:
  - **Overview**: Phase roadmap, milestones, progress percentage, assigned squad members.
  - **Board**: Kanban columns mapped to authoritative task statuses.
  - **List**: High-density task list with phase groupings and inline sorting.
  - **Table**: Tabular data grid showing subtasks, blocking dependencies, assignee, and dates.
  - **Activity**: Live project-scoped audit feed (`/api/activity?projectId=[id]`).
  - **Settings**: Project metadata, deadline updates, and member role assignment (`LEAD`, `CONTRIBUTOR`, `VIEWER`).

---

## 7. Task Experience & Multi-View Architecture

The Work Engine treats **Board**, **List**, and **Table** as alternative projections of the same authoritative domain entity:

```text
                           Task Domain Service
                                   │
                 ┌─────────────────┼─────────────────┐
                 ↓                 ↓                 ↓
            Board View         List View         Table View
            (State Flow)       (Grouped List)    (Dense Data Grid)
                 │                 │                 │
                 └─────────────────┼─────────────────┘
                                   ↓
                   Shared UI Infrastructure
                   ├── Task State Machine Enforcement
                   ├── Subtasks & Dependencies Display
                   ├── Assignee & Tag Multi-Filters
                   ├── Realtime Event Invalidation
                   └── Slide-out Task Detail Drawer
```

### Authoritative Status Mapping
The frontend reflects the full backend Task State Machine:
- `BACKLOG`: Unprioritized ideas / future backlog
- `TODO`: Selected for current iteration / phase
- `IN_PROGRESS`: Actively under work
- `IN_REVIEW`: Code review, QA, or design review
- `DONE`: Completed & verified
- `BLOCKED`: Explicitly obstructed by unfinished dependencies
- `CANCELLED`: Discontinued tasks

### State Machine UX Constraints
- Status transitions in the frontend trigger `TaskDomainService.changeStatus`.
- If a task has unfinished blocking dependencies, the backend prevents moving to `DONE` or `IN_PROGRESS` and transitions it to `BLOCKED`. The UI respects this error and provides a clear toast explaining the blocking task dependency.

---

## 8. My Work — The Personal Work Cockpit

Instead of an unfocused generic dashboard, **My Work** (`/my-work`) answers: *"What must I deliver right now?"*

Directly backed by `MyWorkService` (`/api/tasks/my-work`), the cockpit structures tasks into clear operational buckets:
1. **🚨 Overdue**: Tasks whose due date has passed and status is not `DONE`.
2. **🎯 Due Today**: Tasks due before end of day.
3. **⏳ Upcoming**: Tasks scheduled for the upcoming 7-day window.
4. **⚠️ Blocked**: Tasks assigned to the user that are currently blocked by an upstream dependency.
5. **🔥 High Priority**: Urgent/High priority items requiring attention.
6. **✅ Recently Completed**: Tasks completed within the last 7 days.

### Component Architecture
- **`MyWorkAttentionBar`**: Actionable 5-metric summary bar (Overdue, Blocked, Due Today, Upcoming, High Priority) that acts as an interactive attention filter to jump directly into specific work queues.
- **`MyWorkQueueSection`**: Collapsible, high-density queue container with custom empty states, status/priority indicators, and count badges.
- **`MyWorkTaskRow`**: Accessible task row rendering title, project/phase context, status/priority badges, blocked dependency chips, subtask progress, due dates, and quick status toggles.
- **Task Drawer Integration**: Direct inspection via `TaskDetailDrawer` and editing via `TaskModal` reusing existing domain mutation services.
- **Client-Side Filtering**: Lightweight multi-parameter filtering by search text, project, and priority without corrupting authoritative backend categorization.
- **Realtime Resync**: Automatically invalidates and refreshes upon `TASK_CREATED`, `TASK_UPDATED`, `TASK_ASSIGNED`, `TASK_STATUS_CHANGED`, or `TASK_DELETED` broadcasts.

---

## 9. Project Workspace & Unified Task Views Architecture

The **Project Workspace** (`/projects/[id]`) is Synplan's primary collaborative work surface, establishing a unified hierarchy from project context down to tasks, dependencies, subtasks, and audit logs.

```text
Workspace
  ↓
Project Context (/projects/[id])
  ↓
Navigation Context: [ Overview | Board | List | Table | Activity | Settings ]
  ↓
Shared Task Toolbar (View Switcher, Search, Status, Priority, Phase, Assignee)
  ↓
Multi-View Representations (Board, List, Table) — Same Authoritative Task Domain
  ↓
Unified Task Drawer (TaskDetailDrawer: Info, Subtasks, Dependencies, Comments, History)
```

### Component Architecture
- **`ProjectHeader`**: Contextual navigation breadcrumb, project status badge, deterministic `ProjectHealthSignals` badge (`ON_TRACK`, `AT_RISK`, `CRITICAL`), target delivery dates, squad avatar cluster, and quick action triggers.
- **`SharedTaskToolbar`**: Unified filter and search toolbar shared across Board, List, and Table views, guaranteeing that view changes alter presentation only without losing filter state or task identity.
- **`ProjectBoardView`**: 7-state Kanban board rendering `ProjectBoardCard` components with accessible status dropdowns, priority badges, due date indicators, subtask progress, and blocked dependency chips.
- **`ProjectListView`**: Hierarchical tree representation (`Phase → Milestone → Task → Subtask` + Ungrouped Tasks) with collapsible phase/milestone accordions and stage-gate progress metrics.
- **`ProjectTableView`**: High-density tabular grid with interactive column sorting (Title, Status, Priority, Due Date, Phase), status toggles, and assignee chips.
- **`ProjectOverview`**: High-level telemetry dashboard providing authoritative health signals, blocked work queue, active deliverables, upcoming target deadlines, team roster, and audit log preview.
- **`ProjectActivityTab`**: Complete project-scoped audit stream powered by `ActivityService` (`apiClient.getActivity({ projectId })`).
- **`ProjectSettingsTab`**: Configuration form for project attributes, embedded `PhaseManager` for stage gate sequencing, team member role assignments, and danger zone project deletion with name confirmation guard.

### Data & Realtime Integration
- **Authoritative Adapters**: Directly consumes `TaskViewsService` backend adapters via `apiClient.getTasks({ projectId, view: "board"|"list"|"table" })`.
- **Health Telemetry**: Consumes `ProjectHealthService` signals via `apiClient.getProjectHealth(projectId)`.
- **Realtime Resynchronization**: Listens to centralized workspace broadcasts:
  - `TASK_CREATED`, `TASK_UPDATED`, `TASK_STATUS_CHANGED`, `TASK_DELETED`
  - `PHASE_CREATED`, `PHASE_UPDATED`, `PHASE_DELETED`, `PHASES_REORDERED`
  - `PROJECT_UPDATED`, `PROJECT_DELETED`
  Automatically invalidates client cache and updates views without per-card polling.

---

## 10. Authoritative Activity Feed Architecture

- **Data Origin**: Directly queries `ActivityService` (`/api/activity`) backed by the PostgreSQL `AuditLog` table.
- **Data Shape**:
  - `id`: Unique audit log ID.
  - `actor`: Resolved name, email, avatar, or `SYSTEM` indicator.
  - `action`: Human-readable action description (`created task`, `changed status to DONE`, `added dependency`).
  - `target`: Entity title/name.
  - `entityType`: `TASK`, `PROJECT`, `WORKSPACE`, `MEMBER`, `AUTOMATION`.
  - `entityId`: Identifier for navigation linking.
  - `timestamp`: Precise ISO timestamp.
- **Scopes**: Supports workspace-wide audit logs (`/api/activity?workspaceId=...`) and project-specific audit logs (`/api/activity?workspaceId=...&projectId=...`).
- **Realtime Updates**: Listens to server-broadcasted domain events on the workspace channel and prepends new entries without synthetic client fabrication.

---

## 11. Authoritative Notification System

- Notifications are stored in PostgreSQL (`Notification` model) and fetched via `/api/notifications`.
- Slices:
  - `unreadCount`: Badged on TopHeader bell icon.
  - Dropdown menu for rapid preview and mark-as-read.
  - Dedicated `/notifications` page with filter tabs (`All`, `Unread`, `Read`).
- Realtime: Subscribed to `NOTIFICATION_CREATED` on `user:${userId}` and `workspace:${workspaceId}` channels. New notifications appear with instant UI counter update.

---

## 12. Workflow Automation Boundary

- Configured under **Settings → Automations** (`/settings` or `/api/automations`).
- The frontend exposes a clean management interface:
  - List workspace automation rules (Name, Trigger, Status, Target Project).
  - Enable / Disable toggles (`POST /api/automations/[id]/enable`).
  - Delete rule (`DELETE /api/automations/[id]`).
  - Create rule wizard with structured condition and action selectors.
- Does NOT pollute the top-level navigation; treated as an administrative workspace capability.

---

## 12. AI Integration Boundary

- **Interaction Pattern**: Non-modal drawer (`AiAssistantDrawer.tsx`) triggered via floating button (`AiAssistantTrigger.tsx`) or keyboard shortcut.
- **Functional Boundary**:
  - Assists with natural language task creation, phase decomposition, task updates, and summaries.
  - Generates structured, typed execution plans (`AiPlan`).
  - Employs server-validated **Confirmation Sessions** (`AiConfirmationSession`) with cryptographic tokens for destructive or batch operations.
  - Issues Undo tokens (`AiExecutionReceipt`) for reversible operations.
- AI never replaces manual project and task management; it augments it as an assistant.

---

## 13. State Management Classification

| State Category | Store / Mechanism | Examples | Source of Truth |
| :--- | :--- | :--- | :--- |
| **Server State** | `apiClient` + TTL Memory Cache | Projects, Tasks, Phases, Members, Activity, Automations | PostgreSQL Database |
| **Session State** | `useWorkspaceStore` (`currentUser`, `activeWorkspace`) | Active user session, active workspace selection | Server Session Cookie & Auth API |
| **Client UI State** | `useUiStore` & `useTaskStore` (filters only) | Sidebar collapsed, active tab, active view mode, modals, search query | Browser Memory / LocalStorage |
| **Ephemeral State** | React `useState` / `useReducer` | Form inputs, dropdown open states, sorting direction | Local Component React Tree |

### Eliminated Redundancies
- Removed duplicate `notifications` slice from `useUiStore` (consolidated exclusively into `useNotificationStore`).
- Eliminated fake analytics calculation overrides in `ReportsPage`.
- Eliminated synthetic client-side broadcasts (`realtimeClient.broadcast("ACTIVITY_CREATED")`).

---

## 14. Data Fetching & Cache Strategy

- **Client Wrapper**: `src/lib/apiClient.ts` provides a unified, typed HTTP client.
- **In-Flight Deduplication**: Concurrent requests to identical endpoints (e.g. `GET /api/projects`) are multiplexed to a single network promise.
- **Memory Cache**: Light TTL-based memory cache (4,000ms – 10,000ms) prevents redundant refetches during fast tab navigation.
- **Cache Invalidation**: Mutations (`createTask`, `updateTask`, `createProject`, etc.) immediately invalidate affected cache prefixes (`invalidateApiCache("/api/tasks")`).

---

## 15. Realtime Frontend Boundary

- **Single Gateway**: One `RealtimeProvider` per active workspace (`workspace:${workspaceId}`).
- **Event Flow**:
  1. Server mutation executes inside domain transaction.
  2. Server emits typed domain event via `eventBus`.
  3. Realtime publisher broadcasts to Supabase channel.
  4. Client `RealtimeProvider` receives event and routes to registered listeners.
  5. Listeners invalidate relevant `apiClient` cache prefixes and update reactive stores.
- **No Per-Card Subscriptions**: Cards and list items do not open independent channels or websocket connections.

---

## 16. Permission-Aware UI (RBAC)

- **Roles Supported**:
  - Workspace: `OWNER`, `ADMIN`, `MEMBER`, `VIEWER`.
  - Project: `LEAD`, `CONTRIBUTOR`, `VIEWER`.
- **UI Policy**:
  - `usePermissions` hook provides conditional rendering hints (e.g. disabling delete buttons for `VIEWER`).
  - All UI checks are strictly treated as **UX guidance**. The backend domain guards (`verifyUserWorkspaceAccess`, `verifyUserProjectAccess`) remain authoritative. If a user bypasses UI controls, the backend rejects the operation with `403 Forbidden`.

---

## 17. Responsive Strategy

- **Desktop (≥ 1024px)**: Full multi-column Kanban board, comprehensive table view, side-by-side split panels, expanded sidebar.
- **Tablet (768px – 1023px)**: Collapsible compact sidebar (`w-16`), horizontal scroll for Kanban columns, stacked list items.
- **Mobile (< 768px)**:
  - Sidebar collapses to slide-over drawer with backdrop blur.
  - Primary focus shifts to **My Work**, **Task Details**, and **Notifications**.
  - Kanban board defaults to tabbed column view or dense list view.
  - Safe touch targets (minimum 44x44px) for all buttons and interactive controls.

---

## 18. Accessibility Strategy

- **Semantic HTML**: Proper `<header>`, `<nav>`, `<main>`, `<aside>`, `<section>`, and `<article>` tags.
- **Focus Management**: Focus traps on modals (`TaskModal`, `CommandPalette`), autofocus on primary inputs, and ESC key listener on all drawers and overlays.
- **Keyboard Navigation**:
  - `Cmd+K` / `Ctrl+K`: Global search & command launcher.
  - Tab order flows predictably through form fields and buttons.
- **Contrast & State**:
  - High-contrast text tokens (`text-foreground`, `text-muted-foreground`) meeting WCAG AA requirements.
  - Priority and status badges utilize both color indicators and explicit text labels.

---

## 19. Deprecated & Removed Frontend Systems

1. **Synthetic Activity Broadcasts**: Client components broadcasting fake `Squad Member` activity items removed in favor of authoritative `AuditLog` events.
2. **Duplicate Notification Stores**: Unused notification slice in `useUiStore` removed to eliminate dual sources of truth.
3. **Hardcoded Phase List**: Static `PHASES` array in project detail replaced with real `Phase` and `Milestone` records from `/api/phases`.
4. **Fake Analytics Multipliers**: Arbitrary date-range formulas in reports page removed in favor of authoritative analytics endpoints.

---

## 20. Component Inventory & Classification

| Component | Path | Classification | Rationale |
| :--- | :--- | :---: | :--- |
| `AppShell` | `src/components/layout/AppShell.tsx` | **KEEP** | Clean layout shell with realtime provider and command palette |
| `TopHeader` | `src/components/layout/TopHeader.tsx` | **ADAPT** | Add My Work & Activity navigation links; ensure clean workspace resolver |
| `Sidebar` | `src/components/layout/Sidebar.tsx` | **ADAPT** | Update navigation items to prioritize My Work, Projects, Tasks, Activity |
| `GlobalSearch` | `src/components/layout/GlobalSearch.tsx` | **REPLACE** | Consolidated into `CommandPalette` to eliminate dual shortcut listeners |
| `CommandPalette` | `src/components/common/CommandPalette.tsx` | **ADAPT** | Unified Cmd/Ctrl+K palette for navigation, entity search, and quick actions |
| `RealtimeProvider` | `src/components/realtime/RealtimeProvider.tsx` | **KEEP** | Centralized workspace channel manager |
| `RealtimeStatusBadge` | `src/components/realtime/RealtimeStatusBadge.tsx` | **KEEP** | Subtle visual connection health badge |
| `AiAssistantDrawer` | `src/components/ai/AiAssistantDrawer.tsx` | **KEEP** | Non-modal assistant drawer with plan confirmation safety |
| `AiAssistantTrigger` | `src/components/ai/AiAssistantTrigger.tsx` | **KEEP** | Floating action trigger |
| `KpiSummaryGrid` | `src/components/dashboard/KpiSummaryGrid.tsx` | **KEEP** | Realtime KPI metrics from `/api/dashboard/summary` |
| `RecentActivityFeed` | `src/components/dashboard/RecentActivityFeed.tsx` | **ADAPT** | Switch to `/api/activity` authoritative audit endpoint |
| `KanbanColumn` | `src/components/kanban/KanbanColumn.tsx` | **ADAPT** | Support all 7 state machine statuses |
| `KanbanCard` | `src/components/kanban/KanbanCard.tsx` | **KEEP** | Draggable task card with priority and dependency badges |
| `TaskModal` | `src/components/kanban/TaskModal.tsx` | **ADAPT** | Connect phases to `/api/phases` and support blocking dependencies |
| `TaskDetailDrawer` | `src/components/kanban/TaskDetailDrawer.tsx` | **ADAPT** | Display dependency blocking state and subtask completion |
| `PhaseManager` | `src/components/projects/PhaseManager.tsx` | **ADAPT** | Persist phases and milestones via `/api/phases` |
| `ProjectCard` | `src/components/projects/ProjectCard.tsx` | **KEEP** | Displays health signals, deadlines, and progress |
| `ProjectModal` | `src/components/projects/ProjectModal.tsx` | **KEEP** | Multi-phase project creation wizard |
| `WorkloadVisualizer` | `src/components/team/WorkloadVisualizer.tsx` | **KEEP** | Team member workload score visualizer |
| `RbacMatrixTable` | `src/components/settings/RbacMatrixTable.tsx` | **KEEP** | Role permission matrix display |
| `WorkspaceProfileForm`| `src/components/settings/WorkspaceProfileForm.tsx` | **KEEP** | Workspace settings form |
| `useUiStore` | `src/store/useUiStore.ts` | **ADAPT** | Strip dead duplicate notifications slice |
| `useTaskStore` | `src/store/useTaskStore.ts` | **ADAPT** | Support table view and full status enum |
| `useNotificationStore`| `src/store/useNotificationStore.ts` | **KEEP** | Authoritative user notification store |
| `apiClient` | `src/lib/apiClient.ts` | **ADAPT** | Add `getMyWork()`, `getActivity()`, `getAutomations()` methods |
| UI Primitives (`button`, `dialog`, `skeleton`, etc.) | `src/components/ui/*` | **KEEP** | Core reusable presentation tokens |

---

## 21. Global Tasks Workspace & Multi-View Task Architecture (Phase 6E)

### 21.1 Overview & Workspace Role
The global `/tasks` workspace serves as Synplan's centralized, workspace-wide task management control surface across all delivery pipelines. It represents tasks across the entire active workspace, preserving strict separation of responsibilities:
- `/my-work`: Personal workload and immediate attention queues (tasks assigned to current user).
- `/tasks`: Workspace-wide task delivery control surface across all workspace projects.
- `/projects/[id]`: Project workspace with deterministic health telemetry, overview, milestones, settings, and phases.

### 21.2 Hierarchy & Information Flow
```text
Workspace
  ↓
Global Tasks (/tasks)
  ↓
Page Header (Tasks H1, Workspace Badge, Sync Action, "+ New Task" Action)
  ↓
Shared Task Toolbar (Board | List | Table view switcher, Search, Status, Priority, Project, Phase, Assignee, Counter, Reset)
  ↓
Task Views (Board, List, Table) — 3 unified projections of the authoritative workspace task dataset
  ↓
Task Selection & Multi-Row Checkbox
  ↓
Floating Batch Operations Bar (Batch Status, Batch Priority)
  ↓
TaskDetailDrawer (Authoritative Task Inspector: Subtasks, Dependencies, Comments, History)
```

### 21.3 Shared Multi-View System
- **Unified Toolbar (`SharedTaskToolbar`)**: Shared filter state (`SharedFilterState`) containing `search`, `status`, `priority`, `assigneeId`, `phaseId`, and `projectId`. Features real-time filtered-versus-total task telemetry.
- **Board View (`ProjectBoardView`)**: 7-state Kanban board (`backlog`, `todo`, `in_progress`, `in_review`, `blocked`, `done`, `cancelled`). Each `ProjectBoardCard` displays task title, subtle project indicator (name and color dot), priority badge, assignee avatar, due date chip, blocker chip, and subtask progress chip.
- **List View (`ProjectListView`)**: Preserves project context via hierarchical grouping (`Project → Phase → Milestone → Task → Subtasks`). Supports collapsible project groups with completion progress bars and task counters. Tasks without phases are placed in an "Ungrouped Tasks" container.
- **Table View (`ProjectTableView`)**: High-density tabular grid with sortable columns: Task, Project, Status, Priority, Assignee, Due Date, Phase, Subtasks. Integrates multi-task selection checkboxes for atomic batch mutations.
- **Batch Operations**: Table row selection reveals a floating action bar supporting atomic batch operations via `/api/tasks/batch` (`STATUS`, `PRIORITY`) powered by `TaskDomainService.batchChangeStatus` and `batchChangePriority`.
- **Authoritative Inspector (`TaskDetailDrawer`)**: Reused directly across `/my-work`, `/tasks`, and `/projects/[id]`. Inspects and mutates tasks using authoritative backend APIs, rendering dependencies, subtasks, comments, and audit timeline.
- **Task Creation (`TaskModal`)**: Centralized task creation modal with project selection, phase selection, assignee, status, priority, and subtasks.
- **Centralized Realtime Synchronization**: Subscribed to `TASK_CREATED`, `TASK_UPDATED`, `TASK_STATUS_CHANGED`, `TASK_DELETED`, `PROJECT_UPDATED`. Cache invalidation (`/api/tasks`, `/api/projects`) triggers automatic UI state refresh without polling or per-card sockets.

---

## 22. Projects Directory Architecture (Phase 6F)

### 22.1 Overview & Architecture Role
The `/projects` page serves as Synplan's workspace-wide **Projects Directory** and the primary entry point for discovering, filtering, sorting, and creating projects across delivery pipelines. It maintains a strict boundary with `/projects/[id]`:
- `/projects`: Project Directory (workspace discovery, status filtering, member context, task ratio telemetry, and permission-guarded project creation).
- `/projects/[id]`: Project Workspace (execution environment with Board/List/Table views, deterministic health telemetry, milestones, phases, and settings).

### 22.2 Hierarchy & Information Flow
```text
Workspace
  ↓
Projects Directory (/projects)
  ├── Page Header (Projects H1, Total Counter, Live Realtime Sync, Permission-guarded "+ New Project")
  ├── Directory Toolbar
  │     ├── Debounced Search (Title, Description, Project Key)
  │     ├── Status Filter Tabs with dynamic count badges (All, Active, Planning, On Hold, Completed, Archived)
  │     ├── Sort Selector Dropdown (Recently Updated, Date Created, Project Name, Deadline)
  │     └── View Mode Switcher (Grid, List)
  ├── Project Grid / List View
  │     └── ProjectCard (Slate-Cobalt container, ProjectStatusBadge, Task Telemetry, Avatar Cluster, Deadline Chip, Accessible Menu)
  │           ↓
  │     Click Project → Navigate to /projects/[id] (Project Workspace)
  └── Create Project Wizard (ProjectModal with multi-step creation and cache invalidation)
```

### 22.3 Presentation & Primitives
- **Slate-Cobalt ProjectCard (`ProjectCard.tsx`)**: Replaces legacy spotlight card with a refined Slate-Cobalt card container. Displays project key badge, project title, description, `ProjectStatusBadge`, member avatar stack, authoritative task ratio telemetry (`X / Y tasks` with progress bar), due date chip with overdue indicator, and accessible options menu with delete confirmation.
- **ProjectStatusBadge (`src/components/ui/badge.tsx`)**: Semantic badge mapping the 5 authoritative Prisma project statuses (`planning`, `active`, `on_hold`, `completed`, `archived`) with explicit icons and accessible labels.
- **Loading Skeleton (`loading.tsx`)**: Matches the Slate-Cobalt Directory toolbar and card grid layout for seamless initial loading.

### 22.4 Filtering, Sorting & Telemetry
- **Filter Tabs**: Categorizes projects by status (`all`, `active`, `planning`, `on_hold`, `completed`, `archived`), rendering badge counts derived from the active project list.
- **Debounced Search**: Responsive search filtering across project name, description, and project key.
- **Dual Sorting Support**:
  - Server-side: `GET /api/projects?sort=updated|created|name|deadline` accepts dynamic sort parameters.
  - Client-side: In-memory sorting on `filteredProjects` guarantees instant response when toggling sorts or status tabs.
- **Authoritative Task Telemetry**: `GET /api/projects` calculates aggregated task progress (`totalTasks`, `completedTasks`, `progress`) directly from database task states (`done`), preventing mock multipliers or fake statistics.

### 22.5 Permission-Aware Project Creation
- **UI RBAC Gate**: Evaluates `hasPermission(activeWorkspace?.role, "projects.create")` to show or hide the `+ New Project` button and empty-state action triggers (accessible to `OWNER`, `ADMIN`, `MEMBER`; disabled/hidden for `VIEWER`).
- **Server Guard**: `requireAuthGuard(req, "projects.create", workspaceId)` enforces RBAC at the API layer, rejecting unauthorized creation attempts with `403 Forbidden`.
- **Creation Flow**: Triggers `ProjectModal` wizard; on success, invalidates `/api/projects` cache and navigates to the newly created project workspace.

### 22.6 Centralized Realtime & Cache Invalidation
- **Realtime Listener**: Centralized subscription via `useRealtime` listening to `PROJECT_CREATED`, `PROJECT_UPDATED`, `PROJECT_DELETED`, `TASK_CREATED`, `TASK_STATUS_CHANGED`, `TASK_DELETED`.
- **Zero Sockets Per Card**: Individual project cards never open separate realtime sockets. Global events trigger cache invalidation (`invalidateApiCache("/api/projects")`) and automatic UI refresh.

---

## 23. Activity & Audit Workspace Architecture (Phase 6G)

### 23.1 Overview & Architecture Role
The `/activity` page serves as Synplan's workspace-wide **Activity & Audit Workspace**. It is directly backed by the PostgreSQL `AuditLog` domain table (`@@index([workspaceId, timestamp])`, `@@index([workspaceId, actorId, timestamp])`, `@@index([workspaceId, action, timestamp])`, `@@index([workspaceId, entityType, timestamp])`) and `ActivityService.getActivityFeed`, eliminating synthetic feed generators and client-invented event mocks.

### 23.2 Authoritative Data Flow
```text
Domain Action (Task, Project, Phase, Member, AI Execution)
      ↓
Authoritative Audit Event (EventBus / createAuditEntry)
      ↓
PostgreSQL AuditLog (workspaceId, actorId, action, target, entityType, entityId, metadata, timestamp)
      ↓
Activity Domain Service (ActivityService.getActivityFeed with actor/project/search filters & cursor pagination)
      ↓
/api/activity (Server-authorized, workspace-scoped, two-tier RBAC guard)
      ↓
/activity (Slate-Cobalt Activity & Audit Timeline)
      ├── Header with Activity Counter, Live Sync Status, and Refresh Action
      ├── Filter Toolbar (Search, Actor Filter, Project Filter, Entity Tabs, Reset)
      ├── Live Event Notification Banner ("X new activities • Click to view")
      ├── Date-Grouped Timeline (Today, Yesterday, This Week, Earlier)
      ├── Structured Activity Items (ActivityTimelineItem & ActivityEventFormatter)
      └── Infinite Timeline / Cursor Pagination with Deduplication
```

### 23.3 Presentation & Primitives
- **`ActivityEventFormatter` (`src/components/activity/ActivityEventFormatter.ts`)**: Centralized formatter that maps audit action strings (`TASK_CREATED`, `CREATE_TASK`, `TASK_STATUS_CHANGED`, `PROJECT_CREATED`, `COMMENT_CREATED`, `AI_EXECUTION_COMPLETED`, etc.) to semantic Lucide icons, Slate-Cobalt color tokens, human-readable action verbs, structured context snippets, and safe destination URLs. Includes graceful fallback for unknown/custom actions.
- **`ActivityTimelineItem` (`src/components/activity/ActivityTimelineItem.tsx`)**: Accessible timeline node featuring actor avatar/monogram, action verb, clickable entity link, status transition pill (`Planning → In Progress`), comment excerpt, and relative timestamp with full ISO tooltip.
- **`ActivityFilterToolbar` (`src/components/activity/ActivityFilterToolbar.tsx`)**: Responsive toolbar integrating debounced search, real workspace member dropdown, workspace project dropdown, entity filter tabs (`All`, `Tasks`, `Projects`, `Comments`, `Members`), and active filter reset action.

### 23.4 Multi-Dimensional Server-Side Filtering
- **Actor Filter**: Scoped to verified workspace members (`apiClient.getTeamMembers`), filtering directly on indexed `where.actorId`.
- **Project Filter**: Scoped to workspace projects (`apiClient.getProjects`), filtering on `entityId = projectId` or `metadata.projectId = projectId`.
- **Combined Filtering**: Intersects `actorId` AND `projectId` on the server using Prisma `AND` clauses.
- **Search**: Server-side case-insensitive query matching `target`, `action`, or `actor.name`.

### 23.5 Pagination & Scroll-Safe Realtime Updates
---

## 24. Workspace Settings & Configuration Architecture (Phase 6H)

### 24.1 Overview & Architectural Purpose
The `/settings` surface serves as Synplan's **centralized, authoritative workspace configuration environment**. It unifies tenant identity, authenticated user profile management, real-time notification dispatch telemetry, single sign-on security, role-based access control (RBAC), disaster recovery resilience, and platform plan entitlements into a cohesive, responsive Slate-Cobalt interface.

### 24.2 Conceptual Structure & Navigation
```text
/settings
    ↓
Workspace Settings
    ├── General       → Workspace name, URL slug, logo URL, tenant identifiers, owner telemetry
    ├── Profile       → Authenticated display name, avatar URL, read-only OAuth email, system role
    ├── Notifications → In-app delivery queue telemetry, WebSocket status, planned external digests
    ├── Security      → Delegated OAuth SSO, active session telemetry, RBAC matrix, disaster recovery
    ├── Integrations  → Single sign-on providers, planned webhooks/sync, server-side secret isolation
    ├── Billing       → Community Edition status, active platform entitlements, zero fake checkout
    └── Appearance    → Interface theme modes (Dark, Light, System) with persistent UI store
```

### 24.3 Authoritative Data Flow & Server Enforcement
```text
User Input (/settings?tab=...)
       ↓
Client Validation & Dirty State Tracking (Clean, Dirty, Saving, Saved, Error)
       ↓
Typed API Client (apiClient.updateWorkspaceSettings / apiClient.updateUserProfile)
       ↓
Server API Route (/api/workspaces/settings, /api/auth/profile)
       ↓
Permission Guard (requireAuthGuard: workspace.update for workspace; session for profile)
       ↓
Zod Schema Validation (UpdateWorkspaceSettingsSchema, UpdateUserProfileSchema)
       ↓
Database Persistence (Workspace, User)
       ↓
Immutable Audit Log (WORKSPACE_SETTINGS_UPDATE, USER_PROFILE_UPDATE)
       ↓
Store & Invalidation Synchronization (useWorkspaceStore, invalidateApiCache)
```

### 24.4 Epistemic Discipline & Honest Architecture Boundaries
- **General Settings**: Persisted to `Workspace` table. Strictly guarded by `workspace.update` (`OWNER` and `ADMIN` roles). `MEMBER` and `VIEWER` roles receive an informative view-only state; server rejects unauthorized mutations with `403 Forbidden`.
- **Profile Settings**: Persisted to `User` table (`name`, `avatarUrl`). `email` is strictly read-only and verified via OAuth provider.
- **Notification Settings**: Documents the real in-app notification queue (`Notification` model) and WebSocket streaming. Avoids fake toggle controls for unbacked preference models; transparently classifies email/Slack digests as future domain modules.
- **Security & Access Control**: Accurately reflects Synplan's delegated OAuth 2.0 architecture (Google & GitHub). Avoids fake 2FA or password reset forms. Displays live session tokens (masked), session termination action (`/api/auth/logout`), complete RBAC permission matrix, and disaster recovery snapshot exports (`/api/admin/backup/export`).
- **Integrations**: Displays active SSO identity providers. Planned bi-directional synchronizers (GitHub Issues/PRs, Outbound Webhooks) are marked as upcoming. Guarantees zero secret exposure to the browser.
- **Billing**: Honestly presents the workspace as operating under the **Community Edition / Open Workspace** ($0.00/month). Unlocks all current platform capabilities (unlimited projects, tasks, multi-views, real-time sync, audit logs) without simulating fake credit card inputs or fake invoice downloads.

### 24.5 Responsive Layout & Deep Linking
- **Desktop**: Left navigation sidebar with icon, title, description, and active state pill; content pane on the right with sticky positioning.
- **Mobile**: Horizontal scrollable segmented pill navigation preventing unintended horizontal viewport overflows.
- **Deep Linking**: Synchronizes active tab state with the URL query string (`/settings?tab=general|profile|security|...`), supporting direct links, bookmarks, and full browser history navigation (`back`/`forward`).

---

## 25. Team & People Workspace Architecture (Phase 6I)

### 25.1 Architecture & Core Objectives
The Team & People Workspace (`/team`) provides an authoritative, real-time command surface for managing workspace members, balancing sprint allocations, inspecting individual workload capacity, and enforcing server-authoritative role hierarchies. It eliminates legacy visual gimmicks (`AnimatedGrid`, `MagnetButton`, `SpotlightCard`) in favor of Synplan's Slate-Cobalt design language.

```text
/team
  ├── Header (Member Counter, Role-Guarded Member Invite Modal)
  ├── WorkloadVisualizer (Squad Bandwidth, Allocated Active Tasks, Bottleneck Risks)
  ├── Filter & Search Control Bar (Keyword Search, Workload Capacity Tabs, Role Select, View Mode Toggle)
  ├── Views:
  │     ├── Grid View (MemberCard with capacity bars, project pills, action menus)
  │     └── Table View (MemberTableView with high-density tabular telemetry)
  ├── MemberDetailDrawer (Slide-out drawer with telemetry breakdown, project memberships, role editor, guarded removal)
  └── InviteMemberModal (Squad addition with role hierarchy enforcement & in-app notifications)
```

### 25.2 Dual View Modes (Grid & High-Density Table)
- **Grid View (`MemberCard`)**: Clean Slate-Cobalt card layout featuring avatar initial monogram fallback, role badges (`Owner`, `Admin`, `Member`, `Viewer`), workload utilization progress bar, capacity status chip (`Optimal`, `High`, `Overloaded`), active task counters, project involvement pills, and permission-aware actions menu (`Change Role`, `Remove Member`). Clicking any card opens the focused Member Detail Drawer.
- **Table View (`MemberTableView`)**: High-density tabular layout optimized for managing larger teams. Displays Member (avatar, name, email), Role badge, Workload Capacity percentage with visual progress bar, Active Tasks count, Projects pills with direct links, Joined Date formatting, and permission-aware actions menu.

### 25.3 Member Detail Drawer (`MemberDetailDrawer`)
An accessible, keyboard-dismissable (`Esc`) slide-out drawer providing comprehensive member telemetry without losing workspace navigation context:
- **Header**: Avatar monogram, user full name, verified email, and a one-click Global User ID copy button.
- **Role Management Card**: Interactive role selector reflecting the user's current role. Strictly guarded by `canModifyRole(callerRole, targetMemberRole, newRole)`. Owners are protected from demotion; Admins cannot elevate themselves or other members to Admin or Owner.
- **Workload & Task Telemetry**: Visual progress bar indicating workload capacity percentage, accompanied by a three-way numeric breakdown: Active Tasks, Completed Tasks, and Total Tasks Assigned.
- **Workspace Projects Card**: Displays all projects within the active workspace where the member is enrolled, including their project-specific role and direct clickable links to `/projects/[id]`.
- **Membership Metadata**: Joined date and internal WorkspaceMember ID.
- **Guarded Destructive Removal**: Removal button with confirmation modal. Disabled if the target is an `OWNER` or if the caller lacks `members.remove` permissions.

### 25.4 Server-Authoritative RBAC & Permission Enforcement
Permission rules are strictly enforced at the API boundary (`src/app/api/team/members/route.ts`), while frontend components provide role-aware UX:
- **Owner (`OWNER`)**: Full authority to invite members (Admin, Member, Viewer), modify roles (Admin, Member, Viewer), and remove members (Admin, Member, Viewer). Owner cannot be demoted or removed by any user (including themselves).
- **Admin (`ADMIN`)**: Can invite Members and Viewers (`members.invite`). Can modify roles between `MEMBER` and `VIEWER` (`members.update_role`). Cannot modify, demote, or remove another Admin or the Owner. Cannot promote any user to Admin or Owner.
- **Member (`MEMBER`) & Viewer (`VIEWER`)**: Read-only access to `/team`. Any mutate attempt (`POST`, `PUT`/`PATCH`, `DELETE`) is rejected at the API route with `403 Forbidden`.

### 25.5 Workload Telemetry & Sprint Bandwidth (`WorkloadVisualizer`)
- **Squad Bandwidth**: Calculates overall team capacity utilization `(totalActiveTasks / (memberCount * MAX_CAPACITY_PER_MEMBER)) * 100`.
- **Allocated Active Tasks**: Aggregate count of active (non-completed) tasks assigned to squad members across the workspace.
- **Bottleneck Risks**: Real-time counter of members with utilization > 85%, alerting sprint leads to potential burnout or delayed deliverables.

### 25.6 Honest Invitation & Realtime Events (Zero Fake Tokens)
- **Zero Fake Infrastructure**: Rather than simulating fake SMTP email delivery or unbacked invitation tokens, `POST /api/team/members` transparently provisions or attaches the user to the workspace squad.
- **In-App Notification**: An in-app `Notification` record is created for the invited member, alerting them upon their next login.
- **Immutable Audit Logging**: Every invitation, role change, and member removal generates an authoritative `AuditLog` entry (`MEMBER_INVITED`, `MEMBER_ROLE_UPDATED`, `MEMBER_REMOVED`).
- **Realtime WebSocket Synchronization**: Publishes `MEMBER_INVITED`, `MEMBER_ROLE_UPDATED`, and `MEMBER_REMOVED` events to the workspace channel, enabling live synchronization across all connected clients with automatic reconnect catch-up resync.

### 25.7 Atomic Member Removal & Data Integrity
When a member is removed via `DELETE /api/team/members?id=[id]`:
- Server executes an atomic Prisma `$transaction`:
  1. Unassigns all tasks within the workspace assigned to this user (`assignedToId: null`).
  2. Deletes all `ProjectMember` records linking the user to projects within this workspace.
  3. Deletes the `WorkspaceMember` record.
  4. Writes an `AuditLog` entry.
- Guarantees zero orphaned assignments or broken foreign key references.

---

## 26. Project Workspace Architecture (`/projects/[id]`)

### 26.1 Overview & Responsibilities
The Project Workspace (`/projects/[id]`) is the operational command center for an initiative in Synplan. Rather than functioning as a static project overview, it provides a high-density, real-time productivity workspace bridging project metadata, multi-view execution workflows (Kanban Board, Hierarchical List, Dense Table), dedicated squad collaboration, explainable health telemetry, and an immutable audit activity stream.

```text
/projects/[id]
  ├── ProjectHeader (Breadcrumbs, Status Badge, Quick Status Transition, Lead Badge, Deadline, Actions Menu)
  ├── Workspace Context Tabs:
  │     ├── Overview (Authoritative Telemetry Strip, Blocked Work Queue, Deadlines, Squad Roster, Recent Activity)
  │     ├── Tasks (SharedTaskToolbar + BoardView [Kanban] | ListView [Phased] | TableView [Dense Grid])
  │     ├── Members (ProjectMembersTab: Squad roster, role selector, workload telemetry, add/remove members)
  │     ├── Activity (ProjectActivityTab: Authoritative AuditLog timeline with deep entity links)
  │     └── Settings (ProjectSettingsTab: Metadata, status, delivery roadmap/phases, danger zone)
  ├── TaskDetailDrawer (Dynamic slide-out inspection drawer for any selected task)
  └── TaskModal (Pre-scoped task creation/editing dialog locked to active projectId)
```

### 26.2 Project Header & Fast Actions
- **Title & Metadata**: Color pill indicator, initiative title, description with truncation safeguards, target deadline chip, and Project Lead indicator (`UserCheck`).
- **Interactive Status Changer**: Server-authoritative status switcher (`PLANNING`, `ACTIVE`, `ON_HOLD`, `COMPLETED`, `ARCHIVED`). Changes are guarded by `projects.update`, persisted directly to PostgreSQL, broadcasted via Supabase Realtime, and audited.
- **Actions Menu (`...`)**: Accessible dropdown offering quick shortcuts (`Add Task`, `Squad Members`, `Configure Project`, `Archive Project`, `Delete Project`).
- **Health Signal Badge**: Real-time evaluation badge (`ON_TRACK`, `AT_RISK`, `CRITICAL`) with tooltip explainability computed from delivery milestone targets, blocked items, and overdue work.

### 26.3 Unified Tasks Engine & Views
- **Shared Filtering & Search**: Shared filter state across views (`search`, `status`, `priority`, `assigneeId`, `phaseId`).
- **Multi-View Modes**:
  1. **Kanban Board (`ProjectBoardView`)**: 7-lane Kanban board (`BACKLOG`, `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `BLOCKED`, `DONE`, `CANCELED`) with interactive task creation per lane.
  2. **Hierarchical List (`ProjectListView`)**: Stage-gate roadmaps categorized by delivery phases and milestones.
  3. **High-Density Table (`ProjectTableView`)**: Tabular view featuring instant sortable columns, quick status toggles, and assignee chips.
- **Drawer Integration**: Clicking any task across all three views opens the unified `TaskDetailDrawer` for deep inspection without leaving the project workspace.
- **Pre-Scoped Task Creation**: `TaskModal` accepts `defaultProjectId={project.id}`, ensuring newly created tasks are automatically associated with the active project container.

### 26.4 Project Squad Management (`ProjectMembersTab` & `/api/projects/[id]/members`)
A dedicated, authoritative interface for managing initiative collaborators:
- **Squad Roster**: Shows user avatar monogram, name, email, project role (`LEAD`, `CONTRIBUTOR`, `VIEWER`), and active task workload in this project.
- **Workload Telemetry**: Dynamically counts active assigned tasks (`assigneeId = user.id` where status is not `DONE` or `CANCELED`) within this project. Clicking filters the task views directly to that member's tasks.
- **Role Hierarchy**:
  - `LEAD`: Directs delivery, roadmap planning, and squad management.
  - `CONTRIBUTOR`: Assigned work items, updates status, and collaborates on deliverables.
  - `VIEWER`: Read-only access to deliverables and roadmap.
- **Member Assignment Modal**: Allows selecting from workspace members not yet assigned to the project. Validates on both client and server that target user belongs to the project's workspace.
- **Guarded Removal**: Removing a member preserves all their historical tasks, phases, and comments while safely detaching the `ProjectMember` record and writing an audit log.

### 26.5 Server-Authoritative RBAC & Cross-Workspace Security Boundaries
All project mutations are enforced on the server authorization layer (`src/lib/authGuard.ts` and API routes):
- **`projects.view`**: OWNER, ADMIN, MEMBER, VIEWER can inspect project, tasks, members, activity, and health signals.
- **`projects.update`**: OWNER, ADMIN, MEMBER (or designated Project LEAD) can update project metadata, transition status, and manage project squad members. VIEWERS attempting mutations receive `403 Forbidden`.
- **`projects.delete`**: Strictly reserved for workspace OWNER and ADMIN. Regular MEMBERS and VIEWERS are rejected with `403 Forbidden`.
- **Cross-Workspace Boundary**: Direct requests to `/api/projects/[id]` or `/api/projects/[id]/members` from a foreign workspace session are rejected with `403 Forbidden`. Attempting to assign a user from a different workspace to a project is rejected with `400 Bad Request`.

### 26.6 Centralized Realtime Synchronization
- Realtime events are published via `publishWorkspaceEvent` to the Supabase Realtime channel:
  - `PROJECT_UPDATED`: Dispatched on metadata or status transitions.
  - `PROJECT_MEMBER_ADDED`, `PROJECT_MEMBER_UPDATED`, `PROJECT_MEMBER_REMOVED`: Dispatched on squad mutations.
  - `TASK_CREATED`, `TASK_UPDATED`, `TASK_STATUS_CHANGED`, `TASK_DELETED`: Dispatched on work item mutations.
  - `PHASE_CREATED`, `PHASE_UPDATED`, `PHASE_DELETED`, `PHASES_REORDERED`: Dispatched on roadmap changes.
- The Project Workspace listens to these events, invalidates memory cache, and updates UI state smoothly without causing full page reloads or infinite fetch loops.

### 26.7 Atomic Cascade Deletion & Audit Trail
When a project is deleted via `DELETE /api/projects/[id]`:
- Server executes an atomic Prisma `$transaction`:
  1. Deletes all `TaskComment` records associated with project tasks.
  2. Deletes all `Subtask` records associated with project tasks.
  3. Deletes all `Task` records belonging to the project.
  4. Deletes all `Phase` records belonging to the project.
  5. Deletes all `ProjectMember` records belonging to the project.
  6. Deletes the `Project` record.
  7. Creates an authoritative `AuditLog` entry (`PROJECT_DELETE`).
- Broadcasts `PROJECT_DELETED` realtime event, triggering automatic client redirection back to `/projects`.

---

## 27. Notification Architecture & User Notification Center

### 27.1 Notification vs Activity Distinction
In Synplan, Notifications and Activity serve two completely distinct architectural purposes:
- **Activity (`/activity` & `AuditLog`)**: Immutable, workspace-wide chronological ledger recording administrative and operational events for organizational compliance, security tracing, and team telemetry.
- **Notifications (`/notifications` & `Notification`)**: Actionable, personal, user-specific delivery queue targeted directly to authenticated individuals based on relevant domain triggers (e.g. task assignments, squad invites, role updates). Notifications represent items requiring attention, whereas Activity is an audit trail.

### 27.2 Notification Lifecycle & Domain Recipient Rules
Notifications are created through the server-side authoritative helper `createNotification` (`src/lib/notificationService.ts`). Every notification requires explicit semantic justification and strict recipient resolution:

1. **Task Assignment (`TASK_ASSIGNED`)**:
   - Recipient: Newly assigned collaborator (`assigneeId`).
   - Anti-Self Suppression: If creator or assigner assigns work to themselves (`actorId === assigneeId`), notification creation is automatically suppressed.
   - Deep Link: `/tasks?taskId=${taskId}` (opens the `TaskDetailDrawer`).
2. **Task Status Transition (`TASK_STATUS_CHANGED`)**:
   - Recipient: Task assignee (`task.assigneeId`).
   - Anti-Self Suppression: Only dispatched when changed by a collaborator other than the assignee (`actorId !== assigneeId`).
   - Deep Link: `/tasks?taskId=${taskId}`.
3. **Project Squad Assignment (`PROJECT_MEMBER_ADDED`)**:
   - Recipient: Added squad collaborator (`userId`).
   - Trigger: `POST /api/projects/[id]/members`.
   - Deep Link: `/projects/${projectId}` (directs to Project Workspace).
4. **Project Role Updated (`PROJECT_UPDATED`)**:
   - Recipient: Affected squad collaborator (`userId`).
   - Trigger: `PATCH /api/projects/[id]/members`.
   - Deep Link: `/projects/${projectId}`.
5. **Team Squad Invitation / Role Updated (`TEAM_MEMBER_ADDED`)**:
   - Recipient: Invited or re-roled team collaborator (`userId`).
   - Trigger: `POST /api/team/members` and `PATCH /api/team/members`.
   - Deep Link: `/team`.

### 27.3 Authoritative API Contracts (`/api/notifications`)
- **`GET /api/notifications`**:
  - Requires valid session authentication (`Role.VIEWER` minimum).
  - Scoped strictly to `where: { userId: auth.userId, workspaceId: auth.workspaceId }`.
  - Supports filters (`all`, `unread`, `read`).
  - Supports cursor and page-based pagination with deterministic dual-column tie-breaker ordering (`orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`).
  - Returns payload with `data`, `unreadCount`, and structured `pagination` metadata (`total`, `hasMore`, `nextCursor`).
- **`PATCH /api/notifications`**:
  - Single mark-read: Accepts `{ id: string }`. Validates that notification exists and strictly belongs to `auth.userId` and `auth.workspaceId`. Rejects cross-user mutations with `403 Forbidden`.
  - Bulk mark-read: Accepts `{ markAll: true }`. Atomically updates all unread notifications for the caller's `(userId, workspaceId)` tuple and broadcasts `NOTIFICATIONS_READ_ALL`.
- **`DELETE /api/notifications`**:
  - Accepts notification ID in query string (`?id=...`) or body.
  - Rejects attempts to delete another user's notification with `403 Forbidden`.
  - Deletes record permanently from PostgreSQL and returns `200 OK`.

### 27.4 Security Boundaries & Cross-Workspace Isolation
1. **Authentication**: Unauthenticated requests to `/api/notifications` (GET, PATCH, DELETE) are unconditionally rejected with `401 Unauthorized`.
2. **Strict IDOR Protection**: Direct object references (`id`) are authorized against `auth.userId`. A user cannot view, mark as read, or delete another user's notifications.
3. **Cross-Tenant Isolation**: Database queries enforce `workspaceId: auth.workspaceId`. Users belonging to Workspace A receive `403 Forbidden` if attempting to query or mutate records from Workspace B.

### 27.5 Sliding-Window Deduplication & Idempotency
To prevent notification spam caused by rapid double-clicks, network retries, or redundant automation triggers, `createNotification` enforces a 10-second sliding deduplication window. If an unread notification with identical `(workspaceId, userId, type, link, title)` was created within the last 10 seconds, the existing notification is returned without creating an extraneous database record.

### 27.6 Centralized Realtime Synchronization & Multi-User Filtering
- Notification events are published via `publishWorkspaceEvent`:
  - `NOTIFICATION_CREATED`: Dispatched when a new notification is generated.
  - `NOTIFICATION_READ`: Dispatched on single-item read transition.
  - `NOTIFICATIONS_READ_ALL`: Dispatched on bulk read transition.
- **Client-Side User Scoping**: While events travel over the active workspace broadcast channel, client listeners in `TopHeader.tsx` and `NotificationsPage.tsx` guard incoming payloads:
  `if (currentUser?.id && event.payload?.userId && event.payload.userId !== currentUser.id) return;`
  This guarantees that multiple users operating concurrently within the same workspace never experience state leakage or cross-contamination of their unread badge counts.

### 27.7 Deep Link Resolution & Deleted Entity Resilience
Notifications carry persistent deep links formatted for specific Synplan destinations (`/tasks?taskId=...`, `/projects/...`, `/team`). When clicked:
- If the entity exists, the interface routes directly to the operational workspace or slide-out inspection drawer.
- If the entity was subsequently deleted, Synplan's deterministic 404 handlers (e.g. Project Workspace Not Found banner, Task Drawer safe close) gracefully catch the missing record with actionable navigation rather than unhandled errors.

---

## 28. Cross-Domain Integration Architecture & System Consistency

### 28.1 System Architecture & Interaction Map
Synplan operates as an integrated, multi-tenant productivity platform where individual domains communicate across strictly defined architectural contracts:

```text
                     [ Authenticated User / Session ]
                                    ↓
                     [ requireAuthGuard / Session ]
                                    ↓
                   [ Authoritative Workspace Context ]
                                    ↓
      ┌─────────────────┬───────────┴───────────┬─────────────────┐
      ↓                 ↓                       ↓                 ↓
 [ Tasks Domain ]  [ Projects Domain ]   [ Team Squads ]  [ Workspace Settings ]
   - Task Status     - Project Health      - Workload        - Profile / RBAC
   - Dependencies    - Phases/Milestones   - Roles           - Disaster Recovery
   - Assignments     - Memberships         - Assignments     - Automations
      └─────────────────┼───────────────────────┘
                        ↓
            [ EventBus / AuditLog Stream ]
            (Immutable cross-workspace audit)
                   ↙                 ↘
       [ Activity Feed ]         [ Notification Delivery Queue ]
       (Workspace-wide audit)    (User-specific actionable inbox,
                                  anti-self suppression, 10s dedup)
                                      ↓
                         [ Centralized Realtime Engine ]
                         (Workspace channel pub/sub,
                          targeted cache invalidation,
                          scoped by currentUser.id)
```

### 28.2 Single Source of Truth Hierarchy
To eliminate data anomalies, stale UI, or conflicting states, Synplan establishes a clear source of truth hierarchy across all layers:
1. **Authoritative Tier: Supabase PostgreSQL via Prisma ORM**
   - The PostgreSQL database is the single authoritative source of truth for all persistent entities (`User`, `Workspace`, `WorkspaceMember`, `Project`, `ProjectMember`, `Phase`, `Milestone`, `Task`, `Subtask`, `TaskComment`, `TaskDependency`, `Notification`, `AuditLog`, `AutomationRule`, `AiConfirmationSession`).
   - Zero mock data, zero in-memory collections, and zero `localStorage` data arrays are ever treated as authoritative storage.
2. **Transit & Cache Tier: In-Memory TTL Cache & Dedup Map (`src/lib/apiClient.ts`)**
   - Short-lived in-memory cache (3s to 10s TTL) for read-heavy operations with explicit mutation invalidation (`invalidateApiCache`).
   - Concurrent GET deduplication map (`inFlightMap`) preventing waterfall request storms.
3. **Reactive UI State Tier: Client Stores (Zustand: `useWorkspaceStore`, `useTaskStore`, `useUiStore`)**
   - Stores hold ephemeral client session context (e.g., active view mode, filter selections, open modal states).
   - Upon active workspace transition (`setActiveWorkspace`), all entity caches are completely purged (`resetWorkspaceTasks()`, `projects: []`, `members: []`) to prevent cross-workspace memory leakage.
   - `localStorage` key `synplan_active_ws` is strictly used as an optional persistent preference for browser session recovery, and is always re-validated against the user's authoritative memberships on the server.

### 28.3 EventBus, AuditLog, and Notification Separation
- **`AuditLog`**: Record of who did what, when, and from where. Every critical mutation writes an immutable record via `createAuditEntry` (`workspaceId`, `actorId`, `actorType`, `action`, `target`, `entityType`, `entityId`, `before`, `after`, `requestId`, `source`, `ipAddress`).
- **`Notification`**: Targeted alert delivered only to affected users. Handled by `createNotification` with automatic anti-self suppression (`actorId === recipientId -> drop`) and 10-second sliding-window duplicate suppression.
- **Rule**: An administrative action may create an `AuditLog` entry, a `Notification`, both, or neither, depending on domain semantics. Under no circumstances is `AuditLog` repurposed as a user notification queue, or vice versa.

### 28.4 Destructive Operation Flows & Atomic Cascade Integrity
All destructive operations are executed within atomic database transactions with deterministic cleanup:
1. **Workspace Member Removal (`DELETE /api/team/members`)**:
   - Transaction:
     - Unassigns all tasks assigned to the user within the workspace (`assigneeId = null`).
     - Deletes all `ProjectMember` records for the user in the workspace.
     - Deletes the `WorkspaceMember` record.
   - Generates `MEMBER_REMOVED` audit entry and broadcasts `MEMBER_REMOVED` realtime event.
2. **Project Member Removal (`DELETE /api/projects/[id]/members`)**:
   - Transaction:
     - Unassigns all tasks assigned to the user within that specific project (`assigneeId = null`).
     - Deletes the `ProjectMember` record.
   - Generates `PROJECT_MEMBER_REMOVE` audit entry and broadcasts `PROJECT_MEMBER_REMOVED` realtime event.
3. **Task Deletion (`DELETE /api/tasks/[id]`)**:
   - Transaction:
     - Deletes all `TaskDependency` records referencing the task as either blocking or blocked.
     - Deletes all `Subtask` records.
     - Deletes all `TaskComment` records.
     - Deletes the `Task` record.
   - Generates `TASK_DELETE` audit entry and broadcasts `TASK_DELETED` realtime event.
4. **Project Deletion (`DELETE /api/projects/[id]`)**:
   - Transaction:
     - Deletes all `TaskDependency` records for tasks in the project.
     - Deletes all `TaskComment` records for tasks in the project.
     - Deletes all `Subtask` records for tasks in the project.
     - Deletes all `Task` records in the project.
     - Deletes all `Milestone` records in the project.
     - Deletes all `Phase` records in the project.
     - Deletes all `ProjectMember` records in the project.
     - Deletes all project-scoped `AutomationRule` records.
     - Deletes the `Project` record.
   - Generates `PROJECT_DELETE` audit entry, broadcasts `PROJECT_DELETED` realtime event, and prompts client redirection.

### 28.5 Realtime Multi-User Scoping & Cache Invalidation
- All realtime broadcasts travel over the tenant channel `workspace:{workspaceId}`.
- Shared broadcast messages that carry personal payload properties (`userId`) are guarded on the receiving browser by `if (payload.userId && currentUser && payload.userId !== currentUser.id) return;`.
- Domain events trigger targeted cache invalidation rather than full page reloads, ensuring instant collaborative updates without UX flicker.

### 28.6 Deep-Link Navigation & Deleted Entity Resilience
- Deep-links are structured uniformly:
  - Task: `/tasks?taskId=[id]`
  - Project: `/projects/[id]`
  - Team: `/team`
  - Notifications: `/notifications`
  - Activity: `/activity`
- When a user navigates to an entity that was deleted or archived:
  - Project Workspace displays a dedicated "Project Not Found" card with a clear return navigation action.
  - Global Tasks page displays an explicit warning toast ("The linked task could not be found or has been removed.") rather than silently failing to open the inspection drawer.

### 28.7 AI Engine Safety & Confirmation Engine
- The AI Engine (`/api/ai/plan` and `/api/ai/execute`) complies strictly with Synplan's cross-domain RBAC:
  - Requires session authentication and workspace membership.
  - Destructive or high-impact actions (e.g. deleting entities, batch mutations) require explicit user confirmation via server-authoritative tokens (`AiConfirmationSession`).
  - Stale entity verification checks that target tasks and projects exist before executing mutations.
  - Replay protection marks confirmation tokens executed upon successful processing.
  - AI mutations emit standard `AuditLog` entries with `actorType: 'AI'` and broadcast realtime events.

---

## 29. PRODUCTION READINESS & RELEASE ARCHITECTURE

### 29.1 Production Security Boundaries
1. **Zero Client-Only Trust**:
   - All role-based authorization checks (`requireAuthGuard`, `checkPermission`) execute strictly server-side.
   - Any client attempt to forge elevated roles (`OWNER`, `ADMIN`) or pass cross-tenant entity IDs is rejected with `403 Forbidden` or `404 Not Found`.
2. **Strict IDOR Prevention**:
   - Every mutation and query endpoint verifies entity ownership against `auth.workspaceId`.
   - Notifications, projects, tasks, comments, and members cannot be viewed or mutated across tenant boundaries.
3. **CSRF & Origin Verification**:
   - `src/middleware.ts` enforces origin and host consistency for all state-changing HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`).
4. **Content-Security-Policy & Hardened Headers**:
   - `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and restricted `Content-Security-Policy` headers guard all responses.
5. **Sanitized Error Responses & Zero Secret Leakage**:
   - `createApiErrorResponse` strips raw database queries, Prisma schema internals, connection strings, and stack traces from production error bodies.
   - All errors return a correlation `x-request-id` matching structured server logs.

### 29.2 Multi-Tenant Data Integrity & Cascade Guarantees
1. **Atomic Destructive Lifecycles**:
   - Project and task deletions execute within atomic PostgreSQL `$transaction` blocks.
   - Project deletion cascades all child `Task`, `TaskDependency`, `TaskComment`, `Subtask`, `Phase`, `Milestone`, `ProjectMember`, and `AutomationRule` records.
2. **Zero Orphan Invariant**:
   - Deleting tasks automatically cleans up blocking and blocked `TaskDependency` records.
   - Removing squad members atomically sets `assigneeId = null` on project tasks to avoid dangling user assignments while preserving work history.
   - Comprehensive orphan verification sweeps confirm 0 orphan tasks, phases, dependencies, comments, or squad members in the database.

### 29.3 Client-Side Storage & Session Hygiene
1. **Single-Source-of-Truth Storage**:
   - Active workspace persistence uses `synplan_active_ws`.
   - Any legacy key (`synplan_active_workspace`) is systematically purged on login, workspace switch, and logout.
2. **Graceful Session Expiration**:
   - Stale cookies trigger automatic cleanup of localStorage workspace state and redirect to `/login?error=session_expired`.
   - Re-authenticating establishes fresh session context and restores active workspace resolution.

### 29.4 Responsive Layouts & Mobile Navigation Standard
1. **Complete 8-Domain Mobile Navigation**:
   - `Sidebar.tsx` provides direct navigation across all primary domains:
     - **Work**: Dashboard (`/`), My Work (`/my-work`), Projects (`/projects`), Tasks (`/tasks`), Activity (`/activity`).
     - **Planning**: Calendar (`/calendar`), Reports (`/reports`), Team (`/team`).
     - **Workspace**: Notifications (`/notifications` with live unread badge), Settings (`/settings`).
2. **Touch-Optimized Off-Canvas Drawer**:
   - On viewports `< 768px`, the sidebar functions as an accessible off-canvas drawer with backdrop blur overlay, escape-key listener, and automatic drawer closing upon link navigation.
3. **Responsive Viewport Compliance**:
   - Responsive design is tested and verified from 375px mobile viewports up to 1920px desktop viewports with zero horizontal overflow or clipped actions.

### 29.5 Realtime Lifecycle & Connection Cleanup
1. **Scoped Workspace Channels**:
   - Realtime events travel exclusively over `workspace:{workspaceId}` channels.
   - User notification events are filtered on the client to ensure private user-directed alerts are not rendered by other workspace members.
2. **Zero Listener Leaks**:
   - All `onEvent` subscriptions return dedicated unsubscription callbacks invoked in React `useEffect` cleanup routines.
   - Reconnect catch-up resync refreshes active workspace cache automatically without requiring browser reloads.

### 29.6 Observability, Telemetry & Production Logging
1. **Structured Cloud Logging**:
   - Server-side logging outputs structured JSON records containing timestamps, log levels, correlation IDs, and contextual metadata.
2. **Automated Credential Redaction**:
   - Sensitive keys (`password`, `token`, `sessionToken`, `authorization`, `cookie`, `secret`, `supabase_service_role_key`, database URLs) are automatically masked as `[REDACTED]` prior to logging.

### 29.7 Production Build & Static Verification Profile
- **TypeScript**: `npx tsc --noEmit` $\to$ **0 errors**.
- **ESLint**: `npm run lint` $\to$ **✔ No ESLint warnings or errors**.
- **Prisma**: Schema valid, database migrations up to date (0 pending migrations).
- **Next.js 15 Build**: `npx next build` compiles 47 static and dynamic routes cleanly.

### 29.8 Known Operational Limitations & Future Enhancements
- **Push Notification Service Worker**: Currently notifications are delivered via WebSocket realtime and polling fallbacks; Web Push / APNs integration is deferred for mobile PWA packaging.
- **Granular Custom Roles**: RBAC supports 4 standard tiers (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`); custom permission creation is planned for enterprise tier enhancements.
- **Bulk CSV Export Performance**: Table exports for > 10,000 tasks can be streamed via asynchronous server workers in future scaling phases.





