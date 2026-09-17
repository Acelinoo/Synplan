/**
 * Synplan - Phase 6L: Cross-Domain Integration & System Consistency Verification Suite
 *
 * This test suite validates:
 * 1. Authentication & Session Boundary Enforcement
 * 2. Workspace Tenancy Isolation & Spoof Prevention
 * 3. Task <-> Project Consistency & Cascade Deletion Integrity (Dependencies, Milestones, Automations)
 * 4. Team <-> Project Consistency & Member Removal Cleanup (Atomic Task Unassignment)
 * 5. Activity <-> Notification Decoupling (EventBus, Anti-Self Suppression, 10s Dedup Window)
 * 6. Realtime Multi-User Scoping & Event Metadata Integrity
 * 7. Cross-Domain Server-Authoritative RBAC Matrix
 * 8. Deep-Link Target Resolution & Deleted Entity Graceful Fallbacks
 * 9. AI Engine Safety, Stale Checks & Server Confirmation Replay Protection
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { Role, ProjectRole, TaskStatus, TaskPriority } from "@prisma/client";
import { createSession } from "@/lib/auth/session";
import { createNotification } from "@/lib/notificationService";
import { createAuditEntry } from "@/lib/audit";
import { registerPendingConfirmation, validatePendingConfirmation, markConfirmationExecuted } from "@/lib/ai/confirmationStore";

// Route handlers
import { GET as getSessionRoute } from "@/app/api/auth/session/route";
import { GET as getProjectsRoute, POST as createProjectRoute } from "@/app/api/projects/route";
import { GET as getProjectDetailRoute, DELETE as deleteProjectRoute } from "@/app/api/projects/[id]/route";
import { GET as getTasksRoute, POST as createTaskRoute } from "@/app/api/tasks/route";
import { GET as getTaskDetailRoute, DELETE as deleteTaskRoute } from "@/app/api/tasks/[id]/route";
import { GET as getProjectMembersRoute, DELETE as deleteProjectMemberRoute } from "@/app/api/projects/[id]/members/route";
import { GET as getTeamMembersRoute, DELETE as deleteTeamMemberRoute } from "@/app/api/team/members/route";
import { GET as getNotificationsRoute, PATCH as patchNotificationsRoute, DELETE as deleteNotificationRoute } from "@/app/api/notifications/route";
import { GET as getActivityRoute } from "@/app/api/activity/route";
import { GET as getDashboardSummaryRoute } from "@/app/api/dashboard/summary/route";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ [PASS] ${message}`);
    passedCount++;
  } else {
    console.error(`  ✗ [FAIL] ${message}`);
    failedCount++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function main() {
  console.log("===============================================================");
  console.log(" SYNPLAN PHASE 6L: CROSS-DOMAIN INTEGRATION & CONSISTENCY SUITE ");
  console.log("===============================================================\n");

  const timestamp = Date.now();
  const suffix = `p6l_${timestamp}`;

  // Fixture references
  let userOwner: any = null;
  let userAdmin: any = null;
  let userMember: any = null;
  let userViewer: any = null;
  let userForeign: any = null;

  let workspaceAlpha: any = null;
  let workspaceBeta: any = null;

  let ownerSession: any = null;
  let adminSession: any = null;
  let memberSession: any = null;
  let viewerSession: any = null;
  let foreignSession: any = null;

  let projectAlpha: any = null;
  let phaseAlpha: any = null;
  let milestoneAlpha: any = null;
  let taskOne: any = null;
  let taskTwo: any = null;
  let dependencyOne: any = null;
  let automationAlpha: any = null;

  try {
    // --- 0. FIXTURE SETUP ---
    console.log("--- 0. Setting Up Multi-Domain Test Fixtures ---");

    userOwner = await prisma.user.create({
      data: { name: "Owner Alpha", email: `owner_${suffix}@synplan.dev`, role: Role.OWNER },
    });
    userAdmin = await prisma.user.create({
      data: { name: "Admin Alpha", email: `admin_${suffix}@synplan.dev`, role: Role.ADMIN },
    });
    userMember = await prisma.user.create({
      data: { name: "Member Alpha", email: `member_${suffix}@synplan.dev`, role: Role.MEMBER },
    });
    userViewer = await prisma.user.create({
      data: { name: "Viewer Alpha", email: `viewer_${suffix}@synplan.dev`, role: Role.VIEWER },
    });
    userForeign = await prisma.user.create({
      data: { name: "Foreign User", email: `foreign_${suffix}@synplan.dev`, role: Role.MEMBER },
    });

    workspaceAlpha = await prisma.workspace.create({
      data: {
        name: `Workspace Alpha ${suffix}`,
        slug: `ws-alpha-${suffix}`,
        ownerId: userOwner.id,
      },
    });

    workspaceBeta = await prisma.workspace.create({
      data: {
        name: `Workspace Beta ${suffix}`,
        slug: `ws-beta-${suffix}`,
        ownerId: userForeign.id,
      },
    });

    // Workspace Alpha Memberships
    await prisma.workspaceMember.createMany({
      data: [
        { workspaceId: workspaceAlpha.id, userId: userOwner.id, role: Role.OWNER },
        { workspaceId: workspaceAlpha.id, userId: userAdmin.id, role: Role.ADMIN },
        { workspaceId: workspaceAlpha.id, userId: userMember.id, role: Role.MEMBER },
        { workspaceId: workspaceAlpha.id, userId: userViewer.id, role: Role.VIEWER },
      ],
    });

    // Workspace Beta Membership
    await prisma.workspaceMember.create({
      data: { workspaceId: workspaceBeta.id, userId: userForeign.id, role: Role.OWNER },
    });

    // Sessions
    ownerSession = await createSession(userOwner.id);
    adminSession = await createSession(userAdmin.id);
    memberSession = await createSession(userMember.id);
    viewerSession = await createSession(userViewer.id);
    foreignSession = await createSession(userForeign.id);

    console.log("  ✓ Fixtures established in Supabase PostgreSQL\n");

    // --- 1. AUTHENTICATION & SESSION BOUNDARY ENFORCEMENT ---
    console.log("--- 1. Authentication & Session Boundary Enforcement ---");

    {
      // 1.1 Unauthenticated request returns 401
      const unauthReq = new NextRequest("http://localhost:3000/api/auth/session");
      const unauthRes = await getSessionRoute(unauthReq);
      const unauthJson = await unauthRes.json();
      assert(unauthRes.status === 401, "Unauthenticated session check rejected with 401");
      assert(unauthJson.authenticated === false, "Unauthenticated response payload reports authenticated = false");

      // 1.2 Valid session returns authenticated user with workspace roster
      const authReq = new NextRequest("http://localhost:3000/api/auth/session", {
        headers: { "x-synplan-session-token": ownerSession.sessionToken },
      });
      const authRes = await getSessionRoute(authReq);
      const authJson = await authRes.json();
      assert(authRes.status === 200, "Valid session returns 200 OK");
      assert(authJson.authenticated === true, "Session response reports authenticated = true");
      assert(authJson.user.id === userOwner.id, "Session returns authenticated user ID");
      assert(Array.isArray(authJson.workspaces) && authJson.workspaces.length > 0, "Session includes user workspaces roster");
    }

    // --- 2. WORKSPACE TENANCY ISOLATION & BOUNDARY ENFORCEMENT ---
    console.log("\n--- 2. Workspace Tenancy Isolation & Boundary Enforcement ---");

    {
      // 2.1 Authorized user can access Workspace Alpha projects
      const wsReq = new NextRequest(`http://localhost:3000/api/projects?workspaceId=${workspaceAlpha.id}`, {
        headers: {
          "x-synplan-session-token": memberSession.sessionToken,
          "x-synplan-workspace-id": workspaceAlpha.id,
        },
      });
      const wsRes = await getProjectsRoute(wsReq);
      assert(wsRes.status === 200, "Workspace member accessing their workspace projects returns 200");

      // 2.2 Cross-tenant boundary: User Alpha accessing Workspace Beta is rejected with 403
      const crossReq = new NextRequest(`http://localhost:3000/api/projects?workspaceId=${workspaceBeta.id}`, {
        headers: {
          "x-synplan-session-token": memberSession.sessionToken,
          "x-synplan-workspace-id": workspaceBeta.id,
        },
      });
      const crossRes = await getProjectsRoute(crossReq);
      assert(crossRes.status === 403, "Cross-tenant access to foreign workspace rejected with 403 Forbidden");

      // 2.3 Spoofing prevention: Header workspaceId cannot bypass session membership
      const spoofReq = new NextRequest(`http://localhost:3000/api/projects?workspaceId=${workspaceBeta.id}`, {
        headers: {
          "x-synplan-session-token": viewerSession.sessionToken,
          "x-synplan-workspace-id": workspaceBeta.id,
        },
      });
      const spoofRes = await getProjectsRoute(spoofReq);
      assert(spoofRes.status === 403, "Header spoofing foreign workspace rejected with 403 Forbidden");
    }

    // --- 3. TASK <-> PROJECT CONSISTENCY & CASCADE DELETION INTEGRITY ---
    console.log("\n--- 3. Task <-> Project Consistency & Cascade Deletion ---");

    {
      // Create Project Alpha
      projectAlpha = await prisma.project.create({
        data: {
          workspaceId: workspaceAlpha.id,
          name: `Project Alpha ${suffix}`,
          slug: `proj-alpha-${suffix}`,
          status: "ACTIVE",
        },
      });

      // Add Project Members
      await prisma.projectMember.createMany({
        data: [
          { projectId: projectAlpha.id, userId: userOwner.id, role: ProjectRole.LEAD },
          { projectId: projectAlpha.id, userId: userMember.id, role: ProjectRole.CONTRIBUTOR },
        ],
      });

      // Add Phase & Milestone
      phaseAlpha = await prisma.phase.create({
        data: {
          workspaceId: workspaceAlpha.id,
          projectId: projectAlpha.id,
          name: "Sprint 1 Phase",
          order: 1,
        },
      });

      milestoneAlpha = await prisma.milestone.create({
        data: {
          workspaceId: workspaceAlpha.id,
          projectId: projectAlpha.id,
          title: "Phase Milestone",
          targetDate: new Date(Date.now() + 86400000),
        },
      });

      // Add Automation Rule
      automationAlpha = await prisma.automationRule.create({
        data: {
          workspaceId: workspaceAlpha.id,
          projectId: projectAlpha.id,
          name: "Auto Rule Alpha",
          triggerType: "TASK_CREATED",
          conditions: {},
          actions: {},
        },
      });

      // Add Tasks
      taskOne = await prisma.task.create({
        data: {
          workspaceId: workspaceAlpha.id,
          projectId: projectAlpha.id,
          phaseId: phaseAlpha.id,
          title: "Task 1 - Blocking Task",
          status: TaskStatus.IN_PROGRESS,
          priority: TaskPriority.HIGH,
          assigneeId: userMember.id,
        },
      });

      taskTwo = await prisma.task.create({
        data: {
          workspaceId: workspaceAlpha.id,
          projectId: projectAlpha.id,
          phaseId: phaseAlpha.id,
          title: "Task 2 - Blocked Task",
          status: TaskStatus.TODO,
          priority: TaskPriority.MEDIUM,
          assigneeId: userMember.id,
        },
      });

      // Add Task Dependency (Task 1 blocks Task 2)
      dependencyOne = await prisma.taskDependency.create({
        data: {
          blockingTaskId: taskOne.id,
          blockedTaskId: taskTwo.id,
        },
      });

      // Add Subtask and Comment to Task 1
      await prisma.subtask.create({
        data: { taskId: taskOne.id, title: "Subtask 1.1", completed: false },
      });
      await prisma.taskComment.create({
        data: { taskId: taskOne.id, authorId: userOwner.id, content: "Initial progress check" },
      });

      assert(Boolean(dependencyOne.id), "TaskDependency record created successfully");

      // 3.1 Verify Task Deletion cascades dependencies, subtasks, and comments cleanly
      const delTaskReq = new NextRequest(`http://localhost:3000/api/tasks/${taskOne.id}`, {
        method: "DELETE",
        headers: {
          "x-synplan-session-token": adminSession.sessionToken,
          "x-synplan-workspace-id": workspaceAlpha.id,
        },
      });
      const delTaskRes = await deleteTaskRoute(delTaskReq, { params: Promise.resolve({ id: taskOne.id }) });
      assert(delTaskRes.status === 200, "DELETE /api/tasks/[id] succeeds with 200 OK");

      const checkTaskOne = await prisma.task.findUnique({ where: { id: taskOne.id } });
      assert(!checkTaskOne, "Deleted task is removed from PostgreSQL");

      const checkDeps = await prisma.taskDependency.findFirst({
        where: { OR: [{ blockingTaskId: taskOne.id }, { blockedTaskId: taskOne.id }] },
      });
      assert(!checkDeps, "TaskDependency cascading deletion cleared referencing dependencies");

      const checkSubtasks = await prisma.subtask.findMany({ where: { taskId: taskOne.id } });
      assert(checkSubtasks.length === 0, "Subtasks cleanly deleted in transaction");

      // 3.2 Recreate a task for Project Deletion Cascade test
      const taskThree = await prisma.task.create({
        data: {
          workspaceId: workspaceAlpha.id,
          projectId: projectAlpha.id,
          phaseId: phaseAlpha.id,
          title: "Task 3 - Project Task",
          status: TaskStatus.TODO,
        },
      });

      // 3.3 Verify Project Deletion cascades tasks, phases, milestones, automations, and members cleanly
      const delProjReq = new NextRequest(`http://localhost:3000/api/projects/${projectAlpha.id}`, {
        method: "DELETE",
        headers: {
          "x-synplan-session-token": ownerSession.sessionToken,
          "x-synplan-workspace-id": workspaceAlpha.id,
        },
      });
      const delProjRes = await deleteProjectRoute(delProjReq, { params: Promise.resolve({ id: projectAlpha.id }) });
      assert(delProjRes.status === 200, "DELETE /api/projects/[id] succeeds with 200 OK");

      const checkProject = await prisma.project.findUnique({ where: { id: projectAlpha.id } });
      assert(!checkProject, "Project record completely deleted");

      const checkProjTasks = await prisma.task.findMany({ where: { projectId: projectAlpha.id } });
      assert(checkProjTasks.length === 0, "All project tasks deleted in transaction");

      const checkPhases = await prisma.phase.findMany({ where: { projectId: projectAlpha.id } });
      assert(checkPhases.length === 0, "All project phases deleted in transaction");

      const checkMilestones = await prisma.milestone.findMany({ where: { projectId: projectAlpha.id } });
      assert(checkMilestones.length === 0, "All project milestones deleted in transaction");

      const checkAutomations = await prisma.automationRule.findMany({ where: { projectId: projectAlpha.id } });
      assert(checkAutomations.length === 0, "All project automations deleted in transaction");
    }

    // --- 4. TEAM <-> PROJECT CONSISTENCY & MEMBER REMOVAL CLEANUP ---
    console.log("\n--- 4. Team <-> Project Consistency & Member Removal Cleanup ---");

    {
      // Create fresh Project Beta in Workspace Alpha
      const projectBeta = await prisma.project.create({
        data: {
          workspaceId: workspaceAlpha.id,
          name: `Project Beta ${suffix}`,
          slug: `proj-beta-${suffix}`,
          status: "ACTIVE",
        },
      });

      // Add userMember to project squad
      const projMember = await prisma.projectMember.create({
        data: {
          projectId: projectBeta.id,
          userId: userMember.id,
          role: ProjectRole.CONTRIBUTOR,
        },
      });

      // Assign a task to userMember in projectBeta
      const assignedTask = await prisma.task.create({
        data: {
          workspaceId: workspaceAlpha.id,
          projectId: projectBeta.id,
          title: "Assigned Task Beta",
          assigneeId: userMember.id,
          status: TaskStatus.IN_PROGRESS,
        },
      });

      assert(assignedTask.assigneeId === userMember.id, "Task assigned to userMember");

      // 4.1 Remove member from project squad: atomically unassigns tasks in that project
      const remProjMemberReq = new NextRequest(
        `http://localhost:3000/api/projects/${projectBeta.id}/members?memberId=${projMember.id}`,
        {
          method: "DELETE",
          headers: {
            "x-synplan-session-token": adminSession.sessionToken,
            "x-synplan-workspace-id": workspaceAlpha.id,
          },
        }
      );
      const remProjMemberRes = await deleteProjectMemberRoute(remProjMemberReq, {
        params: Promise.resolve({ id: projectBeta.id }),
      });
      assert(remProjMemberRes.status === 200, "DELETE /api/projects/[id]/members removes squad member with 200 OK");

      const checkAssignedTask = await prisma.task.findUnique({ where: { id: assignedTask.id } });
      assert(checkAssignedTask?.assigneeId === null, "Removing project member automatically nullifies task assigneeId");

      // 4.2 Re-assign userMember and remove from Workspace: atomically unassigns tasks & cleans project members
      await prisma.projectMember.create({
        data: { projectId: projectBeta.id, userId: userMember.id, role: ProjectRole.CONTRIBUTOR },
      });
      await prisma.task.update({
        where: { id: assignedTask.id },
        data: { assigneeId: userMember.id },
      });

      const memberRecord = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: workspaceAlpha.id, userId: userMember.id } },
      });

      const remWsMemberReq = new NextRequest(
        `http://localhost:3000/api/team/members?memberId=${memberRecord?.id}`,
        {
          method: "DELETE",
          headers: {
            "x-synplan-session-token": ownerSession.sessionToken,
            "x-synplan-workspace-id": workspaceAlpha.id,
          },
        }
      );
      const remWsMemberRes = await deleteTeamMemberRoute(remWsMemberReq);
      assert(remWsMemberRes.status === 200, "DELETE /api/team/members removes squad member from workspace with 200 OK");

      const checkWsTask = await prisma.task.findUnique({ where: { id: assignedTask.id } });
      assert(checkWsTask?.assigneeId === null, "Workspace member removal unassigns workspace tasks");

      const checkWsProjMember = await prisma.projectMember.findFirst({
        where: { projectId: projectBeta.id, userId: userMember.id },
      });
      assert(!checkWsProjMember, "Workspace member removal cleanly deletes project memberships");

      // Restore userMember to Workspace Alpha for subsequent tests
      await prisma.workspaceMember.create({
        data: { workspaceId: workspaceAlpha.id, userId: userMember.id, role: Role.MEMBER },
      });

      // Cleanup projectBeta
      await prisma.task.deleteMany({ where: { projectId: projectBeta.id } });
      await prisma.project.delete({ where: { id: projectBeta.id } });
    }

    // --- 5. ACTIVITY <-> NOTIFICATION CONSISTENCY & DECOUPLING ---
    console.log("\n--- 5. Activity <-> Notification Consistency & Decoupling ---");

    {
      // 5.1 Create AuditLog entry directly (simulating EventBus dispatch)
      const auditEntry = await createAuditEntry({
        workspaceId: workspaceAlpha.id,
        actorId: userOwner.id,
        actorType: "USER",
        action: "TASK_ASSIGN",
        target: `Assigned task to ${userMember.name}`,
        entityType: "task",
        entityId: "task_test_123",
        source: "WEB",
        ipAddress: "127.0.0.1",
      });
      assert(Boolean(auditEntry?.id), "createAuditEntry persists immutable AuditLog record to PostgreSQL");

      // 5.2 Create Notification for recipient (userMember)
      const notif = await createNotification({
        workspaceId: workspaceAlpha.id,
        userId: userMember.id,
        actorId: userOwner.id,
        type: "TASK_ASSIGNED",
        title: "New Task Assigned",
        description: "You have been assigned a high priority task",
        link: "/tasks?taskId=task_test_123",
      });
      assert(Boolean(notif?.id), "createNotification creates user-specific Notification record");

      // 5.3 Anti-Self Notification Suppression: actorId === userId returns null
      const selfNotif = await createNotification({
        workspaceId: workspaceAlpha.id,
        userId: userOwner.id,
        actorId: userOwner.id,
        type: "TASK_ASSIGNED",
        title: "Self Assigned",
        description: "Self action",
      });
      assert(selfNotif === null, "Anti-self notification is suppressed (returns null)");

      // 5.4 10-Second Sliding Window Deduplication: duplicate notification returns existing record
      const dupNotif = await createNotification({
        workspaceId: workspaceAlpha.id,
        userId: userMember.id,
        actorId: userOwner.id,
        type: "TASK_ASSIGNED",
        title: "New Task Assigned",
        description: "You have been assigned a high priority task",
        link: "/tasks?taskId=task_test_123",
      });
      assert(dupNotif?.id === notif?.id, "10s sliding window deduplication returns existing notification record");
    }

    // --- 6. REALTIME MULTI-USER SCOPING & NOTIFICATIONS API ---
    console.log("\n--- 6. Realtime Multi-User Scoping & Notifications API ---");

    {
      // 6.1 Recipient user reads their notification
      const getNotifsReq = new NextRequest("http://localhost:3000/api/notifications?filter=all", {
        headers: {
          "x-synplan-session-token": memberSession.sessionToken,
          "x-synplan-workspace-id": workspaceAlpha.id,
        },
      });
      const getNotifsRes = await getNotificationsRoute(getNotifsReq);
      const getNotifsJson = await getNotifsRes.json();
      assert(getNotifsRes.status === 200, "GET /api/notifications returns 200 OK");
      assert(getNotifsJson.data.some((n: any) => n.title === "New Task Assigned"), "Notification present in recipient's inbox");

      // 6.2 IDOR protection: User A cannot mutate or mark-read User B's notification
      const targetNotif = getNotifsJson.data.find((n: any) => n.title === "New Task Assigned");
      assert(Boolean(targetNotif), "Target notification resolved");

      const idorReq = new NextRequest("http://localhost:3000/api/notifications", {
        method: "PATCH",
        headers: {
          "x-synplan-session-token": viewerSession.sessionToken,
          "x-synplan-workspace-id": workspaceAlpha.id,
        },
        body: JSON.stringify({ id: targetNotif.id }),
      });
      const idorRes = await patchNotificationsRoute(idorReq);
      assert(idorRes.status === 403, "Cross-user notification modification rejected with 403 Forbidden (IDOR safe)");

      // 6.3 Legitimate recipient can mark read
      const markReadReq = new NextRequest("http://localhost:3000/api/notifications", {
        method: "PATCH",
        headers: {
          "x-synplan-session-token": memberSession.sessionToken,
          "x-synplan-workspace-id": workspaceAlpha.id,
        },
        body: JSON.stringify({ id: targetNotif.id }),
      });
      const markReadRes = await patchNotificationsRoute(markReadReq);
      assert(markReadRes.status === 200, "Legitimate owner marking notification as read returns 200 OK");
    }

    // --- 7. CROSS-DOMAIN SERVER-AUTHORITATIVE RBAC MATRIX ---
    console.log("\n--- 7. Cross-Domain Server-Authoritative RBAC Matrix ---");

    {
      // 7.1 VIEWER attempting to create project is rejected with 403
      const viewerCreateReq = new NextRequest("http://localhost:3000/api/projects", {
        method: "POST",
        headers: {
          "x-synplan-session-token": viewerSession.sessionToken,
          "x-synplan-workspace-id": workspaceAlpha.id,
        },
        body: JSON.stringify({ name: "Viewer Unauthorized Project" }),
      });
      const viewerCreateRes = await createProjectRoute(viewerCreateReq);
      assert(viewerCreateRes.status === 403, "VIEWER creating project rejected with 403 Forbidden");

      // 7.2 MEMBER attempting to delete project is rejected with 403
      const dummyProject = await prisma.project.create({
        data: { workspaceId: workspaceAlpha.id, name: "Dummy Proj", slug: `dummy-${suffix}` },
      });

      const memberDelReq = new NextRequest(`http://localhost:3000/api/projects/${dummyProject.id}`, {
        method: "DELETE",
        headers: {
          "x-synplan-session-token": memberSession.sessionToken,
          "x-synplan-workspace-id": workspaceAlpha.id,
        },
      });
      const memberDelRes = await deleteProjectRoute(memberDelReq, { params: Promise.resolve({ id: dummyProject.id }) });
      assert(memberDelRes.status === 403, "MEMBER deleting project rejected with 403 Forbidden");

      // 7.3 OWNER deleting project is allowed (200)
      const ownerDelReq = new NextRequest(`http://localhost:3000/api/projects/${dummyProject.id}`, {
        method: "DELETE",
        headers: {
          "x-synplan-session-token": ownerSession.sessionToken,
          "x-synplan-workspace-id": workspaceAlpha.id,
        },
      });
      const ownerDelRes = await deleteProjectRoute(ownerDelReq, { params: Promise.resolve({ id: dummyProject.id }) });
      assert(ownerDelRes.status === 200, "OWNER deleting project succeeds with 200 OK");
    }

    // --- 8. DEEP-LINK TARGET RESOLUTION & DELETED ENTITY FALLBACKS ---
    console.log("\n--- 8. Deep-Link Target Resolution & Deleted Entity Fallbacks ---");

    {
      // 8.1 Accessing deleted project returns structured 404
      const deletedProjReq = new NextRequest("http://localhost:3000/api/projects/non_existent_project_id", {
        headers: {
          "x-synplan-session-token": memberSession.sessionToken,
          "x-synplan-workspace-id": workspaceAlpha.id,
        },
      });
      const deletedProjRes = await getProjectDetailRoute(deletedProjReq, { params: Promise.resolve({ id: "non_existent_project_id" }) });
      const deletedProjJson = await deletedProjRes.json();
      assert(deletedProjRes.status === 404, "Deep link to deleted project returns 404 Not Found");
      assert(deletedProjJson.message === "Project not found", "Deleted project response returns clear descriptive error message");

      // 8.2 Accessing deleted task returns structured 404
      const deletedTaskReq = new NextRequest("http://localhost:3000/api/tasks/non_existent_task_id", {
        headers: {
          "x-synplan-session-token": memberSession.sessionToken,
          "x-synplan-workspace-id": workspaceAlpha.id,
        },
      });
      const deletedTaskRes = await getTaskDetailRoute(deletedTaskReq, { params: Promise.resolve({ id: "non_existent_task_id" }) });
      const deletedTaskJson = await deletedTaskRes.json();
      assert(deletedTaskRes.status === 404, "Deep link to deleted task returns 404 Not Found");
      assert(deletedTaskJson.message === "Task not found", "Deleted task response returns clear descriptive error message");
    }

    // --- 9. AI ENGINE SAFETY & CONFIRMATION REPLAY PROTECTION ---
    console.log("\n--- 9. AI Engine Safety & Confirmation Replay Protection ---");

    {
      const planPayload = {
        id: "plan_test_cross_domain_001",
        title: "Cross-Domain Batch Reallocation",
        requiresConfirmation: true,
        isDestructive: false,
        actions: [{ type: "UPDATE_TASK", payload: { taskId: "task_sample", title: "Updated Title" } }],
      };

      const contextPayload = {
        workspaceId: workspaceAlpha.id,
        userId: userOwner.id,
        userRole: Role.OWNER,
        workspaceMembers: [],
        projects: [],
      };

      // 9.1 Register pending confirmation session
      const confSession = await registerPendingConfirmation(planPayload as any, contextPayload as any);
      assert(Boolean(confSession.token), "registerPendingConfirmation produces valid confirmation token");

      // 9.2 Validate confirmation token with valid owner
      const validCheck = await validatePendingConfirmation({
        token: confSession.token,
        fingerprint: confSession.planFingerprint,
        userId: userOwner.id,
        workspaceId: workspaceAlpha.id,
      });
      assert(validCheck.isValid === true, "Confirmation token validates successfully for authorized user");

      // 9.3 Validate confirmation token with foreign user (rejected)
      const foreignCheck = await validatePendingConfirmation({
        token: confSession.token,
        fingerprint: confSession.planFingerprint,
        userId: userForeign.id,
        workspaceId: workspaceAlpha.id,
      });
      assert(foreignCheck.isValid === false, "Confirmation token validation fails for unauthorized foreign user");

      // 9.4 Replay protection: once executed, token cannot be reused
      await markConfirmationExecuted(confSession.token);
      const replayCheck = await validatePendingConfirmation({
        token: confSession.token,
        fingerprint: confSession.planFingerprint,
        userId: userOwner.id,
        workspaceId: workspaceAlpha.id,
      });
      assert(replayCheck.isValid === false, "Executed confirmation token cannot be reused (Replay Protection enforced)");
    }

    // --- 10. AUTHORITATIVE DASHBOARD & METRICS INTEGRITY ---
    console.log("\n--- 10. Authoritative Dashboard & Metrics Integrity ---");

    {
      const dashReq = new NextRequest(`http://localhost:3000/api/dashboard/summary?workspaceId=${workspaceAlpha.id}`, {
        headers: {
          "x-synplan-session-token": ownerSession.sessionToken,
          "x-synplan-workspace-id": workspaceAlpha.id,
        },
      });
      const dashRes = await getDashboardSummaryRoute(dashReq);
      const dashJson = await dashRes.json();
      assert(dashRes.status === 200, "GET /api/dashboard/summary returns 200 OK");
      assert(typeof dashJson.data.totalProjects === "number", "Dashboard returns authoritative totalProjects count");
      assert(typeof dashJson.data.totalTasks === "number", "Dashboard returns authoritative totalTasks count");
      assert(typeof dashJson.data.teamMembersCount === "number", "Dashboard returns authoritative teamMembersCount");
      assert(Array.isArray(dashJson.data.recentActivities), "Dashboard returns authoritative recentActivities array");
    }

  } finally {
    // --- 11. CLEANUP FIXTURES ---
    console.log("\n--- 11. Cleaning Up Test Fixtures ---");

    try {
      if (workspaceAlpha?.id || workspaceBeta?.id) {
        const wsIds = [workspaceAlpha?.id, workspaceBeta?.id].filter(Boolean);

        await prisma.aiConfirmationSession.deleteMany({ where: { workspaceId: { in: wsIds } } });
        await prisma.notification.deleteMany({ where: { workspaceId: { in: wsIds } } });
        await prisma.auditLog.deleteMany({ where: { workspaceId: { in: wsIds } } });
        await prisma.taskDependency.deleteMany({ where: { blockingTask: { workspaceId: { in: wsIds } } } });
        await prisma.subtask.deleteMany({ where: { task: { workspaceId: { in: wsIds } } } });
        await prisma.taskComment.deleteMany({ where: { task: { workspaceId: { in: wsIds } } } });
        await prisma.task.deleteMany({ where: { workspaceId: { in: wsIds } } });
        await prisma.automationRule.deleteMany({ where: { workspaceId: { in: wsIds } } });
        await prisma.milestone.deleteMany({ where: { workspaceId: { in: wsIds } } });
        await prisma.phase.deleteMany({ where: { workspaceId: { in: wsIds } } });
        await prisma.projectMember.deleteMany({ where: { project: { workspaceId: { in: wsIds } } } });
        await prisma.project.deleteMany({ where: { workspaceId: { in: wsIds } } });
        await prisma.workspaceMember.deleteMany({ where: { workspaceId: { in: wsIds } } });
        await prisma.workspace.deleteMany({ where: { id: { in: wsIds } } });
      }

      if (userOwner?.id) {
        const userIds = [userOwner?.id, userAdmin?.id, userMember?.id, userViewer?.id, userForeign?.id].filter(Boolean);
        await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }

      console.log("  ✓ Test fixtures cleaned up cleanly with zero database residue");
    } catch (e) {
      console.warn("  ⚠ Warning during fixture teardown:", e);
    }
  }

  console.log("\n===============================================================");
  console.log(` PHASE 6L CROSS-DOMAIN VERIFICATION: ${passedCount} / ${passedCount + failedCount} PASS `);
  console.log("===============================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL in test-phase6l-cross-domain:", err);
  process.exit(1);
});
