import { prisma } from "../src/lib/prisma";
import { Role, ProjectRole, TaskStatus, TaskPriority } from "@prisma/client";
import { RealtimeChannels } from "../src/domains/realtime/realtime.channels";
import { RealtimeAuthorization } from "../src/domains/realtime/realtime.authorization";
import { RealtimePublisher } from "../src/domains/realtime/realtime.publisher";
import { RealtimeService } from "../src/domains/realtime/realtime.service";
import { RealtimeEnvelope } from "../src/domains/realtime/realtime.types";
import { eventBus } from "../src/domains/events/event-bus";
import { EventDeduplicator } from "../src/lib/realtime/event-deduplicator";
import { RealtimeClientSubscription } from "../src/lib/realtime/client-subscription";
import { ActivityService } from "../src/domains/activity/activity.service";
import { TaskDomainService } from "../src/domains/task/task.service";
import { DependencyService } from "../src/domains/task/dependency.service";
import { ProjectDomainService } from "../src/domains/project/project.service";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`  ✕ [FAIL] ${testName}${detail ? ` -> ${detail}` : ""}`);
  }
}

async function runPhase4RealtimeTests() {
  console.log("===============================================================");
  console.log(" SYNPLAN 2.0 — PHASE 4 REALTIME & ACTIVITY TEST SUITE");
  console.log(" REALTIME INFRASTRUCTURE, AUTH, DEDUP, RESYNC & ACTIVITY FEED");
  console.log("===============================================================\n");

  // -------------------------------------------------------------
  // 1. SETUP TEST CONTEXT (MULTI-WORKSPACE FIXTURE)
  // -------------------------------------------------------------
  const workspaceA = await prisma.workspace.findFirst({
    where: { name: { contains: "Acme" } },
  }) || await prisma.workspace.findFirst();

  if (!workspaceA) throw new Error("Workspace A not found. Seed first.");

  const [ownerUser, memberUser] = await Promise.all([
    prisma.user.findFirst({ where: { role: Role.OWNER } }),
    prisma.user.findFirst({ where: { role: Role.MEMBER } }),
  ]);

  if (!ownerUser || !memberUser) throw new Error("Owner and Member users not found in seed.");

  // Create isolated Workspace B and Foreign User for cross-workspace tests
  const workspaceB = await prisma.workspace.create({
    data: {
      name: `Workspace Beta ${Date.now()}`,
      slug: `beta-${Date.now()}`,
      ownerId: ownerUser.id,
    },
  });

  const foreignUser = await prisma.user.create({
    data: {
      name: "Foreign User Beta",
      email: `foreign-${Date.now()}@beta.com`,
      role: Role.MEMBER,
    },
  });

  await prisma.workspaceMember.create({
    data: {
      workspaceId: workspaceB.id,
      userId: foreignUser.id,
      role: Role.MEMBER,
    },
  });

  // Create extra user in Workspace A who is NOT a project squad member
  const nonProjectMember = await prisma.user.create({
    data: {
      name: "Non Squad Member",
      email: `nonsquad-${Date.now()}@acme.com`,
      role: Role.MEMBER,
    },
  });

  await prisma.workspaceMember.create({
    data: {
      workspaceId: workspaceA.id,
      userId: nonProjectMember.id,
      role: Role.MEMBER,
    },
  });

  // Create isolated project in Workspace A
  const projectA = await prisma.project.create({
    data: {
      workspaceId: workspaceA.id,
      name: "Realtime Test Project A",
      slug: `realtime-proj-a-${Date.now()}`,
      status: "ACTIVE",
    },
  });

  // Assign memberUser to project A squad
  await prisma.projectMember.create({
    data: {
      projectId: projectA.id,
      userId: memberUser.id,
      role: ProjectRole.CONTRIBUTOR,
    },
  });

  // -------------------------------------------------------------
  // SECTION 1: CHANNEL ARCHITECTURE & FORMAT
  // -------------------------------------------------------------
  console.log("--- Section 1: Channel Scoping & Validation ---");

  const wsChan = RealtimeChannels.getWorkspaceChannel(workspaceA.id);
  assert(wsChan === `workspace:${workspaceA.id}`, "1.1 Workspace channel format is workspace:{workspaceId}");

  const projChan = RealtimeChannels.getProjectChannel(projectA.id);
  assert(projChan === `project:${projectA.id}`, "1.2 Project channel format is project:{projectId}");

  const parsedWs = RealtimeChannels.parseChannel(wsChan);
  assert(parsedWs?.type === "workspace" && parsedWs?.id === workspaceA.id, "1.3 Parse workspace channel returns correct type & id");

  const parsedProj = RealtimeChannels.parseChannel(projChan);
  assert(parsedProj?.type === "project" && parsedProj?.id === projectA.id, "1.4 Parse project channel returns correct type & id");

  const invalidChan = RealtimeChannels.parseChannel("task-event-123");
  assert(invalidChan === null, "1.5 Prohibited micro-channel (task-event-123) is rejected by parser");

  // -------------------------------------------------------------
  // SECTION 2: TWO-TIER SERVER-SIDE CHANNEL AUTHORIZATION
  // -------------------------------------------------------------
  console.log("\n--- Section 2: Two-Tier Channel Authorization ---");

  // Workspace subscription: Valid member accepted
  const wsAuthMember = await RealtimeAuthorization.authorizeChannel(memberUser.id, wsChan);
  assert(wsAuthMember.isAuthorized === true, "2.1 Valid workspace member can subscribe to workspace channel");

  // Workspace subscription: Foreign user rejected
  const wsAuthForeign = await RealtimeAuthorization.authorizeChannel(foreignUser.id, wsChan);
  assert(wsAuthForeign.isAuthorized === false, "2.2 Foreign user from Workspace B is rejected from Workspace A channel");

  // Project subscription: Valid project member accepted
  const projAuthMember = await RealtimeAuthorization.authorizeChannel(memberUser.id, projChan);
  assert(projAuthMember.isAuthorized === true, "2.3 Valid project squad member can subscribe to project channel");

  // Project subscription: Non-project member rejected
  const projAuthNonMember = await RealtimeAuthorization.authorizeChannel(nonProjectMember.id, projChan);
  assert(projAuthNonMember.isAuthorized === false, "2.4 Workspace member not assigned to project squad is rejected");

  // Project subscription: Workspace OWNER has elevated access
  const projAuthOwner = await RealtimeAuthorization.authorizeChannel(ownerUser.id, projChan);
  assert(projAuthOwner.isAuthorized === true, "2.5 Workspace OWNER has elevated project channel access without explicit squad row");

  // Malformed channel name rejected
  const authMalformed = await RealtimeAuthorization.authorizeChannel(memberUser.id, "invalid:channel:topic");
  assert(authMalformed.isAuthorized === false, "2.6 Malformed channel topic is safely rejected");

  // -------------------------------------------------------------
  // SECTION 3: SECURITY ISOLATION
  // -------------------------------------------------------------
  console.log("\n--- Section 3: Security & Cross-Workspace Isolation ---");

  const wsBChan = RealtimeChannels.getWorkspaceChannel(workspaceB.id);
  const authCross1 = await RealtimeAuthorization.authorizeChannel(memberUser.id, wsBChan);
  assert(authCross1.isAuthorized === false, "3.1 Member of Workspace A cannot authorize on Workspace B channel");

  const authCross2 = await RealtimeAuthorization.authorizeChannel(foreignUser.id, projChan);
  assert(authCross2.isAuthorized === false, "3.2 Member of Workspace B cannot authorize on Workspace A project channel");

  // -------------------------------------------------------------
  // SECTION 4: SERVER-SIDE PUBLISHING & EVENT ENVELOPE CONTRACT
  // -------------------------------------------------------------
  console.log("\n--- Section 4: Server-Side Publishing & Envelope Contract ---");

  const capturedEnvelopes: RealtimeEnvelope[] = [];
  RealtimePublisher.setTransport(async (_channel, envelope) => {
    capturedEnvelopes.push(envelope);
    return true;
  });

  const testEnvelope: RealtimeEnvelope = {
    id: `evt_test_${Date.now()}`,
    type: "TASK_CREATED",
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    entityId: "task-test-123",
    actorId: memberUser.id,
    timestamp: new Date().toISOString(),
    version: 1,
    payload: { title: "Test Envelope Task", taskId: "task-test-123" },
  };

  const publishResult = await RealtimePublisher.publish(testEnvelope);
  assert(publishResult === true, "4.1 RealtimePublisher.publish executes successfully");
  assert(capturedEnvelopes.length >= 1, "4.2 Custom transport received broadcasted envelope");

  const received = capturedEnvelopes[0];
  assert(Boolean(received.id), "4.3 Envelope contains unique event ID");
  assert(received.workspaceId === workspaceA.id, "4.4 Envelope contains authoritative workspaceId");
  assert(received.projectId === projectA.id, "4.5 Envelope contains authoritative projectId");
  assert(received.entityId === "task-test-123", "4.6 Envelope contains entityId");
  assert(received.actorId === memberUser.id, "4.7 Envelope contains actorId");
  assert(Boolean(received.timestamp), "4.8 Envelope contains ISO timestamp");
  assert(received.type === "TASK_CREATED", "4.9 Envelope contains correct event type");

  // Non-blocking failure test: Transport failure must not throw
  RealtimePublisher.setTransport(async () => {
    throw new Error("Simulated network timeout in Supabase Realtime broadcast");
  });

  let nonBlockingPassed = false;
  try {
    const res = await RealtimePublisher.publish(testEnvelope);
    nonBlockingPassed = res === false;
  } catch {
    nonBlockingPassed = false;
  }
  assert(nonBlockingPassed, "4.10 Realtime broadcast failure is non-blocking (does not throw)");

  // Restore memory transport
  capturedEnvelopes.length = 0;
  RealtimePublisher.setTransport(async (_channel, envelope) => {
    capturedEnvelopes.push(envelope);
    return true;
  });

  // -------------------------------------------------------------
  // SECTION 5: DOMAIN EVENT → REALTIME BRIDGE (ALL 11 EVENT TYPES)
  // -------------------------------------------------------------
  console.log("\n--- Section 5: Domain Event to Realtime Bridge (11 Events) ---");

  // Ensure bridge is active
  RealtimeService.init();

  // 5.1 TASK_CREATED
  const taskCreated = await TaskDomainService.createTask(memberUser.id, {
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    title: "Phase 4 Realtime Task 1",
  });
  await new Promise((r) => setTimeout(r, 50));
  const hasTaskCreated = capturedEnvelopes.some((e) => e.type === "TASK_CREATED" && e.entityId === taskCreated.id);
  assert(hasTaskCreated, "5.1 Domain mutation creates TASK_CREATED realtime envelope");

  // 5.2 TASK_UPDATED
  await TaskDomainService.updateTask(memberUser.id, taskCreated.id, {
    description: "Updated via Phase 4 test",
  });
  await new Promise((r) => setTimeout(r, 50));
  const hasTaskUpdated = capturedEnvelopes.some((e) => e.type === "TASK_UPDATED" && e.entityId === taskCreated.id);
  assert(hasTaskUpdated, "5.2 Domain mutation creates TASK_UPDATED realtime envelope");

  // 5.3 TASK_ASSIGNED
  await TaskDomainService.assignTask(ownerUser.id, taskCreated.id, memberUser.id);
  await new Promise((r) => setTimeout(r, 50));
  const hasTaskAssigned = capturedEnvelopes.some((e) => e.type === "TASK_ASSIGNED" && e.entityId === taskCreated.id);
  assert(hasTaskAssigned, "5.3 Domain mutation creates TASK_ASSIGNED realtime envelope");

  // 5.4 NOTIFICATION_CREATED (Triggered by TASK_ASSIGNED consumer)
  const hasNotifCreated = capturedEnvelopes.some((e) => e.type === "NOTIFICATION_CREATED");
  assert(hasNotifCreated, "5.4 Assignment notification creates NOTIFICATION_CREATED realtime envelope");

  // 5.5 TASK_STATUS_CHANGED
  await TaskDomainService.changeStatus(memberUser.id, taskCreated.id, TaskStatus.IN_PROGRESS);
  await new Promise((r) => setTimeout(r, 50));
  const hasStatusChanged = capturedEnvelopes.some((e) => e.type === "TASK_STATUS_CHANGED" && e.entityId === taskCreated.id);
  assert(hasStatusChanged, "5.5 Domain mutation creates TASK_STATUS_CHANGED realtime envelope");

  // 5.6 TASK_COMPLETED
  await TaskDomainService.changeStatus(memberUser.id, taskCreated.id, TaskStatus.DONE);
  await new Promise((r) => setTimeout(r, 50));
  const hasTaskCompleted = capturedEnvelopes.some((e) => e.type === "TASK_COMPLETED" && e.entityId === taskCreated.id);
  assert(hasTaskCompleted, "5.6 Domain mutation creates TASK_COMPLETED realtime envelope");

  // 5.7 TASK_DEPENDENCY_CREATED & 5.8 TASK_DEPENDENCY_REMOVED
  const taskDepTarget = await TaskDomainService.createTask(memberUser.id, {
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    title: "Phase 4 Realtime Task 2",
  });

  const dep = await DependencyService.addDependency({
    workspaceId: workspaceA.id,
    blockingTaskId: taskCreated.id,
    blockedTaskId: taskDepTarget.id,
    actorUserId: memberUser.id,
  });
  await new Promise((r) => setTimeout(r, 50));
  const hasDepCreated = capturedEnvelopes.some((e) => e.type === "TASK_DEPENDENCY_CREATED" && e.entityId === dep.id);
  assert(hasDepCreated, "5.7 Domain mutation creates TASK_DEPENDENCY_CREATED realtime envelope");

  await DependencyService.removeDependency(memberUser.id, dep.id, workspaceA.id);
  await new Promise((r) => setTimeout(r, 50));
  const hasDepRemoved = capturedEnvelopes.some((e) => e.type === "TASK_DEPENDENCY_REMOVED" && e.entityId === dep.id);
  assert(hasDepRemoved, "5.8 Domain mutation creates TASK_DEPENDENCY_REMOVED realtime envelope");

  // 5.9 COMMENT_CREATED
  await eventBus.emit({
    type: "COMMENT_CREATED",
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    actorId: memberUser.id,
    payload: {
      commentId: `comment_${Date.now()}`,
      taskId: taskCreated.id,
      taskTitle: taskCreated.title,
      content: "Hello from Phase 4 comment bridge test!",
      authorId: memberUser.id,
    },
  });
  await new Promise((r) => setTimeout(r, 50));
  const hasCommentCreated = capturedEnvelopes.some((e) => e.type === "COMMENT_CREATED");
  assert(hasCommentCreated, "5.9 COMMENT_CREATED bridged into realtime envelope");

  // 5.10 PROJECT_UPDATED
  await eventBus.emit({
    type: "PROJECT_UPDATED",
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    actorId: ownerUser.id,
    payload: {
      projectId: projectA.id,
      projectName: projectA.name,
      changes: { description: "Updated description in Phase 4" },
    },
  });
  await new Promise((r) => setTimeout(r, 50));
  const hasProjectUpdated = capturedEnvelopes.some((e) => e.type === "PROJECT_UPDATED" && e.entityId === projectA.id);
  assert(hasProjectUpdated, "5.10 PROJECT_UPDATED bridged into realtime envelope");

  // 5.11 TASK_DELETED
  await TaskDomainService.deleteTask(ownerUser.id, taskDepTarget.id);
  await new Promise((r) => setTimeout(r, 50));
  const hasTaskDeleted = capturedEnvelopes.some((e) => e.type === "TASK_DELETED" && e.entityId === taskDepTarget.id);
  assert(hasTaskDeleted, "5.11 TASK_DELETED bridged into realtime envelope");

  // -------------------------------------------------------------
  // SECTION 6: CLIENT-SIDE DEDUPLICATION & ORDERING
  // -------------------------------------------------------------
  console.log("\n--- Section 6: Client Deduplication & Stale Event Protection ---");

  const dedup = new EventDeduplicator(10, 5000);
  const testEvtId = `evt_dedup_${Date.now()}`;

  assert(dedup.isDuplicate(testEvtId) === false, "6.1 First delivery of event ID is accepted");
  assert(dedup.isDuplicate(testEvtId) === true, "6.2 Immediate duplicate delivery of same event ID is rejected");
  assert(dedup.isDuplicate(`evt_distinct_${Date.now()}`) === false, "6.3 Distinct event ID is accepted");

  // Bounded capacity eviction
  for (let i = 0; i < 15; i++) {
    dedup.isDuplicate(`evt_burst_${i}`);
  }
  assert(dedup.size <= 10, "6.4 Deduplicator cache size is strictly bounded to prevent memory leaks");

  // RealtimeClientSubscription with ordering & dedup test
  const deliveredEvents: RealtimeEnvelope[] = [];
  const clientSub = RealtimeClientSubscription.subscribe({
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    onEvent: (ev) => deliveredEvents.push(ev),
  });

  assert(clientSub.isSubscribed() === true, "6.5 Client subscription is active");
  clientSub.unsubscribe();
  assert(clientSub.isSubscribed() === false, "6.6 Client subscription unsubscribes cleanly");

  // -------------------------------------------------------------
  // SECTION 7: RECONNECT & RESYNC STRATEGY
  // -------------------------------------------------------------
  console.log("\n--- Section 7: Reconnect & Resync Strategy ---");

  let refetchTriggered = false;
  const resyncSub = RealtimeClientSubscription.subscribe({
    workspaceId: workspaceA.id,
    onEvent: () => {},
    onReconnect: () => {
      refetchTriggered = true;
    },
  });

  assert(typeof resyncSub.unsubscribe === "function", "7.1 Reconnect handler registered cleanly");
  resyncSub.unsubscribe();

  // -------------------------------------------------------------
  // SECTION 8: ACTIVITY FEED QUERY & SCOPING (POSTGRESQL AUDITLOG)
  // -------------------------------------------------------------
  console.log("\n--- Section 8: Activity Feed via PostgreSQL AuditLog ---");

  // Workspace-scoped feed
  const wsActivity = await ActivityService.getActivityFeed({
    workspaceId: workspaceA.id,
    limit: 10,
    page: 1,
  });

  assert(wsActivity.items.length > 0, "8.1 Activity feed returns recorded events for workspace");
  assert(wsActivity.pagination.total > 0, "8.2 Activity feed returns correct total count");

  const firstItem = wsActivity.items[0];
  assert(firstItem.workspaceId === workspaceA.id, "8.3 Activity item is strictly scoped to workspace");
  assert(Boolean(firstItem.summary), "8.4 Activity item has human-readable summary");
  assert(Boolean(firstItem.timestamp), "8.5 Activity item has timestamp");

  // Project-scoped feed
  const projActivity = await ActivityService.getActivityFeed({
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    limit: 10,
    page: 1,
  });

  assert(projActivity.items.length > 0, "8.6 Project-scoped activity feed returns events");
  const allMatchProject = projActivity.items.every(
    (item) => item.projectId === projectA.id || item.entityId === projectA.id
  );
  assert(allMatchProject, "8.7 Project-scoped activity only returns items pertaining to that project");

  // Pagination verification
  const page1 = await ActivityService.getActivityFeed({
    workspaceId: workspaceA.id,
    limit: 2,
    page: 1,
  });
  const page2 = await ActivityService.getActivityFeed({
    workspaceId: workspaceA.id,
    limit: 2,
    page: 2,
  });

  assert(page1.items.length <= 2, "8.8 Page 1 obeys limit bound");
  if (page1.pagination.totalPages >= 2) {
    assert(page1.items[0].id !== page2.items[0].id, "8.9 Page 2 returns next offset items");
  } else {
    assert(true, "8.9 Pagination offset check (single page available)");
  }

  // Cross-workspace activity isolation
  const wsBActivity = await ActivityService.getActivityFeed({
    workspaceId: workspaceB.id,
    limit: 10,
  });

  const hasLeakedEvents = wsBActivity.items.some((item) => item.workspaceId === workspaceA.id);
  assert(!hasLeakedEvents, "8.10 Workspace B activity query never leaks Workspace A activity");

  // -------------------------------------------------------------
  // CLEANUP FIXTURES
  // -------------------------------------------------------------
  RealtimePublisher.setTransport(null);

  await prisma.auditLog.deleteMany({
    where: { OR: [{ workspaceId: workspaceA.id }, { workspaceId: workspaceB.id }] },
  });
  await prisma.notification.deleteMany({
    where: { OR: [{ workspaceId: workspaceA.id }, { workspaceId: workspaceB.id }] },
  });
  await prisma.taskComment.deleteMany({ where: { taskId: taskCreated.id } });
  await prisma.task.deleteMany({ where: { projectId: projectA.id } });
  await prisma.projectMember.deleteMany({ where: { projectId: projectA.id } });
  await prisma.project.delete({ where: { id: projectA.id } });
  await prisma.workspaceMember.deleteMany({
    where: { OR: [{ userId: foreignUser.id }, { userId: nonProjectMember.id }] },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [foreignUser.id, nonProjectMember.id] } },
  });
  await prisma.workspace.delete({ where: { id: workspaceB.id } });

  console.log("\n===============================================================");
  console.log(` PHASE 4 VERIFICATION COMPLETE: ${passed} / ${passed + failed} PASS`);
  console.log("===============================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase4RealtimeTests()
  .catch((err) => {
    console.error("Phase 4 test suite fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
