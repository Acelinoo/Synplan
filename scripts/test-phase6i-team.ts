import { prisma } from "../src/lib/prisma";
import { NextRequest } from "next/server";
import {
  GET as getTeamMembers,
  POST as inviteTeamMember,
  PATCH as patchMemberRole,
  PUT as putMemberRole,
  DELETE as deleteTeamMember,
} from "../src/app/api/team/members/route";
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

async function runPhase6iTeamTests() {
  console.log("===============================================================");
  console.log(" SYNPLAN PHASE 6I: TEAM & PEOPLE WORKSPACE TEST SUITE");
  console.log(" AUTHORITATIVE RBAC, WORKLOAD TELEMETRY, & ATOMIC CLEANUP");
  console.log("===============================================================\n");

  const runId = Math.random().toString(36).substring(2, 7);

  // 1. Fixture Setup
  console.log("--- 1. Setting up Isolated Test Workspaces, Projects & Squads ---");

  const userOwner = await prisma.user.create({
    data: {
      name: `Owner 6I ${runId}`,
      email: `owner-6i-${runId}@synplan.test`,
      role: "OWNER",
    },
  });

  const userAdmin = await prisma.user.create({
    data: {
      name: `Admin 6I ${runId}`,
      email: `admin-6i-${runId}@synplan.test`,
      role: "ADMIN",
    },
  });

  const userMember = await prisma.user.create({
    data: {
      name: `Member 6I ${runId}`,
      email: `member-6i-${runId}@synplan.test`,
      role: "MEMBER",
    },
  });

  const userViewer = await prisma.user.create({
    data: {
      name: `Viewer 6I ${runId}`,
      email: `viewer-6i-${runId}@synplan.test`,
      role: "VIEWER",
    },
  });

  const userForeign = await prisma.user.create({
    data: {
      name: `Foreign 6I ${runId}`,
      email: `foreign-6i-${runId}@synplan.test`,
      role: "OWNER",
    },
  });

  const workspaceA = await prisma.workspace.create({
    data: {
      name: `Workspace Alpha 6I ${runId}`,
      slug: `ws-alpha-6i-${runId}`,
      ownerId: userOwner.id,
    },
  });

  const workspaceB = await prisma.workspace.create({
    data: {
      name: `Workspace Beta 6I ${runId}`,
      slug: `ws-beta-6i-${runId}`,
      ownerId: userForeign.id,
    },
  });

  // Create project in Workspace A
  const projectAlpha = await prisma.project.create({
    data: {
      name: `Project Alpha ${runId}`,
      slug: `proj-alpha-${runId}`,
      workspaceId: workspaceA.id,
      color: "#3b82f6",
    },
  });

  // Assign memberships in Workspace A
  const memberOwner = await prisma.workspaceMember.create({
    data: { workspaceId: workspaceA.id, userId: userOwner.id, role: "OWNER" },
  });
  const memberAdmin = await prisma.workspaceMember.create({
    data: { workspaceId: workspaceA.id, userId: userAdmin.id, role: "ADMIN" },
  });
  const memberRegular = await prisma.workspaceMember.create({
    data: { workspaceId: workspaceA.id, userId: userMember.id, role: "MEMBER" },
  });
  const memberViewer = await prisma.workspaceMember.create({
    data: { workspaceId: workspaceA.id, userId: userViewer.id, role: "VIEWER" },
  });

  // Assign project membership for memberRegular
  await prisma.projectMember.create({
    data: {
      projectId: projectAlpha.id,
      userId: userMember.id,
      role: "CONTRIBUTOR",
    },
  });

  // Create tasks assigned to memberRegular
  await prisma.task.create({
    data: {
      title: `Active Task 1 ${runId}`,
      workspaceId: workspaceA.id,
      projectId: projectAlpha.id,
      assigneeId: userMember.id,
      status: "IN_PROGRESS",
    },
  });

  await prisma.task.create({
    data: {
      title: `Completed Task 1 ${runId}`,
      workspaceId: workspaceA.id,
      projectId: projectAlpha.id,
      assigneeId: userMember.id,
      status: "DONE",
    },
  });

  // Assign Foreign user to Workspace B
  await prisma.workspaceMember.create({
    data: { workspaceId: workspaceB.id, userId: userForeign.id, role: "OWNER" },
  });

  // Real Database Sessions
  const ownerSession = await createSession(userOwner.id);
  const adminSession = await createSession(userAdmin.id);
  const memberSession = await createSession(userMember.id);
  const viewerSession = await createSession(userViewer.id);
  const foreignSession = await createSession(userForeign.id);

  console.log(`  ✓ Created test fixtures: Workspace A (${workspaceA.id}) with 4 squad members, Project Alpha, and Workspace B (${workspaceB.id})\n`);

  // 2. GET /api/team/members Tests
  console.log("--- 2. Team Members Read (GET) Verification ---");

  {
    // Test 2.1: Unauthenticated request returns 401
    const unauthReq = new NextRequest(`http://localhost:3000/api/team/members?workspaceId=${workspaceA.id}`, {
      method: "GET",
    });
    const unauthRes = await getTeamMembers(unauthReq);
    assert(unauthRes.status === 401, "GET /api/team/members rejects unauthenticated request (401)");

    // Test 2.2: Authenticated request returns all workspace members with enriched project data
    const authReq = new NextRequest(`http://localhost:3000/api/team/members?workspaceId=${workspaceA.id}`, {
      method: "GET",
      headers: {
        "x-synplan-session-token": ownerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const authRes = await getTeamMembers(authReq);
    assert(authRes.status === 200, "GET /api/team/members succeeds for authenticated workspace member (200)");

    const body = await authRes.json();
    assert(body.success === true && Array.isArray(body.data), "GET /api/team/members returns success payload with array");
    assert(body.data.length === 4, "GET /api/team/members returns exactly the 4 squad members of Workspace A");

    // Test 2.3: Verify enriched member payload structure
    const enrichedMember = body.data.find((m: any) => m.userId === userMember.id);
    assert(Boolean(enrichedMember), "Found regular member in GET /api/team/members response");
    assert(enrichedMember.activeTaskCount === 1, "Enriched member has accurate activeTaskCount (1 active task)", `Got ${enrichedMember.activeTaskCount}`);
    assert(enrichedMember.completedTaskCount === 1, "Enriched member has accurate completedTaskCount (1 completed task)", `Got ${enrichedMember.completedTaskCount}`);
    assert(enrichedMember.totalAssignedCount === 2, "Enriched member has accurate totalAssignedCount (2 total tasks)", `Got ${enrichedMember.totalAssignedCount}`);
    assert(Array.isArray(enrichedMember.projects) && enrichedMember.projects.length === 1, "Enriched member has associated workspace projects array");
    assert(enrichedMember.projects[0].name === projectAlpha.name, "Enriched member project item contains correct project name");
    assert(typeof enrichedMember.workloadScore === "number", "Enriched member has calculated workloadScore");
    assert(["OPTIMAL", "HIGH", "OVERLOADED"].includes(enrichedMember.capacityStatus), "Enriched member has valid capacityStatus enum");
  }

  // 3. POST /api/team/members (Invite Member) Tests
  console.log("\n--- 3. Team Member Invitation (POST) & RBAC Enforcement ---");

  {
    // Test 3.1: Admin invites a new user with role MEMBER
    const inviteEmail = `invited-${runId}@synplan.test`;
    const inviteReq = new NextRequest(`http://localhost:3000/api/team/members`, {
      method: "POST",
      headers: {
        "x-synplan-session-token": adminSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
      body: JSON.stringify({
        email: inviteEmail,
        name: `Invited Member ${runId}`,
        role: "MEMBER",
        workspaceId: workspaceA.id,
      }),
    });

    const inviteRes = await inviteTeamMember(inviteReq);
    assert(inviteRes.status === 201, "Admin can invite new user with MEMBER role (201)");
    const inviteBody = await inviteRes.json();
    const returnedEmail = inviteBody.data?.user?.email || inviteBody.data?.email;
    assert(inviteBody.success === true && returnedEmail === inviteEmail, "Invite response returns newly created/attached squad member");

    // Test 3.2: Verify in-app Notification was created
    const createdUser = await prisma.user.findUnique({ where: { email: inviteEmail } });
    assert(Boolean(createdUser), "Invited user record exists in database");

    const notification = await prisma.notification.findFirst({
      where: { userId: createdUser!.id, type: "TEAM_MEMBER_ADDED" },
    });
    assert(Boolean(notification), "In-app notification created for invited member");

    // Test 3.3: Verify AuditLog entry
    const auditLog = await prisma.auditLog.findFirst({
      where: { workspaceId: workspaceA.id, action: "MEMBER_INVITED" },
      orderBy: { timestamp: "desc" },
    });
    assert(Boolean(auditLog), "Authoritative AuditLog entry generated for MEMBER_INVITED");
    assert(auditLog?.actorId === userAdmin.id, "AuditLog accurately records admin as the actor");

    // Test 3.4: Duplicate invite returns 409 Conflict
    const dupReq = new NextRequest(`http://localhost:3000/api/team/members`, {
      method: "POST",
      headers: {
        "x-synplan-session-token": adminSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
      body: JSON.stringify({
        name: `Invited Member ${runId}`,
        email: inviteEmail,
        role: "MEMBER",
        workspaceId: workspaceA.id,
      }),
    });
    const dupRes = await inviteTeamMember(dupReq);
    assert(dupRes.status === 409, "Duplicate invitation returns 409 Conflict");

    // Test 3.5: Privilege escalation: Admin attempting to invite with ADMIN or OWNER role returns 403
    const escalateReq = new NextRequest(`http://localhost:3000/api/team/members`, {
      method: "POST",
      headers: {
        "x-synplan-session-token": adminSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
      body: JSON.stringify({
        name: `Escalate Member ${runId}`,
        email: `escalate-${runId}@synplan.test`,
        role: "ADMIN",
        workspaceId: workspaceA.id,
      }),
    });
    const escalateRes = await inviteTeamMember(escalateReq);
    assert(escalateRes.status === 403, "Privilege escalation: Admin cannot invite another ADMIN (403 Forbidden)");

    // Test 3.6: Viewer attempting to invite member returns 403
    const viewerInviteReq = new NextRequest(`http://localhost:3000/api/team/members`, {
      method: "POST",
      headers: {
        "x-synplan-session-token": viewerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
      body: JSON.stringify({
        name: `Viewer Invited ${runId}`,
        email: `viewer-invite-${runId}@synplan.test`,
        role: "MEMBER",
        workspaceId: workspaceA.id,
      }),
    });
    const viewerInviteRes = await inviteTeamMember(viewerInviteReq);
    assert(viewerInviteRes.status === 403, "Viewer cannot invite members (403 Forbidden)");
  }

  // 4. Role Modification (PATCH & PUT) Tests
  console.log("\n--- 4. Role Modification (PATCH & PUT) & Protection Rules ---");

  {
    // Test 4.1: Owner can update MEMBER to VIEWER via PATCH
    const patchReq = new NextRequest(`http://localhost:3000/api/team/members`, {
      method: "PATCH",
      headers: {
        "x-synplan-session-token": ownerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
      body: JSON.stringify({
        memberId: memberRegular.id,
        role: "VIEWER",
        workspaceId: workspaceA.id,
      }),
    });
    const patchRes = await patchMemberRole(patchReq);
    assert(patchRes.status === 200, "Owner can modify member role via PATCH (200)");

    // Verify role update in DB
    const updatedMember = await prisma.workspaceMember.findUnique({ where: { id: memberRegular.id } });
    assert(updatedMember?.role === "VIEWER", "Database reflects updated role 'VIEWER'");

    // Test 4.2: Owner can update back to MEMBER via PUT
    const putReq = new NextRequest(`http://localhost:3000/api/team/members`, {
      method: "PUT",
      headers: {
        "x-synplan-session-token": ownerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
      body: JSON.stringify({
        memberId: memberRegular.id,
        role: "MEMBER",
        workspaceId: workspaceA.id,
      }),
    });
    const putRes = await putMemberRole(putReq);
    assert(putRes.status === 200, "Owner can modify member role via PUT (200)");

    // Test 4.3: Owner demotion protection (Attempt to demote Owner returns 403)
    const demoteOwnerReq = new NextRequest(`http://localhost:3000/api/team/members`, {
      method: "PATCH",
      headers: {
        "x-synplan-session-token": ownerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
      body: JSON.stringify({
        memberId: memberOwner.id,
        role: "ADMIN",
        workspaceId: workspaceA.id,
      }),
    });
    const demoteOwnerRes = await patchMemberRole(demoteOwnerReq);
    assert(demoteOwnerRes.status === 403, "Owner demotion is strictly forbidden (403 Forbidden)");

    // Test 4.4: Admin attempting to modify another Admin returns 403
    const adminModAdminReq = new NextRequest(`http://localhost:3000/api/team/members`, {
      method: "PATCH",
      headers: {
        "x-synplan-session-token": adminSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
      body: JSON.stringify({
        memberId: memberAdmin.id,
        role: "MEMBER",
        workspaceId: workspaceA.id,
      }),
    });
    const adminModAdminRes = await patchMemberRole(adminModAdminReq);
    assert(adminModAdminRes.status === 403, "Admin cannot demote or modify another Admin (403 Forbidden)");

    // Test 4.5: Admin attempting to promote Member to Admin returns 403
    const adminPromoteReq = new NextRequest(`http://localhost:3000/api/team/members`, {
      method: "PATCH",
      headers: {
        "x-synplan-session-token": adminSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
      body: JSON.stringify({
        memberId: memberRegular.id,
        role: "ADMIN",
        workspaceId: workspaceA.id,
      }),
    });
    const adminPromoteRes = await patchMemberRole(adminPromoteReq);
    assert(adminPromoteRes.status === 403, "Admin cannot promote a user to Admin (403 Forbidden)");

    // Test 4.6: Member or Viewer attempting to update roles returns 403
    const memberPatchReq = new NextRequest(`http://localhost:3000/api/team/members`, {
      method: "PATCH",
      headers: {
        "x-synplan-session-token": memberSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
      body: JSON.stringify({
        memberId: memberViewer.id,
        role: "MEMBER",
        workspaceId: workspaceA.id,
      }),
    });
    const memberPatchRes = await patchMemberRole(memberPatchReq);
    assert(memberPatchRes.status === 403, "Regular member cannot update squad roles (403 Forbidden)");
  }

  // 5. DELETE /api/team/members & Atomic Cleanup Tests
  console.log("\n--- 5. Member Removal (DELETE) & Atomic Transaction Integrity ---");

  {
    // Test 5.1: Attempt to remove Workspace Owner returns 403
    const deleteOwnerReq = new NextRequest(`http://localhost:3000/api/team/members?id=${memberOwner.id}`, {
      method: "DELETE",
      headers: {
        "x-synplan-session-token": ownerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const deleteOwnerRes = await deleteTeamMember(deleteOwnerReq);
    assert(deleteOwnerRes.status === 403, "Cannot remove workspace Owner (403 Forbidden)");

    // Test 5.2: Admin attempting to remove another Admin returns 403
    const adminDelAdminReq = new NextRequest(`http://localhost:3000/api/team/members?id=${memberAdmin.id}`, {
      method: "DELETE",
      headers: {
        "x-synplan-session-token": adminSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const adminDelAdminRes = await deleteTeamMember(adminDelAdminReq);
    assert(adminDelAdminRes.status === 403, "Admin cannot remove another Admin (403 Forbidden)");

    // Test 5.3: Viewer attempting to remove a member returns 403
    const viewerDelReq = new NextRequest(`http://localhost:3000/api/team/members?id=${memberRegular.id}`, {
      method: "DELETE",
      headers: {
        "x-synplan-session-token": viewerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const viewerDelRes = await deleteTeamMember(viewerDelReq);
    assert(viewerDelRes.status === 403, "Viewer cannot remove squad members (403 Forbidden)");

    // Test 5.4: Owner removes memberRegular with atomic task unassignment & project member cleanup
    const deleteReq = new NextRequest(`http://localhost:3000/api/team/members?id=${memberRegular.id}`, {
      method: "DELETE",
      headers: {
        "x-synplan-session-token": ownerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const deleteRes = await deleteTeamMember(deleteReq);
    assert(deleteRes.status === 200, "Owner successfully removes squad member (200 OK)");

    // Verify WorkspaceMember record is deleted
    const deletedWM = await prisma.workspaceMember.findUnique({ where: { id: memberRegular.id } });
    assert(deletedWM === null, "WorkspaceMember record was completely deleted from DB");

    // Verify tasks assigned to that user in this workspace are unassigned
    const assignedTasks = await prisma.task.findMany({
      where: { workspaceId: workspaceA.id, assigneeId: userMember.id },
    });
    assert(assignedTasks.length === 0, "All workspace tasks assigned to removed member were atomically unassigned (assigneeId = null)");

    // Verify ProjectMember record was removed
    const projMember = await prisma.projectMember.findFirst({
      where: { projectId: projectAlpha.id, userId: userMember.id },
    });
    assert(projMember === null, "ProjectMember record for removed user was atomically deleted");

    // Verify AuditLog record for MEMBER_REMOVED
    const removeAudit = await prisma.auditLog.findFirst({
      where: { workspaceId: workspaceA.id, action: "MEMBER_REMOVED" },
      orderBy: { timestamp: "desc" },
    });
    assert(Boolean(removeAudit), "Authoritative AuditLog entry generated for MEMBER_REMOVED");
  }

  // 6. Cross-Workspace Security Isolation Tests
  console.log("\n--- 6. Cross-Workspace Security Isolation Verification ---");

  {
    // Test 6.1: Foreign user from Workspace B attempting to read Workspace A members returns 403
    const crossGetReq = new NextRequest(`http://localhost:3000/api/team/members?workspaceId=${workspaceA.id}`, {
      method: "GET",
      headers: {
        "x-synplan-session-token": foreignSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const crossGetRes = await getTeamMembers(crossGetReq);
    assert(crossGetRes.status === 403, "Cross-workspace GET rejected with 403 Forbidden");

    // Test 6.2: Foreign user attempting to invite someone to Workspace A returns 403
    const crossInviteReq = new NextRequest(`http://localhost:3000/api/team/members`, {
      method: "POST",
      headers: {
        "x-synplan-session-token": foreignSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
      body: JSON.stringify({
        name: `Cross Member ${runId}`,
        email: `cross-invite-${runId}@synplan.test`,
        role: "MEMBER",
        workspaceId: workspaceA.id,
      }),
    });
    const crossInviteRes = await inviteTeamMember(crossInviteReq);
    assert(crossInviteRes.status === 403, "Cross-workspace invite rejected with 403 Forbidden");

    // Test 6.3: Foreign user attempting to delete a member from Workspace A returns 403
    const crossDeleteReq = new NextRequest(`http://localhost:3000/api/team/members?id=${memberAdmin.id}`, {
      method: "DELETE",
      headers: {
        "x-synplan-session-token": foreignSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const crossDeleteRes = await deleteTeamMember(crossDeleteReq);
    assert(crossDeleteRes.status === 403, "Cross-workspace delete rejected with 403 Forbidden");
  }

  // Cleanup fixtures
  console.log("\n--- 7. Test Fixture Teardown ---");
  try {
    await prisma.task.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } });
    await prisma.projectMember.deleteMany({ where: { project: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } } });
    await prisma.project.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } });
    await prisma.notification.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } });
    await prisma.auditLog.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } });
    await prisma.session.deleteMany({
      where: { userId: { in: [userOwner.id, userAdmin.id, userMember.id, userViewer.id, userForeign.id] } },
    });
    await prisma.workspaceMember.deleteMany({ where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceA.id, workspaceB.id] } } });
    await prisma.user.deleteMany({
      where: { id: { in: [userOwner.id, userAdmin.id, userMember.id, userViewer.id, userForeign.id] } },
    });
    console.log("  ✓ Isolated test fixtures cleaned up successfully.");
  } catch (err) {
    console.warn("  Warning during cleanup:", err);
  }

  console.log("\n===============================================================");
  console.log(` PHASE 6I TEAM & PEOPLE WORKSPACE TEST RESULTS:`);
  console.log(` PASSED: ${passed} | FAILED: ${failed}`);
  console.log("===============================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase6iTeamTests().catch((err) => {
  console.error("FATAL ERROR running Phase 6I tests:", err);
  process.exit(1);
});
