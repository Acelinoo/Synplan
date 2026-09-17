# Synplan 2.0 Design System & Visual Architecture Specification

> **Version:** 2.0.0  
> **Phase:** 6B (Design System Foundation & App Shell)  
> **Status:** Authoritative Foundation  
> **Philosophy:** High-Precision Slate-Cobalt, Calm, Editorial Engineering, High-Density, Data-Focused & Anti-Slop  

---

## 1. Design Principles

Synplan is an authoritative work & project management platform built for product engineers, project leads, and technical organizations. Its interface prioritizes **clarity, speed, information density, and predictability**.

1. **Precision & Engineering Calm**:
   - The interface is quiet, structured, and free of visual gimmicks.
   - High information density without visual claustrophobia.
   - Distinctive Slate-Cobalt personality: no purple AI neon, no cold sterile gray, no generic SaaS template aesthetics.

2. **Data-Focused Structural Hierarchy**:
   - Spacing, subtle borders, and typography drive hierarchy rather than heavy container cards or deep nesting.
   - Do NOT wrap every row, label, or widget in a rounded card.
   - Content and state take precedence over chrome.

3. **Restrained Elevation & Subtle Contrast**:
   - Elevation is communicated through 1px border contrast (`border-border`, `border-subtle`, `border-strong`) and surface shade differentiation rather than dramatic drop shadows.
   - Dark mode uses deep obsidian slate layers (`#090D14` → `#0F1726` → `#162032` → `#1A263C`).
   - Light mode uses crisp slate paper layers (`#F8FAFC` → `#FFFFFF` → `#F1F5F9`).

4. **Multi-Modal Accessibility (WCAG 2.1 AA Compliant)**:
   - High-contrast typography across all themes.
   - Semantic status indicators that never rely on color alone (always paired with geometric icons or explicit status copy).
   - Unconditional visible focus rings (`focus-visible:ring-2`) and full keyboard navigation.
   - Native `prefers-reduced-motion` suppression of transitions and animations.

5. **Integrated, Subservient AI**:
   - AI is an augmentative interaction surface, not a noisy visual centerpiece.
   - No glowing AI banners, purple gradients, or floating robotic mascots.

---

## 2. Color System & Semantic Tokens

Synplan uses semantic CSS custom properties defined in `src/app/globals.css` and mapped via `tailwind.config.js`.

### 2.1 Light Mode Palette (Crisp Slate-Paper Canvas)

| Token | CSS Variable | Value | Purpose |
| :--- | :--- | :--- | :--- |
| **Canvas / Background** | `--background` | `#F8FAFC` | Main application background |
| **Surface Level 1 / Card** | `--card` / `--surface` | `#FFFFFF` | Cards, main content panels, active rows |
| **Surface Level 2 / Muted** | `--surface-muted` | `#F1F5F9` | Table headers, secondary toolbars, disabled regions |
| **Surface Level 3 / Elevated**| `--surface-elevated` | `#FFFFFF` | Dialog modals, popovers, flyouts |
| **Foreground / Primary Text** | `--foreground` | `#0F172A` | High-contrast headline and body text |
| **Foreground Muted / Secondary**| `--muted-foreground` | `#64748B` | Labels, timestamps, secondary metadata |
| **Border Default** | `--border` | `#E2E8F0` | Structural dividers, card borders |
| **Border Subtle** | `--border-subtle` | `#F1F5F9` | Table row dividers, inner grid lines |
| **Border Strong** | `--border-strong` | `#CBD5E1` | Input outlines, active borders, tab lines |
| **Primary Accent** | `--primary` | `#0F3D64` | Deep Synplan Cobalt (brand action, primary button) |
| **Primary Foreground** | `--primary-foreground`| `#FFFFFF` | Text on primary elements |
| **Primary Hover** | `--primary-hover` | `#0A2B47` | Hover state for primary actions |
| **Primary Muted** | `--primary-muted` | `rgba(15, 61, 100, 0.08)` | Selected row background, subtle tags |
| **Secondary Surface** | `--secondary` | `#F1F5F9` | Secondary button background |
| **Destructive** | `--destructive` | `#DC2626` | Destructive actions, delete confirmations |
| **Focus Ring** | `--ring` | `#0F3D64` | Visible keyboard focus outline |

### 2.2 Dark Mode Palette (Deep Obsidian Slate Canvas)

