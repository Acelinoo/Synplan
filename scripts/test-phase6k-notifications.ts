import { prisma } from "../src/lib/prisma";
import { NextRequest } from "next/server";
import {
  GET as getNotifications,
  PATCH as patchNotifications,
  DELETE as deleteNotification,
} from "../src/app/api/notifications/route";
import { POST as addProjectMember, PATCH as patchProjectMemberRole } from "../src/app/api/projects/[id]/members/route";
import { createNotification } from "../src/lib/notificationService";
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

async function runPhase6kNotificationTests() {
  console.log("===============================================================");
  console.log(" SYNPLAN PHASE 6K: NOTIFICATIONS & USER NOTIFICATION CENTER");
  console.log(" AUTHORITATIVE RBAC, IDOR GUARDS, & REALTIME ISOLATION SUITE");
  console.log("===============================================================\n");

  const runId = Math.random().toString(36).substring(2, 7);

  // 1. Fixture Setup
  console.log("--- 1. Setting up Isolated Test Workspaces, Users & Sessions ---");

  const userOwner = await prisma.user.create({
    data: {
      name: `Owner 6K ${runId}`,
      email: `owner-6k-${runId}@synplan.test`,
      role: "OWNER",
    },
  });

  const userMember = await prisma.user.create({
    data: {
      name: `Member 6K ${runId}`,
      email: `member-6k-${runId}@synplan.test`,
      role: "MEMBER",
    },
  });

  const userForeign = await prisma.user.create({
    data: {
      name: `Foreign 6K ${runId}`,
      email: `foreign-6k-${runId}@synplan.test`,
      role: "OWNER",
    },
  });

  const workspaceA = await prisma.workspace.create({
    data: {
      name: `Workspace Alpha 6K ${runId}`,
      slug: `ws-alpha-6k-${runId}`,
      ownerId: userOwner.id,
    },
  });

  const workspaceB = await prisma.workspace.create({
    data: {
      name: `Workspace Beta 6K ${runId}`,
      slug: `ws-beta-6k-${runId}`,
      ownerId: userForeign.id,
    },
  });

  await prisma.workspaceMember.createMany({
    data: [
      { workspaceId: workspaceA.id, userId: userOwner.id, role: "OWNER" },
      { workspaceId: workspaceA.id, userId: userMember.id, role: "MEMBER" },
      { workspaceId: workspaceB.id, userId: userForeign.id, role: "OWNER" },
    ],
  });

  const projectAlpha = await prisma.project.create({
    data: {
      name: `Project Alpha 6K ${runId}`,
      slug: `proj-alpha-6k-${runId}`,
      workspaceId: workspaceA.id,
      color: "#0284C7",
      status: "ACTIVE",
    },
  });

  const ownerSession = await createSession(userOwner.id);
  const memberSession = await createSession(userMember.id);
  const foreignSession = await createSession(userForeign.id);

  console.log(`  ✓ Created test fixtures: Workspace A (${workspaceA.id}), Workspace B (${workspaceB.id})\n`);

  // 2. Authentication Rejection Tests
  console.log("--- 2. Unauthenticated Access Rejection (401 Unauthorized) ---");
  {
    const reqGet = new NextRequest("http://localhost:3000/api/notifications");
    const resGet = await getNotifications(reqGet);
    assert(resGet.status === 401, "GET /api/notifications rejects unauthenticated request (401)");

    const reqPatch = new NextRequest("http://localhost:3000/api/notifications", {
      method: "PATCH",
      body: JSON.stringify({ markAll: true }),
    });
    const resPatch = await patchNotifications(reqPatch);
    assert(resPatch.status === 401, "PATCH /api/notifications rejects unauthenticated request (401)");

    const reqDelete = new NextRequest("http://localhost:3000/api/notifications?id=notif_dummy", {
      method: "DELETE",
    });
    const resDelete = await deleteNotification(reqDelete);
    assert(resDelete.status === 401, "DELETE /api/notifications rejects unauthenticated request (401)");
  }

  // 3. User-Scoped Retrieval & Isolation Tests
  console.log("\n--- 3. User-Scoped Notification Retrieval & Filtering ---");
  let notifOwner1: any;
  let notifOwner2: any;
  let notifMember1: any;
  let notifForeign1: any;

  {
    // Create notifications for Owner in Workspace A
    notifOwner1 = await prisma.notification.create({
      data: {
        workspaceId: workspaceA.id,
        userId: userOwner.id,
        title: "Sprint Planning Assigned",
        description: "You were assigned to review sprint deliverables.",
        type: "TASK_ASSIGNED",
        link: "/tasks?taskId=task_test_01",
        read: false,
      },
    });

    notifOwner2 = await prisma.notification.create({
      data: {
        workspaceId: workspaceA.id,
        userId: userOwner.id,
        title: "Project Milestone Reached",
        description: "Alpha initiative has reached Milestone 1.",
        type: "PROJECT_UPDATED",
        link: `/projects/${projectAlpha.id}`,
        read: true,
      },
    });

    // Create notification for Member in Workspace A
    notifMember1 = await prisma.notification.create({
      data: {
        workspaceId: workspaceA.id,
        userId: userMember.id,
        title: "New Team Task",
        description: "You have a new task assigned in Alpha.",
        type: "TASK_ASSIGNED",
        link: "/tasks?taskId=task_test_02",
        read: false,
      },
    });

    // Create notification for Foreign User in Workspace B
    notifForeign1 = await prisma.notification.create({
      data: {
        workspaceId: workspaceB.id,
        userId: userForeign.id,
        title: "Beta Workspace Welcome",
        description: "Welcome to Workspace Beta.",
        type: "SYSTEM",
        link: "/notifications",
        read: false,
      },
    });

    // User Owner fetches notifications
    const reqOwner = new NextRequest("http://localhost:3000/api/notifications", {
      headers: {
        "x-synplan-session-token": ownerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const resOwner = await getNotifications(reqOwner);
    assert(resOwner.status === 200, "GET /api/notifications returns 200 OK for authenticated user");

    const jsonOwner = await resOwner.json();
    assert(jsonOwner.success === true, "Response payload indicates success = true");
    assert(Array.isArray(jsonOwner.data) && jsonOwner.data.length === 2, "Owner retrieves exactly their 2 notifications");
    assert(jsonOwner.unreadCount === 1, "Owner unread count reflects exactly 1 unread notification");
    assert(
      jsonOwner.data.every((n: any) => n.userId === userOwner.id),
      "All returned notifications strictly belong to userOwner"
    );

    // Verify Member cannot see Owner's notifications
    const reqMember = new NextRequest("http://localhost:3000/api/notifications", {
      headers: {
        "x-synplan-session-token": memberSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const resMember = await getNotifications(reqMember);
    const jsonMember = await resMember.json();
    assert(jsonMember.data.length === 1, "Member retrieves exactly their 1 notification");
    assert(jsonMember.data[0].id === notifMember1.id, "Member retrieves their own task notification");
    assert(jsonMember.unreadCount === 1, "Member unread count is 1");

    // Test filter=unread
    const reqUnread = new NextRequest("http://localhost:3000/api/notifications?filter=unread", {
      headers: {
        "x-synplan-session-token": ownerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const resUnread = await getNotifications(reqUnread);
    const jsonUnread = await resUnread.json();
    assert(jsonUnread.data.length === 1, "filter=unread returns only unread notification");
    assert(jsonUnread.data[0].id === notifOwner1.id, "Returned unread item is notifOwner1");

    // Test filter=read
    const reqRead = new NextRequest("http://localhost:3000/api/notifications?filter=read", {
      headers: {
        "x-synplan-session-token": ownerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const resRead = await getNotifications(reqRead);
    const jsonRead = await resRead.json();
    assert(jsonRead.data.length === 1, "filter=read returns only read notification");
    assert(jsonRead.data[0].id === notifOwner2.id, "Returned read item is notifOwner2");
  }

  // 4. Authorization & IDOR Protection Tests
  console.log("\n--- 4. Authorization & IDOR Protection Tests ---");
  {
    // Test 4.1: Member attempts to mark Owner's notification as read -> REJECTED (403 Forbidden)
    const reqIdorPatch = new NextRequest("http://localhost:3000/api/notifications", {
      method: "PATCH",
      headers: {
        "x-synplan-session-token": memberSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
      body: JSON.stringify({ id: notifOwner1.id }),
    });
    const resIdorPatch = await patchNotifications(reqIdorPatch);
    assert(
      resIdorPatch.status === 403,
      "PATCH /api/notifications rejects modifying another user's notification (403 Forbidden)"
    );

    // Verify in database that Owner's notification remains unread
    const checkDbOwner1 = await prisma.notification.findUnique({
      where: { id: notifOwner1.id },
    });
    assert(checkDbOwner1?.read === false, "Database confirms Owner notification remained unread");

    // Test 4.2: Owner marks their own notification as read -> ALLOWED (200 OK)
    const reqOwnPatch = new NextRequest("http://localhost:3000/api/notifications", {
      method: "PATCH",
      headers: {
        "x-synplan-session-token": ownerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
      body: JSON.stringify({ id: notifOwner1.id }),
    });
    const resOwnPatch = await patchNotifications(reqOwnPatch);
    assert(resOwnPatch.status === 200, "PATCH /api/notifications allows marking own notification as read (200 OK)");

    const checkDbOwner1Updated = await prisma.notification.findUnique({
      where: { id: notifOwner1.id },
    });
    assert(checkDbOwner1Updated?.read === true, "Database confirms Owner notification is now marked as read");

    // Test 4.3: Member attempts to delete Owner's notification -> REJECTED (403 Forbidden)
    const reqIdorDelete = new NextRequest(`http://localhost:3000/api/notifications?id=${notifOwner2.id}`, {
      method: "DELETE",
      headers: {
        "x-synplan-session-token": memberSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const resIdorDelete = await deleteNotification(reqIdorDelete);
    assert(
      resIdorDelete.status === 403,
      "DELETE /api/notifications rejects deleting another user's notification (403 Forbidden)"
    );

    // Test 4.4: Owner deletes their own notification -> ALLOWED (200 OK)
    const reqOwnDelete = new NextRequest(`http://localhost:3000/api/notifications?id=${notifOwner2.id}`, {
      method: "DELETE",
      headers: {
        "x-synplan-session-token": ownerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const resOwnDelete = await deleteNotification(reqOwnDelete);
    assert(resOwnDelete.status === 200, "DELETE /api/notifications allows deleting own notification (200 OK)");

    const checkDeleted = await prisma.notification.findUnique({
      where: { id: notifOwner2.id },
    });
    assert(checkDeleted === null, "Database confirms Owner notification was deleted");
  }

  // 5. Cross-Workspace Security Isolation Tests
  console.log("\n--- 5. Cross-Workspace Security Isolation Tests ---");
  {
    // Foreign user in Workspace B attempts to GET notifications using Workspace A context
    const reqCrossGet = new NextRequest("http://localhost:3000/api/notifications", {
      headers: {
        "x-synplan-session-token": foreignSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const resCrossGet = await getNotifications(reqCrossGet);
    assert(
      resCrossGet.status === 403,
      "GET /api/notifications rejects foreign user accessing foreign workspace (403 Forbidden)"
    );

    // Foreign user in Workspace B queries their own workspace
    const reqForeignOwn = new NextRequest("http://localhost:3000/api/notifications", {
      headers: {
        "x-synplan-session-token": foreignSession.sessionToken,
        "x-synplan-workspace-id": workspaceB.id,
      },
    });
    const resForeignOwn = await getNotifications(reqForeignOwn);
    assert(resForeignOwn.status === 200, "GET /api/notifications allows foreign user in own workspace (200 OK)");
    const jsonForeignOwn = await resForeignOwn.json();
    assert(jsonForeignOwn.data.length === 1, "Foreign user receives only Workspace B notifications");
    assert(jsonForeignOwn.data[0].id === notifForeign1.id, "Foreign user receives notifForeign1");
  }

  // 6. Mark All As Read Tests
  console.log("\n--- 6. Mark All As Read Atomic Transition ---");
  {
    // Create 3 unread notifications for Member in Workspace A
    const m1 = await prisma.notification.create({
      data: {
        workspaceId: workspaceA.id,
        userId: userMember.id,
        title: "Sprint Task 1",
        description: "Task 1 unread",
        type: "TASK_ASSIGNED",
        read: false,
      },
    });
    const m2 = await prisma.notification.create({
      data: {
        workspaceId: workspaceA.id,
        userId: userMember.id,
        title: "Sprint Task 2",
        description: "Task 2 unread",
        type: "TASK_ASSIGNED",
        read: false,
      },
    });

    const reqMarkAll = new NextRequest("http://localhost:3000/api/notifications", {
      method: "PATCH",
      headers: {
        "x-synplan-session-token": memberSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
      body: JSON.stringify({ markAll: true }),
    });
    const resMarkAll = await patchNotifications(reqMarkAll);
    assert(resMarkAll.status === 200, "PATCH /api/notifications with markAll=true returns 200 OK");

    const memberUnreadCount = await prisma.notification.count({
      where: { userId: userMember.id, workspaceId: workspaceA.id, read: false },
    });
    assert(memberUnreadCount === 0, "All unread notifications for Member transitioned to read: true");
  }

  // 7. Domain Event Notification Creation & Anti-Self Notification Suppression
  console.log("\n--- 7. Domain Event Notification Creation & Suppression ---");
  {
    // 7.1 Notification creation on Project Squad Addition
    const addMemberReq = new NextRequest(`http://localhost:3000/api/projects/${projectAlpha.id}/members`, {
      method: "POST",
      headers: {
        "x-synplan-session-token": ownerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
      body: JSON.stringify({
        userId: userMember.id,
        role: "CONTRIBUTOR",
      }),
    });
    const addMemberRes = await addProjectMember(addMemberReq, {
      params: Promise.resolve({ id: projectAlpha.id }),
    });
    assert(addMemberRes.status === 201, "POST /api/projects/[id]/members successfully added member (201 Created)");

    // Verify notification was created for Member
    const notifSquad = await prisma.notification.findFirst({
      where: {
        userId: userMember.id,
        workspaceId: workspaceA.id,
        type: "PROJECT_MEMBER_ADDED",
      },
    });
    assert(notifSquad !== null, "Notification created in DB for added squad member");
    assert(notifSquad?.title === "Added to Project Squad", "Notification has correct squad title");
    assert(notifSquad?.link === `/projects/${projectAlpha.id}`, "Notification contains valid project deep link");

    // 7.2 Anti-Self Notification Suppression:
    // If an actor assigns a task or project to themselves, no notification should be dispatched
    const selfNotif = await createNotification({
      workspaceId: workspaceA.id,
      userId: userOwner.id,
      actorId: userOwner.id, // Self-action!
      type: "TASK_ASSIGNED",
      title: "Self Task",
      description: "Assigned by myself",
    });
    assert(selfNotif === null, "createNotification returns null when actorId === userId (Self Notification Suppressed)");
  }

  // 8. Deduplication & Idempotency Safeguards
  console.log("\n--- 8. Deduplication & Idempotency Safeguards ---");
  {
    const notifA = await createNotification({
      workspaceId: workspaceA.id,
      userId: userMember.id,
      actorId: userOwner.id,
      type: "TASK_STATUS_CHANGED",
      title: "Build Pipeline Ready",
      description: "The build pipeline has transitioned to testing.",
      link: "/tasks?taskId=task_pipeline_01",
    });
    assert(notifA !== null, "Initial notification created successfully");

    // Call createNotification again immediately with identical parameters
    const notifB = await createNotification({
      workspaceId: workspaceA.id,
      userId: userMember.id,
      actorId: userOwner.id,
      type: "TASK_STATUS_CHANGED",
      title: "Build Pipeline Ready",
      description: "The build pipeline has transitioned to testing.",
      link: "/tasks?taskId=task_pipeline_01",
    });

    assert(notifB !== null, "Deduplicated call returned notification object");
    assert(notifA?.id === notifB?.id, "Deduplication returned existing notification ID without duplicate DB row");

    const duplicateCount = await prisma.notification.count({
      where: {
        userId: userMember.id,
        workspaceId: workspaceA.id,
        title: "Build Pipeline Ready",
      },
    });
    assert(duplicateCount === 1, "Exactly 1 record persisted in database, zero duplicates");
  }

  // 9. Pagination & Cursor Stability
  console.log("\n--- 9. Pagination & Cursor Determinism ---");
  {
    // Clean prior notifications for userMember to test clean pagination sequence
    await prisma.notification.deleteMany({
      where: { userId: userMember.id },
    });

    // Create 4 distinct notifications with controlled timestamps
    const now = Date.now();
    for (let i = 1; i <= 4; i++) {
      await prisma.notification.create({
        data: {
          workspaceId: workspaceA.id,
          userId: userMember.id,
          title: `Pagination Test ${i}`,
          description: `Item sequence #${i}`,
          type: "SYSTEM",
          createdAt: new Date(now + i * 1000),
          read: false,
        },
      });
    }

    // Page 1: Limit 2
    const reqP1 = new NextRequest("http://localhost:3000/api/notifications?limit=2&page=1", {
      headers: {
        "x-synplan-session-token": memberSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const resP1 = await getNotifications(reqP1);
    const jsonP1 = await resP1.json();

    assert(jsonP1.data.length === 2, "Page 1 returns exactly 2 items");
    assert(jsonP1.pagination.hasMore === true, "Page 1 reports hasMore = true");
    assert(jsonP1.pagination.nextCursor !== null, "Page 1 provides valid nextCursor");

    const cursor = jsonP1.pagination.nextCursor;

    // Page 2 using cursor
    const reqP2 = new NextRequest(`http://localhost:3000/api/notifications?limit=2&cursor=${cursor}`, {
      headers: {
        "x-synplan-session-token": memberSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });
    const resP2 = await getNotifications(reqP2);
    const jsonP2 = await resP2.json();

    assert(jsonP2.data.length === 2, "Page 2 returns remaining 2 items");
    const p1Ids = jsonP1.data.map((n: any) => n.id);
    const p2Ids = jsonP2.data.map((n: any) => n.id);
    const hasOverlap = p1Ids.some((id: string) => p2Ids.includes(id));
    assert(!hasOverlap, "Zero overlap between Page 1 and Page 2 records (Cursor stability PASS)");
  }

  // 10. Fixture Teardown & Cleanup
  console.log("\n--- 10. Cleaning up Test Fixtures ---");
  await prisma.notification.deleteMany({
    where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } },
  });
  await prisma.auditLog.deleteMany({
    where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } },
  });
  await prisma.projectMember.deleteMany({
    where: { projectId: projectAlpha.id },
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
    where: { userId: { in: [userOwner.id, userMember.id, userForeign.id] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [userOwner.id, userMember.id, userForeign.id] } },
  });

  console.log("  ✓ Test fixtures cleaned up successfully.");

  console.log("\n===============================================================");
  console.log(` SYNPLAN PHASE 6K TEST SUITE COMPLETE: ${passed} PASSED / ${failed} FAILED`);
  console.log("===============================================================\n");
}

runPhase6kNotificationTests().catch((err) => {
  console.error("FATAL: Phase 6K test runner crashed:", err);
  process.exit(1);
});
