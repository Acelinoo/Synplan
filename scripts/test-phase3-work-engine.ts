import { prisma } from "../src/lib/prisma";
import { Role, ProjectRole, TaskStatus, TaskPriority } from "@prisma/client";
import { TaskDomainService } from "../src/domains/task/task.service";
import { TaskStateMachine } from "../src/domains/task/task.state-machine";
import { DependencyService } from "../src/domains/task/dependency.service";
import { TaskViewsService } from "../src/domains/task/views.service";
import { MyWorkService } from "../src/domains/task/my-work.service";
import { ProjectHealthService } from "../src/domains/project/project-health.service";
import { ProjectDomainService } from "../src/domains/project/project.service";
import { eventBus } from "../src/domains/events/event-bus";
import { DomainEvent } from "../src/domains/events/types";

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

async function runPhase3WorkEngineTests() {
  console.log("===============================================================");
  console.log(" SYNPLAN 2.0 — PHASE 3 CORE WORK ENGINE TEST SUITE");
  console.log(" MULTI-VIEW, DEPENDENCY ENGINE, STATE MACHINE & MY WORK");
  console.log("===============================================================\n");

  // 1. Fetch seed context
  const workspace = await prisma.workspace.findFirst();
  if (!workspace) throw new Error("Workspace not found. Seed first.");

  const [adminUser, memberUser] = await Promise.all([
    prisma.user.findFirst({ where: { role: Role.ADMIN } }),
    prisma.user.findFirst({ where: { role: Role.MEMBER } }),
  ]);

  if (!adminUser || !memberUser) throw new Error("Admin and Member users not found.");

  // Create isolated project for Phase 3 tests
  const testProject = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      name: "Phase 3 Work Engine Project",
      slug: `work-engine-${Date.now()}`,
      status: "ACTIVE",
    },
  });

  // Assign admin as LEAD and member as CONTRIBUTOR
  await prisma.projectMember.createMany({
    data: [
      { projectId: testProject.id, userId: adminUser.id, role: ProjectRole.LEAD },
      { projectId: testProject.id, userId: memberUser.id, role: ProjectRole.CONTRIBUTOR },
    ],
  });

  // Create Phase and Milestone for relational tests
  const testPhase = await prisma.phase.create({
    data: {
      workspaceId: workspace.id,
      projectId: testProject.id,
      name: "Phase 3 Engineering Core",
      order: 1,
    },
  });

  const testMilestone = await prisma.milestone.create({
    data: {
      workspaceId: workspace.id,
      projectId: testProject.id,
      title: "M1: Alpha Engine Complete",
      targetDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  // Event listener array to capture emitted domain events
  const capturedEvents: DomainEvent[] = [];
  const unsubscribeEvents = eventBus.subscribeAll((evt) => {
    capturedEvents.push(evt);
  });

  // -------------------------------------------------------------
  // 1. TASK STATE MACHINE & STATUS TRANSITIONS
  // -------------------------------------------------------------
  console.log("--- 1. TASK STATE MACHINE & STATUS TRANSITIONS ---");

  // 1.1 Valid transitions
  assert(TaskStateMachine.canTransition(TaskStatus.BACKLOG, TaskStatus.TODO), "1.1 BACKLOG -> TODO is valid");
  assert(TaskStateMachine.canTransition(TaskStatus.TODO, TaskStatus.IN_PROGRESS), "1.2 TODO -> IN_PROGRESS is valid");
  assert(TaskStateMachine.canTransition(TaskStatus.IN_PROGRESS, TaskStatus.IN_REVIEW), "1.3 IN_PROGRESS -> IN_REVIEW is valid");
  assert(TaskStateMachine.canTransition(TaskStatus.IN_REVIEW, TaskStatus.DONE), "1.4 IN_REVIEW -> DONE is valid");
  assert(TaskStateMachine.canTransition(TaskStatus.DONE, TaskStatus.IN_PROGRESS), "1.5 DONE -> IN_PROGRESS (reopen) is valid");

  // 1.2 Invalid transitions
  assert(!TaskStateMachine.canTransition(TaskStatus.BACKLOG, TaskStatus.DONE), "1.6 BACKLOG -> DONE is strictly prohibited");
  assert(!TaskStateMachine.canTransition(TaskStatus.DONE, TaskStatus.BLOCKED), "1.7 DONE -> BLOCKED is prohibited");

  // 1.3 State machine side effects (completion dates)
  const doneEffects = TaskStateMachine.getTransitionSideEffects(TaskStatus.IN_PROGRESS, TaskStatus.DONE);
  assert(Boolean(doneEffects.completedAt), "1.8 Transitioning to DONE populates completedAt timestamp");

  const reopenEffects = TaskStateMachine.getTransitionSideEffects(TaskStatus.DONE, TaskStatus.IN_PROGRESS);
  assert(reopenEffects.completedAt === null, "1.9 Reopening DONE task resets completedAt to null");

  // -------------------------------------------------------------
  // 2. TASK LIFECYCLE & MUTATION CONTRACT
  // -------------------------------------------------------------
  console.log("\n--- 2. TASK LIFECYCLE & MUTATIONS ---");

  // 2.1 Create Task in Phase & Milestone
  const taskA = await TaskDomainService.createTask(adminUser.id, {
    workspaceId: workspace.id,
    projectId: testProject.id,
    phaseId: testPhase.id,
    milestoneId: testMilestone.id,
    assigneeId: memberUser.id,
    title: "Task A - Database DAG Indexing",
    priority: TaskPriority.HIGH,
    status: TaskStatus.TODO,
    dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
  });
  assert(Boolean(taskA && taskA.id), "2.1 Task created with Phase, Milestone, and Assignee");

  const taskB = await TaskDomainService.createTask(adminUser.id, {
    workspaceId: workspace.id,
    projectId: testProject.id,
    phaseId: testPhase.id,
    title: "Task B - Multi-View Kanban Board",
    priority: TaskPriority.MEDIUM,
    status: TaskStatus.TODO,
  });
  assert(Boolean(taskB && taskB.id), "2.2 Second task created in Phase");

  const taskC = await TaskDomainService.createTask(adminUser.id, {
    workspaceId: workspace.id,
    projectId: testProject.id,
    title: "Task C - Root Work Item",
    priority: TaskPriority.URGENT,
    status: TaskStatus.TODO,
  });
  assert(Boolean(taskC && taskC.id), "2.3 Third task created as root item");

  // 2.4 Status transition enforcement via Domain Service
  const inProgressA = await TaskDomainService.changeStatus(adminUser.id, taskA.id, TaskStatus.IN_PROGRESS);
  assert(inProgressA.status === TaskStatus.IN_PROGRESS, "2.4 Task A transitioned to IN_PROGRESS");

  let illegalTransitionFailed = false;
  try {
    // Attempt illegal transition directly from TODO to DONE on Task B
    await TaskDomainService.changeStatus(adminUser.id, taskB.id, TaskStatus.DONE);
  } catch {
    illegalTransitionFailed = true;
  }
  assert(illegalTransitionFailed, "2.5 Illegal transition (TODO -> DONE without IN_PROGRESS) was rejected");

  // -------------------------------------------------------------
  // 3. DEPENDENCY ENGINE & CYCLE DETECTION
  // -------------------------------------------------------------
  console.log("\n--- 3. DEPENDENCY ENGINE & CYCLE DETECTION ---");

  // 3.1 Valid dependency: Task A blocks Task B
  const dep1 = await DependencyService.addDependency({
    actorUserId: adminUser.id,
    blockingTaskId: taskA.id,
    blockedTaskId: taskB.id,
    workspaceId: workspace.id,
  });
  assert(Boolean(dep1 && dep1.id), "3.1 Valid dependency: Task A blocks Task B");

  // 3.2 Self-dependency rejection
  let selfDepRejected = false;
  try {
    await DependencyService.addDependency({
      actorUserId: adminUser.id,
      blockingTaskId: taskA.id,
      blockedTaskId: taskA.id,
      workspaceId: workspace.id,
    });
  } catch (err: any) {
    selfDepRejected = err?.message?.includes("Self-dependency");
  }
  assert(selfDepRejected, "3.2 Self-dependency (Task A blocks Task A) strictly rejected");

  // 3.3 Duplicate dependency rejection
  let duplicateRejected = false;
  try {
    await DependencyService.addDependency({
      actorUserId: adminUser.id,
      blockingTaskId: taskA.id,
      blockedTaskId: taskB.id,
      workspaceId: workspace.id,
    });
  } catch (err: any) {
    duplicateRejected = err?.message?.includes("Duplicate dependency");
  }
  assert(duplicateRejected, "3.3 Duplicate dependency (Task A blocks Task B again) strictly rejected");

  // 3.4 Valid chaining: Task B blocks Task C
  const dep2 = await DependencyService.addDependency({
    actorUserId: adminUser.id,
    blockingTaskId: taskB.id,
    blockedTaskId: taskC.id,
    workspaceId: workspace.id,
  });
  assert(Boolean(dep2 && dep2.id), "3.4 Valid chain: Task B blocks Task C (A -> B -> C)");

  // 3.5 Circular dependency rejection: Task C blocks Task A
  let cycleRejected = false;
  try {
    await DependencyService.addDependency({
      actorUserId: adminUser.id,
      blockingTaskId: taskC.id,
      blockedTaskId: taskA.id,
      workspaceId: workspace.id,
    });
  } catch (err: any) {
    cycleRejected = err?.message?.includes("Circular dependency");
  }
  assert(cycleRejected, "3.5 Circular dependency (Task C blocks Task A) detected & rejected by DAG detector");

  // 3.6 Dependency status inspection
  const taskBDepInfo = await DependencyService.getTaskDependencies(taskB.id);
  assert(taskBDepInfo.isBlocked === true, "3.6 Task B is currently BLOCKED because Task A is not DONE");
  assert(taskBDepInfo.blockedBy.length === 1, "3.7 Task B blockedBy count is exactly 1");

  // -------------------------------------------------------------
  // 4. SUBTASK LIFECYCLE & DETERMINISTIC PROGRESS
  // -------------------------------------------------------------
  console.log("\n--- 4. SUBTASK LIFECYCLE & PROGRESS ---");

  const st1 = await TaskDomainService.createSubtask(adminUser.id, taskA.id, "Subtask 1 - Schema definition", 1);
  const st2 = await TaskDomainService.createSubtask(adminUser.id, taskA.id, "Subtask 2 - Migration validation", 2);
  assert(Boolean(st1 && st2), "4.1 Subtasks created for Task A");

  // Complete one subtask
  await TaskDomainService.completeSubtask(adminUser.id, st1.id, true);
  const subtasksSummary = await TaskDomainService.getSubtasksForTask(taskA.id);
  assert(
    subtasksSummary.summary.total === 2 &&
      subtasksSummary.summary.completed === 1 &&
      subtasksSummary.summary.percentage === 50,
    "4.2 Subtasks completion calculated dynamically as 50% (1/2 complete)"
  );

  // -------------------------------------------------------------
  // 5. BATCH OPERATIONS
  // -------------------------------------------------------------
  console.log("\n--- 5. BATCH OPERATIONS ---");

  // 5.1 Batch change priority
  const batchPrioRes = await TaskDomainService.batchChangePriority(
    adminUser.id,
    [taskA.id, taskB.id],
    TaskPriority.URGENT,
    workspace.id
  );
  assert(batchPrioRes.updatedCount === 2, "5.1 Batch priority update succeeded for 2 tasks");

  // 5.2 Batch assign tasks
  const batchAssignRes = await TaskDomainService.batchAssign(
    adminUser.id,
    [taskB.id, taskC.id],
    memberUser.id,
    workspace.id
  );
  assert(batchAssignRes.updatedCount === 2, "5.2 Batch assign succeeded for 2 tasks");

  // -------------------------------------------------------------
  // 6. MULTI-VIEW QUERY ADAPTERS
  // -------------------------------------------------------------
  console.log("\n--- 6. MULTI-VIEW QUERY ADAPTERS ---");

  // 6.1 Board View (Kanban)
  const boardView = await TaskViewsService.getBoardView({
    workspaceId: workspace.id,
    projectId: testProject.id,
  });
  assert(boardView.columns[TaskStatus.IN_PROGRESS].count >= 1, "6.1 Board View includes IN_PROGRESS column with tasks");
  assert(boardView.columns[TaskStatus.TODO].count >= 2, "6.2 Board View includes TODO column with tasks");
  assert(boardView.totalTasks >= 3, "6.3 Board View totalTasks reflects all project tasks");

  // 6.2 Hierarchical List View
  const listView = await TaskViewsService.getListView({
    workspaceId: workspace.id,
    projectId: testProject.id,
  });
  assert(Array.isArray(listView.phases) && listView.phases.length === 1, "6.4 List View structures phases hierarchically");
  assert(listView.phases[0].milestones.length === 1, "6.5 List View groups milestones inside phase");
  assert(listView.ungroupedTasks.length >= 1, "6.6 List View captures ungrouped tasks outside phases");

  // 6.3 High-Density Table View
  const tableView = await TaskViewsService.getTableView({
    workspaceId: workspace.id,
    projectId: testProject.id,
  });
  assert(tableView.rows.length >= 3, "6.7 Table View returns high-density tabular rows");
  assert(Boolean(tableView.rows[0].project?.name), "6.8 Table View rows include project metadata");
  assert(typeof tableView.rows[0].subtasksCompleted === "number", "6.9 Table View rows include subtasks summary metrics");

  // -------------------------------------------------------------
  // 7. MY WORK SERVICE
  // -------------------------------------------------------------
  console.log("\n--- 7. MY WORK SERVICE ---");

  const myWork = await MyWorkService.getMyWork(memberUser.id, workspace.id);
  assert(myWork.summary.totalAssigned >= 3, "7.1 My Work aggregates active tasks assigned to user");
  assert(myWork.categories.highPriority.length >= 2, "7.2 My Work identifies high priority items");
  assert(myWork.categories.blocked.length >= 1, "7.3 My Work identifies blocked tasks (Task B blocked by Task A)");

  // -------------------------------------------------------------
  // 8. DETERMINISTIC PROJECT HEALTH SIGNALS
  // -------------------------------------------------------------
  console.log("\n--- 8. DETERMINISTIC PROJECT HEALTH SIGNALS ---");

  const health = await ProjectHealthService.calculateHealthSignals(testProject.id, workspace.id);
  assert(health.metrics.totalTasks >= 3, "8.1 Project health calculates total task metrics");
  assert(health.metrics.blockedTasksCount >= 1, "8.2 Project health identifies blocked tasks count");
  assert(["ON_TRACK", "AT_RISK", "CRITICAL"].includes(health.healthStatus), "8.3 Health status is deterministic enum");
  assert(health.reasons.length > 0, "8.4 Health status includes explainable reasons array");

  // -------------------------------------------------------------
  // 9. DOMAIN EVENTS & NOTIFICATIONS
  // -------------------------------------------------------------
  console.log("\n--- 9. DOMAIN EVENTS & NOTIFICATIONS ---");

  const createdEvents = capturedEvents.filter((e) => e.type === "TASK_CREATED");
  const assignedEvents = capturedEvents.filter((e) => e.type === "TASK_ASSIGNED");
  const statusEvents = capturedEvents.filter((e) => e.type === "TASK_STATUS_CHANGED");
  const depEvents = capturedEvents.filter((e) => e.type === "TASK_DEPENDENCY_CREATED");

  assert(createdEvents.length >= 3, "9.1 TASK_CREATED events emitted for all created tasks");
  assert(assignedEvents.length >= 3, "9.2 TASK_ASSIGNED events emitted for assignments");
  assert(statusEvents.length >= 1, "9.3 TASK_STATUS_CHANGED events emitted for status transitions");
  assert(depEvents.length >= 2, "9.4 TASK_DEPENDENCY_CREATED events emitted for dependency additions");

  // Check notification created in PostgreSQL for assigned user
  const dbNotification = await prisma.notification.findFirst({
    where: {
      userId: memberUser.id,
      workspaceId: workspace.id,
      type: "ASSIGNED",
    },
    orderBy: { createdAt: "desc" },
  });
  assert(Boolean(dbNotification), "9.5 Notification record created in PostgreSQL for task assignment");

  // -------------------------------------------------------------
  // CLEANUP TEST FIXTURES
  // -------------------------------------------------------------
  unsubscribeEvents();
  await prisma.taskDependency.deleteMany({
    where: { OR: [{ blockingTaskId: taskA.id }, { blockedTaskId: taskB.id }, { blockedTaskId: taskC.id }] },
  });
  await prisma.subtask.deleteMany({ where: { taskId: { in: [taskA.id, taskB.id, taskC.id] } } });
  await prisma.taskComment.deleteMany({ where: { taskId: { in: [taskA.id, taskB.id, taskC.id] } } });
  await prisma.task.deleteMany({ where: { projectId: testProject.id } });
  await prisma.milestone.deleteMany({ where: { projectId: testProject.id } });
  await prisma.phase.deleteMany({ where: { projectId: testProject.id } });
  await prisma.projectMember.deleteMany({ where: { projectId: testProject.id } });
  await prisma.project.delete({ where: { id: testProject.id } });

  console.log("\n===============================================================");
  console.log(` PHASE 3 VERIFICATION COMPLETE: ${passed} / ${passed + failed} PASS`);
  console.log("===============================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase3WorkEngineTests()
  .catch((err) => {
    console.error("Phase 3 test suite fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
