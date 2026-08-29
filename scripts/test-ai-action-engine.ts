import { prisma } from "../src/lib/prisma";
import { Role } from "@prisma/client";
import { generateAiPlan, parseHeuristicIntent } from "../src/lib/ai/planner";
import { validateAiPlan } from "../src/lib/ai/validator";
import { executeAiPlan } from "../src/lib/ai/executor";
import { getAiExecutionContext } from "../src/lib/ai/context";
import { validateActionPermission, ACTION_PERMISSION_MAPPINGS } from "../src/lib/ai/permissions";
import { ACTION_REGISTRY } from "../src/lib/ai/registry";
import { resolveWorkspaceMember, resolveWorkspaceProject, resolveWorkspaceTask } from "../src/lib/ai/entityResolver";
import { resolveNaturalDate } from "../src/lib/ai/dateResolver";
import { getLatestExecutionReceipt, generateUndoPlanFromReceipt } from "../src/lib/ai/receiptStore";
import { AiExecutionContext, AiPlan } from "../src/lib/ai/types";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passedCount++;
    console.log(`  ✓ [PASS ${passedCount.toString().padStart(3, "0")}] ${testName}`);
  } else {
    failedCount++;
    console.error(`  ✗ [FAIL] ${testName}${detail ? ` — ${detail}` : ""}`);
  }
}

