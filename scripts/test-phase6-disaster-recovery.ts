/**
 * SYNPLAN — PHASE 6: BACKUP, RECOVERY & DISASTER RESILIENCE TEST SUITE
 *
 * Comprehensive non-destructive automated test suite validating:
 * 1. Safe test execution with synthetic fixtures (0 destructive operations on production).
 * 2. Strict RBAC & Authentication enforcement on GET /api/admin/backup/export.
 * 3. 100% Multi-Tenant Isolation & Zero Secret Leakage in backup payloads.
 * 4. Automatic immutable audit trail generation for backup export actions.
 * 5. Backup integrity validator checking referential consistency and structural schema.
 * 6. Disaster recovery health and readiness monitoring API.
 */

import { prisma } from "../src/lib/prisma";
import { Role, ProjectStatus, TaskStatus, TaskPriority } from "@prisma/client";
import { NextRequest } from "next/server";
import { GET as getBackupExportRoute } from "../src/app/api/admin/backup/export/route";
import { GET as getDisasterRecoveryHealthRoute } from "../src/app/api/health/disaster-recovery/route";
import { validateBackupPayload } from "../src/lib/backupValidator";
import { createSession } from "../src/lib/auth/session";

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ""}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
}

async function runPhase6TestSuite() {
  console.log("================================================================================");
  console.log("SYNPLAN — PHASE 6: BACKUP, RECOVERY & DISASTER RESILIENCE TEST SUITE");
  console.log("================================================================================\n");

  const runId = `p6_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  let passedCount = 0;
  let totalCount = 0;

  function countAssert(condition: boolean, testName: string, detail?: string) {
    totalCount++;
    assert(condition, testName, detail);
    passedCount++;
  }

  // ---------------------------------------------------------------------------
  // FIXTURE SETUP (Isolated synthetic datasets)
  // ---------------------------------------------------------------------------
  console.log("--- SECTION 1: Fixture Setup & Safety Rules Verification ---");

  // User A (OWNER of Workspace A)
  const userA = await prisma.user.create({
    data: {
      name: `User Alpha ${runId}`,
      email: `alpha_${runId}@example.com`,
      role: Role.OWNER,
    },
  });

  // User B (MEMBER of Workspace A)
  const userB = await prisma.user.create({
    data: {
      name: `User Beta ${runId}`,
      email: `beta_${runId}@example.com`,
      role: Role.MEMBER,
    },
  });

  // User C (VIEWER of Workspace A)
  const userC = await prisma.user.create({
    data: {
      name: `User Charlie ${runId}`,
      email: `charlie_${runId}@example.com`,
      role: Role.VIEWER,
    },
  });

  // User D (OWNER of foreign Workspace B)
  const userD = await prisma.user.create({
    data: {
      name: `User Delta ${runId}`,
      email: `delta_${runId}@example.com`,
      role: Role.OWNER,
    },
  });

  // Workspace A
  const workspaceA = await prisma.workspace.create({
    data: {
      name: `Workspace Alpha ${runId}`,
      slug: `ws-alpha-${runId}`,
      ownerId: userA.id,
      members: {
        create: [
          { userId: userA.id, role: Role.OWNER, workloadScore: 20 },
          { userId: userB.id, role: Role.MEMBER, workloadScore: 50 },
          { userId: userC.id, role: Role.VIEWER, workloadScore: 0 },
        ],
      },
    },
  });

  // Workspace B (Tenant Isolation Target)
  const workspaceB = await prisma.workspace.create({
    data: {
      name: `Workspace Beta Foreign ${runId}`,
      slug: `ws-beta-foreign-${runId}`,
      ownerId: userD.id,
      members: {
        create: [{ userId: userD.id, role: Role.OWNER, workloadScore: 10 }],
      },
    },
  });

  // Sessions
  const sessionA = await createSession(userA.id);
  const sessionB = await createSession(userB.id);
  const sessionC = await createSession(userC.id);
  const sessionD = await createSession(userD.id);

  // Entities in Workspace A
  const projectA = await prisma.project.create({
    data: {
      workspaceId: workspaceA.id,
      name: "Project Red Alpha",
      description: "Mission critical Alpha project",
      progress: 60,
      status: ProjectStatus.ACTIVE,
      color: "#6366F1",
      members: {
        create: [
          { userId: userA.id, role: Role.OWNER },
          { userId: userB.id, role: Role.MEMBER },
        ],
      },
    },
  });

  const phaseA1 = await prisma.phase.create({
    data: {
      projectId: projectA.id,
      name: "Sprint 1 - Foundation",
      order: 1,
    },
  });

  const taskA1 = await prisma.task.create({
    data: {
      workspaceId: workspaceA.id,
      projectId: projectA.id,
      phaseId: phaseA1.id,
      assigneeId: userB.id,
      title: "Core Architectural Task A1",
      description: "Design backup resilience",
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      tags: ["disaster-recovery", "backup"],
    },
  });

  const subtaskA1 = await prisma.subtask.create({
    data: {
      taskId: taskA1.id,
      title: "Verify WAL Archiving",
      completed: true,
    },
  });

  const commentA1 = await prisma.taskComment.create({
    data: {
      taskId: taskA1.id,
      authorId: userA.id,
      content: "Ensure zero secret leak in backup export payload.",
    },
  });

  const notifA1 = await prisma.notification.create({
    data: {
      workspaceId: workspaceA.id,
      userId: userA.id,
      title: "Backup System Ready",
      description: "Phase 6 engine initiated",
      type: "info",
    },
  });

  // Entity in Workspace B (Foreign Tenant)
  const projectB = await prisma.project.create({
    data: {
      workspaceId: workspaceB.id,
      name: "Foreign Secret Project in Beta",
      progress: 10,
      status: ProjectStatus.PLANNING,
    },
  });

  const taskB = await prisma.task.create({
    data: {
      workspaceId: workspaceB.id,
      projectId: projectB.id,
      title: "Confidential Beta Task",
      status: TaskStatus.TODO,
    },
  });

  countAssert(Boolean(workspaceA.id && workspaceB.id), "Safety rule: synthetic non-destructive test fixtures provisioned");

  // ---------------------------------------------------------------------------
  // SECTION 2: GET /api/admin/backup/export RBAC & Authentication
  // ---------------------------------------------------------------------------
  console.log("\n--- SECTION 2: Backup Export RBAC & Security Gates ---");

  // 2.1 Unauthenticated request returns 401
  const unauthReq = new NextRequest(`http://localhost:3000/api/admin/backup/export?workspaceId=${workspaceA.id}`);
  const unauthRes = await getBackupExportRoute(unauthReq);
  countAssert(unauthRes.status === 401, "Unauthenticated backup export request rejected (401 Unauthorized)");

  // 2.2 User with MEMBER role returns 403
  const memberReq = new NextRequest(`http://localhost:3000/api/admin/backup/export?workspaceId=${workspaceA.id}`, {
    headers: {
      authorization: `Bearer ${sessionB.sessionToken}`,
      "x-synplan-workspace-id": workspaceA.id,
    },
  });
  const memberRes = await getBackupExportRoute(memberReq);
  countAssert(memberRes.status === 403, "MEMBER role blocked from backup export (403 Forbidden)");

  // 2.3 User with VIEWER role returns 403
  const viewerReq = new NextRequest(`http://localhost:3000/api/admin/backup/export?workspaceId=${workspaceA.id}`, {
    headers: {
      authorization: `Bearer ${sessionC.sessionToken}`,
      "x-synplan-workspace-id": workspaceA.id,
    },
  });
  const viewerRes = await getBackupExportRoute(viewerReq);
  countAssert(viewerRes.status === 403, "VIEWER role blocked from backup export (403 Forbidden)");

  // 2.4 User with OWNER role returns 200 OK
  const ownerReq = new NextRequest(`http://localhost:3000/api/admin/backup/export?workspaceId=${workspaceA.id}`, {
    headers: {
      authorization: `Bearer ${sessionA.sessionToken}`,
      "x-synplan-workspace-id": workspaceA.id,
    },
  });
  const ownerRes = await getBackupExportRoute(ownerReq);
  countAssert(ownerRes.status === 200, "OWNER role successfully authorized to export backup (200 OK)");

  // ---------------------------------------------------------------------------
  // SECTION 3: Multi-Tenant Boundary & Secret Sanitization Audit
  // ---------------------------------------------------------------------------
  console.log("\n--- SECTION 3: Multi-Tenant Boundary & Secret Sanitization ---");

  const exportJson = await ownerRes.json();

  // 3.1 Metadata & versioning
  countAssert(exportJson.version === "1.0", "Export payload specifies version '1.0'");
  countAssert(Boolean(exportJson.exportedAt), "Export payload contains ISO exportedAt timestamp");
  countAssert(exportJson.workspace?.id === workspaceA.id, "Export payload belongs to target Workspace A");

  // 3.2 Target workspace contents verification
  countAssert(Array.isArray(exportJson.projects) && exportJson.projects.length >= 1, "Backup contains workspace projects");
  countAssert(Array.isArray(exportJson.tasks) && exportJson.tasks.length >= 1, "Backup contains workspace tasks");
  countAssert(Array.isArray(exportJson.subtasks) && exportJson.subtasks.length >= 1, "Backup contains task subtasks");
  countAssert(Array.isArray(exportJson.comments) && exportJson.comments.length >= 1, "Backup contains task comments");
  countAssert(Array.isArray(exportJson.members) && exportJson.members.length >= 3, "Backup contains workspace members");
  countAssert(Array.isArray(exportJson.notifications) && exportJson.notifications.length >= 1, "Backup contains notifications");

  // 3.3 Strict Zero Cross-Tenant Leakage Check
  const hasProjectB = exportJson.projects.some((p: any) => p.id === projectB.id || p.workspaceId === workspaceB.id);
  const hasTaskB = exportJson.tasks.some((t: any) => t.id === taskB.id || t.workspaceId === workspaceB.id);
  const hasUserD = exportJson.members.some((m: any) => m.userId === userD.id || m.workspaceId === workspaceB.id);

  countAssert(!hasProjectB, "Workspace A backup strictly omits Workspace B projects");
  countAssert(!hasTaskB, "Workspace A backup strictly omits Workspace B tasks");
  countAssert(!hasUserD, "Workspace A backup strictly omits Workspace B members");

  // 3.4 Zero Secret Leakage Scan
  const stringifiedBackup = JSON.stringify(exportJson).toLowerCase();
  const containsSessionToken = stringifiedBackup.includes(sessionA.sessionToken.toLowerCase());
  const containsHashedOrSecret =
    stringifiedBackup.includes("passwordhash") ||
    stringifiedBackup.includes("service_role_key") ||
    stringifiedBackup.includes("postgres://") ||
    stringifiedBackup.includes("postgresql://");

  countAssert(!containsSessionToken, "Backup payload does NOT contain active session tokens");
  countAssert(!containsHashedOrSecret, "Backup payload does NOT leak connection strings or service role keys");

  // ---------------------------------------------------------------------------
  // SECTION 4: Immutable Audit Trail Generation
  // ---------------------------------------------------------------------------
  console.log("\n--- SECTION 4: Audit Trail Generation for Backup Export ---");

  const auditEntry = await prisma.auditLog.findFirst({
    where: {
      workspaceId: workspaceA.id,
      action: "BACKUP_EXPORT",
    },
    orderBy: { timestamp: "desc" },
  });

  countAssert(Boolean(auditEntry), "Backup export successfully generates BACKUP_EXPORT audit record");
  countAssert(auditEntry?.actorId === userA.id, "Audit record attributes action to requesting user (User A)");
  countAssert(auditEntry?.actorType === "USER", "Audit record records actorType: USER");
  countAssert(auditEntry?.source === "API", "Audit record records source: API");

  // ---------------------------------------------------------------------------
  // SECTION 5: Backup Payload Integrity Validator (src/lib/backupValidator.ts)
  // ---------------------------------------------------------------------------
  console.log("\n--- SECTION 5: Backup Integrity Validator Invariants ---");

  // 5.1 Valid clean backup verification
  const cleanValidation = validateBackupPayload(exportJson);
  countAssert(cleanValidation.valid === true, "Validator confirms clean exported backup is 100% valid");
  countAssert(cleanValidation.issues.length === 0, "Clean backup produces zero validation issues");
  countAssert(cleanValidation.stats.totalProjects >= 1, "Validator correctly counts projects in payload");
  countAssert(cleanValidation.stats.totalTasks >= 1, "Validator correctly counts tasks in payload");

  // 5.2 Corrupted backup detection: Orphaned Task (task pointing to non-existent project)
  const corruptedPayload = JSON.parse(JSON.stringify(exportJson));
  corruptedPayload.tasks.push({
    id: "tsk_corrupt_orphan",
    workspaceId: workspaceA.id,
    projectId: "prj_non_existent_fake",
    title: "Orphaned Task",
    status: "TODO",
  });

  const corruptValidation = validateBackupPayload(corruptedPayload);
  countAssert(corruptValidation.valid === false, "Validator detects orphaned task referencing non-existent project");
  countAssert(
    corruptValidation.issues.some((i) => i.type === "ORPHAN_TASK_PROJECT"),
    "Validator reports ORPHAN_TASK_PROJECT issue"
  );

  // 5.3 Cross-Tenant anomaly detection in backup payload
  const crossTenantPayload = JSON.parse(JSON.stringify(exportJson));
  crossTenantPayload.projects.push({
    id: "prj_foreign_rogue",
    workspaceId: workspaceB.id,
    name: "Rogue Project from Foreign Workspace",
  });

  const crossValidation = validateBackupPayload(crossTenantPayload);
  countAssert(crossValidation.valid === false, "Validator detects cross-tenant project in backup payload");
  countAssert(
    crossValidation.issues.some((i) => i.type === "CROSS_WORKSPACE_ENTITY"),
    "Validator reports CROSS_WORKSPACE_ENTITY issue"
  );

  // 5.4 Secret leakage detection in backup payload
  const leakyPayload = JSON.parse(JSON.stringify(exportJson));
  leakyPayload.workspace.service_role_key = "secret_supabase_key_leak";

  const secretValidation = validateBackupPayload(leakyPayload);
  countAssert(secretValidation.valid === false, "Validator detects injected secret credential in backup payload");
  countAssert(
    secretValidation.issues.some((i) => i.type === "SECRET_LEAKAGE"),
    "Validator reports SECRET_LEAKAGE issue"
  );

  // ---------------------------------------------------------------------------
  // SECTION 6: Disaster Recovery Health & Readiness API
  // ---------------------------------------------------------------------------
  console.log("\n--- SECTION 6: Disaster Recovery Health & Readiness API ---");

  // 6.1 Unauthenticated health check returns 401
  const unauthHealthReq = new NextRequest(`http://localhost:3000/api/health/disaster-recovery`);
  const unauthHealthRes = await getDisasterRecoveryHealthRoute(unauthHealthReq);
  countAssert(unauthHealthRes.status === 401, "Unauthenticated disaster health query rejected (401)");

  // 6.2 Non-admin (MEMBER) query returns 403
  const memberHealthReq = new NextRequest(`http://localhost:3000/api/health/disaster-recovery`, {
    headers: {
      authorization: `Bearer ${sessionB.sessionToken}`,
      "x-synplan-workspace-id": workspaceA.id,
    },
  });
  const memberHealthRes = await getDisasterRecoveryHealthRoute(memberHealthReq);
  countAssert(memberHealthRes.status === 403, "MEMBER role blocked from disaster recovery health (403)");

  // 6.3 OWNER query returns 200 OK with health status
  const ownerHealthReq = new NextRequest(`http://localhost:3000/api/health/disaster-recovery`, {
    headers: {
      authorization: `Bearer ${sessionA.sessionToken}`,
      "x-synplan-workspace-id": workspaceA.id,
    },
  });
  const ownerHealthRes = await getDisasterRecoveryHealthRoute(ownerHealthReq);
  const healthJson = await ownerHealthRes.json();

  countAssert(ownerHealthRes.status === 200, "OWNER query returns HTTP 200 for disaster recovery health");
  countAssert(healthJson.status === "HEALTHY", "Disaster health reports status: HEALTHY");
  countAssert(healthJson.workspaceHealth?.databaseConnected === true, "Disaster health confirms live database connection");
  countAssert(healthJson.disasterRecovery?.rpoTarget.includes("24h"), "Disaster health confirms baseline RPO target");
  countAssert(healthJson.disasterRecovery?.rtoTarget.includes("4h"), "Disaster health confirms baseline RTO target");
  countAssert(
    ownerHealthRes.headers.get("x-disaster-readiness") === "READY",
    "Health API returns x-disaster-readiness: READY header"
  );

  // ---------------------------------------------------------------------------
  // CLEANUP FIXTURES
  // ---------------------------------------------------------------------------
  console.log("\nCleaning up synthetic test fixtures...");
  await prisma.session.deleteMany({ where: { userId: { in: [userA.id, userB.id, userC.id, userD.id] } } });
  await prisma.auditLog.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } });
  await prisma.notification.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } });
  await prisma.taskComment.deleteMany({ where: { taskId: { in: [taskA1.id, taskB.id] } } });
  await prisma.subtask.deleteMany({ where: { taskId: { in: [taskA1.id, taskB.id] } } });
  await prisma.task.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } });
  await prisma.phase.deleteMany({ where: { id: phaseA1.id } });
  await prisma.projectMember.deleteMany({ where: { projectId: { in: [projectA.id, projectB.id] } } });
  await prisma.project.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } });
  await prisma.workspaceMember.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } });
  await prisma.workspace.deleteMany({ where: { id: { in: [workspaceA.id, workspaceB.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id, userC.id, userD.id] } } });

  console.log(`\n================================================================================`);
  console.log(`PHASE 6 TEST RESULTS: ${passedCount}/${totalCount} PASSED (0 FAILED)`);
  console.log(`================================================================================\n`);
}

runPhase6TestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error in Phase 6 test suite:", err);
    process.exit(1);
  });
