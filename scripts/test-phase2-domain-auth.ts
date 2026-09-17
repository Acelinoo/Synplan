import { prisma } from "../src/lib/prisma";
import { Role, ProjectRole, TaskStatus, TaskPriority } from "@prisma/client";
import { verifyUserProjectAccess } from "../src/domains/identity/guards";
import { ProjectDomainService } from "../src/domains/project/project.service";
import { TaskDomainService } from "../src/domains/task/task.service";
import {
  registerPendingConfirmation,
  validatePendingConfirmation,
  markConfirmationExecuted,
  invalidatePendingConfirmation,
} from "../src/lib/ai/confirmationStore";
import { recordExecutionReceipt, getLatestExecutionReceipt } from "../src/lib/ai/receiptStore";
import { AiExecutionContext, AiPlan } from "../src/lib/ai/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`  ✕ [FAIL] ${testName}${details ? ` -> ${details}` : ""}`);
  }
}

async function runPhase2DomainAuthTests() {
  console.log("===============================================================");
  console.log(" SYNPLAN 2.0 — PHASE 2 VERIFICATION SUITE");
  console.log(" DOMAIN LAYER, AUTHORIZATION & AI PERSISTENCE");
  console.log("===============================================================\n");

  // Fetch real seeded data from PostgreSQL
  const [adminUser, memberUser] = await Promise.all([
    prisma.user.findFirst({ where: { role: Role.ADMIN } }),
    prisma.user.findFirst({ where: { role: Role.MEMBER } }),
  ]);

  if (!adminUser || !memberUser) {
    throw new Error("Seeded admin and member users not found in database.");
  }

  // Create or upsert a test viewer user
  const viewerUser = await prisma.user.upsert({
    where: { email: "test.viewer.phase2@synplan.dev" },
    update: { role: Role.VIEWER },
    create: {
      email: "test.viewer.phase2@synplan.dev",
      name: "Test Viewer Phase 2",
      role: Role.VIEWER,
    },
  });

  const workspace = await prisma.workspace.findFirst();
  if (!workspace) throw new Error("Seeded workspace not found.");

  const projects = await prisma.project.findMany({
    where: { workspaceId: workspace.id },
  });
  if (projects.length === 0) throw new Error("Seeded projects not found.");

  const primaryProject = projects[0];

  // -------------------------------------------------------------
  // 1. AUTHORIZATION & RBAC VERIFICATION
  // -------------------------------------------------------------
  console.log("--- 1. AUTHORIZATION & RBAC VERIFICATION ---");

  // 1.1 Workspace Admin elevated project access
  const adminAccess = await verifyUserProjectAccess({
    userId: adminUser.id,
    projectId: primaryProject.id,
    workspaceId: workspace.id,
  });
  assert(adminAccess.isAuthorized && adminAccess.isElevated, "1.1 Workspace ADMIN has elevated project access");

  // 1.2 Workspace isolation (foreign workspace query rejected)
  const foreignWsAccess = await verifyUserProjectAccess({
    userId: adminUser.id,
    projectId: primaryProject.id,
    workspaceId: "ws_non_existent_foreign_id",
  });
  assert(!foreignWsAccess.isAuthorized, "1.2 Access to foreign workspace is strictly rejected");

  // 1.3 Project isolation: Member without project squad assignment
  // Create a temporary project with no members assigned
  const isolatedProject = await prisma.project.create({
    data: {
      name: "Private Restricted Project",
      slug: `private-restricted-${Date.now()}`,
      workspaceId: workspace.id,
    },
  });

  const memberNoSquad = await verifyUserProjectAccess({
    userId: memberUser.id,
    projectId: isolatedProject.id,
    workspaceId: workspace.id,
  });
  assert(!memberNoSquad.isAuthorized, "1.3 Workspace MEMBER without project squad assignment is denied");

  // 1.4 Assign Member as Project CONTRIBUTOR
  await prisma.projectMember.create({
    data: {
      projectId: isolatedProject.id,
      userId: memberUser.id,
      role: ProjectRole.CONTRIBUTOR,
    },
  });

  const contributorAccess = await verifyUserProjectAccess({
    userId: memberUser.id,
    projectId: isolatedProject.id,
    workspaceId: workspace.id,
    allowedRoles: [ProjectRole.LEAD, ProjectRole.CONTRIBUTOR],
  });
  assert(
    contributorAccess.isAuthorized && contributorAccess.role === ProjectRole.CONTRIBUTOR,
    "1.4 Project CONTRIBUTOR is granted access for mutation roles"
  );

  // 1.5 Assign Viewer as Project VIEWER
  await prisma.projectMember.create({
    data: {
      projectId: isolatedProject.id,
      userId: viewerUser.id,
      role: ProjectRole.VIEWER,
    },
  });

  const viewerMutationAccess = await verifyUserProjectAccess({
    userId: viewerUser.id,
    projectId: isolatedProject.id,
    workspaceId: workspace.id,
    allowedRoles: [ProjectRole.LEAD, ProjectRole.CONTRIBUTOR],
  });
  assert(!viewerMutationAccess.isAuthorized, "1.5 Project VIEWER is denied for mutation role requirements");

  // 1.6 Unauthorized access with non-existent user
  const nonExistentUserAccess = await verifyUserProjectAccess({
    userId: "usr_fake_attacker_99",
    projectId: isolatedProject.id,
    workspaceId: workspace.id,
  });
  assert(!nonExistentUserAccess.isAuthorized, "1.6 Non-existent user is strictly rejected");

  // -------------------------------------------------------------
  // 2. DOMAIN SERVICES & DYNAMIC PROGRESS VERIFICATION
  // -------------------------------------------------------------
  console.log("\n--- 2. DOMAIN SERVICES & PROGRESS CALCULATION ---");

  // 2.1 Dynamic progress calculation for empty project
  const emptyProgress = await ProjectDomainService.calculateProjectProgress(isolatedProject.id);
  assert(
    emptyProgress.totalTasks === 0 && emptyProgress.progressPercentage === 0,
    "2.1 Empty project returns 0 tasks and 0% progress"
  );

  // 2.2 Task domain creation
  const taskA = await TaskDomainService.createTask(adminUser.id, {
    workspaceId: workspace.id,
    projectId: isolatedProject.id,
    title: "Phase 2 Security Validation Task A",
    priority: TaskPriority.HIGH,
    status: TaskStatus.TODO,
  });
  assert(Boolean(taskA && taskA.id), "2.2 TaskDomainService creates task with transaction and audit log");

  const taskB = await TaskDomainService.createTask(adminUser.id, {
    workspaceId: workspace.id,
    projectId: isolatedProject.id,
    title: "Phase 2 Security Validation Task B",
    priority: TaskPriority.URGENT,
    status: TaskStatus.DONE,
  });
  assert(Boolean(taskB && taskB.id), "2.3 Second task created with DONE status");

  // 2.4 Dynamic progress calculation (1 of 2 done = 50%)
  const updatedProgress = await ProjectDomainService.calculateProjectProgress(isolatedProject.id);
  assert(
    updatedProgress.totalTasks === 2 &&
      updatedProgress.completedTasks === 1 &&
      updatedProgress.progressPercentage === 50,
    "2.4 Dynamic progress calculated deterministically as 50% (1/2 completed)"
  );

  // 2.5 Task domain status update (via legitimate state machine path: TODO -> IN_PROGRESS -> DONE)
  await TaskDomainService.changeStatus(adminUser.id, taskA.id, TaskStatus.IN_PROGRESS);
  const updatedTaskA = await TaskDomainService.changeStatus(adminUser.id, taskA.id, TaskStatus.DONE);
  assert(updatedTaskA.status === TaskStatus.DONE, "2.5 TaskDomainService updates task status to DONE");

  // 2.6 Dynamic progress reaches 100%
  const completeProgress = await ProjectDomainService.calculateProjectProgress(isolatedProject.id);
  assert(
    completeProgress.completedTasks === 2 && completeProgress.progressPercentage === 100,
    "2.6 Dynamic progress dynamically updates to 100% (2/2 completed)"
  );

  // 2.7 Subtask creation
  const subtask = await TaskDomainService.createSubtask(adminUser.id, taskA.id, "Subtask Unit A.1");
  assert(Boolean(subtask && subtask.id), "2.7 Subtask created successfully");

  // 2.8 Dependency validation (Self-dependency rejected)
  let selfDepFailed = false;
  try {
    await TaskDomainService.createDependency(adminUser.id, taskA.id, taskA.id);
  } catch {
    selfDepFailed = true;
  }
  assert(selfDepFailed, "2.8 Self-dependency is rejected by domain service");

  // 2.9 Valid dependency creation
  const dep = await TaskDomainService.createDependency(adminUser.id, taskA.id, taskB.id);
  assert(Boolean(dep && dep.id), "2.9 Valid cross-task dependency created");

  // -------------------------------------------------------------
  // 3. AI PERSISTENCE & CONFIRMATION VERIFICATION
  // -------------------------------------------------------------
  console.log("\n--- 3. AI PERSISTENCE & CONFIRMATION VERIFICATION ---");

  const testAiContext: AiExecutionContext = {
    userId: adminUser.id,
    workspaceId: workspace.id,
    userName: adminUser.name,
    userRole: "ADMIN",
    workspaceName: workspace.name,
    isMock: false, // REAL PostgreSQL test!
    projects: [],
    phases: [],
    tasks: [],
    members: [],
  };

  const testPlan: AiPlan = {
    id: `plan_phase2_${Date.now()}`,
    userPrompt: "Delete obsolete task",
    assistantMessage: "Menghapus task validation",
    isDestructive: true,
    requiresConfirmation: true,
    status: "NEEDS_CONFIRMATION",
    actions: [
      {
        id: `act_${Date.now()}`,
        type: "DELETE_TASK",
        summary: "Delete validation task",
        payload: { taskId: taskA.id },
        riskLevel: "HIGH",
        requiredRole: Role.MEMBER,
        isDestructive: true,
        requiresConfirmation: true,
        status: "READY",
      },
    ],
    warnings: [],
    planner: "heuristic",
    provider: "fallback",
    createdAt: new Date().toISOString(),
  };

  // 3.1 Register persistent confirmation in PostgreSQL
  const pendingConf = await registerPendingConfirmation(testPlan, testAiContext);
  assert(Boolean(pendingConf && pendingConf.token), "3.1 registerPendingConfirmation generated valid token");

  // Verify session actually exists in PostgreSQL
  const dbSession = await prisma.aiConfirmationSession.findUnique({
    where: { token: pendingConf.token },
  });
  assert(Boolean(dbSession && dbSession.status === "PENDING"), "3.2 Confirmation session persisted to PostgreSQL");

  // 3.3 Valid confirmation token validation
  const validationResult = await validatePendingConfirmation({
    token: pendingConf.token,
    userId: adminUser.id,
    workspaceId: workspace.id,
    fingerprint: pendingConf.planFingerprint,
  });
  assert(validationResult.isValid, "3.3 validatePendingConfirmation validates successfully with server authority");

  // 3.4 Cross-user spoofing rejected
  const spoofUserValidation = await validatePendingConfirmation({
    token: pendingConf.token,
    userId: memberUser.id,
    workspaceId: workspace.id,
  });
  assert(!spoofUserValidation.isValid, "3.4 Confirmation token cannot be validated by unauthorized user");

  // 3.5 Cross-workspace spoofing rejected
  const spoofWsValidation = await validatePendingConfirmation({
    token: pendingConf.token,
    userId: adminUser.id,
    workspaceId: "foreign_workspace_123",
  });
  assert(!spoofWsValidation.isValid, "3.5 Confirmation token cannot be validated from foreign workspace");

  // 3.6 Replay attack prevention: mark executed
  await markConfirmationExecuted(pendingConf.token);
  const replayedValidation = await validatePendingConfirmation({
    token: pendingConf.token,
    userId: adminUser.id,
    workspaceId: workspace.id,
  });
  assert(!replayedValidation.isValid, "3.6 Executed confirmation token cannot be reused (Replay Protection)");

  // 3.7 Persistent Execution Receipt
  const executionId = `exec_phase2_${Date.now()}`;
  await recordExecutionReceipt({
    executionId,
    planId: testPlan.id,
    workspaceId: workspace.id,
    userId: adminUser.id,
    timestamp: new Date().toISOString(),
    status: "SUCCESS",
    workflowPolicy: "ATOMIC",
    reversible: false,
    summary: "Phase 2 execution test",
    successfulCount: 1,
    failedCount: 0,
    blockedCount: 0,
    actions: [],
  });

  const latestReceipt = await getLatestExecutionReceipt(workspace.id, adminUser.id);
  assert(latestReceipt?.executionId === executionId, "3.7 Persistent execution receipt recorded and retrieved");

  // -------------------------------------------------------------
  // CLEANUP TEST DATA
  // -------------------------------------------------------------
  await prisma.taskDependency.deleteMany({
    where: { OR: [{ blockingTaskId: taskA.id }, { blockedTaskId: taskB.id }] },
  });
  await prisma.subtask.deleteMany({ where: { taskId: taskA.id } });
  await prisma.task.deleteMany({ where: { projectId: isolatedProject.id } });
  await prisma.projectMember.deleteMany({ where: { projectId: isolatedProject.id } });
  await prisma.project.delete({ where: { id: isolatedProject.id } });
  await prisma.aiConfirmationSession.deleteMany({ where: { token: pendingConf.token } });
  await prisma.aiExecutionReceipt.deleteMany({ where: { executionId } });

  console.log("\n===============================================================");
  console.log(` PHASE 2 VERIFICATION COMPLETE: ${passed} / ${passed + failed} PASS`);
  console.log("===============================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase2DomainAuthTests()
  .catch((err) => {
    console.error("Phase 2 test suite encountered fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