async function runTestSuite() {
  console.log("\n================================================================================");
  console.log("SYNPLAN — PHASE 2: AI CORE + ACTION ENGINE VERIFICATION SUITE");
  console.log("================================================================================\n");

  const mockContext: AiExecutionContext = {
    workspaceId: "ws_test_alpha",
    workspaceName: "Engineering Core",
    userId: "usr_alice",
    userName: "Alice Developer",
    userRole: Role.MEMBER,
    currentProjectId: "prj_alpha_1",
    currentProjectName: "Alpha Platform",
    serverTime: "2026-08-29T10:00:00.000Z",
    isMock: true,
    members: [
      { id: "mem_1", userId: "usr_alice", name: "Alice Developer", email: "alice@synplan.com", role: Role.MEMBER },
      { id: "mem_2", userId: "usr_bob", name: "Bob Designer", email: "bob@synplan.com", role: Role.MEMBER },
      { id: "mem_3", userId: "usr_charlie", name: "Charlie Owner", email: "charlie@synplan.com", role: Role.OWNER },
      { id: "mem_4", userId: "usr_andi_s", name: "Andi Saputra", email: "andi.s@synplan.com", role: Role.MEMBER },
      { id: "mem_5", userId: "usr_andi_p", name: "Andi Pratama", email: "andi.p@synplan.com", role: Role.MEMBER },
    ],
    projects: [
      { id: "prj_alpha_1", name: "Alpha Platform", status: "ACTIVE", totalTasks: 5, deadline: "2026-09-30" },
      { id: "prj_alpha_2", name: "Mobile App V2", status: "PLANNING", totalTasks: 2, deadline: "2026-10-15" },
    ],
    phases: [
      { id: "ph_1", projectId: "prj_alpha_1", name: "Design", order: 1 },
      { id: "ph_2", projectId: "prj_alpha_1", name: "Development", order: 2 },
    ],
    tasks: [
      { id: "tsk_1", projectId: "prj_alpha_1", title: "API Authentication", status: "TODO", priority: "HIGH", assigneeId: "usr_alice" },
      { id: "tsk_2", projectId: "prj_alpha_1", title: "Database Schema", status: "IN_PROGRESS", priority: "HIGH", assigneeId: "usr_alice" },
    ],
  };

  // --------------------------------------------------------------------------
  console.log("--- STAGE 1: Natural Language & Intent Parsing ---");
  // --------------------------------------------------------------------------
  const p1 = parseHeuristicIntent("buatkan project Website Toko Roti deadline 15 September", mockContext);
  assert(p1.actions.length > 0, "Generates actions for create project");
  assert(p1.actions[0].type === "CREATE_PROJECT", "Identifies CREATE_PROJECT action type");
  assert(p1.actions[0].payload.name.toLowerCase().includes("toko roti"), "Extracts project name 'Toko Roti'");
  assert(p1.actions[0].payload.deadline === "2026-09-15", "Normalizes deadline to 2026-09-15");

  const pCancel = await generateAiPlan("batal deh", mockContext);
  assert(pCancel.actions.length === 0, "Cancellation prompt produces 0 actions");
  assert(pCancel.assistantMessage.toLowerCase().includes("dibatalkan"), "Cancellation returns cancellation confirmation");

  const pTask = parseHeuristicIntent("buatkan task Setup Redux dan assign ke Bob", mockContext);
  assert(pTask.actions.some((a) => a.type === "CREATE_TASK"), "Identifies CREATE_TASK intent");
  assert(pTask.actions[0].payload.assigneeName === "Bob" || pTask.actions[0].payload.assigneeName === "Bob Designer", "Extracts assignee 'Bob'");

  // --------------------------------------------------------------------------
  console.log("\n--- STAGE 2: Action Registry Schema & Validation ---");
  // --------------------------------------------------------------------------
  const allActionTypes = Object.keys(ACTION_REGISTRY);
  assert(allActionTypes.includes("CREATE_PROJECT"), "Registry contains CREATE_PROJECT");
  assert(allActionTypes.includes("UPDATE_PROJECT"), "Registry contains UPDATE_PROJECT");
  assert(allActionTypes.includes("DELETE_PROJECT"), "Registry contains DELETE_PROJECT");
  assert(allActionTypes.includes("CREATE_TASK"), "Registry contains CREATE_TASK");
  assert(allActionTypes.includes("UPDATE_TASK"), "Registry contains UPDATE_TASK");
  assert(allActionTypes.includes("DELETE_TASK"), "Registry contains DELETE_TASK");
  assert(allActionTypes.includes("ASSIGN_TASK"), "Registry contains ASSIGN_TASK");
  assert(allActionTypes.includes("ADD_MEMBER"), "Registry contains ADD_MEMBER");
  assert(allActionTypes.includes("CREATE_PHASE"), "Registry contains CREATE_PHASE");
  assert(allActionTypes.includes("UPDATE_PHASE"), "Registry contains UPDATE_PHASE");
  assert(allActionTypes.includes("DELETE_PHASE"), "Registry contains DELETE_PHASE");

  const invalidTaskValidation = ACTION_REGISTRY.CREATE_TASK.validate({ title: "" }, mockContext, new Map());
  assert(!invalidTaskValidation.isValid, "Rejects CREATE_TASK without title");
  assert(invalidTaskValidation.errors.length > 0, "Provides validation error message for empty title");

  // --------------------------------------------------------------------------
  console.log("\n--- STAGE 3: Server-Side RBAC Enforcement Matrix ---");
  // --------------------------------------------------------------------------
  // OWNER check
  assert(validateActionPermission("CREATE_PROJECT", Role.OWNER).allowed, "OWNER can CREATE_PROJECT");
  assert(validateActionPermission("DELETE_PROJECT", Role.OWNER).allowed, "OWNER can DELETE_PROJECT");
  assert(validateActionPermission("DELETE_PHASE", Role.OWNER).allowed, "OWNER can DELETE_PHASE");
  assert(validateActionPermission("REMOVE_MEMBER", Role.OWNER).allowed, "OWNER can REMOVE_MEMBER");

  // ADMIN check
  assert(validateActionPermission("CREATE_PROJECT", Role.ADMIN).allowed, "ADMIN can CREATE_PROJECT");
  assert(validateActionPermission("DELETE_PROJECT", Role.ADMIN).allowed, "ADMIN can DELETE_PROJECT");
  assert(validateActionPermission("DELETE_PHASE", Role.ADMIN).allowed, "ADMIN can DELETE_PHASE");
  assert(validateActionPermission("REMOVE_MEMBER", Role.ADMIN).allowed, "ADMIN can REMOVE_MEMBER");

  // MEMBER check
  assert(validateActionPermission("CREATE_PROJECT", Role.MEMBER).allowed, "MEMBER can CREATE_PROJECT");
  assert(validateActionPermission("CREATE_TASK", Role.MEMBER).allowed, "MEMBER can CREATE_TASK");
  assert(validateActionPermission("ASSIGN_TASK", Role.MEMBER).allowed, "MEMBER can ASSIGN_TASK");
  assert(!validateActionPermission("DELETE_PROJECT", Role.MEMBER).allowed, "MEMBER CANNOT DELETE_PROJECT (Forbidden)");
  assert(!validateActionPermission("DELETE_PHASE", Role.MEMBER).allowed, "MEMBER CANNOT DELETE_PHASE (Forbidden)");
  assert(!validateActionPermission("REMOVE_MEMBER", Role.MEMBER).allowed, "MEMBER CANNOT REMOVE_MEMBER (Forbidden)");

  // VIEWER check
  assert(!validateActionPermission("CREATE_PROJECT", Role.VIEWER).allowed, "VIEWER CANNOT CREATE_PROJECT");
  assert(!validateActionPermission("CREATE_TASK", Role.VIEWER).allowed, "VIEWER CANNOT CREATE_TASK");
  assert(!validateActionPermission("DELETE_PROJECT", Role.VIEWER).allowed, "VIEWER CANNOT DELETE_PROJECT");
  assert(!validateActionPermission("ASSIGN_TASK", Role.VIEWER).allowed, "VIEWER CANNOT ASSIGN_TASK");

  // --------------------------------------------------------------------------
  console.log("\n--- STAGE 4: Cross-Workspace & IDOR Protection ---");
  // --------------------------------------------------------------------------
  let idorDeleteCaught = false;
  try {
    // Attempting to delete a foreign project in real DB mode will fail workspace check
    await ACTION_REGISTRY.DELETE_PROJECT.execute({ id: "foreign_prj_999", name: "Foreign" }, { ...mockContext, isMock: false }, new Map());
  } catch (e: any) {
    idorDeleteCaught = true;
  }
  assert(idorDeleteCaught, "Attempt to delete foreign project throws workspace boundary exception");

  let idorTaskCaught = false;
  try {
    await ACTION_REGISTRY.DELETE_TASK.execute({ id: "foreign_tsk_999" }, { ...mockContext, isMock: false }, new Map());
  } catch (e: any) {
    idorTaskCaught = true;
  }
  assert(idorTaskCaught, "Attempt to delete foreign task throws workspace boundary exception");

  let idorAssignCaught = false;
  try {
    await ACTION_REGISTRY.ASSIGN_TASK.execute({ taskId: "foreign_tsk_999", assigneeName: "Alice" }, { ...mockContext, isMock: false }, new Map());
  } catch (e: any) {
    idorAssignCaught = true;
  }
  assert(idorAssignCaught, "Attempt to assign foreign task throws workspace boundary exception");

  // --------------------------------------------------------------------------
  console.log("\n--- STAGE 5: Entity Resolution & Zero Hallucinations ---");
  // --------------------------------------------------------------------------
  const resBob = resolveWorkspaceMember("bob", mockContext.members);
  assert(resBob.member?.userId === "usr_bob", "Resolves fuzzy 'bob' -> Bob Designer (usr_bob)");

  const resAmbiguous = resolveWorkspaceMember("Andi", mockContext.members);
  assert(resAmbiguous.isAmbiguous, "Flags ambiguous 'Andi' with multiple matching squad members");
  assert(resAmbiguous.candidates.length === 2, "Returns 2 candidates for Andi");

  const resUnknown = resolveWorkspaceMember("Zulfa", mockContext.members);
  assert(resUnknown.notFound, "Flags non-existent member 'Zulfa' with notFound: true");
  assert(!resUnknown.member, "Does not invent fake user ID for unknown member");

  const resProj = resolveWorkspaceProject("Alpha", mockContext);
  assert(resProj.project?.id === "prj_alpha_1", "Resolves project 'Alpha' -> Alpha Platform (prj_alpha_1)");

  // --------------------------------------------------------------------------
  console.log("\n--- STAGE 6: Safety & Confirmation Policy ---");
  // --------------------------------------------------------------------------
  const deletePlan: AiPlan = {
    id: "plan_del_1",
    userPrompt: "hapus project Alpha Platform",
    assistantMessage: "Menghapus project",
    status: "READY",
    requiresConfirmation: false,
    isDestructive: false,
    warnings: [],
    planner: "heuristic",
    provider: "fallback",
    createdAt: new Date().toISOString(),
    actions: [
      {
        id: "act_del_1",
        type: "DELETE_PROJECT",
        summary: "Hapus project Alpha Platform",
        riskLevel: "CRITICAL",
        requiredRole: Role.ADMIN,
        status: "READY",
        payload: { id: "prj_alpha_1", name: "Alpha Platform" },
      },
    ],
  };

  const validatedDelete = validateAiPlan(deletePlan, { ...mockContext, userRole: Role.ADMIN });
  assert(validatedDelete.validatedPlan.requiresConfirmation === true, "DELETE_PROJECT strictly requires confirmation");
  assert(validatedDelete.validatedPlan.isDestructive === true, "DELETE_PROJECT is flagged as isDestructive");
  assert(validatedDelete.validatedPlan.status === "NEEDS_CONFIRMATION", "Plan status is set to NEEDS_CONFIRMATION");

  // --------------------------------------------------------------------------
  console.log("\n--- STAGE 7: Topological DAG & Dependency Execution ---");
  // --------------------------------------------------------------------------
  const compoundPlan: AiPlan = {
    id: "plan_comp_1",
    userPrompt: "Buat project Beta dengan 2 task",
    assistantMessage: "Menyiapkan project",
    status: "READY",
    requiresConfirmation: false,
    isDestructive: false,
    warnings: [],
    planner: "heuristic",
    provider: "fallback",
    createdAt: new Date().toISOString(),
    actions: [
      {
        id: "act_proj",
        type: "CREATE_PROJECT",
        summary: "Buat project Beta",
        riskLevel: "MEDIUM",
        requiredRole: Role.MEMBER,
        status: "READY",
        payload: { name: "Beta" },
      },
      {
        id: "act_task_1",
        type: "CREATE_TASK",
        summary: "Buat task 1",
        riskLevel: "MEDIUM",
        requiredRole: Role.MEMBER,
        status: "READY",
        dependsOn: ["act_proj"],
        payload: { title: "Task 1" },
      },
      {
        id: "act_task_2",
        type: "CREATE_TASK",
        summary: "Buat task 2",
        riskLevel: "MEDIUM",
        requiredRole: Role.MEMBER,
        status: "READY",
        dependsOn: ["act_proj"],
        payload: { title: "Task 2" },
      },
    ],
  };

  const execRes = await executeAiPlan(compoundPlan, mockContext);
  assert(execRes.success === true, "Compound plan executes successfully");
  assert(execRes.results.length === 3, "All 3 actions executed");
  assert(execRes.createdEntities.projectIds.length > 0, "Created project ID tracked in result");
  assert(execRes.receipt !== undefined, "Execution receipt generated");

  // Dependency failure cascade test
  const failingParentPlan: AiPlan = {
    id: "plan_fail_dag",
    userPrompt: "Test fail DAG",
    assistantMessage: "Test",
    status: "READY",
    requiresConfirmation: false,
    isDestructive: false,
    warnings: [],
    planner: "heuristic",
    provider: "fallback",
    createdAt: new Date().toISOString(),
    actions: [
      {
        id: "act_fail_parent",
        type: "CREATE_PROJECT",
        summary: "Missing name project",
        riskLevel: "MEDIUM",
        requiredRole: Role.MEMBER,
        status: "READY",
        payload: { name: "" }, // Will fail validation in mock
      },
      {
        id: "act_child_task",
        type: "CREATE_TASK",
        summary: "Dependent task",
        riskLevel: "MEDIUM",
        requiredRole: Role.MEMBER,
        status: "READY",
        dependsOn: ["act_fail_parent"],
        payload: { title: "Child Task" },
      },
    ],
  };

  const failExecRes = await executeAiPlan(failingParentPlan, mockContext);
  assert(failExecRes.results[0].status === "FAILED", "Parent action marked FAILED");
  assert(failExecRes.results[1].status === "BLOCKED", "Child action cascaded to BLOCKED");
  assert(Boolean(failExecRes.results[1].blockedReason?.includes("act_fail_parent")), "Child blockedReason explains dependency failure");

  // --------------------------------------------------------------------------
  console.log("\n--- STAGE 8: Execution Receipt & Undo Rollback ---");
  // --------------------------------------------------------------------------
  const receipt = execRes.receipt;
  assert(receipt !== undefined, "Execution receipt exists on compound execution result");
  assert(receipt?.planId === compoundPlan.id, "Receipt planId matches executed plan");

  if (receipt) {
    const { plan: undoPlan, error: undoError } = generateUndoPlanFromReceipt(receipt, mockContext);
    assert(!undoError, "Generates undo plan without errors");
    assert(undoPlan !== undefined, "Undo plan constructed");
    assert(undoPlan?.actions.length === 3, "Undo plan reverses all 3 actions");
    assert(undoPlan?.actions[0].type === "DELETE_TASK", "Undo deletes tasks before project (reverse order)");
    assert(undoPlan?.requiresConfirmation === true, "Undo plan requires confirmation");
  }

  // --------------------------------------------------------------------------
  console.log("\n--- STAGE 9: Idempotency Caching ---");
  // --------------------------------------------------------------------------
  const idempotencyKey = `idem_${Date.now()}`;
  const firstExec = await executeAiPlan(compoundPlan, mockContext, idempotencyKey);
  const secondExec = await executeAiPlan(compoundPlan, mockContext, idempotencyKey);
  assert(firstExec.receipt?.executionId === secondExec.receipt?.executionId, "Idempotent re-run returns cached result");

  console.log("\n================================================================================");
  console.log(`TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("================================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((e) => {
  console.error("Test Suite Fatal Error:", e);
  process.exit(1);
});
