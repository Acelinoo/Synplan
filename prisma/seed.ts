import { PrismaClient, Role, ProjectStatus, TaskStatus, TaskPriority } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting Synplan Database Seeding...");

  // 1. Clean existing records (in reverse dependency order)
  await prisma.auditLog.deleteMany({});
  await prisma.subtask.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.projectMember.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.workspaceMember.deleteMany({});
  await prisma.workspace.deleteMany({});
  await prisma.user.deleteMany({});

  // 2. Create Users
  const acelino = await prisma.user.create({
    data: {
      name: "Acelino (Marchelino K.)",
      email: "acelino@synplan.dev",
      role: Role.OWNER,
    },
  });

  const sarah = await prisma.user.create({
    data: {
      name: "Sarah Chen",
      email: "sarah.chen@synplan.dev",
      role: Role.ADMIN,
    },
  });

  const marcus = await prisma.user.create({
    data: {
      name: "Marcus Vance",
      email: "marcus.v@synplan.dev",
      role: Role.MEMBER,
    },
  });

  const devon = await prisma.user.create({
    data: {
      name: "Devon Lane",
      email: "devon.lane@synplan.dev",
      role: Role.MEMBER,
    },
  });

  console.log("✅ Users seeded.");

  // 3. Create Workspace
  const workspace = await prisma.workspace.create({
    data: {
      name: "Engineering Core",
      slug: "engineering-core",
      ownerId: acelino.id,
      members: {
        create: [
          { userId: acelino.id, role: Role.OWNER, workloadScore: 68 },
          { userId: sarah.id, role: Role.ADMIN, workloadScore: 54 },
          { userId: marcus.id, role: Role.MEMBER, workloadScore: 72 },
          { userId: devon.id, role: Role.MEMBER, workloadScore: 40 },
        ],
      },
    },
  });

  console.log("✅ Workspace and WorkspaceMembers seeded.");

  // 4. Create Projects
  const projectSynplan = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      name: "Synplan SaaS Platform MVP",
      description: "Multi-workspace project management platform with high-density Kanban, Calendar, and Workload visualizers.",
      progress: 68,
      status: ProjectStatus.ACTIVE,
      deadline: new Date("2026-09-12"),
      color: "#6366F1",
      totalTasks: 25,
      completedTasks: 17,
      members: {
        create: [
          { userId: acelino.id, role: Role.OWNER },
          { userId: sarah.id, role: Role.ADMIN },
          { userId: marcus.id, role: Role.MEMBER },
        ],
      },
    },
  });

  const projectGerobak = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      name: "GerobakLink Integration API",
      description: "High-performance POS and ordering middleware connecting local Indonesian merchant telemetry.",
      progress: 84,
      status: ProjectStatus.ACTIVE,
      deadline: new Date("2026-09-18"),
      color: "#10B981",
      totalTasks: 25,
      completedTasks: 21,
      members: {
        create: [
          { userId: acelino.id, role: Role.OWNER },
          { userId: devon.id, role: Role.MEMBER },
        ],
      },
    },
  });

  const projectSecurity = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      name: "Cybersecurity SOC & Telemetry",
      description: "Automated vulnerability scanner, SOC event correlation engine, and real-time audit logging.",
      progress: 42,
      status: ProjectStatus.ACTIVE,
      deadline: new Date("2026-09-30"),
      color: "#F59E0B",
      totalTasks: 19,
      completedTasks: 8,
      members: {
        create: [
          { userId: acelino.id, role: Role.OWNER },
          { userId: marcus.id, role: Role.MEMBER },
          { userId: devon.id, role: Role.MEMBER },
        ],
      },
    },
  });

  const projectDesign = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      name: "Design System Tokens v2.0",
      description: "Full dark & light Obsidian token scale, React Bits micro-animations, and zero-slop UI primitives.",
      progress: 100,
      status: ProjectStatus.COMPLETED,
      deadline: new Date("2026-08-28"),
      color: "#8B5CF6",
      totalTasks: 14,
      completedTasks: 14,
      members: {
        create: [
          { userId: acelino.id, role: Role.OWNER },
          { userId: sarah.id, role: Role.ADMIN },
        ],
      },
    },
  });

  console.log("✅ Projects seeded.");

  // 5. Create Tasks with Subtasks
  await prisma.task.create({
    data: {
      workspaceId: workspace.id,
      projectId: projectSynplan.id,
      title: "Setup Next.js 16 App Router & Tailwind Config",
      description: "Initialize base Next.js project with custom tokens, dark mode obsidian, and typography.",
      status: TaskStatus.DONE,
      priority: TaskPriority.HIGH,
      assigneeId: acelino.id,
      dueDate: new Date("2026-08-28"),
      completedAt: new Date("2026-08-28"),
      order: 0,
      tags: ["core", "setup"],
      subtasks: {
        create: [
          { title: "Configure tailwind tokens", completed: true },
          { title: "Setup Inter & JetBrains Mono", completed: true },
        ],
      },
    },
  });

  await prisma.task.create({
    data: {
      workspaceId: workspace.id,
      projectId: projectSynplan.id,
      title: "Implement Zustand State Stores",
      description: "Create useWorkspaceStore, useTaskStore, useCalendarStore, and useUiStore.",
      status: TaskStatus.DONE,
      priority: TaskPriority.URGENT,
      assigneeId: acelino.id,
      dueDate: new Date("2026-08-28"),
      completedAt: new Date("2026-08-28"),
      order: 1,
      tags: ["state", "frontend"],
      subtasks: {
        create: [
          { title: "Workspace & Project Store", completed: true },
          { title: "Task & Kanban Mutators", completed: true },
        ],
      },
    },
  });

  await prisma.task.create({
    data: {
      workspaceId: workspace.id,
      projectId: projectSynplan.id,
      title: "Build Multi-Column Kanban Board",
      description: "Interactive Kanban with 5 lanes, priority indicators, subtasks checklist, and Done celebration.",
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.URGENT,
      assigneeId: acelino.id,
      dueDate: new Date("2026-08-29"),
      order: 0,
      tags: ["kanban", "ui"],
      subtasks: {
        create: [
          { title: "KanbanCard with priority styles", completed: true },
          { title: "Micro-feedback animation on Done", completed: false },
        ],
      },
    },
  });

  await prisma.task.create({
    data: {
      workspaceId: workspace.id,
      projectId: projectGerobak.id,
      title: "GerobakLink POS Webhook Integration",
      description: "Connect incoming POS transactional webhooks with Synplan task auto-generation.",
      status: TaskStatus.IN_REVIEW,
      priority: TaskPriority.HIGH,
      assigneeId: sarah.id,
      dueDate: new Date("2026-08-30"),
      order: 0,
      tags: ["backend", "pos"],
      subtasks: {
        create: [
          { title: "Webhook signature validation", completed: true },
          { title: "Idempotency key handler", completed: true },
        ],
      },
    },
  });

  await prisma.task.create({
    data: {
      workspaceId: workspace.id,
      projectId: projectSecurity.id,
      title: "Security Telemetry Audit Logging",
      description: "Log user mutations and workspace access requests for compliance report generation.",
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      assigneeId: marcus.id,
      dueDate: new Date("2026-09-05"),
      order: 0,
      tags: ["security", "audit"],
      subtasks: {
        create: [
          { title: "Create audit log schema", completed: false },
        ],
      },
    },
  });

  await prisma.task.create({
    data: {
      workspaceId: workspace.id,
      projectId: projectGerobak.id,
      title: "Legacy Database Migration Script",
      description: "Awaiting external database dump and schema validation before running data seed.",
      status: TaskStatus.BLOCKED,
      priority: TaskPriority.URGENT,
      assigneeId: devon.id,
      dueDate: new Date("2026-08-29"),
      order: 0,
      tags: ["database", "blocked"],
      subtasks: {
        create: [
          { title: "Backup existing database", completed: true },
          { title: "Resolve schema foreign key deadlock", completed: false },
        ],
      },
    },
  });

  console.log("✅ Tasks and Subtasks seeded.");

  // 6. Create Notifications
  await prisma.notification.deleteMany({});
  await prisma.notification.createMany({
    data: [
      {
        workspaceId: workspace.id,
        userId: acelino.id,
        title: "Sprint Review Scheduled",
        description: "Sprint #14 telemetry and velocity review set for tomorrow 14:00 UTC.",
        type: "task",
        link: "/calendar",
        read: true,
      },
      {
        workspaceId: workspace.id,
        userId: acelino.id,
        title: "New Project Created",
        description: 'Sarah Chen created new project "GerobakLink Integration API".',
        type: "project",
        link: "/projects",
        read: false,
      },
      {
        workspaceId: workspace.id,
        userId: acelino.id,
        title: "Milestone Completed",
        description: "Design System Tokens v2.0 reached 100% completion.",
        type: "milestone",
        link: "/reports",
        read: false,
      },
    ],
  });
  console.log("✅ Notifications seeded.");

  // 7. Create Audit Logs
  await prisma.auditLog.deleteMany({});
  await prisma.auditLog.createMany({
    data: [
      {
        workspaceId: workspace.id,
        actorId: acelino.id,
        action: "WORKSPACE_RBAC_UPDATE",
        target: "Permissions policy sync",
        ipAddress: "192.168.1.104",
      },
      {
        workspaceId: workspace.id,
        actorId: sarah.id,
        action: "PROJECT_CREATE",
        target: "GerobakLink Integration API",
        ipAddress: "114.124.201.88",
      },
      {
        workspaceId: workspace.id,
        actorId: acelino.id,
        action: "API_TOKEN_ROTATED",
        target: "Live Production Token",
        ipAddress: "127.0.0.1",
      },
    ],
  });

  console.log("✅ Audit Logs seeded.");
  console.log("🎉 Database seeding complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
