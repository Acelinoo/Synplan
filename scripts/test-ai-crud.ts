import { generateAiPlan, parseHeuristicIntent } from "../src/lib/ai/planner";
import { validateAiPlan } from "../src/lib/ai/validator";
import { ACTION_REGISTRY } from "../src/lib/ai/registry";
import { AiExecutionContext, MAX_BATCH_ACTIONS } from "../src/lib/ai/types";
import { Role } from "@prisma/client";

// Global Mock Execution Context for Phase 4 CRUD & Batch Testing
const mockContext: AiExecutionContext = {
  workspaceId: "ws_eng_core_1",
  workspaceName: "Engineering Core",
  userId: "usr_marchel",
  userName: "Marchelino Kurniawan",
  userRole: Role.OWNER,
  currentProjectId: "prj_cafe_01",
  currentProjectName: "Website Cafe & Resto",
  currentTaskId: "tsk_1",
  serverTime: "2026-08-30T04:30:00.000Z",
  isMock: true,
  members: [
    { id: "mem_1", userId: "usr_marchel", name: "Marchelino Kurniawan", email: "marchelinokurniawan321@gmail.com", role: Role.OWNER },
    { id: "mem_2", userId: "usr_sarah", name: "Sarah Chen", email: "sarah@synplan.dev", role: Role.ADMIN },
    { id: "mem_3", userId: "usr_bob", name: "Bob Designer", email: "bob@synplan.dev", role: Role.MEMBER },
    { id: "mem_4", userId: "usr_alice", name: "Alice Engineer", email: "alice@synplan.dev", role: Role.MEMBER },
    { id: "mem_5", userId: "usr_andi_1", name: "Andi Saputra", email: "andi.s@synplan.dev", role: Role.MEMBER },
    { id: "mem_6", userId: "usr_andi_2", name: "Andi Pratama", email: "andi.p@synplan.dev", role: Role.MEMBER },
  ],
  projects: [
    { id: "prj_cafe_01", name: "Website Cafe & Resto", status: "ACTIVE", totalTasks: 6, deadline: "2026-09-01" },
    { id: "prj_bakery_02", name: "Website Bakery", status: "PLANNING", totalTasks: 2, deadline: "2026-09-15" },
  ],
  phases: [
    { id: "phs_design", projectId: "prj_cafe_01", name: "Design Phase", order: 1 },
    { id: "phs_dev", projectId: "prj_cafe_01", name: "Development Phase", order: 2 },
    { id: "phs_qa", projectId: "prj_cafe_01", name: "Testing Phase", order: 3 },
  ],
  tasks: [
    { id: "tsk_1", projectId: "prj_cafe_01", phaseId: "phs_design", title: "Desain Homepage", status: "IN_PROGRESS", priority: "HIGH", assigneeId: "usr_marchel", dueDate: "2026-09-02T00:00:00.000Z", description: "Buat wireframe dan mockup homepage" },
    { id: "tsk_2", projectId: "prj_cafe_01", phaseId: "phs_dev", title: "API Payment Gateway", status: "TODO", priority: "URGENT", assigneeId: "usr_sarah", dueDate: "2026-09-05T00:00:00.000Z", description: "Integrasi Midtrans" },
    { id: "tsk_3", projectId: "prj_cafe_01", phaseId: "phs_dev", title: "Backend Auth Service", status: "TODO", priority: "MEDIUM", assigneeId: undefined, dueDate: "2026-09-03T00:00:00.000Z", description: "OAuth2 & session auth" },
    { id: "tsk_4", projectId: "prj_cafe_01", phaseId: "phs_dev", title: "Backend Order System", status: "TODO", priority: "HIGH", assigneeId: undefined, dueDate: "2026-09-04T00:00:00.000Z", description: "Cart & order processing" },
    { id: "tsk_5", projectId: "prj_cafe_01", phaseId: "phs_qa", title: "QA Regression Testing", status: "TODO", priority: "LOW", assigneeId: "usr_alice", dueDate: "2026-09-10T00:00:00.000Z", description: "E2E testing" },
    { id: "tsk_6", projectId: "prj_cafe_01", phaseId: "phs_design", title: "Desain Menu Item", status: "DONE", priority: "MEDIUM", assigneeId: "usr_bob", dueDate: "2026-08-28T00:00:00.000Z", description: "Cards & modal dialogs" },
    { id: "tsk_bakery_1", projectId: "prj_bakery_02", phaseId: undefined, title: "Logo Bakery", status: "TODO", priority: "HIGH", assigneeId: "usr_bob", dueDate: "2026-09-12T00:00:00.000Z", description: "Logo vector" },
  ],
};

