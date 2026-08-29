# Synplan v1.0 — Production Release Document

## 1. Product Overview

**Synplan** is a modern, high-performance Project Management & Team Collaboration Platform tailored for engineering squads, agile teams, and technical organizations.

- **Architecture**: Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, Prisma ORM, PostgreSQL (Supabase / PgBouncer pooler).
- **Design Language**: Rich visual design system, glassmorphism, responsive sidebar navigation, dark/light theme tokens, and dynamic micro-animations.

---

## 2. Active Modules

The active modules for Synplan v1.0 are:

1. **Dashboard (`/`)**
   - Live KPI overview (Total Projects, Active Projects, Active Tasks, Velocity Rate).
   - Recent Projects interactive progress cards with quick navigation to `/projects/[id]`.
   - Upcoming Deadlines widget with smart date intelligence badges.
   - Live Squad Activity feed connected directly to PostgreSQL `AuditLog`.

2. **Projects (`/projects` & `/projects/[id]`)**
   - Multi-view initiative management (Grid View & List View).
   - Lifecycle filtering: `Planning`, `Active`, `Completed`, `On Hold`, `Archived`.
   - Project Detail with 4 structured tabs: `Overview`, `Tasks`, `Phases`, `Team`.
   - Interactive `PhaseManager` with phase creation, renaming, reordering, and task-safe deletion.

3. **Tasks (`/tasks`)**
   - Canonical 4-column Kanban board (`To Do`, `In Progress`, `In Review`, `Done`).
   - List View with 3-state sorting (`ASC`, `DESC`, `DEFAULT`) and priority weighting.
   - Task creation modal with cascading project $\rightarrow$ phase selectors.
   - Task Detail Drawer with live discussion feed and comment authoring.

4. **Team (`/team`)**
   - Squad capacity visualizer and workload calculation.
   - Role-based member management (`Owner`, `Admin`, `Member`, `Viewer`).
   - Squad invitation modal with automated audit logging.

5. **Settings (`/settings`)**
   - Workspace profile, theme configuration, RBAC permissions matrix, and audit stream.

---

## 3. Hidden Modules

The following modules remain fully functional in backend API routes but are **strictly hidden from UI/Sidebar navigation**:

- **Calendar (`/calendar`)**
- **Reports (`/reports`)**

---

## 4. Core Data Model

```text
Workspace
   ├── WorkspaceMember (Role: OWNER | ADMIN | MEMBER | VIEWER)
   ├── Project (Status: PLANNING | ACTIVE | ON_HOLD | COMPLETED | ARCHIVED)
   │      ├── ProjectMember (userId -> WorkspaceMember.userId)
   │      ├── Phase (order ASC)
   │      │      └── Task (phaseId -> Phase.id)
   │      │             ├── Subtask
   │      │             └── TaskComment (authorId -> User.id)
   │      └── Task (projectId -> Project.id)
   └── AuditLog (actorId, entityType, entityId, action, target)
```

---

## 5. Core Workflow

```text
Workspace
   ↓
Project Creation / Phase Definition
   ↓
Task Breakdown & Assignee Scoping
   ↓
Status Transitions (To Do → In Progress → In Review → Done)
   ↓
Discussion (Task Comments)
   ↓
Live Activity Stream (AuditLog)
```

---

## 6. Validation Summary

- **Prisma Schema Validation**: PASS (`The schema at prisma\schema.prisma is valid 🚀`)
- **ESLint**: PASS (`✔ No ESLint warnings or errors`)
- **TypeScript Compile Check**: PASS (`tsc --noEmit` exited with code 0)
- **Next.js Production Build**: PASS (`Exit code 0`, 24 routes generated)
- **Database Invariants**: PASS (0 orphan projects, 0 orphan phases, 0 assignee leaks, 0 cross-workspace violations)
- **Security & Multi-Tenancy**: PASS (Strict `workspaceId` containment on all mutations)

---

## 7. Known Limitations & Manual Validation Notes

- Visual rendering has been strictly audited via static source code and CLI compiler passes in compliance with the **NO BROWSER / NO INTERNET** restriction.
- Direct browser UI interaction is ready for final manual user walkthrough.

---

## 8. Deferred Features (Post-v1.0 Roadmap)

- In-App Notification Center & Webhooks
- Interactive Gantt Chart & Task Dependencies
- File & Cloud Attachment Storage
- Live WebSocket Chat
- Time Tracking & Invoicing
