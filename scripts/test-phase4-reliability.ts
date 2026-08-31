import { prisma } from "../src/lib/prisma";
import { idempotency } from "../src/lib/idempotency";
import { logger, sanitizeLogData } from "../src/lib/logger";
import { createApiErrorResponse } from "../src/lib/apiErrors";
import { SlidingWindowRateLimiter } from "../src/lib/rateLimit";
import { POST as createTask } from "../src/app/api/tasks/route";
import { PATCH as updateTaskStatus } from "../src/app/api/tasks/status/route";
import { POST as createProject } from "../src/app/api/projects/route";
import { DELETE as deleteProject } from "../src/app/api/projects/[id]/route";
import { POST as createPhase } from "../src/app/api/phases/route";
import { POST as reorderPhases } from "../src/app/api/phases/reorder/route";
import { POST as inviteMember, DELETE as removeMember } from "../src/app/api/team/members/route";
import { NextRequest } from "next/server";
import { TaskStatus, Role, ProjectStatus } from "@prisma/client";

async function main() {
  console.log("================================================================================");
  console.log("SYNPLAN — PHASE 4: PRODUCTION HARDENING & RELIABILITY VERIFICATION SUITE");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function record(section: string, description: string, condition: boolean) {
    if (condition) {
      console.log(`  [PASS] ${section} -> ${description}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${section} -> ${description}`);
      failed++;
    }
  }

  // Setup Test Fixtures
  const testSuffix = `p4_${Date.now()}`;
  const ownerUser = await prisma.user.create({
    data: {
      id: `usr_owner_${testSuffix}`,
      name: "Owner User",
      email: `owner_${testSuffix}@synplan.dev`,
      role: Role.OWNER,
    },
  });

  const memberUser = await prisma.user.create({
    data: {
      id: `usr_member_${testSuffix}`,
      name: "Member User",
      email: `member_${testSuffix}@synplan.dev`,
      role: Role.MEMBER,
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      id: `ws_${testSuffix}`,
      name: `Workspace ${testSuffix}`,
      slug: `ws-slug-${testSuffix}`,
      ownerId: ownerUser.id,
      members: {
        create: [
          { userId: ownerUser.id, role: Role.OWNER },
          { userId: memberUser.id, role: Role.MEMBER },
        ],
      },
    },
  });

  const session = await prisma.session.create({
    data: {
      id: `sess_owner_${testSuffix}`,
      sessionToken: `token_owner_${testSuffix}`,
      userId: ownerUser.id,
      expiresAt: new Date(Date.now() + 86400 * 1000),
    },
  });

  const authHeaders = {
    cookie: `synplan_session_token=${session.sessionToken}`,
    "x-synplan-workspace-id": workspace.id,
    "Content-Type": "application/json",
  };

  try {
    // --------------------------------------------------------------------------
    // 1. GENERALIZED IDEMPOTENCY ENGINE TESTS
    // --------------------------------------------------------------------------
    console.log("1. MUTATION IDEMPOTENCY VERIFICATION");
    idempotency.clear();

    const taskKey = `idem_task_${testSuffix}`;
    const initialProject = await prisma.project.create({
      data: {
        id: `prj_init_${testSuffix}`,
        workspaceId: workspace.id,
        name: "Initial Project",
        status: ProjectStatus.ACTIVE,
      },
    });

    // 1.1 Task Creation Idempotency
    const taskReq1 = new NextRequest("http://localhost:3000/api/tasks", {
      method: "POST",
      headers: {
        ...authHeaders,
        "idempotency-key": taskKey,
      },
      body: JSON.stringify({
        workspaceId: workspace.id,
        projectId: initialProject.id,
        title: "Idempotent Task Test",
        priority: "HIGH",
        status: "TODO",
      }),
    });

    const taskRes1 = await createTask(taskReq1);
    const taskBody1 = await taskRes1.json();
    record("Idempotency", "1.1 First task creation request succeeds with 201 Created", taskRes1.status === 201 && taskBody1.success);

    // Duplicate call with same idempotency key
    const taskReq2 = new NextRequest("http://localhost:3000/api/tasks", {
      method: "POST",
      headers: {
        ...authHeaders,
        "idempotency-key": taskKey,
      },
      body: JSON.stringify({
        workspaceId: workspace.id,
        projectId: initialProject.id,
        title: "Idempotent Task Test",
        priority: "HIGH",
        status: "TODO",
      }),
    });

    const taskRes2 = await createTask(taskReq2);
    const taskBody2 = await taskRes2.json();
    record("Idempotency", "1.2 Second identical request returns cached result with HIT header", taskRes2.headers.get("x-idempotency-cache") === "HIT");
    record("Idempotency", "1.3 Returned task ID is identical across both requests", taskBody1.data?.id === taskBody2.data?.id);

    // Verify DB count: exactly 1 task created, not 2
    const taskDbCount = await prisma.task.count({
      where: { workspaceId: workspace.id, title: "Idempotent Task Test" },
    });
    record("Idempotency", "1.4 Database contains exactly 1 task record (0 duplicate creation)", taskDbCount === 1);

    // 1.2 Project Creation Idempotency
    const projKey = `idem_proj_${testSuffix}`;
    const projReq1 = new NextRequest("http://localhost:3000/api/projects", {
      method: "POST",
      headers: {
        ...authHeaders,
        "idempotency-key": projKey,
      },
      body: JSON.stringify({
        workspaceId: workspace.id,
        name: "Idempotent Project Test",
      }),
    });

    const projRes1 = await createProject(projReq1);
    const projBody1 = await projRes1.json();
    record("Idempotency", "1.5 First project creation request succeeds with 201 Created", projRes1.status === 201 && projBody1.success);

    const projReq2 = new NextRequest("http://localhost:3000/api/projects", {
      method: "POST",
      headers: {
        ...authHeaders,
        "idempotency-key": projKey,
      },
      body: JSON.stringify({
        workspaceId: workspace.id,
        name: "Idempotent Project Test",
      }),
    });

    const projRes2 = await createProject(projReq2);
    const projBody2 = await projRes2.json();
    record("Idempotency", "1.6 Second project request returns cached result (HIT)", projRes2.headers.get("x-idempotency-cache") === "HIT");
    record("Idempotency", "1.7 Project ID is identical across calls", projBody1.data?.id === projBody2.data?.id);

    const projDbCount = await prisma.project.count({
      where: { workspaceId: workspace.id, name: "Idempotent Project Test" },
    });
    record("Idempotency", "1.8 Database contains exactly 1 project record", projDbCount === 1);

    // 1.3 Phase Creation Idempotency
    const phaseKey = `idem_phase_${testSuffix}`;
    const phaseReq1 = new NextRequest("http://localhost:3000/api/phases", {
      method: "POST",
      headers: {
        ...authHeaders,
        "idempotency-key": phaseKey,
      },
      body: JSON.stringify({
        workspaceId: workspace.id,
        projectId: initialProject.id,
        name: "Planning Phase",
      }),
    });

    const phaseRes1 = await createPhase(phaseReq1);
    const phaseBody1 = await phaseRes1.json();
    record("Idempotency", "1.9 First phase creation request succeeds with 201 Created", phaseRes1.status === 201 && phaseBody1.success);

    const phaseReq2 = new NextRequest("http://localhost:3000/api/phases", {
      method: "POST",
      headers: {
        ...authHeaders,
        "idempotency-key": phaseKey,
      },
      body: JSON.stringify({
        workspaceId: workspace.id,
        projectId: initialProject.id,
        name: "Planning Phase",
      }),
    });

    const phaseRes2 = await createPhase(phaseReq2);
    const phaseBody2 = await phaseRes2.json();
    record("Idempotency", "1.10 Second phase request returns cached result (HIT)", phaseRes2.headers.get("x-idempotency-cache") === "HIT");
    record("Idempotency", "1.11 Phase ID is identical across calls", phaseBody1.data?.id === phaseBody2.data?.id);

    // --------------------------------------------------------------------------
    // 2. ATOMIC PRISMA TRANSACTION INTEGRITY TESTS
    // --------------------------------------------------------------------------
    console.log("\n2. ATOMIC PRISMA TRANSACTION BOUNDARIES");

    // 2.1 Task Status + Project Progress Atomic Synchronization
    const progressProject = await prisma.project.create({
      data: {
        id: `prj_prog_${testSuffix}`,
        workspaceId: workspace.id,
        name: "Progress Sync Project",
        progress: 0,
        status: ProjectStatus.ACTIVE,
      },
    });

    const syncTask1 = await prisma.task.create({
      data: {
        id: `tsk_sync_1_${testSuffix}`,
        workspaceId: workspace.id,
        projectId: progressProject.id,
        title: "Task 1 for progress",
        status: TaskStatus.TODO,
      },
    });

    const syncTask2 = await prisma.task.create({
      data: {
        id: `tsk_sync_2_${testSuffix}`,
        workspaceId: workspace.id,
        projectId: progressProject.id,
        title: "Task 2 for progress",
        status: TaskStatus.TODO,
      },
    });

    // Update syncTask1 to DONE -> Project progress should become 50%
    const statusReq1 = new NextRequest("http://localhost:3000/api/tasks/status", {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({
        taskId: syncTask1.id,
        status: "DONE",
      }),
    });

    const statusRes1 = await updateTaskStatus(statusReq1);
    const statusBody1 = await statusRes1.json();
    record("Transactions", "2.1 Task status update succeeds with 200 OK", statusRes1.status === 200 && statusBody1.success);
    record("Transactions", "2.2 Evaluator reports 50% project progress", statusBody1.evaluator?.projectProgress === 50);

    const checkProj1 = await prisma.project.findUnique({ where: { id: progressProject.id } });
    record("Transactions", "2.3 Database Project.progress was updated atomically to 50%", checkProj1?.progress === 50);

    // Update syncTask2 to DONE -> Project progress should become 100% and status COMPLETED
    const statusReq2 = new NextRequest("http://localhost:3000/api/tasks/status", {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({
        taskId: syncTask2.id,
        status: "DONE",
      }),
    });

    const statusRes2 = await updateTaskStatus(statusReq2);
    const statusBody2 = await statusRes2.json();
    record("Transactions", "2.4 Final task completion triggers 100% progress and projectCompleted flag", statusBody2.evaluator?.projectProgress === 100 && statusBody2.evaluator?.projectCompleted === true);

    const checkProj2 = await prisma.project.findUnique({ where: { id: progressProject.id } });
    record("Transactions", "2.5 Database Project.status updated atomically to COMPLETED", checkProj2?.status === ProjectStatus.COMPLETED && checkProj2?.progress === 100);

    // 2.2 Member Removal Atomic Cleanup (Unassigning Tasks & Removing Project Memberships)
    const cleanupUser = await prisma.user.create({
      data: {
        id: `usr_cleanup_${testSuffix}`,
        name: "Cleanup Test User",
        email: `cleanup_${testSuffix}@synplan.dev`,
        role: Role.MEMBER,
      },
    });

    const cleanupMember = await prisma.workspaceMember.create({
      data: {
        id: `wm_cleanup_${testSuffix}`,
        workspaceId: workspace.id,
        userId: cleanupUser.id,
        role: Role.MEMBER,
      },
    });

    await prisma.projectMember.create({
      data: {
        id: `pm_cleanup_${testSuffix}`,
        projectId: progressProject.id,
        userId: cleanupUser.id,
        role: Role.MEMBER,
      },
    });

    const assignedTask = await prisma.task.create({
      data: {
        id: `tsk_assigned_${testSuffix}`,
        workspaceId: workspace.id,
        projectId: progressProject.id,
        title: "Assigned to Cleanup User",
        assigneeId: cleanupUser.id,
      },
    });

    // Remove member via DELETE /api/team/members
    const removeReq = new NextRequest(`http://localhost:3000/api/team/members?memberId=${cleanupMember.id}`, {
      method: "DELETE",
      headers: authHeaders,
    });

    const removeRes = await removeMember(removeReq);
    record("Transactions", "2.6 Member removal succeeds with 200 OK", removeRes.status === 200);

    const checkDeletedMember = await prisma.workspaceMember.findUnique({ where: { id: cleanupMember.id } });
    record("Transactions", "2.7 WorkspaceMember record deleted from database", checkDeletedMember === null);

    const checkProjectMember = await prisma.projectMember.findFirst({ where: { userId: cleanupUser.id, projectId: progressProject.id } });
    record("Transactions", "2.8 ProjectMember record cleaned up atomically", checkProjectMember === null);

    const checkTaskAssignee = await prisma.task.findUnique({ where: { id: assignedTask.id } });
    record("Transactions", "2.9 Task assigneeId safely nullified without deleting task record", checkTaskAssignee?.assigneeId === null);

    // 2.3 Phase Reordering Atomic Transaction
    const phaseA = await prisma.phase.create({
      data: { id: `ph_a_${testSuffix}`, projectId: progressProject.id, name: "Phase A", order: 1 },
    });
    const phaseB = await prisma.phase.create({
      data: { id: `ph_b_${testSuffix}`, projectId: progressProject.id, name: "Phase B", order: 2 },
    });

    const reorderReq = new NextRequest("http://localhost:3000/api/phases/reorder", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        projectId: progressProject.id,
        phaseOrders: [
          { id: phaseA.id, order: 2 },
          { id: phaseB.id, order: 1 },
        ],
      }),
    });

    const reorderRes = await reorderPhases(reorderReq);
    record("Transactions", "2.10 Phase reordering succeeds with 200 OK", reorderRes.status === 200);

    const [updatedPhaseA, updatedPhaseB] = await Promise.all([
      prisma.phase.findUnique({ where: { id: phaseA.id } }),
      prisma.phase.findUnique({ where: { id: phaseB.id } }),
    ]);
    record("Transactions", "2.11 Phase orders swapped atomically (A->2, B->1)", updatedPhaseA?.order === 2 && updatedPhaseB?.order === 1);

    // --------------------------------------------------------------------------
    // 3. STRUCTURED LOGGING & CREDENTIAL REDACTION AUDIT
    // --------------------------------------------------------------------------
    console.log("\n3. STRUCTURED LOGGING & CREDENTIAL REDACTION AUDIT");

    const sensitiveObject = {
      user: "Admin",
      password: "SuperSecretPassword123!",
      sessionToken: "sess_tok_99999",
      authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.test",
      databaseUrl: "postgresql://postgres:mysecretpass@db.synplan.supabase.co:5432/postgres",
      safeData: {
        workspaceId: "ws_123",
        itemCount: 42,
      },
    };

    const sanitized = sanitizeLogData(sensitiveObject) as any;
    record("Logging", "3.1 Password field redacted", sanitized.password === "[REDACTED]");
    record("Logging", "3.2 Session token field redacted", sanitized.sessionToken === "[REDACTED]");
    record("Logging", "3.3 Authorization header redacted", sanitized.authorization === "[REDACTED]");
    record("Logging", "3.4 Database connection URL string redacted", sanitized.databaseUrl.includes("postgresql://[REDACTED]@"));
    record("Logging", "3.5 Non-sensitive metadata preserved intact", sanitized.safeData?.workspaceId === "ws_123" && sanitized.safeData?.itemCount === 42);

    // --------------------------------------------------------------------------
    // 4. API ERROR SANITIZATION & CORRELATION IDS
    // --------------------------------------------------------------------------
    console.log("\n4. API ERROR SANITIZATION & REQUEST CORRELATION IDS");

    const customReqId = `req_test_${Date.now()}`;
    const prismaError = new Error("Invalid `prisma.task.findMany()` invocation: column `tasks.unknown` does not exist");
    const errorResponse = createApiErrorResponse(prismaError, "Failed to load tasks", {
      status: 500,
      requestId: customReqId,
    });

    const errorJson = await errorResponse.json();
    record("Error Handling", "4.1 Error response includes x-request-id correlation header", errorResponse.headers.get("x-request-id") === customReqId);
    record("Error Handling", "4.2 Error response body includes matching requestId", errorJson.requestId === customReqId);
    record("Error Handling", "4.3 Internal Prisma query string does not leak in production error message", !errorJson.message.includes("column `tasks.unknown`"));

    // --------------------------------------------------------------------------
    // 5. RATE LIMITING RESILIENCE
    // --------------------------------------------------------------------------
    console.log("\n5. RATE LIMITING ENGINE AUDIT");

    const testLimiter = new SlidingWindowRateLimiter({
      windowMs: 1000,
      maxRequests: 3,
    });

    const key = `ip_${Date.now()}`;
    const r1 = testLimiter.check(key);
    const r2 = testLimiter.check(key);
    const r3 = testLimiter.check(key);
    const r4 = testLimiter.check(key);

    record("Rate Limiter", "5.1 Requests within limit (1-3) return success: true", r1.success && r2.success && r3.success);
    record("Rate Limiter", "5.2 Exceeded request (4th) returns success: false with retryAfter > 0", !r4.success && r4.retryAfter > 0);

  } finally {
    // --------------------------------------------------------------------------
    // CLEANUP TEST FIXTURES
    // --------------------------------------------------------------------------
    console.log("\nCleaning up test fixtures...");
    await prisma.task.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.phase.deleteMany({ where: { project: { workspaceId: workspace.id } } });
    await prisma.projectMember.deleteMany({ where: { project: { workspaceId: workspace.id } } });
    await prisma.project.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.session.deleteMany({ where: { userId: { in: [ownerUser.id, memberUser.id] } } });
    await prisma.workspaceMember.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.auditLog.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.workspace.deleteMany({ where: { id: workspace.id } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerUser.id, memberUser.id] } } });
    console.log("Cleanup complete.\n");
  }

  console.log("================================================================================");
  console.log(`PHASE 4 RELIABILITY AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error in Phase 4 test suite:", err);
  process.exit(1);
});