| Token | CSS Variable | Value | Purpose |
| :--- | :--- | :--- | :--- |
| **Canvas / Background** | `--background` | `#090D14` | Deep Obsidian Slate canvas |
| **Surface Level 1 / Card** | `--card` / `--surface` | `#0F1726` | Work panels, task cards, sidebar |
| **Surface Level 2 / Muted** | `--surface-muted` | `#162032` | Table headers, secondary toolbars |
| **Surface Level 3 / Elevated**| `--surface-elevated` | `#1A263C` | Modals, popovers, dropdown menus |
| **Foreground / Primary Text** | `--foreground` | `#F1F5F9` | Crisp Slate 100 body text |
| **Foreground Muted / Secondary**| `--muted-foreground` | `#94A3B8` | Slate 400 secondary metadata |
| **Border Default** | `--border` | `#1E293B` | Slate 800 structural borders |
| **Border Subtle** | `--border-subtle` | `#162032` | Subtle inner borders |
| **Border Strong** | `--border-strong` | `#334155` | Active input & card focus borders |
| **Primary Accent** | `--primary` | `#0284C7` | Vivid Sky/Cobalt (bright readability in dark mode) |
| **Primary Foreground** | `--primary-foreground`| `#FFFFFF` | Text on primary elements |
| **Primary Hover** | `--primary-hover` | `#0369A1` | Hover state for primary actions |
| **Primary Muted** | `--primary-muted` | `rgba(2, 132, 199, 0.15)` | Selected row background, active chips |
| **Secondary Surface** | `--secondary` | `#162032` | Secondary button background |
| **Destructive** | `--destructive` | `#EF4444` | Red 500 error / destructive actions |
| **Focus Ring** | `--ring` | `#0284C7` | Keyboard focus ring |

### 2.3 Semantic Task Status Tokens (State Machine Aligned)

| Status | State Machine Key | Light Hex | Dark Hex | Icon & Meaning |
| :--- | :--- | :--- | :--- | :--- |
| **Backlog** | `backlog` | `#64748B` | `#64748B` | `CircleDashed` — Unscheduled task |
| **To Do** | `todo` | `#475569` | `#94A3B8` | `Circle` — Ready for pickup |
| **In Progress** | `in_progress` | `#2563EB` | `#38BDF8` | `Clock` — Actively worked on |
| **In Review** | `in_review` | `#D97706` | `#F59E0B` | `Clock` — Under peer review |
| **Done** | `done` | `#059669` | `#10B981` | `CheckCircle2` — Completed & verified |
| **Blocked** | `blocked` | `#DC2626` | `#EF4444` | `Ban` — Blocked by dependency |
| **Cancelled** | `cancelled` | `#94A3B8` | `#64748B` | `Ban` — Abandoned / superseded |

### 2.4 Semantic Priority Tokens

| Priority | Light Hex | Dark Hex | Indicator | Meaning |
| :--- | :--- | :--- | :--- | :--- |
| **Low** | `#64748B` | `#64748B` | `ArrowDown` | Routine / non-urgent |
| **Medium** | `#0284C7` | `#38BDF8` | `ArrowRight` | Standard sprint target |
| **High** | `#D97706` | `#F59E0B` | `ArrowUp` | Elevated priority item |
| **Urgent** | `#DC2626` | `#EF4444` | `AlertOctagon` | Blocking release or critical path |

---

## 3. Typography & Information Hierarchy

- **UI & Body Font:** `Inter`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `sans-serif`
- **Data, KPIs, Identifiers & Shortcuts:** `JetBrains Mono`, `ui-monospace`, `monospace`

### 3.1 Type Scale

```text
Display / H1 (Pages):       text-lg sm:text-xl (18-20px), font-bold, tracking-tight
Section H2 (Sub-sections):  text-xs font-bold uppercase tracking-wider, text-foreground
Standard Body:              text-xs (12px), line-height: 16px, text-foreground
Secondary / Metadata:       text-[11px] (11px), text-muted-foreground
Micro / Keys / Badges:      text-[10px] (10px), font-mono, tracking-wide
```

> **Typography Rule:** Synplan avoids oversized hero text inside authenticated productivity views. All headings are tight, crisp, and proportioned to save vertical real estate for actual work items.

---

## 4. Spacing Scale

