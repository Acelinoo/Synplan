import { PrismaClient, Role, ProjectRole, ProjectStatus, TaskStatus, TaskPriority, ActorType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting Synplan 2.0 Database Seeding...");

  // 1. Clean existing records in reverse dependency order
  await prisma.aiExecutionReceipt.deleteMany({});
  await prisma.aiConversationTurn.deleteMany({});
  await prisma.aiConversation.deleteMany({});
  await prisma.aiConfirmationSession.deleteMany({});
  await prisma.automationRule.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.taskComment.deleteMany({});
  await prisma.taskDependency.deleteMany({});
  await prisma.subtask.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.milestone.deleteMany({});
  await prisma.phase.deleteMany({});
  await prisma.projectMember.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.workspaceMember.deleteMany({});
  await prisma.workspace.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.account.deleteMany({});
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

  // 3. Create Seed Session for Development
  await prisma.session.create({
    data: {
      sessionToken: "seed_dev_session_token_acelino_2026",
      userId: acelino.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  // 4. Create Workspace
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

  // 5. Create Projects
  const projectSynplan = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      name: "Synplan Platform 2.0",
      slug: "synplan-platform-2",
      description: "AI-Native project management platform with multi-view tasks, project intelligence, and serverless persistence.",
      status: ProjectStatus.ACTIVE,
      startDate: new Date("2026-08-01"),
      targetDate: new Date("2026-10-15"),
      deadline: new Date("2026-10-15"),
      color: "#6366F1",
      members: {
        create: [
          { userId: acelino.id, role: ProjectRole.LEAD },
          { userId: sarah.id, role: ProjectRole.CONTRIBUTOR },
          { userId: marcus.id, role: ProjectRole.CONTRIBUTOR },
        ],
      },
    },
  });

  const projectGerobak = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      name: "GerobakLink Integration API",
      slug: "gerobaklink-integration-api",
      description: "High-performance POS and ordering middleware connecting local Indonesian merchant telemetry.",
      status: ProjectStatus.ACTIVE,
      startDate: new Date("2026-08-15"),
      targetDate: new Date("2026-09-30"),
      deadline: new Date("2026-09-30"),
      color: "#10B981",
      members: {
        create: [
          { userId: acelino.id, role: ProjectRole.LEAD },
          { userId: devon.id, role: ProjectRole.CONTRIBUTOR },
        ],
      },
    },
  });

  const projectSecurity = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      name: "Cybersecurity SOC & Telemetry",
      slug: "cybersecurity-soc-telemetry",
      description: "Automated vulnerability scanner, SOC event correlation engine, and real-time audit logging.",
      status: ProjectStatus.ACTIVE,
      startDate: new Date("2026-09-01"),
      targetDate: new Date("2026-11-30"),
      deadline: new Date("2026-11-30"),
      color: "#F59E0B",
      members: {
        create: [
          { userId: acelino.id, role: ProjectRole.LEAD },
          { userId: marcus.id, role: ProjectRole.CONTRIBUTOR },
          { userId: devon.id, role: ProjectRole.CONTRIBUTOR },
        ],
      },
    },
  });

  console.log("✅ Projects seeded.");

  // 6. Create Phases & Milestones
  const phase1 = await prisma.phase.create({
    data: {
      workspaceId: workspace.id,
      projectId: projectSynplan.id,
      name: "Phase 1: Architecture & Foundation",
      order: 1.0,
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-31"),
    },
  });

  const phase2 = await prisma.phase.create({
    data: {
      workspaceId: workspace.id,
      projectId: projectSynplan.id,
      name: "Phase 2: Core Task & Multi-View Engine",
      order: 2.0,
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-09-30"),
    },
  });

  const milestoneM1 = await prisma.milestone.create({
    data: {
      workspaceId: workspace.id,
      projectId: projectSynplan.id,
      title: "M1: Database & Serverless State Baseline",
      targetDate: new Date("2026-09-20"),
      isReached: true,
      reachedAt: new Date(),
    },
  });

  const milestoneM2 = await prisma.milestone.create({
    data: {
      workspaceId: workspace.id,
      projectId: projectSynplan.id,
      title: "M2: AI Command Center Production Release",
      targetDate: new Date("2026-10-15"),
      isReached: false,
    },
  });

  console.log("✅ Phases and Milestones seeded.");

  // 7. Create Tasks with Subtasks & Dependencies
  const task1 = await prisma.task.create({
    data: {
      workspaceId: workspace.id,
      projectId: projectSynplan.id,
      phaseId: phase1.id,
      milestoneId: milestoneM1.id,
      creatorId: acelino.id,
      assigneeId: acelino.id,
      title: "Synchronize PostgreSQL 17 Schema & Baseline",
      description: "Initialize clean Synplan 2.0 schema with serverless-safe AI state models and compound indexes.",
      status: TaskStatus.DONE,
      priority: TaskPriority.URGENT,
      order: 1.0,
      completedAt: new Date(),
      tags: ["database", "core", "infrastructure"],
      subtasks: {
        create: [
          { title: "Define all 16 Prisma models", completed: true, order: 1.0 },
          { title: "Apply baseline migration 20260917024808_init_synplan2", completed: true, order: 2.0 },
        ],
      },
    },
  });

  const task2 = await prisma.task.create({
    data: {
      workspaceId: workspace.id,
      projectId: projectSynplan.id,
      phaseId: phase2.id,
      milestoneId: milestoneM2.id,
      creatorId: acelino.id,
      assigneeId: sarah.id,
      title: "Implement Persistent AI Confirmation Engine",
      description: "Replace in-memory Map with AiConfirmationSession table in PostgreSQL.",
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      order: 2.0,
      dueDate: new Date("2026-09-25"),
      tags: ["ai", "backend", "security"],
      subtasks: {
        create: [
          { title: "Update confirmationStore.ts to use Prisma", completed: false, order: 1.0 },
          { title: "Add plan fingerprint validation against DB", completed: false, order: 2.0 },
        ],
      },
    },
  });

  const task3 = await prisma.task.create({
    data: {
      workspaceId: workspace.id,
      projectId: projectSynplan.id,
      phaseId: phase2.id,
      milestoneId: milestoneM2.id,
      creatorId: acelino.id,
      assigneeId: marcus.id,
      title: "Build Multi-View Task Engine (Board, List, Table)",
      description: "Unified task dataset rendered interchangeably as Kanban Board, Grouped List, and Spreadsheet Table.",
      status: TaskStatus.TODO,
      priority: TaskPriority.HIGH,
      order: 3.0,
      dueDate: new Date("2026-09-30"),
      tags: ["frontend", "views", "ux"],
      subtasks: {
        create: [
          { title: "TableView high-density component", completed: false, order: 1.0 },
          { title: "ListView grouped with multi-select", completed: false, order: 2.0 },
        ],
      },
    },
  });

  // Create dependency: Task 3 depends on Task 2
  await prisma.taskDependency.create({
    data: {
      blockingTaskId: task2.id,
      blockedTaskId: task3.id,
    },
  });

  // Comments
  await prisma.taskComment.create({
    data: {
      taskId: task1.id,
      authorId: sarah.id,
      content: "Baseline migration applied successfully to Supabase. All 21 tables verified.",
    },
  });

  // Audit Log
  await prisma.auditLog.create({
    data: {
      workspaceId: workspace.id,
      actorId: acelino.id,
      actorType: ActorType.USER,
      action: "DATABASE_INITIALIZED",
      target: "PostgreSQL 17.6 Schema",
      entityType: "DATABASE",
      entityId: "synplan-2.0",
      source: "SYSTEM_MIGRATION",
      after: { tablesCount: 21, status: "READY" },
    },
  });

  console.log("✅ Tasks, Dependencies, Comments, and Audit Logs seeded.");
  console.log("🎉 Synplan 2.0 Database Seeding Completed Successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
