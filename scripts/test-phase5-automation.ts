import { prisma } from "../src/lib/prisma";
import { Role, ProjectRole, TaskStatus, TaskPriority } from "@prisma/client";
import { AutomationService } from "../src/domains/automation/automation.service";
import { AutomationGuard } from "../src/domains/automation/automation.guard";
import { AutomationConditions } from "../src/domains/automation/automation.conditions";
import { AutomationMatcher } from "../src/domains/automation/automation.matcher";
import { AutomationExecutor, MAX_AUTOMATION_DEPTH } from "../src/domains/automation/automation.executor";
import { AutomationEvents } from "../src/domains/automation/automation.events";
import { globalAutomationIdempotency } from "../src/domains/automation/automation.idempotency";
import { TaskDomainService } from "../src/domains/task/task.service";
import { DependencyService } from "../src/domains/task/dependency.service";
import { eventBus } from "../src/domains/events/event-bus";

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

async function runPhase5AutomationTests() {
  console.log("===============================================================");
  console.log(" SYNPLAN 2.0 — PHASE 5 WORKFLOW AUTOMATION TEST SUITE");
  console.log(" DETERMINISTIC, SAFE, SYNCHRONOUS AUTOMATION ENGINE");
  console.log("===============================================================\n");

  // -------------------------------------------------------------
  // SETUP TEST FIXTURES
  // -------------------------------------------------------------
  const workspaceA = await prisma.workspace.findFirst({
    where: { name: { contains: "Acme" } },
  }) || await prisma.workspace.findFirst();

  if (!workspaceA) throw new Error("Workspace A not found. Seed first.");

  // Pre-cleanup leftover test automation rules from previous runs
  await prisma.automationRule.deleteMany({
    where: { workspaceId: workspaceA.id },
  });

  const [ownerUser, memberUser] = await Promise.all([
    prisma.user.findFirst({ where: { role: Role.OWNER } }),
    prisma.user.findFirst({ where: { role: Role.MEMBER } }),
  ]);

  if (!ownerUser || !memberUser) throw new Error("Owner and Member users not found.");

  // Secondary isolated Workspace B & foreign user
  const workspaceB = await prisma.workspace.create({
    data: {
      name: `Automation Workspace Beta ${Date.now()}`,
      slug: `auto-beta-${Date.now()}`,
      ownerId: ownerUser.id,
    },
  });

  const foreignUser = await prisma.user.create({
    data: {
      name: "Foreign User Beta",
      email: `foreign-auto-${Date.now()}@beta.com`,
      role: Role.MEMBER,
    },
  });

  await prisma.workspaceMember.createMany({
    data: [
      { workspaceId: workspaceB.id, userId: foreignUser.id, role: Role.MEMBER },
      { workspaceId: workspaceB.id, userId: ownerUser.id, role: Role.OWNER },
    ],
  });

  // Project in Workspace A
  const projectA = await prisma.project.create({
    data: {
      workspaceId: workspaceA.id,
      name: "Automation Test Project A",
      slug: `auto-proj-a-${Date.now()}`,
      status: "ACTIVE",
    },
  });

  await prisma.projectMember.createMany({
    data: [
      { projectId: projectA.id, userId: ownerUser.id, role: ProjectRole.LEAD },
      { projectId: projectA.id, userId: memberUser.id, role: ProjectRole.CONTRIBUTOR },
    ],
  });

  // Project in Workspace B
  const projectB = await prisma.project.create({
    data: {
      workspaceId: workspaceB.id,
      name: "Automation Test Project B",
      slug: `auto-proj-b-${Date.now()}`,
      status: "ACTIVE",
    },
  });

  await prisma.projectMember.create({
    data: {
      projectId: projectB.id,
      userId: ownerUser.id,
      role: ProjectRole.LEAD,
    },
  });

  // Ensure event bridge is initialized
  AutomationEvents.init();

  // -------------------------------------------------------------
  // SECTION 1: RULE MANAGEMENT & VALIDATION
  // -------------------------------------------------------------
  console.log("--- Section 1: Rule Management & Validation ---");

  // 1.1 Create valid rule
  const createdRule = await AutomationService.createRule({
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    name: "Auto Set Priority on Bug",
    triggerType: "TASK_CREATED",
    conditions: {
      field: "task.projectId",
      operator: "EQUALS",
      value: projectA.id,
    },
    actions: [
      {
        type: "SET_PRIORITY",
        payload: { priority: TaskPriority.HIGH },
      },
    ],
    isActive: true,
  });

  assert(Boolean(createdRule?.id), "1.1 Automation rule created successfully in PostgreSQL");
  assert(createdRule.isActive === true, "1.2 Rule default state is active");
  assert(createdRule.workspaceId === workspaceA.id, "1.3 Rule is scoped to workspace");

  // 1.2 Update rule
  const updatedRule = await AutomationService.updateRule(createdRule.id, workspaceA.id, {
    name: "Auto Elevate Priority to High",
  });
  assert(updatedRule.name === "Auto Elevate Priority to High", "1.4 Automation rule updated successfully");

  // 1.3 Enable / Disable rule
  const disabledRule = await AutomationService.toggleRule(createdRule.id, workspaceA.id, false);
  assert(disabledRule.isActive === false, "1.5 Rule toggled to disabled (isActive: false)");

  const enabledRule = await AutomationService.toggleRule(createdRule.id, workspaceA.id, true);
  assert(enabledRule.isActive === true, "1.6 Rule toggled to enabled (isActive: true)");

  // 1.4 Guard: Reject invalid trigger
  const invalidTriggerVal = await AutomationGuard.validateCreate({
    workspaceId: workspaceA.id,
    name: "Invalid Trigger Rule",
    triggerType: "INVALID_TRIGGER" as any,
    conditions: [],
    actions: [{ type: "SET_STATUS", payload: { status: TaskStatus.DONE } }],
  });
  assert(invalidTriggerVal.isValid === false, "1.7 Unsupported triggerType is rejected by guard");

  // 1.5 Guard: Reject invalid action type
  const invalidActionVal = await AutomationGuard.validateCreate({
    workspaceId: workspaceA.id,
    name: "Invalid Action Rule",
    triggerType: "TASK_CREATED",
    conditions: [],
    actions: [{ type: "RUN_SHELL_COMMAND" as any, payload: {} }],
  });
  assert(invalidActionVal.isValid === false, "1.8 Unsupported action type is rejected by guard");

  // 1.6 Guard: Reject invalid action payload
  const invalidStatusVal = await AutomationGuard.validateCreate({
    workspaceId: workspaceA.id,
    name: "Invalid Status Payload",
    triggerType: "TASK_CREATED",
    conditions: [],
    actions: [{ type: "SET_STATUS", payload: { status: "ILLEGAL_STATUS" as any } }],
  });
  assert(invalidStatusVal.isValid === false, "1.9 Action with invalid status enum is rejected");

  // 1.7 Guard: Reject foreign project
  const foreignProjVal = await AutomationGuard.validateCreate({
    workspaceId: workspaceA.id,
    projectId: projectB.id, // Belongs to workspaceB!
    name: "Foreign Project Rule",
    triggerType: "TASK_CREATED",
    conditions: [],
    actions: [{ type: "SET_STATUS", payload: { status: TaskStatus.DONE } }],
  });
  assert(foreignProjVal.isValid === false, "1.10 Rule referencing foreign workspace project is rejected");

  // 1.8 Guard: Reject foreign assignee
  const foreignAssigneeVal = await AutomationGuard.validateCreate({
    workspaceId: workspaceA.id,
    name: "Foreign Assignee Rule",
    triggerType: "TASK_CREATED",
    conditions: [],
    actions: [{ type: "ASSIGN_TASK", payload: { assigneeId: foreignUser.id } }],
  });
  assert(foreignAssigneeVal.isValid === false, "1.11 Action referencing foreign workspace user is rejected");

  // -------------------------------------------------------------
  // SECTION 2: TRIGGER MATCHING
  // -------------------------------------------------------------
  console.log("\n--- Section 2: Trigger Matching ---");

  // Create task in project A
  const task1 = await TaskDomainService.createTask(memberUser.id, {
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    title: "Phase 5 Automation Task 1",
    priority: TaskPriority.LOW,
  });

  const matchingEvent = {
    id: `evt_match_${Date.now()}`,
    type: "TASK_CREATED",
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    payload: { taskId: task1.id, priority: TaskPriority.LOW },
  };

  const matches = await AutomationMatcher.matchEvent(matchingEvent);
  assert(matches.length >= 1, "2.1 Active rule with matching trigger and condition is matched");

  // Wrong trigger
  const wrongTriggerEvent = {
    id: `evt_wrong_${Date.now()}`,
    type: "COMMENT_CREATED",
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    payload: { taskId: task1.id },
  };
  const wrongMatches = await AutomationMatcher.matchEvent(wrongTriggerEvent);
  assert(wrongMatches.length === 0, "2.2 Event with different trigger type produces 0 matches");

  // Disabled rule matching
  await AutomationService.toggleRule(createdRule.id, workspaceA.id, false);
  const disabledMatches = await AutomationMatcher.matchEvent(matchingEvent);
  assert(disabledMatches.length === 0, "2.3 Disabled rule is not matched");
  await AutomationService.toggleRule(createdRule.id, workspaceA.id, true);

  // -------------------------------------------------------------
  // SECTION 3: CONDITIONS ENGINE
  // -------------------------------------------------------------
  console.log("\n--- Section 3: Deterministic Conditions Engine ---");

  const evalContext = {
    event: matchingEvent,
    task: {
      status: TaskStatus.DONE,
      priority: TaskPriority.HIGH,
      assigneeId: memberUser.id,
      projectId: projectA.id,
      dueDate: new Date().toISOString(),
      hasBlockingDependency: true,
    },
    hasBlockingDependency: true,
  };

  // 3.1 Status equals
  assert(
    AutomationConditions.evaluate({ field: "task.status", operator: "EQUALS", value: TaskStatus.DONE }, evalContext),
    "3.1 Condition: task.status == DONE evaluates to true"
  );
  assert(
    !AutomationConditions.evaluate({ field: "task.status", operator: "EQUALS", value: TaskStatus.BLOCKED }, evalContext),
    "3.2 Condition: task.status == BLOCKED evaluates to false"
  );

  // 3.2 Priority equals
  assert(
    AutomationConditions.evaluate({ field: "task.priority", operator: "EQUALS", value: TaskPriority.HIGH }, evalContext),
    "3.3 Condition: task.priority == HIGH evaluates to true"
  );

  // 3.3 Assignee equals
  assert(
    AutomationConditions.evaluate({ field: "task.assigneeId", operator: "EQUALS", value: memberUser.id }, evalContext),
    "3.4 Condition: task.assigneeId == memberUser.id evaluates to true"
  );

  // 3.4 Project equals
  assert(
    AutomationConditions.evaluate({ field: "task.projectId", operator: "EQUALS", value: projectA.id }, evalContext),
    "3.5 Condition: task.projectId == projectA.id evaluates to true"
  );

  // 3.5 Due date today
  assert(
    AutomationConditions.evaluate({ field: "task.dueDate", operator: "EQUALS", value: "today" }, evalContext),
    "3.6 Condition: task.dueDate == today evaluates to true"
  );

  // 3.6 hasBlockingDependency
  assert(
    AutomationConditions.evaluate({ field: "task.hasBlockingDependency", operator: "EQUALS", value: true }, evalContext),
    "3.7 Condition: task.hasBlockingDependency == true evaluates to true"
  );

  // 3.7 Compound AND
  const andCondition = {
    operator: "AND" as const,
    conditions: [
      { field: "task.status", operator: "EQUALS" as const, value: TaskStatus.DONE },
      { field: "task.priority", operator: "EQUALS" as const, value: TaskPriority.HIGH },
    ],
  };
  assert(AutomationConditions.evaluate(andCondition, evalContext), "3.8 Compound AND: All passing conditions evaluate to true");

  const andConditionFail = {
    operator: "AND" as const,
    conditions: [
      { field: "task.status", operator: "EQUALS" as const, value: TaskStatus.DONE },
      { field: "task.priority", operator: "EQUALS" as const, value: TaskPriority.LOW },
    ],
  };
  assert(!AutomationConditions.evaluate(andConditionFail, evalContext), "3.9 Compound AND: One failing condition evaluates to false");

  // 3.8 Compound OR
  const orCondition = {
    operator: "OR" as const,
    conditions: [
      { field: "task.status", operator: "EQUALS" as const, value: TaskStatus.BLOCKED },
      { field: "task.priority", operator: "EQUALS" as const, value: TaskPriority.HIGH },
    ],
  };
  assert(AutomationConditions.evaluate(orCondition, evalContext), "3.10 Compound OR: At least one matching evaluates to true");

  // -------------------------------------------------------------
  // SECTION 4: ACTIONS & DOMAIN SERVICE INTEGRATION
  // -------------------------------------------------------------
  console.log("\n--- Section 4: Actions & Domain Service Integration ---");

  // 4.1 Action: SET_STATUS
  const statusRule = await AutomationService.createRule({
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    name: "Set In Progress on Creation",
    triggerType: "TASK_CREATED",
    conditions: [],
    actions: [{ type: "SET_STATUS", payload: { status: TaskStatus.IN_PROGRESS } }],
  });

  const taskForStatus = await TaskDomainService.createTask(memberUser.id, {
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    title: "Task for Auto Status",
  });

  await AutomationService.processEvent({
    id: `evt_status_${Date.now()}`,
    type: "TASK_CREATED",
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    payload: { taskId: taskForStatus.id },
  });

  const reloadedTask1 = await prisma.task.findUnique({ where: { id: taskForStatus.id } });
  assert(reloadedTask1?.status === TaskStatus.IN_PROGRESS, "4.1 Action SET_STATUS successfully moved task to IN_PROGRESS");

  // 4.2 Action: SET_PRIORITY
  const priorityRule = await AutomationService.createRule({
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    name: "Auto Elevate to High",
    triggerType: "TASK_CREATED",
    conditions: [],
    actions: [{ type: "SET_PRIORITY", payload: { priority: TaskPriority.HIGH } }],
  });

  await AutomationService.processEvent({
    id: `evt_prio_${Date.now()}`,
    type: "TASK_CREATED",
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    payload: { taskId: taskForStatus.id },
  });

  const reloadedTask2 = await prisma.task.findUnique({ where: { id: taskForStatus.id } });
  assert(reloadedTask2?.priority === TaskPriority.HIGH, "4.2 Action SET_PRIORITY successfully changed priority to HIGH");

  // 4.3 Action: ASSIGN_TASK
  const assignRule = await AutomationService.createRule({
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    name: "Auto Assign to Member",
    triggerType: "TASK_CREATED",
    conditions: [],
    actions: [{ type: "ASSIGN_TASK", payload: { assigneeId: memberUser.id } }],
  });

  await AutomationService.processEvent({
    id: `evt_assign_${Date.now()}`,
    type: "TASK_CREATED",
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    payload: { taskId: taskForStatus.id },
  });

  const reloadedTask3 = await prisma.task.findUnique({ where: { id: taskForStatus.id } });
  assert(reloadedTask3?.assigneeId === memberUser.id, "4.3 Action ASSIGN_TASK successfully assigned task to memberUser");

  // 4.4 Action: UNASSIGN_TASK
  const unassignRule = await AutomationService.createRule({
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    name: "Auto Unassign",
    triggerType: "TASK_CREATED",
    conditions: [],
    actions: [{ type: "UNASSIGN_TASK", payload: {} }],
  });

  await AutomationService.processEvent({
    id: `evt_unassign_${Date.now()}`,
    type: "TASK_CREATED",
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    payload: { taskId: taskForStatus.id },
  });

  const reloadedTask4 = await prisma.task.findUnique({ where: { id: taskForStatus.id } });
  assert(reloadedTask4?.assigneeId === null, "4.4 Action UNASSIGN_TASK successfully cleared assignee");

  // 4.5 Action: CREATE_NOTIFICATION
  const notifRule = await AutomationService.createRule({
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    name: "Auto Notify Lead",
    triggerType: "TASK_COMPLETED",
    conditions: [],
    actions: [
      {
        type: "CREATE_NOTIFICATION",
        payload: {
          recipientType: "LEAD",
          title: "Task Finished",
          description: "A task has been completed automatically.",
        },
      },
    ],
  });

  await AutomationService.processEvent({
    id: `evt_notif_${Date.now()}`,
    type: "TASK_COMPLETED",
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    payload: { taskId: taskForStatus.id, projectId: projectA.id },
  });

  const createdNotif = await prisma.notification.findFirst({
    where: {
      workspaceId: workspaceA.id,
      userId: ownerUser.id, // Project LEAD
      title: "Task Finished",
    },
  });
  assert(Boolean(createdNotif), "4.5 Action CREATE_NOTIFICATION created PostgreSQL notification for LEAD");

  // 4.6 Action: ADD_COMMENT
  const commentRule = await AutomationService.createRule({
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    name: "Auto Add Comment",
    triggerType: "TASK_STATUS_CHANGED",
    conditions: [],
    actions: [
      {
        type: "ADD_COMMENT",
        payload: { content: "Status transitioned automatically by Workflow Engine." },
      },
    ],
  });

  await AutomationService.processEvent({
    id: `evt_comment_${Date.now()}`,
    type: "TASK_STATUS_CHANGED",
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    payload: { taskId: taskForStatus.id },
  });

  const autoComment = await prisma.taskComment.findFirst({
    where: { taskId: taskForStatus.id, content: { contains: "[Automation]" } },
  });
  assert(Boolean(autoComment), "4.6 Action ADD_COMMENT created automated comment record on task");

  // -------------------------------------------------------------
  // SECTION 5: SECURITY & TENANT ISOLATION
  // -------------------------------------------------------------
  console.log("\n--- Section 5: Security & Tenant Isolation ---");

  // Task in Workspace B
  const taskInB = await TaskDomainService.createTask(ownerUser.id, {
    workspaceId: workspaceB.id,
    projectId: projectB.id,
    title: "Task in Beta Workspace",
  });

  // Event from Workspace B processed against Workspace A rules
  const resultsCrossWs = await AutomationService.processEvent({
    id: `evt_cross_${Date.now()}`,
    type: "TASK_CREATED",
    workspaceId: workspaceB.id,
    projectId: projectB.id,
    payload: { taskId: taskInB.id },
  });

  // Since all active rules so far belong to Workspace A, none should execute for Workspace B event
  assert(resultsCrossWs.length === 0, "5.1 Workspace A rules never execute for Workspace B events (Cross-Workspace Isolation)");

  // -------------------------------------------------------------
  // SECTION 6: IDEMPOTENCY PROTECTION
  // -------------------------------------------------------------
  console.log("\n--- Section 6: Idempotency Protection ---");

  const idempotencyEventId = `evt_idemp_${Date.now()}`;
  const idempEvent = {
    id: idempotencyEventId,
    type: "TASK_CREATED",
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    payload: { taskId: taskForStatus.id },
  };

  // First execution
  const res1 = await AutomationExecutor.executeRule(
    priorityRule,
    idempEvent,
    { event: idempEvent, task: taskForStatus }
  );
  assert(res1.status === "EXECUTED", "6.1 First execution of event runs and marks actions as executed");

  // Second delivery of same event
  const res2 = await AutomationExecutor.executeRule(
    priorityRule,
    idempEvent,
    { event: idempEvent, task: taskForStatus }
  );
  assert(res2.actionsExecuted === 0, "6.2 Second delivery of identical event is skipped via idempotency check");

  // -------------------------------------------------------------
  // SECTION 7: RECURSION & CIRCULAR PROTECTION
  // -------------------------------------------------------------
  console.log("\n--- Section 7: Recursion & Circular Protection ---");

  // Create circular execution context with depth = MAX_AUTOMATION_DEPTH
  const maxDepthContext = {
    rootEventId: `evt_root_${Date.now()}`,
    depth: MAX_AUTOMATION_DEPTH,
    visitedRules: ["rule_prev_1", "rule_prev_2"],
  };

  const recursionResult = await AutomationExecutor.executeRule(
    statusRule,
    idempEvent,
    { event: idempEvent, task: taskForStatus },
    maxDepthContext
  );

  assert(recursionResult.status === "SKIPPED", "7.1 Rule chain at MAX_DEPTH is halted");
  assert(recursionResult.reason === "MAX_DEPTH_EXCEEDED", "7.2 Skipped reason is MAX_DEPTH_EXCEEDED");

  // Circular visited rule check
  const circularContext = {
    rootEventId: `evt_root_${Date.now()}`,
    depth: 1,
    visitedRules: [statusRule.id], // Already visited statusRule!
  };

  const circularResult = await AutomationExecutor.executeRule(
    statusRule,
    idempEvent,
    { event: idempEvent, task: taskForStatus },
    circularContext
  );

  assert(circularResult.status === "SKIPPED", "7.3 Circular invocation of same rule in chain is halted");
  assert(circularResult.reason === "CIRCULAR_RULE_DETECTED", "7.4 Skipped reason is CIRCULAR_RULE_DETECTED");

  // -------------------------------------------------------------
  // SECTION 8: FAILURE ISOLATION
  // -------------------------------------------------------------
  console.log("\n--- Section 8: Failure Isolation ---");

  // Create a rule with an invalid/non-existent task target to force failure
  const failingRule = await AutomationService.createRule({
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    name: "Failing Rule",
    triggerType: "TASK_CREATED",
    conditions: [],
    actions: [{ type: "SET_STATUS", payload: { status: TaskStatus.DONE } }],
  });

  const failureEvent = {
    id: `evt_fail_${Date.now()}`,
    type: "TASK_CREATED",
    workspaceId: workspaceA.id,
    projectId: projectA.id,
    payload: { taskId: "non_existent_task_id_99999" },
  };

  const failExec = await AutomationExecutor.executeRule(
    failingRule,
    failureEvent,
    { event: failureEvent }
  );

  assert(failExec.status === "FAILED", "8.1 Action execution failure is captured with FAILED status");
  assert(Boolean(failExec.error), "8.2 Execution result contains structured error reason");

  // Verify that an execution failure does not throw or crash caller
  let didThrow = false;
  try {
    await AutomationService.processEvent(failureEvent);
  } catch {
    didThrow = true;
  }
  assert(!didThrow, "8.3 Automation failure is completely isolated and never aborts caller execution");

  // -------------------------------------------------------------
  // CLEANUP TEST FIXTURES
  // -------------------------------------------------------------
  console.log("\n--- Cleaning up test fixtures ---");
  await prisma.automationRule.deleteMany({
    where: { OR: [{ workspaceId: workspaceA.id }, { workspaceId: workspaceB.id }] },
  });
  await prisma.notification.deleteMany({
    where: { OR: [{ workspaceId: workspaceA.id }, { workspaceId: workspaceB.id }] },
  });
  await prisma.taskComment.deleteMany({
    where: { taskId: { in: [task1.id, taskForStatus.id, taskInB.id] } },
  });
  await prisma.task.deleteMany({
    where: { projectId: { in: [projectA.id, projectB.id] } },
  });
  await prisma.projectMember.deleteMany({
    where: { projectId: { in: [projectA.id, projectB.id] } },
  });
  await prisma.project.deleteMany({
    where: { id: { in: [projectA.id, projectB.id] } },
  });
  await prisma.workspaceMember.deleteMany({
    where: { OR: [{ userId: foreignUser.id }, { workspaceId: workspaceB.id }] },
  });
  await prisma.user.delete({ where: { id: foreignUser.id } });
  await prisma.workspace.delete({ where: { id: workspaceB.id } });

  console.log("\n===============================================================");
  console.log(` PHASE 5 VERIFICATION COMPLETE: ${passed} / ${passed + failed} PASS`);
  console.log("===============================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase5AutomationTests()
  .catch((err) => {
    console.error("Phase 5 test suite fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