let passed = 0;
let total = 0;

function assert(condition: boolean, testName: string, details?: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✓ [PASS ${String(total).padStart(3, "0")}] ${testName}`);
  } else {
    console.error(`  ✗ [FAIL ${String(total).padStart(3, "0")}] ${testName}`);
    if (details) console.error(`      Details: ${details}`);
  }
}

async function runPhase4Tests() {
  console.log("\n" + "=".repeat(80));
  console.log(" SYNPLAN PHASE 4 — AI PROJECT / TASK CRUD + BATCH OPERATIONS TEST SUITE");
  console.log("=".repeat(80) + "\n");

  // =========================================================================
  // 1. READ OPERATIONS (GROUND TRUTH RETRIEVAL WITHOUT MUTATIONS)
  // =========================================================================
  console.log("--- 1. READ OPERATIONS (ZERO MUTATIONS) ---");

  // Test 1.1: Project List Query
  const plan1_1 = parseHeuristicIntent("tampilkan semua project", mockContext);
  assert(
    plan1_1.actions.length === 0 &&
    plan1_1.status === "READY" &&
    plan1_1.assistantMessage.includes("Website Cafe & Resto") &&
    plan1_1.assistantMessage.includes("Website Bakery"),
    "READ: 'tampilkan semua project' returns grounded project list with 0 actions"
  );

  // Test 1.2: Unfinished Tasks Query
  const plan1_2 = parseHeuristicIntent("task apa saja yang belum selesai?", mockContext);
  assert(
    plan1_2.actions.length === 0 &&
    plan1_2.assistantMessage.includes("Desain Homepage") &&
    plan1_2.assistantMessage.includes("API Payment Gateway") &&
    !plan1_2.assistantMessage.includes("Desain Menu Item"),
    "READ: 'task apa saja yang belum selesai?' lists only incomplete tasks"
  );

  // Test 1.3: Specific Task Assignee Query
  const plan1_3 = parseHeuristicIntent("siapa yang mengerjakan Desain Homepage?", mockContext);
  assert(
    plan1_3.actions.length === 0 &&
    plan1_3.assistantMessage.includes("Marchelino Kurniawan"),
    "READ: 'siapa yang mengerjakan Desain Homepage?' identifies correct assignee"
  );

  // Test 1.4: Phase Task Count Query
  const plan1_4 = parseHeuristicIntent("berapa task di Development Phase?", mockContext);
  assert(
    plan1_4.actions.length === 0 &&
    plan1_4.assistantMessage.includes("3 task"),
    "READ: 'berapa task di Development Phase?' counts 3 matching tasks correctly"
  );

  // Test 1.5: Weekly Deadline Filter Query
  const plan1_5 = parseHeuristicIntent("tampilkan task yang deadline-nya minggu ini", mockContext);
  assert(
    plan1_5.actions.length === 0 &&
    plan1_5.assistantMessage.includes("Desain Homepage") &&
    plan1_5.assistantMessage.includes("API Payment Gateway"),
    "READ: 'tampilkan task yang deadline-nya minggu ini' filters relative weekly tasks"
  );

  // Test 1.6: Scoped Project Task Query
  const plan1_6 = parseHeuristicIntent("apa saja task di project Website Bakery?", mockContext);
  assert(
    plan1_6.actions.length === 0 &&
    plan1_6.assistantMessage.includes("Logo Bakery") &&
    !plan1_6.assistantMessage.includes("API Payment Gateway"),
    "READ: Scoped query filters tasks by requested project name"
  );

  // Test 1.7: Workload Inspection Query
  const plan1_7 = parseHeuristicIntent("lihat detail project Website Cafe & Resto", mockContext);
  assert(
    plan1_7.actions.length === 0 &&
    plan1_7.status === "READY",
    "READ: 'lihat detail project' returns informative view without mutating state"
  );

  // =========================================================================
  // 2. TASK SINGLE UPDATE & MUTATIONS
  // =========================================================================
  console.log("\n--- 2. TASK UPDATE OPERATIONS (PARTIAL MUTATIONS) ---");

  // Test 2.1: Task Status Update to DONE
  const plan2_1 = parseHeuristicIntent("selesaikan task Desain Homepage", mockContext);
  assert(
    plan2_1.actions.length === 1 &&
    plan2_1.actions[0].type === "UPDATE_TASK" &&
    plan2_1.actions[0].payload.status === "DONE",
    "UPDATE: 'selesaikan task Desain Homepage' generates UPDATE_TASK status DONE"
  );

  // Test 2.2: Task Priority Update to URGENT
  const plan2_2 = parseHeuristicIntent("ubah priority Desain Homepage jadi urgent", mockContext);
  assert(
    plan2_2.actions.length === 1 &&
    plan2_2.actions[0].type === "UPDATE_TASK" &&
    plan2_2.actions[0].payload.priority === "URGENT",
    "UPDATE: 'ubah priority Desain Homepage jadi urgent' sets priority URGENT"
  );

  // Test 2.3: Task Deadline Update
  const plan2_3 = parseHeuristicIntent("ubah deadline task Desain Homepage jadi 10 September", mockContext);
  assert(
    plan2_3.actions.length === 1 &&
    plan2_3.actions[0].type === "UPDATE_TASK" &&
    plan2_3.actions[0].payload.dueDate === "2026-09-10",
    "UPDATE: 'ubah deadline task Desain Homepage jadi 10 September' resolves ISO date"
  );

  // Test 2.4: Task Rename
  const plan2_4 = parseHeuristicIntent("rename task Desain Homepage jadi Landing Page UI", mockContext);
  assert(
    plan2_4.actions.length === 1 &&
    plan2_4.actions[0].type === "UPDATE_TASK" &&
    plan2_4.actions[0].payload.title === "Landing Page UI",
    "UPDATE: 'rename task ... jadi ...' sets title correctly"
  );

  // Test 2.5: Move Task to Different Phase
  const plan2_5 = parseHeuristicIntent("pindahkan task Desain Homepage ke phase Development Phase", mockContext);
  assert(
    plan2_5.actions.length === 1 &&
    plan2_5.actions[0].type === "UPDATE_TASK" &&
    plan2_5.actions[0].payload.phaseId === "phs_dev",
    "UPDATE: 'pindahkan task ... ke phase ...' updates phaseId to target phase"
  );

  // Test 2.6: Assign Task to Member
  const plan2_6 = parseHeuristicIntent("assign API Payment Gateway ke Sarah", mockContext);
  assert(
    plan2_6.actions.length === 1 &&
    plan2_6.actions[0].type === "ASSIGN_TASK" &&
    plan2_6.actions[0].payload.assigneeName === "Sarah Chen" &&
    plan2_6.actions[0].payload.assigneeId === "usr_sarah",
    "UPDATE: 'assign ... ke ...' resolves workspace member correctly"
  );

  // Test 2.7: Unassign Task
  const plan2_7 = parseHeuristicIntent("hapus assignee Desain Homepage", mockContext);
  assert(
    plan2_7.actions.length === 1 &&
    plan2_7.actions[0].type === "UPDATE_TASK" &&
    plan2_7.actions[0].payload.unassign === true &&
    plan2_7.actions[0].payload.assigneeId === null,
    "UPDATE: 'hapus assignee ...' sets unassign: true and assigneeId: null"
  );

  // Test 2.8: Multi-field Task Update
  const plan2_8 = parseHeuristicIntent("ubah Desain Homepage: deadline 12 September, priority urgent, assign ke Sarah", mockContext);
  assert(
    plan2_8.actions.length === 1 &&
    plan2_8.actions[0].type === "UPDATE_TASK" &&
    plan2_8.actions[0].payload.dueDate === "2026-09-12" &&
    plan2_8.actions[0].payload.priority === "URGENT" &&
    plan2_8.actions[0].payload.assigneeName === "Sarah",
    "UPDATE: Multi-field update combines deadline, priority, and assignee seamlessly"
  );

  // Test 2.9: Reopen Completed Task
  const plan2_9 = parseHeuristicIntent("buka kembali task Desain Menu Item", mockContext);
  assert(
    plan2_9.actions.length === 1 &&
    plan2_9.actions[0].type === "UPDATE_TASK" &&
    plan2_9.actions[0].payload.status === "TODO",
    "UPDATE: 'buka kembali task ...' sets status back to TODO"
  );

  // =========================================================================
  // 3. PROJECT & PHASE UPDATE OPERATIONS
  // =========================================================================
  console.log("\n--- 3. PROJECT & PHASE UPDATE OPERATIONS ---");

  // Test 3.1: Rename Project
  const plan3_1 = parseHeuristicIntent("rename project Website Cafe & Resto menjadi Cafe Resto Digital", mockContext);
  assert(
    plan3_1.actions.length === 1 &&
    plan3_1.actions[0].type === "UPDATE_PROJECT" &&
    plan3_1.actions[0].payload.name === "Cafe Resto Digital",
    "UPDATE: 'rename project ... menjadi ...' generates UPDATE_PROJECT"
  );

  // Test 3.2: Update Project Deadline
  const plan3_2 = parseHeuristicIntent("ubah deadline project Website Cafe & Resto jadi 20 September", mockContext);
  const val3_2 = validateAiPlan(plan3_2, mockContext);
  assert(
    val3_2.validatedPlan.actions.length === 1 &&
    val3_2.validatedPlan.actions[0].type === "UPDATE_PROJECT" &&
    val3_2.validatedPlan.actions[0].payload.deadline === "2026-09-20",
    "UPDATE: 'ubah deadline project ...' updates project deadline"
  );

  // Test 3.3: Rename Phase
  const plan3_3 = parseHeuristicIntent("rename phase Design Phase menjadi UI/UX Concept", mockContext);
  assert(
    plan3_3.actions.length === 1 &&
    plan3_3.actions[0].type === "UPDATE_PHASE" &&
    plan3_3.actions[0].payload.name === "UI/UX Concept" &&
    plan3_3.actions[0].payload.phaseId === "phs_design",
    "UPDATE: 'rename phase ... menjadi ...' generates UPDATE_PHASE with phaseId"
  );

  // =========================================================================
  // 4. DESTRUCTIVE DELETION OPERATIONS
  // =========================================================================
  console.log("\n--- 4. DESTRUCTIVE DELETION OPERATIONS ---");

  // Test 4.1: Delete Task
  const plan4_1 = parseHeuristicIntent("hapus task QA Regression Testing", mockContext);
  const val4_1 = validateAiPlan(plan4_1, mockContext);
  assert(
    val4_1.validatedPlan.actions.length === 1 &&
    val4_1.validatedPlan.actions[0].type === "DELETE_TASK" &&
    val4_1.validatedPlan.actions[0].isDestructive === true &&
    val4_1.validatedPlan.actions[0].requiresConfirmation === true &&
    val4_1.validatedPlan.status === "NEEDS_CONFIRMATION",
    "DELETE: 'hapus task ...' requires confirmation, isDestructive: true"
  );

  // Test 4.2: Delete Phase
  const plan4_2 = parseHeuristicIntent("hapus phase Testing Phase", mockContext);
  const val4_2 = validateAiPlan(plan4_2, mockContext);
  assert(
    val4_2.validatedPlan.actions.length === 1 &&
    val4_2.validatedPlan.actions[0].type === "DELETE_PHASE" &&
    val4_2.validatedPlan.actions[0].isDestructive === true &&
    val4_2.validatedPlan.status === "NEEDS_CONFIRMATION",
    "DELETE: 'hapus phase ...' requires confirmation, isDestructive: true"
  );

  // Test 4.3: Delete Project
  const plan4_3 = parseHeuristicIntent("hapus project Website Cafe & Resto", mockContext);
  const val4_3 = validateAiPlan(plan4_3, mockContext);
  assert(
    val4_3.validatedPlan.actions.length === 1 &&
    val4_3.validatedPlan.actions[0].type === "DELETE_PROJECT" &&
    val4_3.validatedPlan.actions[0].payload.id === "prj_cafe_01" &&
    val4_3.validatedPlan.status === "NEEDS_CONFIRMATION",
    "DELETE: 'hapus project ...' identifies project and sets NEEDS_CONFIRMATION"
  );

  // =========================================================================
  // 5. BATCH OPERATIONS
  // =========================================================================
  console.log("\n--- 5. BATCH OPERATIONS ---");

  // Test 5.1: Batch Priority Update for Backend Tasks
  const plan5_1 = parseHeuristicIntent("ubah semua task backend jadi high priority", mockContext);
  assert(
    plan5_1.actions.length === 2 &&
    plan5_1.actions.every((a) => a.type === "UPDATE_TASK" && a.payload.priority === "HIGH"),
    "BATCH: 'ubah semua task backend jadi high priority' targets 2 backend tasks"
  );

  // Test 5.2: Batch Assignment for Development Phase
  const plan5_2 = parseHeuristicIntent("assign semua task di phase Development Phase ke Marchelino", mockContext);
  assert(
    plan5_2.actions.length === 3 &&
    plan5_2.actions.every((a) => a.type === "ASSIGN_TASK" && a.payload.assigneeName === "Marchelino Kurniawan"),
    "BATCH: 'assign semua task di phase Development Phase ke Marchelino' targets 3 tasks in phase"
  );

  // Test 5.3: Batch Status Update for Unfinished Tasks
  const plan5_3 = parseHeuristicIntent("selesaikan semua task yang belum selesai", mockContext);
  assert(
    plan5_3.actions.length === 5 &&
    plan5_3.actions.every((a) => a.type === "UPDATE_TASK" && a.payload.status === "DONE"),
    "BATCH: 'selesaikan semua task yang belum selesai' updates 5 incomplete tasks in current project"
  );

  // Test 5.4: Bulk Delete Batch
  const plan5_4 = parseHeuristicIntent("hapus semua task di project Website Bakery", mockContext);
  assert(
    plan5_4.actions.length === 1 &&
    plan5_4.actions[0].type === "DELETE_TASK" &&
    plan5_4.isDestructive === true &&
    plan5_4.status === "NEEDS_CONFIRMATION",
    "BATCH: Bulk delete generates DELETE_TASK for matching tasks with confirmation"
  );

  // Test 5.5: Batch Safety Limit (> 50 tasks) Rejection
  const massiveTasksContext: AiExecutionContext = {
    ...mockContext,
    tasks: Array.from({ length: 60 }, (_, i) => ({
      id: `tsk_mass_${i + 1}`,
      projectId: "prj_cafe_01",
      title: `Task #${i + 1}`,
      status: "TODO",
      priority: "LOW",
    })),
  };
  const plan5_5 = parseHeuristicIntent("ubah semua task yang belum selesai jadi high priority", massiveTasksContext);
  assert(
    plan5_5.status === "INVALID" &&
    plan5_5.actions.length === 0 &&
    plan5_5.assistantMessage.includes("Operasi batch melebihi batas aman (maksimum 50 task)"),
    "BATCH SAFETY: Exceeding MAX_BATCH_ACTIONS (50) rejects plan with informative error"
  );

  // =========================================================================
  // 6. AMBIGUITY & INCOMPLETE PROMPT HANDLING
  // =========================================================================
  console.log("\n--- 6. AMBIGUITY & INCOMPLETE PROMPT HANDLING ---");

  // Test 6.1: Ambiguous Member Assignment ("assign Desain Homepage ke Andi")
  const plan6_1 = parseHeuristicIntent("assign Desain Homepage ke Andi", mockContext);
  assert(
    plan6_1.status === "NEEDS_CLARIFICATION" &&
    plan6_1.needsClarification === true &&
    plan6_1.assistantMessage.includes("Andi"),
    "AMBIGUITY: Ambiguous member name 'Andi' triggers clarification"
  );

  // Test 6.2: Incomplete Task Update Prompt ("ubah Desain Homepage")
  const plan6_2 = parseHeuristicIntent("ubah Desain Homepage", mockContext);
  assert(
    plan6_2.status === "NEEDS_CLARIFICATION" &&
    plan6_2.assistantMessage.includes("Apa yang ingin Anda ubah"),
    "INCOMPLETE: 'ubah Desain Homepage' without fields asks for clarification"
  );

  // Test 6.3: Incomplete Deadline Prompt ("deadline Desain Homepage")
  const plan6_3 = parseHeuristicIntent("deadline Desain Homepage", mockContext);
  assert(
    plan6_3.status === "NEEDS_CLARIFICATION" &&
    plan6_3.assistantMessage.includes("Kapan tenggat waktu"),
    "INCOMPLETE: 'deadline Desain Homepage' without date asks for date"
  );

  // Test 6.4: Incomplete Move Prompt ("pindahkan Desain Homepage")
  const plan6_4 = parseHeuristicIntent("pindahkan Desain Homepage", mockContext);
  assert(
    plan6_4.status === "NEEDS_CLARIFICATION" &&
    plan6_4.assistantMessage.includes("Ke fase mana"),
    "INCOMPLETE: 'pindahkan Desain Homepage' without target asks for phase"
  );

  // =========================================================================
  // 7. SECURITY & RBAC PERMISSION ENFORCEMENT
  // =========================================================================
  console.log("\n--- 7. SECURITY & RBAC PERMISSION ENFORCEMENT ---");

  // Test 7.1: Viewer cannot update task
  const viewerContext: AiExecutionContext = { ...mockContext, userRole: Role.VIEWER };
  const val7_1 = validateAiPlan(plan2_1, viewerContext);
  assert(
    val7_1.validatedPlan.status === "FORBIDDEN" &&
    val7_1.validatedPlan.errors !== undefined &&
    val7_1.validatedPlan.errors.some((e) => e.includes("Izin ditolak") || e.includes("tidak memiliki izin")),
    "RBAC: VIEWER role cannot execute UPDATE_TASK (FORBIDDEN)"
  );

  // Test 7.2: Member cannot delete project (Requires ADMIN/OWNER)
  const memberContext: AiExecutionContext = { ...mockContext, userRole: Role.MEMBER };
  const val7_2 = validateAiPlan(plan4_3, memberContext);
  assert(
    val7_2.validatedPlan.status === "FORBIDDEN" &&
    val7_2.validatedPlan.errors !== undefined &&
    val7_2.validatedPlan.errors.some((e) => e.includes("Izin ditolak") || e.includes("tidak memiliki izin")),
    "RBAC: MEMBER role cannot execute DELETE_PROJECT (Requires ADMIN/OWNER)"
  );

  // Test 7.3: Member CAN create task
  const plan7_3 = parseHeuristicIntent("buat task Wireframing dan assign ke Sarah", memberContext);
  const val7_3 = validateAiPlan(plan7_3, memberContext);
  assert(
    val7_3.isValid === true &&
    val7_3.validatedPlan.status === "READY",
    "RBAC: MEMBER role can create tasks"
  );

  // Test 7.4: Member CAN update task
  const val7_4 = validateAiPlan(plan2_1, memberContext);
  assert(
    val7_4.isValid === true &&
    val7_4.validatedPlan.status === "READY",
    "RBAC: MEMBER role can update tasks"
  );

  // Test 7.5: Prompt Injection / Malicious Entity Name
  const plan7_5 = parseHeuristicIntent("rename task Desain Homepage jadi '; DROP TABLE tasks; --", mockContext);
  assert(
    plan7_5.actions.length === 1 &&
    plan7_5.actions[0].payload.title === "'; DROP TABLE tasks; --",
    "SECURITY: SQL injection in title is treated safely as literal text"
  );

  // =========================================================================
  // 8. ACTION REGISTRY INTEGRITY & VERIFICATION
  // =========================================================================
  console.log("\n--- 8. ACTION REGISTRY INTEGRITY ---");

  // Test 8.1: UPDATE_TASK Action Registry Definition
  const updateTaskDef = ACTION_REGISTRY.UPDATE_TASK;
  assert(
    updateTaskDef !== undefined &&
    updateTaskDef.name === "UPDATE_TASK" &&
    updateTaskDef.requiredRole === Role.MEMBER &&
    typeof updateTaskDef.execute === "function" &&
    typeof updateTaskDef.rollback === "function",
    "REGISTRY: UPDATE_TASK is registered with MEMBER role and rollback handler"
  );

  // Test 8.2: DELETE_TASK Action Registry Definition
  const deleteTaskDef = ACTION_REGISTRY.DELETE_TASK;
  assert(
    deleteTaskDef !== undefined &&
    deleteTaskDef.name === "DELETE_TASK" &&
    deleteTaskDef.riskLevel === "HIGH" &&
    typeof deleteTaskDef.rollback === "function",
    "REGISTRY: DELETE_TASK is registered with HIGH risk and rollback handler"
  );

  // Test 8.3: ASSIGN_TASK with unassign support
  const assignDef = ACTION_REGISTRY.ASSIGN_TASK;
  const valUnassign = assignDef.validate({ taskId: "tsk_1", unassign: true }, mockContext, new Map());
  assert(
    valUnassign.isValid === true &&
    valUnassign.needsClarification === false,
    "REGISTRY: ASSIGN_TASK validation succeeds without member name when unassign: true"
  );

  // Test 8.4: UPDATE_PROJECT rollback support
  const updateProjDef = ACTION_REGISTRY.UPDATE_PROJECT;
  assert(
    updateProjDef !== undefined &&
    typeof updateProjDef.rollback === "function",
    "REGISTRY: UPDATE_PROJECT provides atomic rollback handler"
  );

  // Test 8.5: UPDATE_PHASE rollback support
  const updatePhaseDef = ACTION_REGISTRY.UPDATE_PHASE;
  assert(
    updatePhaseDef !== undefined &&
    typeof updatePhaseDef.rollback === "function",
    "REGISTRY: UPDATE_PHASE provides atomic rollback handler"
  );

  // =========================================================================
  // 9. ADVANCED EDGE CASES & DAG RECEIPT INTEGRITY
  // =========================================================================
  console.log("\n--- 9. ADVANCED EDGE CASES & DAG INTEGRITY ---");

  // Test 9.1: Partial Update Preserves Untouched Fields
  const plan9_1 = parseHeuristicIntent("ubah priority Desain Homepage jadi low", mockContext);
  assert(
    plan9_1.actions.length === 1 &&
    plan9_1.actions[0].payload.priority === "LOW" &&
    plan9_1.actions[0].payload.dueDate === undefined &&
    plan9_1.actions[0].payload.status === undefined,
    "ADVANCED: Partial update payload leaves unmentioned fields undefined to preserve DB values"
  );

  // Test 9.2: READ: Unassigned Tasks Query
  const plan9_2 = parseHeuristicIntent("task apa saja yang belum ada assignee?", mockContext);
  assert(
    plan9_2.actions.length === 0 &&
    plan9_2.status === "READY",
    "ADVANCED: READ query for unassigned tasks runs safely without mutations"
  );

  // Test 9.3: Batch Filter by Keyword ("semua task payment")
  const plan9_3 = parseHeuristicIntent("ubah semua task payment jadi high priority", mockContext);
  assert(
    plan9_3.actions.length === 1 &&
    plan9_3.actions[0].payload.taskTitle === "API Payment Gateway",
    "ADVANCED: Batch with keyword 'payment' matches only 'API Payment Gateway'"
  );

  // Test 9.4: Reorder Phase Intent
  const plan9_4 = parseHeuristicIntent("rename phase Testing Phase jadi Quality Assurance", mockContext);
  assert(
    plan9_4.actions.length === 1 &&
    plan9_4.actions[0].type === "UPDATE_PHASE" &&
    plan9_4.actions[0].payload.name === "Quality Assurance",
    "ADVANCED: Phase rename targets correct phase entity"
  );

  // Test 9.5: Scoped Task Update across Projects
  const plan9_5 = parseHeuristicIntent("selesaikan task Logo Bakery di project Website Bakery", mockContext);
  assert(
    plan9_5.actions.length === 1 &&
    plan9_5.actions[0].type === "UPDATE_TASK" &&
    plan9_5.actions[0].payload.status === "DONE",
    "ADVANCED: Scoped task status update resolves task in explicit project"
  );

  // Test 9.6: Cross-Workspace Foreign Task Rejection Simulation
  const foreignContext: AiExecutionContext = {
    ...mockContext,
    workspaceId: "ws_foreign_99",
    tasks: [],
  };
  const plan9_6 = parseHeuristicIntent("selesaikan task Desain Homepage", foreignContext);
  const val9_6 = validateAiPlan(plan9_6, foreignContext);
  assert(
    val9_6.isValid === false || val9_6.validatedPlan.errors?.length! > 0,
    "ADVANCED: Cross-workspace task resolution returns error when task belongs to different tenant"
  );

  // Test 9.7: Ambiguous Project Clarification State Creation
  const multiMatchProjContext: AiExecutionContext = {
    ...mockContext,
    projects: [
      { id: "prj_cafe_a", name: "Cafe Senopati", status: "ACTIVE", totalTasks: 2 },
      { id: "prj_cafe_b", name: "Cafe Kemang", status: "ACTIVE", totalTasks: 3 },
    ],
  };
  const plan9_7 = parseHeuristicIntent("hapus project Cafe", multiMatchProjContext);
  assert(
    plan9_7.status === "NEEDS_CLARIFICATION" &&
    plan9_7.needsClarification === true,
    "ADVANCED: Ambiguous project delete creates clarification without executing delete"
  );

  // Test 9.8: Compound Prompt with Creation & Assignment
  const plan9_8 = parseHeuristicIntent("buat task Testing Checkout dan assign ke Alice", mockContext);
  assert(
    plan9_8.actions.length === 1 &&
    plan9_8.actions[0].type === "CREATE_TASK" &&
    plan9_8.actions[0].payload.title === "Testing Checkout" &&
    plan9_8.actions[0].payload.assigneeName === "Alice",
    "ADVANCED: Create task with assignment resolves inline assignee name"
  );

  // Test 9.9: Action Registry Verification for Rollback on All Mutation Types
  const requiredRollbackActions: (keyof typeof ACTION_REGISTRY)[] = [
    "CREATE_PROJECT",
    "CREATE_TASK",
    "UPDATE_TASK",
    "ASSIGN_TASK",
    "UPDATE_PROJECT",
    "UPDATE_PHASE",
  ];
  const allHaveRollback = requiredRollbackActions.every((type) => typeof ACTION_REGISTRY[type].rollback === "function");
  assert(
    allHaveRollback,
    "ADVANCED: All core mutation action types define rollback handlers in ACTION_REGISTRY"
  );

  // Test 9.10: MAX_BATCH_ACTIONS constant invariant
  assert(
    MAX_BATCH_ACTIONS === 50,
    "ADVANCED: MAX_BATCH_ACTIONS invariant is strictly 50"
  );

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log("\n" + "=".repeat(80));
  console.log(` RESULTS: ${passed}/${total} TESTS PASSED (${((passed / total) * 100).toFixed(1)}%)`);
  console.log("=".repeat(80) + "\n");

  if (passed !== total) {
    process.exit(1);
  }
}

runPhase4Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