Based on a strict 4px grid:
- `space-1` = `4px` (`p-1`, `gap-1`)
- `space-1.5` = `6px` (`p-1.5`, `gap-1.5`)
- `space-2` = `8px` (`p-2`, `gap-2`)
- `space-2.5` = `10px` (`p-2.5`, `gap-2.5`)
- `space-3` = `12px` (`p-3`, `gap-3`)
- `space-4` = `16px` (`p-4`, `gap-4`)
- `space-5` = `20px` (`p-5`, `gap-5`)
- `space-6` = `24px` (`p-6`, `gap-6`)
- `space-8` = `32px` (`p-8`, `gap-8`)

---

## 5. Radius System (Restrained & Geometric)

| Token | Class | Value | Elements |
| :--- | :--- | :--- | :--- |
| `xs` | `rounded-xs` | `2px` | Focus rings, micro-indicators |
| `sm` | `rounded-sm` | `4px` | Badges, small tags, tooltips, checkboxes |
| `md` | `rounded-md` | `6px` | Buttons, inputs, selects, navigation links |
| `lg` | `rounded-lg` | `8px` | Cards, popovers, dropdown menus, table borders |
| `xl` | `rounded-xl` | `12px` | Dialog modals, slide-over drawers |
| `full` | `rounded-full`| `9999px` | Avatars, presence dots, toggle switches |

> **Anti-Slop Radius Directive:** Arbitrary `rounded-2xl` and `rounded-3xl` cards are strictly prohibited inside the core product UI. Restrained radii prevent "bubbly" mobile-game aesthetics and preserve screen efficiency.

---

## 6. Elevation & Borders

- **Border Hierarchy**:
  - `border-border`: Primary perimeter border (`1px solid var(--border)`).
  - `border-subtle`: Internal row divider, horizontal rule (`1px solid var(--border-subtle)`).
  - `border-strong`: Active state, input focus border (`1px solid var(--border-strong)`).
- **Shadows**:
  - `shadow-2xs`: Micro-shadow for buttons and input fields (`0 1px 2px 0 rgba(0, 0, 0, 0.04)`).
  - `shadow-md`: Hover elevation on cards and dropdowns.
  - `shadow-xl` / `shadow-2xl`: Modals and slide-over drawers.

---

## 7. Component Primitives Inventory (`src/components/ui/`)

| Primitive | File | Responsibilities |
| :--- | :--- | :--- |
| `Button` | `button.tsx` | Variants: `default`, `secondary`, `outline`, `ghost`, `subtle`, `destructive`, `link`. Sizes: `xs`, `sm`, `default`, `lg`, `icon`, `icon-sm`. |
| `IconButton` | `button.tsx` | Accessible square button with mandatory `aria-label`. |
| `Badge` | `badge.tsx` | Semantic tags with `default`, `secondary`, `outline`, `success`, `warning`, `destructive`, `info`. |
| `StatusBadge` | `badge.tsx` | Automatic binding to all 7 `TaskStatus` states with semantic icon and copy. |
| `PriorityBadge` | `badge.tsx` | Automatic binding to all 4 `TaskPriority` states with directional icon. |
| `Input` | `input.tsx` | Form text input with label, error text, left/right icon slots, and focus ring. |
| `Textarea` | `textarea.tsx` | Multi-line text field with error state and vertical resize. |
| `Select` | `select.tsx` | Form dropdown with chevron indicator and error state. |
| `Checkbox` | `checkbox.tsx` | Accessible checkbox with checked icon, label, and keyboard focus. |
| `Switch` | `switch.tsx` | Accessible slide toggle switch. |
| `Avatar` | `avatar.tsx` | User avatar with image loading, fallback initial, and presence dot (`online`, `offline`, `busy`, `away`). |
| `Tooltip` | `tooltip.tsx` | Accessible tooltip with 4 positional sides (`top`, `bottom`, `left`, `right`). |
| `Dialog` | `dialog.tsx` | Accessible modal dialog with backdrop, Escape dismissal, header, and footer. |
| `Drawer` | `drawer.tsx` | Slide-over drawer with left/right anchor, smooth transitions, and Escape dismiss. |
| `Tabs` | `tabs.tsx` | Accessible tab switcher with `TabList`, `TabTrigger`, and `TabContent`. |
| `Breadcrumb` | `breadcrumb.tsx` | Breadcrumb trail with clickable items and chevron separators. |
| `EmptyState` | `empty-state.tsx` | Reusable empty container with icon, title, description, and action button. |
| `Divider` | `divider.tsx` | Horizontal or vertical divider with optional text label. |
| `PageHeader` | `page-header.tsx` | Standardized page header with breadcrumb, title, description, and actions slot. |
| `SectionHeader` | `section-header.tsx` | Section sub-header with optional icon and quick action buttons. |
| `Table` | `table.tsx` | Dense tabular primitives (`Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`). |
| `ToastContainer` | `toast.tsx` | Global notification toast renderer consuming `useUiStore.toasts`. |
| `TaskVisuals` | `task-visuals.tsx` | Micro-chips: `TaskBlockedChip`, `TaskDependencyChip`, `SubtaskProgressChip`, `DueDateChip`, `CommentsChip`. |

