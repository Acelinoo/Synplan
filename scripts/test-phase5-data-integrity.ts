import { prisma } from "../src/lib/prisma";
import { createAuditEntry, sanitizeSnapshot } from "../src/lib/audit";
import { checkWorkspaceDataConsistency } from "../src/lib/dataConsistency";
import { GET as getAuditRoute } from "../src/app/api/audit/route";
import { GET as getConsistencyHealthRoute } from "../src/app/api/health/data-consistency/route";
import { createSession } from "../src/lib/auth/session";
import { NextRequest } from "next/server";
import { TaskStatus, ProjectStatus, Role } from "@prisma/client";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${testName}`);
    if (detail) console.error(`     Detail: ${detail}`);
  }
}

async function runPhase5DataIntegrityTests() {
  console.log("\n=======================================================");
  console.log("   SYNPLAN — PHASE 5 DATA INTEGRITY & AUDIT TEST SUITE   ");
  console.log("=======================================================\n");

  // 1. Setup Isolated Test Workspaces, Users, and Sessions
  const timestamp = Date.now();
  const testUserA = await prisma.user.create({
    data: {
      email: `audit_user_a_${timestamp}@synplan.test`,
      name: "Audit User A",
    },
  });

  const testUserB = await prisma.user.create({
    data: {
      email: `audit_user_b_${timestamp}@synplan.test`,
      name: "Audit User B",
    },
  });

  const sessionA = await createSession(testUserA.id);
  const sessionB = await createSession(testUserB.id);

  const testWorkspaceA = await prisma.workspace.create({
    data: {
      name: `Audit Workspace A ${timestamp}`,
      slug: `audit-ws-a-${timestamp}`,
      ownerId: testUserA.id,
      members: {
        create: [
          { userId: testUserA.id, role: Role.OWNER },
        ],
      },
    },
  });

  const testWorkspaceB = await prisma.workspace.create({
    data: {
      name: `Audit Workspace B ${timestamp}`,
      slug: `audit-ws-b-${timestamp}`,
      ownerId: testUserB.id,
      members: {
        create: [
          { userId: testUserB.id, role: Role.OWNER },
        ],
      },
    },
  });

  try {
    // ------------------------------------------------------------------------
    // TEST SECTION 1: AUDIT TRAIL ENGINE CORE & SANITIZATION
    // ------------------------------------------------------------------------
    console.log("\n--- SECTION 1: Core Audit Engine & Sanitization ---");

    // Test 1.1: Snapshot Sanitization (Sensitive Field Redaction)
    const sensitiveData = {
      id: "task_123",
      title: "Secure Task",
      password: "my_secret_password",
      token: "bearer_xyz123",
      cookie: "session=abc",
      description: "A normal task description",
    };

    const sanitized = sanitizeSnapshot("task", sensitiveData) as any;
    assert(sanitized.title === "Secure Task", "Snapshot retains authorized domain fields");
    assert(sanitized.password === undefined, "Snapshot redacts sensitive password field");
    assert(sanitized.token === undefined, "Snapshot redacts sensitive token field");
    assert(sanitized.cookie === undefined, "Snapshot redacts sensitive cookie field");

    // Test 1.2: Snapshot Size Bounding
    const oversizedData = {
      id: "task_long",
      title: "Long Title",
      description: "A".repeat(1000),
    };
    const bounded = sanitizeSnapshot("task", oversizedData) as any;
    assert(bounded.description.length <= 520, "Snapshot string fields are bounded and truncated with ellipsis");

    // Test 1.3: Audit Creation with full metadata
    const audit1 = await createAuditEntry({
      workspaceId: testWorkspaceA.id,
      actorId: testUserA.id,
      actorType: "USER",
      action: "TASK_CREATE",
      target: 'Task "Test Task" created',
      entityType: "task",
      entityId: "tsk_1",
      after: { id: "tsk_1", title: "Test Task", status: "TODO" },
      requestId: "req_test_123",
      source: "TASK_FORM",
      ipAddress: "127.0.0.1",
    });

    assert(audit1 !== null, "createAuditEntry succeeds and returns persisted entry");
    assert(audit1?.workspaceId === testWorkspaceA.id, "Audit entry belongs to correct workspace");
    assert(audit1?.actorType === "USER", "Audit entry preserves actorType USER");
    assert(audit1?.requestId === "req_test_123", "Audit entry preserves requestId");
    assert(audit1?.source === "TASK_FORM", "Audit entry preserves mutation source");

    // Test 1.4: AI Actor Audit Entry
    const aiAudit = await createAuditEntry({
      workspaceId: testWorkspaceA.id,
      actorId: testUserA.id,
      actorType: "AI",
      action: "AI_PLAN_EXECUTE",
      target: "AI executed 3 actions",
      entityType: "ai_plan",
      entityId: "plan_456",
      after: { planId: "plan_456", status: "SUCCESS", count: 3 },
      source: "AI_ASSISTANT",
    });
    assert(aiAudit?.actorType === "AI", "Audit entry correctly identifies AI mutations");
    assert(aiAudit?.source === "AI_ASSISTANT", "Audit entry captures AI_ASSISTANT source");

    // Test 1.5: Non-blocking Failure Tolerance (Graceful Recovery)
    const invalidAudit = await createAuditEntry({
      workspaceId: "", // Invalid workspaceId
      action: "FAIL_ACTION",
    });
    assert(invalidAudit === null, "createAuditEntry handles invalid input gracefully without throwing exception");

    // ------------------------------------------------------------------------
    // TEST SECTION 2: AUDIT QUERY API (GET /api/audit)
    // ------------------------------------------------------------------------
    console.log("\n--- SECTION 2: Audit Query API & Multi-Tenant Isolation ---");

    // Add audit entry to Workspace B
    await createAuditEntry({
      workspaceId: testWorkspaceB.id,
      actorId: testUserB.id,
      actorType: "USER",
      action: "WORKSPACE_B_ONLY",
      target: "Secret data in Workspace B",
      entityType: "task",
      entityId: "tsk_b_1",
    });

    // Test 2.1: Query Workspace A logs
    const reqA = new NextRequest(`http://localhost:3000/api/audit?workspaceId=${testWorkspaceA.id}`, {
      headers: {
        authorization: `Bearer ${sessionA.sessionToken}`,
        "x-synplan-workspace-id": testWorkspaceA.id,
      },
    });

    const resA = await getAuditRoute(reqA);
    const jsonA = await resA.json();
    if (!jsonA.success) console.error("DEBUG jsonA error:", jsonA);

    assert(resA.status === 200, "GET /api/audit returns HTTP 200 for workspace member", `status: ${resA.status}`);
    assert(jsonA.success === true, "GET /api/audit response has success: true", `jsonA: ${JSON.stringify(jsonA)}`);
    assert(Array.isArray(jsonA.data), "GET /api/audit returns data array");
    assert(jsonA.data && jsonA.data.length >= 2, "GET /api/audit retrieves logs recorded for workspace", `length: ${jsonA.data?.length}`);

    // Test 2.2: Verify zero cross-tenant leak
    const leakFound = jsonA.data && jsonA.data.some((l: any) => l.action === "WORKSPACE_B_ONLY" || l.workspaceId === testWorkspaceB.id);
    assert(!leakFound, "Workspace A audit query NEVER leaks logs from Workspace B");

    // Test 2.3: Filtering by action & actorType
    const reqFilter = new NextRequest(`http://localhost:3000/api/audit?workspaceId=${testWorkspaceA.id}&actorType=AI`, {
      headers: {
        authorization: `Bearer ${sessionA.sessionToken}`,
        "x-synplan-workspace-id": testWorkspaceA.id,
      },
    });
    const resFilter = await getAuditRoute(reqFilter);
    const jsonFilter = await resFilter.json();
    if (!jsonFilter.success) console.error("DEBUG jsonFilter error:", jsonFilter);
    assert(jsonFilter.data && jsonFilter.data.length > 0 && jsonFilter.data.every((l: any) => l.actorType === "AI"), "GET /api/audit correctly filters by actorType=AI", `data: ${JSON.stringify(jsonFilter.data)}`);

    // ------------------------------------------------------------------------
    // TEST SECTION 3: DATA CONSISTENCY CHECKER (src/lib/dataConsistency.ts)
    // ------------------------------------------------------------------------
    console.log("\n--- SECTION 3: Data Consistency Checker Invariants ---");

    // Create valid project, phase, and task in Workspace A
    const projectA = await prisma.project.create({
      data: {
        workspaceId: testWorkspaceA.id,
        name: "Clean Architecture Project",
        progress: 50,
        status: ProjectStatus.ACTIVE,
        members: {
          create: [{ userId: testUserA.id, role: "OWNER" }],
        },
      },
    });

    const phaseA1 = await prisma.phase.create({
      data: {
        projectId: projectA.id,
        name: "Phase 1",
        order: 1,
      },
    });

    const phaseA2 = await prisma.phase.create({
      data: {
        projectId: projectA.id,
        name: "Phase 2",
        order: 2,
      },
    });

    const taskA = await prisma.task.create({
      data: {
        workspaceId: testWorkspaceA.id,
        projectId: projectA.id,
        phaseId: phaseA1.id,
        assigneeId: testUserA.id,
        title: "Clean Task",
        status: TaskStatus.IN_PROGRESS,
      },
    });

    // Test 3.1: Verify Healthy Consistency Check
    const cleanCheck = await checkWorkspaceDataConsistency(testWorkspaceA.id);
    assert(cleanCheck.healthy === true, "Consistency check on valid workspace returns healthy: true");
    assert(cleanCheck.checks.workspaceIsolation === "PASS", "Workspace isolation check returns PASS");
    assert(cleanCheck.checks.referentialIntegrity === "PASS", "Referential integrity check returns PASS");
    assert(cleanCheck.checks.businessInvariants === "PASS", "Business domain invariants check returns PASS");
    assert(cleanCheck.issues.length === 0, "Healthy workspace has zero consistency issues");
    assert(cleanCheck.stats.totalTasksChecked >= 1, "Consistency stats report checked tasks");
    assert(cleanCheck.stats.totalProjectsChecked >= 1, "Consistency stats report checked projects");

    // Test 3.2: Detect Cross-Tenant Project Mismatch Invariant
    const rogueProject = await prisma.project.create({
      data: {
        workspaceId: testWorkspaceB.id,
        name: "Rogue Project in B",
        progress: 0,
        status: ProjectStatus.ACTIVE,
      },
    });

    // Create a task in Workspace A that illegally points to a project in Workspace B
    const rogueTask = await prisma.task.create({
      data: {
        workspaceId: testWorkspaceA.id,
        projectId: rogueProject.id,
        title: "Rogue Cross-Tenant Task",
        status: TaskStatus.TODO,
      },
    });

    const degradedCheck = await checkWorkspaceDataConsistency(testWorkspaceA.id);
    assert(degradedCheck.healthy === false, "Consistency checker detects cross-workspace reference failure");
    assert(degradedCheck.checks.workspaceIsolation === "FAIL", "Workspace isolation correctly reports FAIL");
    assert(
      degradedCheck.issues.some((i) => i.type === "CROSS_WORKSPACE_TASK_PROJECT"),
      "Consistency checker flags CROSS_WORKSPACE_TASK_PROJECT issue"
    );

    // Clean up rogue task
    await prisma.task.delete({ where: { id: rogueTask.id } });
    await prisma.project.delete({ where: { id: rogueProject.id } });

    // Test 3.3: Detect Business Invariant Violation (Invalid Progress)
    const invalidProgressProject = await prisma.project.create({
      data: {
        workspaceId: testWorkspaceA.id,
        name: "Corrupt Progress Project",
        progress: 150, // Invalid > 100
        status: ProjectStatus.ACTIVE,
      },
    });

    const progressCheck = await checkWorkspaceDataConsistency(testWorkspaceA.id);
    assert(progressCheck.checks.businessInvariants === "FAIL", "Consistency checker detects invalid project progress");
    assert(
      progressCheck.issues.some((i) => i.type === "INVALID_PROJECT_PROGRESS"),
      "Consistency checker flags INVALID_PROJECT_PROGRESS issue"
    );

    await prisma.project.delete({ where: { id: invalidProgressProject.id } });

    // ------------------------------------------------------------------------
    // TEST SECTION 4: CONSISTENCY HEALTH API (GET /api/health/data-consistency)
    // ------------------------------------------------------------------------
    console.log("\n--- SECTION 4: Consistency Health API ---");

    const healthReq = new NextRequest(`http://localhost:3000/api/health/data-consistency?workspaceId=${testWorkspaceA.id}`, {
      headers: {
        authorization: `Bearer ${sessionA.sessionToken}`,
        "x-synplan-workspace-id": testWorkspaceA.id,
      },
    });

    const healthRes = await getConsistencyHealthRoute(healthReq);
    const healthJson = await healthRes.json();

    assert(healthRes.status === 200, "GET /api/health/data-consistency returns HTTP 200 for OWNER/ADMIN");
    assert(healthJson.success === true, "GET /api/health/data-consistency returns success: true");
    assert(healthJson.data.healthy === true, "Health API reports healthy state for clean workspace");
    assert(healthRes.headers.get("x-consistency-status") === "HEALTHY", "Health API returns x-consistency-status: HEALTHY header");

  } finally {
    // Cleanup Test Data
    console.log("\nCleaning up test artifacts...");
    await prisma.session.deleteMany({ where: { userId: { in: [testUserA.id, testUserB.id] } } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { workspaceId: { in: [testWorkspaceA.id, testWorkspaceB.id] } } }).catch(() => {});
    await prisma.taskComment.deleteMany({ where: { task: { workspaceId: { in: [testWorkspaceA.id, testWorkspaceB.id] } } } }).catch(() => {});
    await prisma.subtask.deleteMany({ where: { task: { workspaceId: { in: [testWorkspaceA.id, testWorkspaceB.id] } } } }).catch(() => {});
    await prisma.task.deleteMany({ where: { workspaceId: { in: [testWorkspaceA.id, testWorkspaceB.id] } } }).catch(() => {});
    await prisma.phase.deleteMany({ where: { project: { workspaceId: { in: [testWorkspaceA.id, testWorkspaceB.id] } } } }).catch(() => {});
    await prisma.projectMember.deleteMany({ where: { project: { workspaceId: { in: [testWorkspaceA.id, testWorkspaceB.id] } } } }).catch(() => {});
    await prisma.project.deleteMany({ where: { workspaceId: { in: [testWorkspaceA.id, testWorkspaceB.id] } } }).catch(() => {});
    await prisma.workspaceMember.deleteMany({ where: { workspaceId: { in: [testWorkspaceA.id, testWorkspaceB.id] } } }).catch(() => {});
    await prisma.workspace.deleteMany({ where: { id: { in: [testWorkspaceA.id, testWorkspaceB.id] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [testUserA.id, testUserB.id] } } }).catch(() => {});
  }

  console.log("\n=======================================================");
  console.log(`PHASE 5 TEST RESULTS: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log("=======================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase5DataIntegrityTests().catch((err) => {
  console.error("Fatal test failure:", err);
  process.exit(1);
});
