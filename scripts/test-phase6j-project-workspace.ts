import { prisma } from "../src/lib/prisma";
import { NextRequest } from "next/server";
import {
  GET as getProject,
  PUT as updateProject,
  DELETE as deleteProject,
} from "../src/app/api/projects/[id]/route";
import {
  GET as getProjectMembers,
  POST as addProjectMember,
  PATCH as patchProjectMemberRole,
  DELETE as deleteProjectMember,
} from "../src/app/api/projects/[id]/members/route";
import { createSession } from "../src/lib/auth/session";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`  ✕ [FAIL] ${testName}${detail ? ` -> ${detail}` : ""}`);
    process.exit(1);
  }
}

async function runPhase6jProjectWorkspaceTests() {
  console.log("===============================================================");
  console.log(" SYNPLAN PHASE 6J: PROJECT WORKSPACE & PROJECT DETAIL SUITE");
  console.log(" AUTHORITATIVE RBAC, WORKLOAD TELEMETRY, & ATOMIC CLEANUP");
  console.log("===============================================================\n");

  const runId = Math.random().toString(36).substring(2, 7);

  // 1. Fixture Setup
  console.log("--- 1. Setting up Isolated Test Workspaces, Projects & Squads ---");

  const userOwner = await prisma.user.create({
    data: {
      name: `Owner 6J ${runId}`,
      email: `owner-6j-${runId}@synplan.test`,
      role: "OWNER",
    },
  });

  const userAdmin = await prisma.user.create({
    data: {
      name: `Admin 6J ${runId}`,
      email: `admin-6j-${runId}@synplan.test`,
      role: "ADMIN",
    },
  });

  const userMember = await prisma.user.create({
    data: {
      name: `Member 6J ${runId}`,
      email: `member-6j-${runId}@synplan.test`,
      role: "MEMBER",
    },
  });

  const userViewer = await prisma.user.create({
    data: {
      name: `Viewer 6J ${runId}`,
      email: `viewer-6j-${runId}@synplan.test`,
      role: "VIEWER",
    },
  });

  const userForeign = await prisma.user.create({
    data: {
      name: `Foreign 6J ${runId}`,
      email: `foreign-6j-${runId}@synplan.test`,
      role: "OWNER",
    },
  });

  const workspaceA = await prisma.workspace.create({
    data: {
      name: `Workspace Alpha 6J ${runId}`,
      slug: `ws-alpha-6j-${runId}`,
      ownerId: userOwner.id,
    },
  });

  const workspaceB = await prisma.workspace.create({
    data: {
      name: `Workspace Beta 6J ${runId}`,
      slug: `ws-beta-6j-${runId}`,
      ownerId: userForeign.id,
    },
  });

  // Assign members to Workspace A
  await prisma.workspaceMember.createMany({
    data: [
      { workspaceId: workspaceA.id, userId: userOwner.id, role: "OWNER" },
      { workspaceId: workspaceA.id, userId: userAdmin.id, role: "ADMIN" },
      { workspaceId: workspaceA.id, userId: userMember.id, role: "MEMBER" },
      { workspaceId: workspaceA.id, userId: userViewer.id, role: "VIEWER" },
    ],
  });

  // Assign userForeign to Workspace B
  await prisma.workspaceMember.create({
    data: { workspaceId: workspaceB.id, userId: userForeign.id, role: "OWNER" },
  });

  // Create Project in Workspace A
  const projectAlpha = await prisma.project.create({
    data: {
      name: `Project Alpha 6J ${runId}`,
      slug: `proj-alpha-6j-${runId}`,
      description: "Primary delivery container for Phase 6J tests",
      workspaceId: workspaceA.id,
      color: "#0284C7",
      status: "PLANNING",
    },
  });

  // Create Project in Workspace B (for cross-workspace isolation tests)
  const projectBeta = await prisma.project.create({
    data: {
      name: `Project Beta 6J ${runId}`,
      slug: `proj-beta-6j-${runId}`,
      workspaceId: workspaceB.id,
      color: "#dc2626",
      status: "ACTIVE",
    },
  });

  // Create Phase in Project Alpha
  const phase1 = await prisma.phase.create({
    data: {
      name: `Phase 1 Discovery ${runId}`,
      projectId: projectAlpha.id,
      workspaceId: workspaceA.id,
      order: 1,
    },
  });

  // Assign userAdmin as initial LEAD in Project Alpha
  const pmAdmin = await prisma.projectMember.create({
    data: {
      projectId: projectAlpha.id,
      userId: userAdmin.id,
      role: "LEAD",
    },
  });

  // Create tasks in Project Alpha with various statuses & assignees
  // Task 1: Active in_progress assigned to userAdmin
  const task1 = await prisma.task.create({
    data: {
      title: `Task Alpha 1 Active ${runId}`,
      workspaceId: workspaceA.id,
      projectId: projectAlpha.id,
      phaseId: phase1.id,
      assigneeId: userAdmin.id,
      status: "IN_PROGRESS",
      priority: "HIGH",
    },
  });

  // Task 2: Completed done assigned to userAdmin
  await prisma.task.create({
    data: {
      title: `Task Alpha 2 Done ${runId}`,
      workspaceId: workspaceA.id,
      projectId: projectAlpha.id,
      phaseId: phase1.id,
      assigneeId: userAdmin.id,
      status: "DONE",
      priority: "MEDIUM",
    },
  });

  // Task 3: Unassigned Todo task
  await prisma.task.create({
    data: {
      title: `Task Alpha 3 Unassigned ${runId}`,
      workspaceId: workspaceA.id,
      projectId: projectAlpha.id,
      phaseId: phase1.id,
      status: "TODO",
      priority: "LOW",
    },
  });

  // Real Database Sessions
  const ownerSession = await createSession(userOwner.id);
  const adminSession = await createSession(userAdmin.id);
  const memberSession = await createSession(userMember.id);
  const viewerSession = await createSession(userViewer.id);
  const foreignSession = await createSession(userForeign.id);

  console.log(`  ✓ Created test fixtures: Workspace A (${workspaceA.id}), Project Alpha (${projectAlpha.id}), and Workspace B (${workspaceB.id})\n`);

  // 2. Project Access & Authentication Tests (GET /api/projects/[id])
  console.log("--- 2. Project Detail (GET) Authentication & Cross-Workspace Isolation ---");

  {
    // Test 2.1: Unauthenticated access returns 401
    const unauthReq = new NextRequest(`http://localhost:3000/api/projects/${projectAlpha.id}`);
    const res = await getProject(unauthReq, { params: Promise.resolve({ id: projectAlpha.id }) });
    assert(res.status === 401, "GET /api/projects/[id] rejects unauthenticated request (401)");

    // Test 2.2: Authorized workspace member (Viewer) can view project details (200)
    const viewerReq = new NextRequest(`http://localhost:3000/api/projects/${projectAlpha.id}`, {
      headers: {
        "x-synplan-session-token": viewerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const viewerRes = await getProject(viewerReq, { params: Promise.resolve({ id: projectAlpha.id }) });
    assert(viewerRes.status === 200, "GET /api/projects/[id] allows authorized workspace VIEWER (200)");
    const viewerJson = await viewerRes.json();
    assert(viewerJson.success === true, "Response payload indicates success = true");
    assert(viewerJson.data.name === projectAlpha.name, "Response includes correct project name");
    assert(Array.isArray(viewerJson.data.phases) && viewerJson.data.phases.length === 1, "Response includes associated phases");
    assert(Array.isArray(viewerJson.data.members) && viewerJson.data.members.length === 1, "Response includes project members");
    assert(Array.isArray(viewerJson.data.tasks) && viewerJson.data.tasks.length === 3, "Response includes project tasks");

    // Test 2.3: Non-existent project returns 404
    const notFoundReq = new NextRequest(`http://localhost:3000/api/projects/non-existent-id`, {
      headers: {
        "x-synplan-session-token": adminSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const notFoundRes = await getProject(notFoundReq, { params: Promise.resolve({ id: "non-existent-id" }) });
    assert(notFoundRes.status === 404, "GET /api/projects/[id] returns 404 for unknown project");

    // Test 2.4: Cross-Workspace Isolation: Foreign user from Workspace B cannot access projectAlpha in Workspace A
    const foreignReq = new NextRequest(`http://localhost:3000/api/projects/${projectAlpha.id}`, {
      headers: {
        "x-synplan-session-token": foreignSession.sessionToken,
        "x-synplan-workspace-id": workspaceB.id,
      },
    });
    const foreignRes = await getProject(foreignReq, { params: Promise.resolve({ id: projectAlpha.id }) });
    assert(foreignRes.status === 403, "GET /api/projects/[id] enforces cross-workspace isolation (403 Forbidden)");
  }

  // 3. Project Status Transitions & Updates (PUT /api/projects/[id])
  console.log("\n--- 3. Project Status Lifecycle, Authorization & Audit Logs ---");

  {
    // Test 3.1: Viewer attempting to update project status is rejected (403)
    const viewerUpdateReq = new NextRequest(`http://localhost:3000/api/projects/${projectAlpha.id}`, {
      method: "PUT",
      headers: {
        "x-synplan-session-token": viewerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    const viewerUpdateRes = await updateProject(viewerUpdateReq, { params: Promise.resolve({ id: projectAlpha.id }) });
    assert(viewerUpdateRes.status === 403, "PUT /api/projects/[id] rejects unauthorized VIEWER from status change (403)");

    // Test 3.2: Authorized Admin updates status from PLANNING to ACTIVE (200)
    const adminUpdateReq = new NextRequest(`http://localhost:3000/api/projects/${projectAlpha.id}`, {
      method: "PUT",
      headers: {
        "x-synplan-session-token": adminSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "ACTIVE", description: "Updated project description by Admin" }),
    });
    const adminUpdateRes = await updateProject(adminUpdateReq, { params: Promise.resolve({ id: projectAlpha.id }) });
    assert(adminUpdateRes.status === 200, "PUT /api/projects/[id] allows authorized ADMIN status update (200)");
    const adminUpdateJson = await adminUpdateRes.json();
    assert(adminUpdateJson.data.status === "ACTIVE", "Project status transitioned to ACTIVE in PostgreSQL");

    // Test 3.3: Verify AuditLog entry was recorded for PROJECT_UPDATE
    const auditLogUpdate = await prisma.auditLog.findFirst({
      where: {
        workspaceId: workspaceA.id,
        entityId: projectAlpha.id,
        action: "PROJECT_UPDATE",
      },
      orderBy: { timestamp: "desc" },
    });
    assert(Boolean(auditLogUpdate), "AuditLog recorded for PROJECT_UPDATE action");
    assert(auditLogUpdate?.actorId === userAdmin.id, "AuditLog records correct actorId (Admin)");

    // Test 3.4: Transition to COMPLETED
    const completeReq = new NextRequest(`http://localhost:3000/api/projects/${projectAlpha.id}`, {
      method: "PUT",
      headers: {
        "x-synplan-session-token": adminSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    const completeRes = await updateProject(completeReq, { params: Promise.resolve({ id: projectAlpha.id }) });
    assert(completeRes.status === 200, "Project status transitioned to COMPLETED");
  }

  // 4. Project Members API & Telemetry (GET /api/projects/[id]/members)
  console.log("\n--- 4. Project Members Telemetry & Workload Verification ---");

  {
    // Test 4.1: Unauthenticated request rejected (401)
    const unauthReq = new NextRequest(`http://localhost:3000/api/projects/${projectAlpha.id}/members`);
    const unauthRes = await getProjectMembers(unauthReq, { params: Promise.resolve({ id: projectAlpha.id }) });
    assert(unauthRes.status === 401, "GET /api/projects/[id]/members rejects unauthenticated request (401)");

    // Test 4.2: Authorized fetch returns project members with computed activeTaskCount
    const authReq = new NextRequest(`http://localhost:3000/api/projects/${projectAlpha.id}/members`, {
      headers: {
        "x-synplan-session-token": memberSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const authRes = await getProjectMembers(authReq, { params: Promise.resolve({ id: projectAlpha.id }) });
    assert(authRes.status === 200, "GET /api/projects/[id]/members returns 200 for authorized caller");
    const json = await authRes.json();
    assert(Array.isArray(json.data), "Response data is an array of project members");
    assert(json.data.length === 1, "Found 1 project member (Admin)");
    const adminMember = json.data[0];
    assert(adminMember.role === "LEAD", "Project member has correct LEAD role");
    assert(adminMember.activeTaskCount === 1, "activeTaskCount correctly computed: 1 active task (1 IN_PROGRESS, 1 DONE)");

    // Test 4.3: Cross-workspace access rejected
    const foreignReq = new NextRequest(`http://localhost:3000/api/projects/${projectAlpha.id}/members`, {
      headers: {
        "x-synplan-session-token": foreignSession.sessionToken,
        "x-synplan-workspace-id": workspaceB.id,
      },
    });
    const foreignRes = await getProjectMembers(foreignReq, { params: Promise.resolve({ id: projectAlpha.id }) });
    assert(foreignRes.status === 403, "GET /api/projects/[id]/members rejects cross-workspace access (403)");
  }

  // 5. Add Project Member (POST /api/projects/[id]/members)
  console.log("\n--- 5. Assigning Squad Members & Cross-Workspace Validation ---");

  let newMemberRecordId: string = "";
  {
    // Test 5.1: Viewer cannot add members (403)
    const viewerAddReq = new NextRequest(`http://localhost:3000/api/projects/${projectAlpha.id}/members`, {
      method: "POST",
      headers: {
        "x-synplan-session-token": viewerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId: userMember.id, role: "CONTRIBUTOR" }),
    });
    const viewerAddRes = await addProjectMember(viewerAddReq, { params: Promise.resolve({ id: projectAlpha.id }) });
    assert(viewerAddRes.status === 403, "POST /api/projects/[id]/members rejects unauthorized VIEWER (403)");

    // Test 5.2: Cross-workspace member addition: Attempting to add userForeign (Workspace B) into Workspace A's project rejected (400)
    const crossWsReq = new NextRequest(`http://localhost:3000/api/projects/${projectAlpha.id}/members`, {
      method: "POST",
      headers: {
        "x-synplan-session-token": adminSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId: userForeign.id, role: "CONTRIBUTOR" }),
    });
    const crossWsRes = await addProjectMember(crossWsReq, { params: Promise.resolve({ id: projectAlpha.id }) });
    assert(crossWsRes.status === 400, "POST /api/projects/[id]/members rejects non-workspace member assignment (400 Bad Request)");

    // Test 5.3: Authorized Admin assigns userMember as CONTRIBUTOR (201)
    const adminAddReq = new NextRequest(`http://localhost:3000/api/projects/${projectAlpha.id}/members`, {
      method: "POST",
      headers: {
        "x-synplan-session-token": adminSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId: userMember.id, role: "CONTRIBUTOR" }),
    });
    const adminAddRes = await addProjectMember(adminAddReq, { params: Promise.resolve({ id: projectAlpha.id }) });
    assert(adminAddRes.status === 201, "POST /api/projects/[id]/members assigns member successfully (201)");
    const addJson = await adminAddRes.json();
    assert(addJson.data.role === "CONTRIBUTOR", "Assigned role is CONTRIBUTOR");
    newMemberRecordId = addJson.data.id;

    // Test 5.4: Verify AuditLog entry was recorded for PROJECT_MEMBER_ADD
    const auditLogAdd = await prisma.auditLog.findFirst({
      where: {
        workspaceId: workspaceA.id,
        action: "PROJECT_MEMBER_ADD",
      },
      orderBy: { timestamp: "desc" },
    });
    assert(Boolean(auditLogAdd), "AuditLog recorded for PROJECT_MEMBER_ADD action");
    assert(auditLogAdd?.actorId === userAdmin.id, "AuditLog records correct actorId");
  }

  // 6. Update Project Member Role (PATCH /api/projects/[id]/members)
  console.log("\n--- 6. Project Member Role Modification & Audit ---");

  {
    // Test 6.1: Viewer cannot update member role (403)
    const viewerPatchReq = new NextRequest(`http://localhost:3000/api/projects/${projectAlpha.id}/members`, {
      method: "PATCH",
      headers: {
        "x-synplan-session-token": viewerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ memberId: newMemberRecordId, role: "LEAD" }),
    });
    const viewerPatchRes = await patchProjectMemberRole(viewerPatchReq, { params: Promise.resolve({ id: projectAlpha.id }) });
    assert(viewerPatchRes.status === 403, "PATCH /api/projects/[id]/members rejects unauthorized VIEWER (403)");

    // Test 6.2: Admin promotes userMember to LEAD (200)
    const adminPatchReq = new NextRequest(`http://localhost:3000/api/projects/${projectAlpha.id}/members`, {
      method: "PATCH",
      headers: {
        "x-synplan-session-token": adminSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ memberId: newMemberRecordId, role: "LEAD" }),
    });
    const adminPatchRes = await patchProjectMemberRole(adminPatchReq, { params: Promise.resolve({ id: projectAlpha.id }) });
    assert(adminPatchRes.status === 200, "PATCH /api/projects/[id]/members promotes member to LEAD (200)");
    const patchJson = await adminPatchRes.json();
    assert(patchJson.data.role === "LEAD", "Project member role updated to LEAD in PostgreSQL");

    // Test 6.3: Verify AuditLog entry was recorded for PROJECT_MEMBER_UPDATE
    const auditLogPatch = await prisma.auditLog.findFirst({
      where: {
        workspaceId: workspaceA.id,
        action: "PROJECT_MEMBER_UPDATE",
      },
      orderBy: { timestamp: "desc" },
    });
    assert(Boolean(auditLogPatch), "AuditLog recorded for PROJECT_MEMBER_UPDATE action");
    assert(auditLogPatch?.actorId === userAdmin.id, "AuditLog records correct actorId");
  }

  // 7. Remove Project Member (DELETE /api/projects/[id]/members)
  console.log("\n--- 7. Project Member Removal & Audit ---");

  {
    // Test 7.1: Viewer cannot remove member (403)
    const viewerDeleteReq = new NextRequest(`http://localhost:3000/api/projects/${projectAlpha.id}/members?memberId=${newMemberRecordId}`, {
      method: "DELETE",
      headers: {
        "x-synplan-session-token": viewerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const viewerDeleteRes = await deleteProjectMember(viewerDeleteReq, { params: Promise.resolve({ id: projectAlpha.id }) });
    assert(viewerDeleteRes.status === 403, "DELETE /api/projects/[id]/members rejects unauthorized VIEWER (403)");

    // Test 7.2: Admin removes userMember from project (200)
    const adminDeleteReq = new NextRequest(`http://localhost:3000/api/projects/${projectAlpha.id}/members?memberId=${newMemberRecordId}`, {
      method: "DELETE",
      headers: {
        "x-synplan-session-token": adminSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const adminDeleteRes = await deleteProjectMember(adminDeleteReq, { params: Promise.resolve({ id: projectAlpha.id }) });
    assert(adminDeleteRes.status === 200, "DELETE /api/projects/[id]/members removes member successfully (200)");

    // Verify record removed in database
    const dbRecord = await prisma.projectMember.findUnique({ where: { id: newMemberRecordId } });
    assert(!dbRecord, "ProjectMember record completely deleted from database");

    // Test 7.3: Verify AuditLog entry was recorded for PROJECT_MEMBER_REMOVE
    const auditLogRemove = await prisma.auditLog.findFirst({
      where: {
        workspaceId: workspaceA.id,
        action: "PROJECT_MEMBER_REMOVE",
      },
      orderBy: { timestamp: "desc" },
    });
    assert(Boolean(auditLogRemove), "AuditLog recorded for PROJECT_MEMBER_REMOVE action");
  }

  // 8. Destructive Operations & Atomic Cascade Deletion (DELETE /api/projects/[id])
  console.log("\n--- 8. Destructive Operations & Atomic Cascade Deletion ---");

  {
    // Test 8.1: Member cannot delete project (Requires projects.delete - OWNER/ADMIN only)
    const memberDeleteReq = new NextRequest(`http://localhost:3000/api/projects/${projectAlpha.id}`, {
      method: "DELETE",
      headers: {
        "x-synplan-session-token": memberSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const memberDeleteRes = await deleteProject(memberDeleteReq, { params: Promise.resolve({ id: projectAlpha.id }) });
    assert(memberDeleteRes.status === 403, "DELETE /api/projects/[id] rejects MEMBER (403 Forbidden)");

    // Test 8.2: Viewer cannot delete project (403)
    const viewerDeleteReq = new NextRequest(`http://localhost:3000/api/projects/${projectAlpha.id}`, {
      method: "DELETE",
      headers: {
        "x-synplan-session-token": viewerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const viewerDeleteRes = await deleteProject(viewerDeleteReq, { params: Promise.resolve({ id: projectAlpha.id }) });
    assert(viewerDeleteRes.status === 403, "DELETE /api/projects/[id] rejects VIEWER (403 Forbidden)");

    // Test 8.3: Owner deletes project -> atomic cascade delete of tasks, phases, members (200)
    const ownerDeleteReq = new NextRequest(`http://localhost:3000/api/projects/${projectAlpha.id}`, {
      method: "DELETE",
      headers: {
        "x-synplan-session-token": ownerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const ownerDeleteRes = await deleteProject(ownerDeleteReq, { params: Promise.resolve({ id: projectAlpha.id }) });
    assert(ownerDeleteRes.status === 200, "DELETE /api/projects/[id] allows OWNER deletion (200 OK)");

    // Test 8.4: Verify database cascade
    const projCheck = await prisma.project.findUnique({ where: { id: projectAlpha.id } });
    assert(!projCheck, "Project record deleted from database");

    const tasksCheck = await prisma.task.findMany({ where: { projectId: projectAlpha.id } });
    assert(tasksCheck.length === 0, "All project tasks cascaded and deleted atomically");

    const phasesCheck = await prisma.phase.findMany({ where: { projectId: projectAlpha.id } });
    assert(phasesCheck.length === 0, "All project phases cascaded and deleted atomically");

    const membersCheck = await prisma.projectMember.findMany({ where: { projectId: projectAlpha.id } });
    assert(membersCheck.length === 0, "All project squad members cascaded and deleted atomically");

    // Test 8.5: Verify AuditLog entry for PROJECT_DELETE
    const auditLogDelete = await prisma.auditLog.findFirst({
      where: {
        workspaceId: workspaceA.id,
        action: "PROJECT_DELETE",
      },
      orderBy: { timestamp: "desc" },
    });
    assert(Boolean(auditLogDelete), "AuditLog recorded for PROJECT_DELETE action");
    assert(auditLogDelete?.actorId === userOwner.id, "AuditLog records correct owner actorId");
  }

  // 9. Fixture Teardown
  console.log("\n--- 9. Cleaning Up Test Fixtures ---");
  try {
    await prisma.auditLog.deleteMany({
      where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } },
    });
    await prisma.project.deleteMany({
      where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } },
    });
    await prisma.workspaceMember.deleteMany({
      where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } },
    });
    await prisma.workspace.deleteMany({
      where: { id: { in: [workspaceA.id, workspaceB.id] } },
    });
    await prisma.session.deleteMany({
      where: { userId: { in: [userOwner.id, userAdmin.id, userMember.id, userViewer.id, userForeign.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userOwner.id, userAdmin.id, userMember.id, userViewer.id, userForeign.id] } },
    });
    console.log("  ✓ Test fixtures cleaned up successfully.\n");
  } catch (err) {
    console.warn("  Warning during cleanup:", err);
  }

  console.log("===============================================================");
  console.log(` SYNPLAN PHASE 6J TEST SUITE COMPLETE`);
  console.log(` RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log("===============================================================\n");
}

runPhase6jProjectWorkspaceTests().catch((err) => {
  console.error("FATAL ERROR in Phase 6J Test Suite:", err);
  process.exit(1);
});