---

## 8. Application Shell Redesign

```text
┌────────────────────────────────────────────────────────────────────────┐
│ TOP HEADER (h-14, sticky, bg-card/95, border-b border-border)          │
│ [☰ Mobile] Workspace / Breadcrumb   [Online Avatars] [Ctrl+K] [🔔] [Avatar]│
├──────────────┬─────────────────────────────────────────────────────────┤
│ SIDEBAR      │ MAIN WORKSPACE VIEWPORT                                 │
│ (w-60 / w-16)│ (flex-1, p-4 sm:p-6 lg:p-8, max-w-[1440px])             │
│              │                                                         │
│ [Workspace▾] │  PageHeader                                             │
│ ──────────── │  ─────────────────────────────────────────────────────  │
│ WORK         │                                                         │
│ • My Work    │  Work Views (Board / List / Table)                      │
│ • Projects   │  Personal Cockpit                                       │
│ • Tasks      │  Authoritative Audit Streams                            │
│ • Activity   │                                                         │
│ ──────────── │                                                         │
│ PLANNING     │                                                         │
│ • Calendar   │                                                         │
│ • Reports    │                                                         │
│ • Team       │                                                         │
│ ──────────── │                                                         │
│ WORKSPACE    │                                                         │
│ • Settings   │                                                         │
│ ──────────── │                                                         │
│ [User Avatar]│                                                         │
└──────────────┴─────────────────────────────────────────────────────────┘
```

### 8.1 Sidebar Navigation Hierarchy
- **Desktop Expanded**: `240px` (`w-60`).
- **Desktop Collapsed (Rail Mode)**: `64px` (`w-16`) with Tooltip hints.
- **Mobile Drawer**: Fixed slide-over drawer with backdrop, touch dismiss, and auto-dismiss on route change or Escape.
- **Group Architecture**:
  - `Work`: My Work, Projects, Tasks, Activity.
  - `Planning`: Calendar, Reports, Team.
  - `Workspace`: Settings.

### 8.2 TopHeader Responsibilities
- Adaptive background (`bg-card/95` in both light and dark mode — no more jarring dark navy bar in light mode).
- Realtime presence squad avatars with online status rings.
- Realtime WebSocket connection dot indicator (`RealtimeStatusBadge`).
- Global search & command palette trigger (`Ctrl+K` button).
- Authoritative notification popover with unread badge and mark-all-as-read action.
- Light / Dark / System theme switcher.
- User profile avatar dropdown with account links and secure sign-out confirmation dialog.

### 8.3 Unified Command Palette (`Ctrl+K`)
- Replaces duplicate `GlobalSearch` modal.
- Provides immediate keyboard search across:
  - Global navigation links.
  - Fast entity search (Projects, Tasks, Team Members) via `/api/search`.
  - Quick actions (Create Task, Create Project, Switch Theme).

---

## 9. Task Visual Language & Work Queue Systems

1. **Status Scannability**:
   - Every task status is rendered using `StatusBadge` or geometric status icons.
   - Status indicators have high contrast in both themes.
2. **Priority Hierarchy**:
   - Urgent tasks stand out with red text and `AlertOctagon`.
   - Normal/low tasks are muted to prevent "alarm fatigue".
3. **Blocked & Dependencies**:
   - `TaskBlockedChip` prominently flags blocked tasks with red tint and `Ban` icon.
   - `TaskDependencyChip` shows dependency chain count (`Link2` + count).
