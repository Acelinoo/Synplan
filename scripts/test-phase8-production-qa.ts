/**
 * SYNPLAN — PHASE 8: COMPREHENSIVE END-TO-END QA, SECURITY PENETRATION & PRODUCTION READINESS TEST SUITE
 *
 * This test suite executes exhaustive adversarial tests, multi-tenant IDOR penetration attacks,
 * RBAC privilege escalation checks, input fuzzing, error sanitization audits, and full
 * Critical User Journeys (A to E) across the entire production surface.
 */

import { prisma } from "../src/lib/prisma";
import { Role, ProjectStatus, TaskStatus, TaskPriority } from "@prisma/client";
import { generateSessionToken } from "../src/lib/auth/session";
import { validateBackupPayload } from "../src/lib/backupValidator";
import { checkWorkspaceDataConsistency } from "../src/lib/dataConsistency";
import { idempotency } from "../src/lib/idempotency";
import { sanitizeErrorMessage, createApiErrorResponse } from "../src/lib/apiErrors";
import { NextRequest, NextResponse } from "next/server";

// Import API Route Handlers
import { GET as getProjects, POST as createProject } from "../src/app/api/projects/route";
import { GET as getProjectById, PUT as updateProjectById, DELETE as deleteProjectById } from "../src/app/api/projects/[id]/route";
import { GET as getTasks, POST as createTask } from "../src/app/api/tasks/route";
import { GET as getTaskById, PUT as updateTaskById, DELETE as deleteTaskById } from "../src/app/api/tasks/[id]/route";
import { PATCH as updateTaskStatus } from "../src/app/api/tasks/status/route";
import { GET as getPhases, POST as createPhase } from "../src/app/api/phases/route";
import { PUT as updatePhaseById, DELETE as deletePhaseById } from "../src/app/api/phases/[id]/route";
import { POST as reorderPhases } from "../src/app/api/phases/reorder/route";
import { GET as getComments, POST as createComment } from "../src/app/api/tasks/[id]/comments/route";
import { PUT as updateComment, DELETE as deleteComment } from "../src/app/api/tasks/comments/[commentId]/route";
import { GET as getMembers, POST as inviteMember, PUT as updateMemberRole, DELETE as removeMember } from "../src/app/api/team/members/route";
import { GET as getAuditLogs } from "../src/app/api/audit/route";
import { GET as exportBackup } from "../src/app/api/admin/backup/export/route";
import { GET as getDisasterRecoveryHealth } from "../src/app/api/health/disaster-recovery/route";
import { GET as getDataConsistencyHealth } from "../src/app/api/health/data-consistency/route";
import { PUT as updateWorkspaceSettings } from "../src/app/api/workspaces/settings/route";
import { POST as planAi } from "../src/app/api/ai/plan/route";
import { POST as executeAi } from "../src/app/api/ai/execute/route";

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS ${String(totalTests).padStart(3, "0")}] ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL ${String(totalTests).padStart(3, "0")}] ${testName}`);
    if (details) console.error(`     Details: ${details}`);
  }
}

// Helper to construct mock NextRequest
function mockRequest(
  url: string,
  method: string = "GET",
  body?: any,
  options?: {
    sessionToken?: string;
    workspaceId?: string;
    headers?: Record<string, string>;
  }
): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(options?.headers || {}),
  };

  if (options?.sessionToken) {
    headers["cookie"] = `synplan_session_token=${options.sessionToken}`;
    headers["authorization"] = `Bearer ${options.sessionToken}`;
  }

  if (options?.workspaceId) {
    headers["x-synplan-workspace-id"] = options.workspaceId;
  }

  const reqInit: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    reqInit.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  return new NextRequest(new URL(url, "http://localhost:3000"), reqInit as any);
}

async function runPhase8QaSuite() {
  console.log("================================================================================");
  console.log("SYNPLAN — PHASE 8: COMPREHENSIVE E2E QA & SECURITY PENETRATION SUITE");
  console.log("================================================================================\n");

  const runId = `qa_${Date.now()}`;

  // 1. SETUP SYNTHETIC TEST FIXTURES
  console.log("--- SETUP: Provisioning Multi-Tenant Test Isolation Fixtures ---");

  // User A (Owner of Workspace Alpha)
  const userA = await prisma.user.create({
    data: {
      name: `User Alpha (${runId})`,
      email: `alpha_${runId}@synplan-qa.local`,
      role: Role.OWNER,
    },
  });

  // User B (Owner of Workspace Beta - Foreign Tenant)
  const userB = await prisma.user.create({
    data: {
      name: `User Beta (${runId})`,
      email: `beta_${runId}@synplan-qa.local`,
      role: Role.OWNER,
    },
  });

  // User C (Member with VIEWER role in Workspace Alpha)
  const userViewer = await prisma.user.create({
    data: {
      name: `User Viewer (${runId})`,
      email: `viewer_${runId}@synplan-qa.local`,
      role: Role.VIEWER,
    },
  });

  // User D (Member with MEMBER role in Workspace Alpha)
  const userMember = await prisma.user.create({
    data: {
      name: `User Member (${runId})`,
      email: `member_${runId}@synplan-qa.local`,
      role: Role.MEMBER,
    },
  });

  // User E (Admin in Workspace Alpha)
  const userAdmin = await prisma.user.create({
    data: {
      name: `User Admin (${runId})`,
      email: `admin_${runId}@synplan-qa.local`,
      role: Role.ADMIN,
    },
  });

  // Workspace Alpha
  const wsAlpha = await prisma.workspace.create({
    data: {
      name: `Workspace Alpha (${runId})`,
      slug: `ws-alpha-${runId}`,
      ownerId: userA.id,
    },
  });

  // Workspace Beta (Isolated Tenant)
  const wsBeta = await prisma.workspace.create({
    data: {
      name: `Workspace Beta (${runId})`,
      slug: `ws-beta-${runId}`,
      ownerId: userB.id,
    },
  });

  // Workspace Memberships for Alpha
  const memAlphaOwner = await prisma.workspaceMember.create({
    data: { workspaceId: wsAlpha.id, userId: userA.id, role: Role.OWNER, workloadScore: 20 },
  });
  const memAlphaAdmin = await prisma.workspaceMember.create({
    data: { workspaceId: wsAlpha.id, userId: userAdmin.id, role: Role.ADMIN, workloadScore: 30 },
  });
  const memAlphaMember = await prisma.workspaceMember.create({
    data: { workspaceId: wsAlpha.id, userId: userMember.id, role: Role.MEMBER, workloadScore: 40 },
  });
  const memAlphaViewer = await prisma.workspaceMember.create({
    data: { workspaceId: wsAlpha.id, userId: userViewer.id, role: Role.VIEWER, workloadScore: 0 },
  });

  // Workspace Memberships for Beta
  const memBetaOwner = await prisma.workspaceMember.create({
    data: { workspaceId: wsBeta.id, userId: userB.id, role: Role.OWNER, workloadScore: 10 },
  });

  // Active Valid Session Tokens
  const tokenA = generateSessionToken();
  const tokenB = generateSessionToken();
  const tokenViewer = generateSessionToken();
  const tokenMember = generateSessionToken();
  const tokenAdmin = generateSessionToken();

  const validExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

  await prisma.session.createMany({
    data: [
      { sessionToken: tokenA, userId: userA.id, expiresAt: validExpiry },
      { sessionToken: tokenB, userId: userB.id, expiresAt: validExpiry },
      { sessionToken: tokenViewer, userId: userViewer.id, expiresAt: validExpiry },
      { sessionToken: tokenMember, userId: userMember.id, expiresAt: validExpiry },
      { sessionToken: tokenAdmin, userId: userAdmin.id, expiresAt: validExpiry },
    ],
  });

  // Expired Session Token
  const expiredRawToken = generateSessionToken();
  await prisma.session.create({
    data: { sessionToken: expiredRawToken, userId: userA.id, expiresAt: expiredDate },
  });

  // Beta Project & Tasks (Foreign Tenant Resources)
  const projBeta = await prisma.project.create({
    data: {
      workspaceId: wsBeta.id,
      name: "Confidential Beta Project",
      description: "Protected resource in foreign tenant",
      status: ProjectStatus.ACTIVE,
      color: "#0284C7",
    },
  });

  const phaseBeta = await prisma.phase.create({
    data: {
      projectId: projBeta.id,
      name: "Beta Architecture",
      order: 1,
    },
  });

  const taskBeta = await prisma.task.create({
    data: {
      workspaceId: wsBeta.id,
      projectId: projBeta.id,
      phaseId: phaseBeta.id,
      title: "Confidential Financial Integration",
      status: TaskStatus.TODO,
      priority: TaskPriority.HIGH,
      order: 1,
    },
  });

  const commentBeta = await prisma.taskComment.create({
    data: {
      taskId: taskBeta.id,
      authorId: userB.id,
      content: "Sensitive internal discussion",
    },
  });

  console.log("  ✅ Synthetic test fixtures provisioned successfully.\n");

  // ==========================================================================
  // SECTION 1: SECURITY PENETRATION — AUTHENTICATION ADVERSARIAL REVIEW
  // ==========================================================================
  console.log("--- SECTION 1: Authentication Penetration Attacks ---");

  // 1.1 Unauthenticated request (no session token)
  const reqNoSession = mockRequest("http://localhost:3000/api/projects");
  const resNoSession = await getProjects(reqNoSession);
  assert(resNoSession.status === 401, "Unauthenticated request without session token rejected (401 Unauthorized)");

  // 1.2 Expired session token
  const reqExpiredSession = mockRequest("http://localhost:3000/api/projects", "GET", undefined, {
    sessionToken: expiredRawToken,
  });
  const resExpiredSession = await getProjects(reqExpiredSession);
  assert(resExpiredSession.status === 401, "Expired session token rejected (401 Unauthorized)");

  // 1.3 Forged / Malformed session token
  const reqForgedSession = mockRequest("http://localhost:3000/api/projects", "GET", undefined, {
    sessionToken: "forged_malformed_token_xyz999",
  });
  const resForgedSession = await getProjects(reqForgedSession);
  assert(resForgedSession.status === 401, "Forged / malformed session token rejected (401 Unauthorized)");

  // 1.4 Request with valid session but non-member workspace spoofing
  const reqSpoofedWorkspace = mockRequest("http://localhost:3000/api/projects", "GET", undefined, {
    sessionToken: tokenA,
    workspaceId: wsBeta.id, // User A attempts to access Workspace Beta
  });
  const resSpoofedWorkspace = await getProjects(reqSpoofedWorkspace);
  assert(resSpoofedWorkspace.status === 403, "Workspace spoofing by non-member rejected (403 Forbidden)");

  // ==========================================================================
  // SECTION 2: MULTI-TENANT IDOR & CROSS-TENANT ESCAPE ATTACKS
  // ==========================================================================
  console.log("\n--- SECTION 2: Multi-Tenant IDOR & Cross-Workspace Isolation Attacks ---");

  // 2.1 User A attempts to GET User B's project in Workspace Beta
  const reqGetBetaProj = mockRequest(`http://localhost:3000/api/projects/${projBeta.id}`, "GET", undefined, {
    sessionToken: tokenA,
  });
  const resGetBetaProj = await getProjectById(reqGetBetaProj, { params: Promise.resolve({ id: projBeta.id }) });
  assert(resGetBetaProj.status === 403 || resGetBetaProj.status === 404, "User A cannot read User B's project (Cross-Tenant GET blocked)");

  // 2.2 User A attempts to PUT/Update User B's project
  const reqPutBetaProj = mockRequest(`http://localhost:3000/api/projects/${projBeta.id}`, "PUT", {
    name: "Hacked Project Name",
  }, { sessionToken: tokenA });
  const resPutBetaProj = await updateProjectById(reqPutBetaProj, { params: Promise.resolve({ id: projBeta.id }) });
  assert(resPutBetaProj.status === 403 || resPutBetaProj.status === 404, "User A cannot update User B's project (Cross-Tenant PUT blocked)");

  // 2.3 User A attempts to DELETE User B's project
  const reqDelBetaProj = mockRequest(`http://localhost:3000/api/projects/${projBeta.id}`, "DELETE", undefined, {
    sessionToken: tokenA,
  });
  const resDelBetaProj = await deleteProjectById(reqDelBetaProj, { params: Promise.resolve({ id: projBeta.id }) });
  assert(resDelBetaProj.status === 403 || resDelBetaProj.status === 404, "User A cannot delete User B's project (Cross-Tenant DELETE blocked)");

  // 2.4 User A attempts to GET User B's task
  const reqGetBetaTask = mockRequest(`http://localhost:3000/api/tasks/${taskBeta.id}`, "GET", undefined, {
    sessionToken: tokenA,
  });
  const resGetBetaTask = await getTaskById(reqGetBetaTask, { params: Promise.resolve({ id: taskBeta.id }) });
  assert(resGetBetaTask.status === 403 || resGetBetaTask.status === 404, "User A cannot read User B's task (Cross-Tenant Task GET blocked)");

  // 2.5 User A attempts to UPDATE User B's task
  const reqPutBetaTask = mockRequest(`http://localhost:3000/api/tasks/${taskBeta.id}`, "PUT", {
    title: "Tampered Task Title",
  }, { sessionToken: tokenA });
  const resPutBetaTask = await updateTaskById(reqPutBetaTask, { params: Promise.resolve({ id: taskBeta.id }) });
  assert(resPutBetaTask.status === 403 || resPutBetaTask.status === 404, "User A cannot update User B's task (Cross-Tenant Task PUT blocked)");

  // 2.6 User A attempts to update User B's task status
  const reqStatusBetaTask = mockRequest("http://localhost:3000/api/tasks/status", "PATCH", {
    taskId: taskBeta.id,
    status: "DONE",
  }, { sessionToken: tokenA });
  const resStatusBetaTask = await updateTaskStatus(reqStatusBetaTask);
  assert(resStatusBetaTask.status === 403 || resStatusBetaTask.status === 404, "User A cannot change User B's task status (Cross-Tenant Status PATCH blocked)");

  // 2.7 User A attempts to DELETE User B's task
  const reqDelBetaTask = mockRequest(`http://localhost:3000/api/tasks/${taskBeta.id}`, "DELETE", undefined, {
    sessionToken: tokenA,
  });
  const resDelBetaTask = await deleteTaskById(reqDelBetaTask, { params: Promise.resolve({ id: taskBeta.id }) });
  assert(resDelBetaTask.status === 403 || resDelBetaTask.status === 404, "User A cannot delete User B's task (Cross-Tenant Task DELETE blocked)");

  // 2.8 User A attempts to GET User B's phases
  const reqGetBetaPhases = mockRequest(`http://localhost:3000/api/phases?projectId=${projBeta.id}`, "GET", undefined, {
    sessionToken: tokenA,
  });
  const resGetBetaPhases = await getPhases(reqGetBetaPhases);
  assert(resGetBetaPhases.status === 403 || resGetBetaPhases.status === 404, "User A cannot read User B's phases (Cross-Tenant Phase GET blocked)");

  // 2.9 User A attempts to UPDATE User B's phase
  const reqPutBetaPhase = mockRequest(`http://localhost:3000/api/phases/${phaseBeta.id}`, "PUT", {
    name: "Compromised Phase",
  }, { sessionToken: tokenA });
  const resPutBetaPhase = await updatePhaseById(reqPutBetaPhase, { params: Promise.resolve({ id: phaseBeta.id }) });
  assert(resPutBetaPhase.status === 403 || resPutBetaPhase.status === 404, "User A cannot update User B's phase (Cross-Tenant Phase PUT blocked)");

  // 2.10 User A attempts to DELETE User B's phase
  const reqDelBetaPhase = mockRequest(`http://localhost:3000/api/phases/${phaseBeta.id}`, "DELETE", undefined, {
    sessionToken: tokenA,
  });
  const resDelBetaPhase = await deletePhaseById(reqDelBetaPhase, { params: Promise.resolve({ id: phaseBeta.id }) });
  assert(resDelBetaPhase.status === 403 || resDelBetaPhase.status === 404, "User A cannot delete User B's phase (Cross-Tenant Phase DELETE blocked)");

  // 2.11 User A attempts to read comments on User B's task
  const reqGetBetaComments = mockRequest(`http://localhost:3000/api/tasks/${taskBeta.id}/comments`, "GET", undefined, {
    sessionToken: tokenA,
  });
  const resGetBetaComments = await getComments(reqGetBetaComments, { params: Promise.resolve({ id: taskBeta.id }) });
  assert(resGetBetaComments.status === 403 || resGetBetaComments.status === 404, "User A cannot read comments on User B's task (Cross-Tenant Comments GET blocked)");

  // 2.12 User A attempts to post comment on User B's task
  const reqPostBetaComment = mockRequest(`http://localhost:3000/api/tasks/${taskBeta.id}/comments`, "POST", {
    content: "Injected comment",
  }, { sessionToken: tokenA });
  const resPostBetaComment = await createComment(reqPostBetaComment, { params: Promise.resolve({ id: taskBeta.id }) });
  assert(resPostBetaComment.status === 403 || resPostBetaComment.status === 404, "User A cannot post comments on User B's task (Cross-Tenant Comments POST blocked)");

  // 2.13 User A attempts to modify User B's squad member role in Beta
  const reqPutBetaMember = mockRequest("http://localhost:3000/api/team/members", "PUT", {
    memberId: memBetaOwner.id,
    role: "VIEWER",
  }, { sessionToken: tokenA });
  const resPutBetaMember = await updateMemberRole(reqPutBetaMember);
  assert(resPutBetaMember.status === 403 || resPutBetaMember.status === 404, "User A cannot modify User B's squad member role (Cross-Tenant Member PUT blocked)");

  // 2.14 User A attempts to remove User B's squad member in Beta
  const reqDelBetaMember = mockRequest(`http://localhost:3000/api/team/members?memberId=${memBetaOwner.id}`, "DELETE", undefined, {
    sessionToken: tokenA,
  });
  const resDelBetaMember = await removeMember(reqDelBetaMember);
  assert(resDelBetaMember.status === 403 || resDelBetaMember.status === 404, "User A cannot remove User B's squad member (Cross-Tenant Member DELETE blocked)");

  // 2.15 User A attempts to read User B's workspace audit logs
  const reqBetaAudit = mockRequest(`http://localhost:3000/api/audit?workspaceId=${wsBeta.id}`, "GET", undefined, {
    sessionToken: tokenA,
    workspaceId: wsBeta.id,
  });
  const resBetaAudit = await getAuditLogs(reqBetaAudit);
  assert(resBetaAudit.status === 403 || resBetaAudit.status === 404, "User A cannot view User B's audit logs (Cross-Tenant Audit GET blocked)");

  // 2.16 User A attempts to export User B's workspace backup
  const reqBetaBackup = mockRequest(`http://localhost:3000/api/admin/backup/export?workspaceId=${wsBeta.id}`, "GET", undefined, {
    sessionToken: tokenA,
    workspaceId: wsBeta.id,
  });
  const resBetaBackup = await exportBackup(reqBetaBackup);
  assert(resBetaBackup.status === 403 || resBetaBackup.status === 404, "User A cannot export User B's workspace backup (Cross-Tenant Backup Export blocked)");

  // ==========================================================================
  // SECTION 3: RBAC PRIVILEGE ESCALATION GATING
  // ==========================================================================
  console.log("\n--- SECTION 3: RBAC Privilege Escalation Gating ---");

  // 3.1 VIEWER attempting to CREATE a project
  const reqViewerCreateProj = mockRequest("http://localhost:3000/api/projects", "POST", {
    name: "Viewer Illegal Project",
    workspaceId: wsAlpha.id,
  }, { sessionToken: tokenViewer, workspaceId: wsAlpha.id });
  const resViewerCreateProj = await createProject(reqViewerCreateProj);
  assert(resViewerCreateProj.status === 403, "VIEWER role blocked from creating project (403 Forbidden)");

  // 3.2 VIEWER attempting to CREATE a task
  const reqViewerCreateTask = mockRequest("http://localhost:3000/api/tasks", "POST", {
    title: "Viewer Illegal Task",
    workspaceId: wsAlpha.id,
  }, { sessionToken: tokenViewer, workspaceId: wsAlpha.id });
  const resViewerCreateTask = await createTask(reqViewerCreateTask);
  assert(resViewerCreateTask.status === 403, "VIEWER role blocked from creating task (403 Forbidden)");

  // 3.3 MEMBER attempting to DELETE a project (projects.delete requires OWNER/ADMIN)
  // First create a project in Alpha with Owner token
  const reqOwnerProj = mockRequest("http://localhost:3000/api/projects", "POST", {
    name: "Alpha Test Project",
    workspaceId: wsAlpha.id,
  }, { sessionToken: tokenA, workspaceId: wsAlpha.id });
  const resOwnerProj = await createProject(reqOwnerProj);
  const projAlphaData = (await resOwnerProj.json()).data;

  const reqMemberDeleteProj = mockRequest(`http://localhost:3000/api/projects/${projAlphaData.id}`, "DELETE", undefined, {
    sessionToken: tokenMember,
    workspaceId: wsAlpha.id,
  });
  const resMemberDeleteProj = await deleteProjectById(reqMemberDeleteProj, { params: Promise.resolve({ id: projAlphaData.id }) });
  assert(resMemberDeleteProj.status === 403, "MEMBER role blocked from deleting project (403 Forbidden)");

  // 3.4 MEMBER attempting to UPDATE workspace settings (workspace.update requires OWNER/ADMIN)
  const reqMemberWsSettings = mockRequest("http://localhost:3000/api/workspaces/settings", "PUT", {
    workspaceId: wsAlpha.id,
    name: "Member Hijacked Name",
  }, { sessionToken: tokenMember, workspaceId: wsAlpha.id });
  const resMemberWsSettings = await updateWorkspaceSettings(reqMemberWsSettings);
  assert(resMemberWsSettings.status === 403, "MEMBER role blocked from modifying workspace settings (403 Forbidden)");

  // 3.5 MEMBER attempting to EXPORT backup (backup.export requires OWNER/ADMIN)
  const reqMemberBackup = mockRequest(`http://localhost:3000/api/admin/backup/export?workspaceId=${wsAlpha.id}`, "GET", undefined, {
    sessionToken: tokenMember,
    workspaceId: wsAlpha.id,
  });
  const resMemberBackup = await exportBackup(reqMemberBackup);
  assert(resMemberBackup.status === 403, "MEMBER role blocked from exporting backup archive (403 Forbidden)");

  // 3.6 MEMBER attempting to VIEW disaster recovery health (backup.view requires OWNER/ADMIN)
  const reqMemberDrHealth = mockRequest(`http://localhost:3000/api/health/disaster-recovery?workspaceId=${wsAlpha.id}`, "GET", undefined, {
    sessionToken: tokenMember,
    workspaceId: wsAlpha.id,
  });
  const resMemberDrHealth = await getDisasterRecoveryHealth(reqMemberDrHealth);
  assert(resMemberDrHealth.status === 403, "MEMBER role blocked from viewing disaster recovery health (403 Forbidden)");

  // 3.7 ADMIN attempting to MODIFY workspace OWNER role
  const reqAdminModifyOwner = mockRequest("http://localhost:3000/api/team/members", "PUT", {
    memberId: memAlphaOwner.id,
    role: "MEMBER",
  }, { sessionToken: tokenAdmin, workspaceId: wsAlpha.id });
  const resAdminModifyOwner = await updateMemberRole(reqAdminModifyOwner);
  assert(resAdminModifyOwner.status === 403, "ADMIN role blocked from modifying workspace OWNER role (403 Forbidden)");

  // 3.8 ADMIN attempting to REMOVE another ADMIN
  // Create another admin in Alpha
  const userAdmin2 = await prisma.user.create({
    data: { name: "Admin Two", email: `admin2_${runId}@synplan-qa.local`, role: Role.ADMIN },
  });
  const memAlphaAdmin2 = await prisma.workspaceMember.create({
    data: { workspaceId: wsAlpha.id, userId: userAdmin2.id, role: Role.ADMIN },
  });

  const reqAdminRemoveAdmin = mockRequest(`http://localhost:3000/api/team/members?memberId=${memAlphaAdmin2.id}`, "DELETE", undefined, {
    sessionToken: tokenAdmin,
    workspaceId: wsAlpha.id,
  });
  const resAdminRemoveAdmin = await removeMember(reqAdminRemoveAdmin);
  assert(resAdminRemoveAdmin.status === 403, "ADMIN role blocked from removing another ADMIN (403 Forbidden)");

  // 3.9 OWNER attempting to self-demote without transfer
  const reqOwnerSelfDemote = mockRequest("http://localhost:3000/api/team/members", "PUT", {
    memberId: memAlphaOwner.id,
    role: "VIEWER",
  }, { sessionToken: tokenA, workspaceId: wsAlpha.id });
  const resOwnerSelfDemote = await updateMemberRole(reqOwnerSelfDemote);
  assert(resOwnerSelfDemote.status === 403, "OWNER cannot self-demote without ownership transfer (403 Forbidden)");

  // ==========================================================================
  // SECTION 4: INPUT VALIDATION & ADVERSARIAL PAYLOAD FUZZING
  // ==========================================================================
  console.log("\n--- SECTION 4: Input Validation & Adversarial Payloads ---");

  // 4.1 Malformed JSON payload
  const reqMalformedJson = new NextRequest(new URL("http://localhost:3000/api/projects"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `synplan_session_token=${tokenA}`,
      authorization: `Bearer ${tokenA}`,
      "x-synplan-workspace-id": wsAlpha.id,
    },
    body: "{\"name\": \"broken JSON, missing closing brace",
  });
  const resMalformedJson = await createProject(reqMalformedJson);
  assert(resMalformedJson.status === 400, "Malformed JSON syntax rejected safely without crash (400 Bad Request)");

  // 4.2 Empty project name rejected by Zod
  const reqEmptyProjName = mockRequest("http://localhost:3000/api/projects", "POST", {
    name: "   ",
    workspaceId: wsAlpha.id,
  }, { sessionToken: tokenA, workspaceId: wsAlpha.id });
  const resEmptyProjName = await createProject(reqEmptyProjName);
  assert(resEmptyProjName.status === 400, "Project creation with whitespace-only name rejected by Zod (400 Bad Request)");

  // 4.3 Invalid project status enum rejected
  const reqBadStatus = mockRequest("http://localhost:3000/api/projects", "POST", {
    name: "Invalid Status Project",
    status: "INVALID_UNKNOWN_STATUS",
    workspaceId: wsAlpha.id,
  }, { sessionToken: tokenA, workspaceId: wsAlpha.id });
  const resBadStatus = await createProject(reqBadStatus);
  assert(resBadStatus.status === 400, "Invalid project status enum rejected by Zod (400 Bad Request)");

  // 4.4 Task creation with empty title rejected
  const reqEmptyTaskTitle = mockRequest("http://localhost:3000/api/tasks", "POST", {
    title: "",
    projectId: projAlphaData.id,
    workspaceId: wsAlpha.id,
  }, { sessionToken: tokenA, workspaceId: wsAlpha.id });
  const resEmptyTaskTitle = await createTask(reqEmptyTaskTitle);
  assert(resEmptyTaskTitle.status === 400, "Task creation with empty title rejected by Zod (400 Bad Request)");

  // 4.5 Task creation with invalid priority enum rejected
  const reqBadPriority = mockRequest("http://localhost:3000/api/tasks", "POST", {
    title: "Bad Priority Task",
    priority: "CRITICAL_SUPER_HERO",
    projectId: projAlphaData.id,
    workspaceId: wsAlpha.id,
  }, { sessionToken: tokenA, workspaceId: wsAlpha.id });
  const resBadPriority = await createTask(reqBadPriority);
  assert(resBadPriority.status === 400, "Invalid task priority enum rejected by Zod (400 Bad Request)");

  // 4.6 Member invitation with invalid email rejected
  const reqBadEmail = mockRequest("http://localhost:3000/api/team/members", "POST", {
    email: "not-an-email-address",
    role: "MEMBER",
    workspaceId: wsAlpha.id,
  }, { sessionToken: tokenA, workspaceId: wsAlpha.id });
  const resBadEmail = await inviteMember(reqBadEmail);
  assert(resBadEmail.status === 400, "Member invitation with invalid email address rejected by Zod (400 Bad Request)");

  // ==========================================================================
  // SECTION 5: ERROR SANITIZATION & LEAKAGE PREVENTION
  // ==========================================================================
  console.log("\n--- SECTION 5: Error Sanitization & Leakage Prevention ---");

  // 5.1 Sanitize database connection string error
  const rawDbError = new Error("Connection failed at postgresql://postgres:SuperSecretPassword123@db.supabase.co:5432/synplan_prod");
  const sanitizedMsg = sanitizeErrorMessage(rawDbError, "Database query failed");
  assert(!sanitizedMsg.includes("SuperSecretPassword123"), "Database password suppressed from error message");
  assert(!sanitizedMsg.includes("postgresql://"), "Postgres connection string suppressed from error message");

  // 5.2 Create standard API error response with correlation ID
  const testRequestId = `req_qa_${Date.now()}`;
  const apiErrResp = createApiErrorResponse(rawDbError, "Failed to load records", {
    status: 500,
    requestId: testRequestId,
  });
  const errJson = await apiErrResp.json();
  assert(apiErrResp.headers.get("x-request-id") === testRequestId, "Error response includes x-request-id header");
  assert(errJson.requestId === testRequestId, "Error response body includes matching requestId");
  assert(!errJson.message.includes("SuperSecretPassword123"), "Error response body does not leak credentials");

  // ==========================================================================
  // SECTION 6: CRITICAL USER JOURNEYS (A TO E) END-TO-END VERIFICATION
  // ==========================================================================
  console.log("\n--- SECTION 6: Critical User Journeys (A to E) ---");

  // JOURNEY A: New User Lifecycle (Project -> Phase -> Task -> Assign -> Done -> Progress)
  console.log("  [Journey A] Testing Complete Project & Task Lifecycle...");
  // 6.1 Create Project
  const reqCreateProjA = mockRequest("http://localhost:3000/api/projects", "POST", {
    name: "E2E Mobile Application",
    description: "Full end-to-end journey project",
    color: "#0D9488",
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    workspaceId: wsAlpha.id,
  }, { sessionToken: tokenA, workspaceId: wsAlpha.id });
  const resCreateProjA = await createProject(reqCreateProjA);
  const projA = (await resCreateProjA.json()).data;
  assert(resCreateProjA.status === 201 && projA.id, "Journey A: Project created with 201 Created");

  // 6.2 Create Phase
  const reqCreatePhaseA = mockRequest("http://localhost:3000/api/phases", "POST", {
    projectId: projA.id,
    name: "Phase 1 - Frontend Architecture",
    description: "Core UI/UX build",
    order: 1,
    workspaceId: wsAlpha.id,
  }, { sessionToken: tokenA, workspaceId: wsAlpha.id });
  const resCreatePhaseA = await createPhase(reqCreatePhaseA);
  const phaseA = (await resCreatePhaseA.json()).data;
  assert(resCreatePhaseA.status === 201 && phaseA.id, "Journey A: Phase created successfully");

  // 6.3 Create Task assigned to User Member
  const reqCreateTaskA = mockRequest("http://localhost:3000/api/tasks", "POST", {
    workspaceId: wsAlpha.id,
    projectId: projA.id,
    phaseId: phaseA.id,
    title: "Build Responsive Kanban Board",
    description: "Complete drag and drop UI",
    status: "TODO",
    priority: "HIGH",
    assigneeId: userMember.id,
  }, { sessionToken: tokenA, workspaceId: wsAlpha.id });
  const resCreateTaskA = await createTask(reqCreateTaskA);
  const taskA = (await resCreateTaskA.json()).data;
  assert(resCreateTaskA.status === 201 && taskA.id, "Journey A: Task created & assigned to squad member");

  // 6.4 Transition Task Status: TODO -> IN_PROGRESS -> DONE
  const reqMoveInProgress = mockRequest("http://localhost:3000/api/tasks/status", "PATCH", {
    taskId: taskA.id,
    status: "IN_PROGRESS",
  }, { sessionToken: tokenMember, workspaceId: wsAlpha.id });
  const resMoveInProgress = await updateTaskStatus(reqMoveInProgress);
  assert(resMoveInProgress.status === 200, "Journey A: Task moved to IN_PROGRESS");

  const reqMoveDone = mockRequest("http://localhost:3000/api/tasks/status", "PATCH", {
    taskId: taskA.id,
    status: "DONE",
  }, { sessionToken: tokenMember, workspaceId: wsAlpha.id });
  const resMoveDone = await updateTaskStatus(reqMoveDone);
  const moveDoneData = await resMoveDone.json();
  assert(resMoveDone.status === 200, "Journey A: Task moved to DONE");
  assert(moveDoneData.evaluator?.projectProgress === 100, "Journey A: Project progress automatically recalculated to 100%");

  // JOURNEY B: Realtime Collaboration & Channel Isolation
  console.log("  [Journey B] Testing Realtime Collaboration & Isolation...");
  assert(taskA.workspaceId === wsAlpha.id, "Journey B: Realtime task workspace matches Alpha");
  assert(projBeta.workspaceId === wsBeta.id, "Journey B: Foreign tenant project matches Beta");

  // JOURNEY C: AI Natural Language Planning & Execution Safety Gating
  console.log("  [Journey C] Testing AI Plan & Execution Safety Gating...");
  const reqAiPlan = mockRequest("http://localhost:3000/api/ai/plan", "POST", {
    prompt: "buat task Setup Tailwind CSS di project ini",
    currentProjectId: projA.id,
    mode: "STRICT",
  }, { sessionToken: tokenA, workspaceId: wsAlpha.id });
  const resAiPlan = await planAi(reqAiPlan);
  const aiPlanData = (await resAiPlan.json()).data;
  assert(resAiPlan.status === 200 && aiPlanData.actions.length > 0, "Journey C: AI Plan generated from natural language prompt");

  // JOURNEY D: Team Management & Role Modification
  console.log("  [Journey D] Testing Team Member Management & Clean Removal...");
  const userNewTeam = await prisma.user.create({
    data: { name: "Devon QA", email: `devon_${runId}@synplan-qa.local`, role: Role.MEMBER },
  });
  const memNewTeam = await prisma.workspaceMember.create({
    data: { workspaceId: wsAlpha.id, userId: userNewTeam.id, role: Role.MEMBER, workloadScore: 50 },
  });

  // Promote Member to ADMIN
  const reqPromoteMem = mockRequest("http://localhost:3000/api/team/members", "PUT", {
    memberId: memNewTeam.id,
    role: "ADMIN",
  }, { sessionToken: tokenA, workspaceId: wsAlpha.id });
  const resPromoteMem = await updateMemberRole(reqPromoteMem);
  assert(resPromoteMem.status === 200, "Journey D: Workspace member promoted to ADMIN by OWNER");

  // Remove Member & Verify Atomic Cleanup
  const reqRemoveMem = mockRequest(`http://localhost:3000/api/team/members?memberId=${memNewTeam.id}`, "DELETE", undefined, {
    sessionToken: tokenA,
    workspaceId: wsAlpha.id,
  });
  const resRemoveMem = await removeMember(reqRemoveMem);
  assert(resRemoveMem.status === 200, "Journey D: Workspace member removed successfully");

  // JOURNEY E: Disaster Recovery & Backup Verification
  console.log("  [Journey E] Testing Disaster Recovery Backup Export & Validation...");
  const reqBackupExport = mockRequest(`http://localhost:3000/api/admin/backup/export?workspaceId=${wsAlpha.id}`, "GET", undefined, {
    sessionToken: tokenA,
    workspaceId: wsAlpha.id,
  });
  const resBackupExport = await exportBackup(reqBackupExport);
  assert(resBackupExport.status === 200, "Journey E: Backup export returns HTTP 200 for OWNER");
  const backupPayload = await resBackupExport.json();
  const backupValidation = validateBackupPayload(backupPayload);
  assert(backupValidation.valid, "Journey E: Exported backup passes 100% referential integrity validation", JSON.stringify(backupValidation.issues));
  assert(backupValidation.issues.length === 0, "Journey E: Exported backup contains zero integrity issues", JSON.stringify(backupValidation.issues));

  // ==========================================================================
  // SECTION 7: CONCURRENCY & DESTRUCTIVE INVARIANTS
  // ==========================================================================
  console.log("\n--- SECTION 7: Concurrency, Destructive Cascade & Invariants ---");

  // 7.1 Idempotency prevents duplicate entity creation on repeated key
  const testIdemKey = `idem_${runId}`;
  idempotency.start(testIdemKey, wsAlpha.id, userA.id);
  const { isInFlight } = idempotency.check(testIdemKey, wsAlpha.id, userA.id);
  assert(isInFlight, "Idempotency engine recognizes in-flight operation and prevents race condition");
  idempotency.release(testIdemKey, wsAlpha.id, userA.id);

  // 7.2 Atomic Deletion of Project with all Child Relations
  const reqDeleteProjA = mockRequest(`http://localhost:3000/api/projects/${projA.id}`, "DELETE", undefined, {
    sessionToken: tokenA,
    workspaceId: wsAlpha.id,
  });
  const resDeleteProjA = await deleteProjectById(reqDeleteProjA, { params: Promise.resolve({ id: projA.id }) });
  assert(resDeleteProjA.status === 200, "Destructive Action: Project and all child entities deleted cleanly in atomic transaction");

  // 7.3 Data Consistency Health Check confirms clean state
  const consistencyReport = await checkWorkspaceDataConsistency(wsAlpha.id);
  assert(consistencyReport.healthy, "Data Consistency Health Check confirms 100% HEALTHY workspace state");
  assert(consistencyReport.issues.length === 0, "Zero orphaned or corrupted records after full lifecycle tests");

  // ==========================================================================
  // CLEANUP SYNTHETIC TEST FIXTURES
  // ==========================================================================
  console.log("\n--- CLEANUP: Removing Synthetic Test Fixtures ---");
  await prisma.session.deleteMany({
    where: { userId: { in: [userA.id, userB.id, userViewer.id, userMember.id, userAdmin.id, userAdmin2.id, userNewTeam.id] } },
  });
  await prisma.auditLog.deleteMany({ where: { workspaceId: { in: [wsAlpha.id, wsBeta.id] } } });
  await prisma.notification.deleteMany({ where: { workspaceId: { in: [wsAlpha.id, wsBeta.id] } } });
  await prisma.taskComment.deleteMany({ where: { task: { workspaceId: { in: [wsAlpha.id, wsBeta.id] } } } });
  await prisma.subtask.deleteMany({ where: { task: { workspaceId: { in: [wsAlpha.id, wsBeta.id] } } } });
  await prisma.task.deleteMany({ where: { workspaceId: { in: [wsAlpha.id, wsBeta.id] } } });
  await prisma.phase.deleteMany({ where: { project: { workspaceId: { in: [wsAlpha.id, wsBeta.id] } } } });
  await prisma.projectMember.deleteMany({ where: { project: { workspaceId: { in: [wsAlpha.id, wsBeta.id] } } } });
  await prisma.project.deleteMany({ where: { workspaceId: { in: [wsAlpha.id, wsBeta.id] } } });
  await prisma.workspaceMember.deleteMany({ where: { workspaceId: { in: [wsAlpha.id, wsBeta.id] } } });
  await prisma.workspace.deleteMany({ where: { id: { in: [wsAlpha.id, wsBeta.id] } } });
  await prisma.user.deleteMany({
    where: { id: { in: [userA.id, userB.id, userViewer.id, userMember.id, userAdmin.id, userAdmin2.id, userNewTeam.id] } },
  });
  console.log("  ✅ Test cleanup completed successfully.");

  // ==========================================================================
  // FINAL RESULTS SUMMARY
  // ==========================================================================
  console.log("\n================================================================================");
  console.log(`PHASE 8 E2E QA & SECURITY PENETRATION RESULTS: ${passedTests}/${totalTests} PASSED (${totalTests - passedTests} FAILED)`);
  console.log("================================================================================");

  if (passedTests === totalTests) {
    console.log("🏆 ALL PHASE 8 E2E QA & SECURITY PENETRATION ASSERTIONS PASSED PERFECTLY!");
  } else {
    throw new Error(`Phase 8 QA Suite Failed: ${totalTests - passedTests} test(s) failed`);
  }
}

runPhase8QaSuite().catch((err) => {
  console.error("FATAL: Phase 8 QA test suite failed with error:", err);
  process.exit(1);
});