4. **Subtask & Due Dates**:
   - `SubtaskProgressChip` shows completion ratio (e.g. `2/5` or green on `5/5`).
   - `DueDateChip` displays date in monospace with red warning if overdue or amber if due today.

### 9.1 Attention Bar (`MyWorkAttentionBar`)
- **Intent**: Actionable attention affordance displaying authoritative backend queue counts (Overdue, Blocked, Due Today, Upcoming, High Priority).
- **Aesthetic**: Flat strip of bordered interactive cells (`border-border`, `bg-card`) with high-contrast count typography and muted uppercase micro-labels (`text-[10px] font-semibold tracking-wider`).
- **Affordance**: Clicking any non-zero metric card triggers filter alignment or focuses the relevant work queue directly.
- **Tone**: Zero decorative gradients or KPI gauge cards; calm, restrained, high-density telemetry.

### 9.2 Work Queue Containers (`MyWorkQueueSection`)
- **Structure**: Collapsible, bordered task grouping container with semantic count badges.
- **Tones**: Semantic tone accents applied to section header counts:
  - `danger`: Overdue queue (`text-destructive`, `bg-destructive/10`)
  - `warning`: Blocked queue (`text-amber-600 dark:text-amber-400`, `bg-amber-500/10`)
  - `amber`: Due Today queue (`text-amber-700 dark:text-amber-300`, `bg-amber-500/10`)
  - `info`: Upcoming queue (`text-sky-600 dark:text-sky-400`, `bg-sky-500/10`)
  - `primary`: High Priority queue (`text-primary`, `bg-primary-muted`)
  - `muted`: Recently Completed queue (`text-muted-foreground`, `bg-surface-muted`)
- **Empty States**: Meaningful, contextual messaging per queue (e.g., "No overdue work — all assigned tasks are on schedule.") with subtle geometric icons, avoiding oversized illustrative empty states.

### 9.3 High-Density Task Rows (`MyWorkTaskRow`)
- **Grid Layout**: Three-zone responsive flex row:
  - **Left**: Interactive status quick-toggle checkbox with status-specific check state.
  - **Center (Fluid)**: Title with `line-through` completion styling, project indicator dot with project name, and contextual chips (`TaskBlockedChip` with blocker count, `SubtaskProgressChip`).
  - **Right (Metadata)**: Aligned badges including `DueDateChip` (with overdue/today color shifts), `PriorityBadge`, and `StatusBadge`.
- **Keyboard Interaction**: Fully accessible via `tabIndex={0}`, with `Enter` or `Space` opening task details, and visible focus ring (`focus-visible:ring-2 focus-visible:ring-primary`).

### 9.4 Project Workspace Visual Patterns (Phase 6D)
- **`ProjectHeader`**:
  - Contextual breadcrumbs (`< Projects / {Project Name}`) with high-contrast text.
  - Color swatch dot with 1px border ring matching project branding.
  - Authoritative Health Signal badge with explicit geometric icons (`CheckCircle2` for `ON_TRACK`, `AlertTriangle` for `AT_RISK`, `AlertOctagon` for `CRITICAL`) and hover explanations.
  - Member avatar cluster and target deadline tags using monospace typography.
- **`ProjectBoardCard`**:
  - Restrained Kanban card surface (`bg-card`, `border-border`, subtle `hover:border-border-strong`).
  - Micro status `<select>` enabling accessible, single-click status transitions without drag dependency.
  - Integrated `TaskBlockedChip` with border warning tints when dependencies are unsatisfied.
- **Hierarchical List Grouping (`ProjectListView`)**:
  - Accordion containers for project phases with subtle slate headers (`bg-surface-muted/60`).
  - Integrated progress indicators displaying `completed/total` ratios and mini completion bars.
  - Sub-accordions for milestone target dates with amber flags and direct task rows.

---

## 10. Anti-Slop Audit Checklist

- [x] Zero purple/neon AI aesthetic.
- [x] Zero arbitrary `rounded-2xl` / `rounded-3xl` cards.
- [x] Zero excessive glassmorphism or blurry unreadable cards.
- [x] Zero unneeded animated dots, floating confetti, or heavy spring physics.
- [x] Zero hardcoded hex colors inside layout headers or sidebars.
- [x] All interactive controls possess clear `:focus-visible` ring outlines.
- [x] No color-only status indicators (all status tokens include icons and copy).
- [x] Reduced-motion media query implemented across base stylesheet.


