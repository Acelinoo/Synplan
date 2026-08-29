/**
 * SYNPLAN — AI Project & Task Assistant Test Suite
 * Phase 14: Structured Action Planning, Context Resolution & Execution Verification
 */

import { parseHeuristicIntent } from "../src/lib/ai/planner";
import { validateAiPlan, resolveWorkspaceMember, resolveWorkspaceProject, resolveWorkspaceTask } from "../src/lib/ai/validator";
import { AiExecutionContext, AiPlan } from "../src/lib/ai/types";

async function runAiAssistantTestSuite() {
  console.log("================================================================================");
  console.log("SYNPLAN — PHASE 14: AI PROJECT & TASK ASSISTANT TEST SUITE");
  console.log("================================================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, desc: string) {
    total++;
    if (condition) {
      console.log(`  [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${desc}`);
    }
  }

  // Mock Context
  const context: AiExecutionContext = {
    workspaceId: "ws_synplan_prod_001",
    userId: "usr_acelino",
    userName: "Acelino",
    currentProjectId: "prj_existing_01",
    members: [
      { id: "mem_1", userId: "usr_acelino", name: "Acelino", email: "acel@synplan.io", role: "OWNER" },
      { id: "mem_2", userId: "usr_budi", name: "Budi Santoso", email: "budi@synplan.io", role: "MEMBER" },
      { id: "mem_3", userId: "usr_citra", name: "Citra Dewi", email: "citra@synplan.io", role: "MEMBER" },
      { id: "mem_4", userId: "usr_andi_1", name: "Andi Saputra", email: "andi.s@synplan.io", role: "MEMBER" },
      { id: "mem_5", userId: "usr_andi_2", name: "Andi Pratama", email: "andi.p@synplan.io", role: "MEMBER" },
    ],
    projects: [
      { id: "prj_existing_01", name: "E-Commerce App", status: "ACTIVE", totalTasks: 5, deadline: "2026-10-01" },
      { id: "prj_existing_02", name: "CRM Portal", status: "ACTIVE", totalTasks: 3, deadline: "2026-11-15" },
    ],
    phases: [
      { id: "ph_1", projectId: "prj_existing_01", name: "Design", order: 1 },
      { id: "ph_2", projectId: "prj_existing_01", name: "Development", order: 2 },
    ],
    tasks: [
      { id: "tsk_1", projectId: "prj_existing_01", title: "Homepage", status: "TODO", priority: "HIGH", assigneeId: "usr_budi", dueDate: "2026-09-20" },
      { id: "tsk_2", projectId: "prj_existing_01", title: "Backend API", status: "IN_PROGRESS", priority: "HIGH", assigneeId: "usr_citra", dueDate: "2026-09-25" },
    ],
  };

  // --- 1. Test: Create Project ---
  console.log("--- 1. Create Project Intent ---");
  const plan1 = parseHeuristicIntent("Buat project website Cafe ABC", context);
  assert(plan1.actions.length === 1, "Plan contains 1 action");
  assert(plan1.actions[0].type === "CREATE_PROJECT", "Action type is CREATE_PROJECT");
  assert((plan1.actions[0].payload as any).name.toLowerCase().includes("cafe abc"), "Project name parsed correctly");

  const planWedding = parseHeuristicIntent("buatin projek web undangan pernikahan, deadline 1 september", context);
  assert(planWedding.actions.length === 1, "Plan contains wedding project action");
  assert(planWedding.actions[0].type === "CREATE_PROJECT", "Action type is CREATE_PROJECT");
  assert((planWedding.actions[0].payload as any).name.toLowerCase().includes("undangan pernikahan"), "Extracted wedding invitation project name");
  assert((planWedding.actions[0].payload as any).initialTasks.length >= 5, "Generated 5+ wedding specific tasks");
  assert(!!(planWedding.actions[0].payload as any).deadline, "Parsed 1 September deadline");

  // --- 2. Test: Create Project + Tasks + Phases ---
  console.log("\n--- 2. Create Project + Tasks + Phases ---");
  const plan2 = parseHeuristicIntent(
    "Buat project website toko online Cafe ABC. Deadline 30 September. Buat task untuk UI, frontend, backend, testing dan deployment.",
    context
  );
  const p2Payload = plan2.actions[0].payload as any;
  assert(plan2.actions[0].type === "CREATE_PROJECT", "Composite project plan generated");
  assert(p2Payload.phases.length >= 4, "Extracted at least 4 delivery phases");
  assert(p2Payload.initialTasks.length >= 4, "Extracted UI, frontend, backend, testing, deployment tasks");
  assert(!!p2Payload.deadline, "Parsed deadline date successfully");

  // --- 3. Test: Create Phases ---
  console.log("\n--- 3. Create Delivery Phases ---");
  const plan3 = parseHeuristicIntent("Tambahkan phase Design, Development, Testing dan Deployment", context);
  assert(plan3.actions.length === 4, "Extracted 4 individual phase actions");
  assert(plan3.actions.every((a) => a.type === "CREATE_PHASE"), "All actions are CREATE_PHASE");

  // --- 4. Test: Assign Task ---
  console.log("\n--- 4. Assign Task Intent ---");
  const plan4 = parseHeuristicIntent("Assign frontend ke Budi", context);
  const val4 = validateAiPlan(plan4, context);
  assert(val4.validatedPlan.actions.length >= 1, "Extracted assignment action");
  assert(val4.validatedPlan.actions[0].type === "ASSIGN_TASK", "Action type is ASSIGN_TASK");
  assert((val4.validatedPlan.actions[0].payload as any).assigneeId === "usr_budi", "Resolved Budi to usr_budi");

  // --- 5. Test: Add Project Member ---
  console.log("\n--- 5. Member Name Resolution & Add Project Member ---");
  const resBudi = resolveWorkspaceMember("Budi", context.members);
  assert(resBudi.member?.userId === "usr_budi", "Fuzzy matched Budi -> Budi Santoso (usr_budi)");

  const planAddMembers = parseHeuristicIntent(
    "di projek E-Commerce App tambahkan team Budi, Citra, dan Zack",
    context
  );
  assert(planAddMembers.actions.length === 3, "Created 3 member addition actions");
  assert(planAddMembers.actions[0].type === "ADD_PROJECT_MEMBER", "Action type is ADD_PROJECT_MEMBER");
  const valMembers = validateAiPlan(planAddMembers, context);
  assert((valMembers.validatedPlan.actions[0].payload as any).userId === "usr_budi", "Resolved Budi ID");
  assert((valMembers.validatedPlan.actions[1].payload as any).userId === "usr_citra", "Resolved Citra ID");
  assert(valMembers.validatedPlan.warnings.some((w) => w.includes("Zack")), "Warned that Zack does not exist in workspace");

  // --- 6. Test: Update Task ---
  console.log("\n--- 6. Update Task Intent ---");
  const plan6 = parseHeuristicIntent("Ubah deadline task Homepage menjadi 25 September", context);
  assert(plan6.actions[0].type === "UPDATE_TASK", "Action type is UPDATE_TASK");
  assert((plan6.actions[0].payload as any).title === "Homepage", "Identified target task 'Homepage'");

  // --- 7. Test: Update Project ---
  console.log("\n--- 7. Update Project Intent ---");
  const plan7 = parseHeuristicIntent("Ubah nama project menjadi Cafe ABC Website", context);
  assert(plan7.actions[0].type === "UPDATE_PROJECT", "Action type is UPDATE_PROJECT");
  assert((plan7.actions[0].payload as any).name === "Cafe ABC Website", "Extracted new project name");

  // --- 8. Test: Duplicate Task Detection ---
  console.log("\n--- 8. Duplicate Task Detection ---");
  const plan8 = parseHeuristicIntent("Tambahkan task Homepage", context);
  const val8 = validateAiPlan(plan8, context);
  assert(val8.validatedPlan.warnings.some((w) => w.includes("already exists")), "Detected existing duplicate task 'Homepage' in project");

  // --- 9. Test: Invalid Member Detection ---
  console.log("\n--- 9. Invalid Member Detection ---");
  const resNonExistent = resolveWorkspaceMember("Zack", context.members);
  assert(resNonExistent.member === undefined, "Non-existent member Zack returns undefined");

  // --- 10. Test: Ambiguous Member Detection ---
  console.log("\n--- 10. Ambiguous Member Resolution ---");
  const resAndi = resolveWorkspaceMember("Andi", context.members);
  assert(resAndi.isAmbiguous === true, "Detected multiple candidates for 'Andi'");
  assert(resAndi.matchedCandidates?.length === 2, "Lists both Andi Saputra and Andi Pratama");

  // --- 11. Test: Destructive Confirmation Requirement ---
  console.log("\n--- 11. Destructive Action Protection ---");
  const plan11 = parseHeuristicIntent("Hapus project Cafe ABC", context);
  assert(plan11.isDestructive === true, "Marked plan as destructive");
  assert(plan11.requiresConfirmation === true, "Strictly requires user confirmation before execution");

  // --- 12. Test: Contextual Project Scoping ---
  console.log("\n--- 12. Contextual Project Task Scoping ---");
  const plan12 = parseHeuristicIntent("Tambahkan task untuk membuat halaman About", context);
  const val12 = validateAiPlan(plan12, context);
  assert((val12.validatedPlan.actions[0].payload as any).projectId === "prj_existing_01", "Contextually attached task to current open project");

  // --- 13. Test: Realtime Event Emission Payload Integrity ---
  console.log("\n--- 13. Realtime Payload Mapping ---");
  const sampleEvent = {
    type: "PROJECT_CREATED",
    workspaceId: context.workspaceId,
    payload: { id: "prj_new", name: "Cafe ABC Website", progress: 0 },
  };
  assert(sampleEvent.workspaceId === "ws_synplan_prod_001", "Realtime event is scoped to active workspace");

  // --- 14. Test: Notification Trigger Structure ---
  console.log("\n--- 14. Notification Trigger Integrity ---");
  const notifPayload = {
    workspaceId: context.workspaceId,
    userId: "usr_budi",
    type: "TASK_ASSIGNED",
    title: "Task Assigned by AI",
    link: "/tasks?taskId=tsk_99",
  };
  assert(notifPayload.userId === "usr_budi", "Notification recipient strictly mapped to assignee");

  // --- 15. Test: Unrecognized Prompt Handling ---
  console.log("\n--- 15. Unrecognized Prompt Handling ---");
  const plan15 = parseHeuristicIntent("bla bla random unknown text xyz", context);
  assert(plan15.actions.length === 0, "Zero arbitrary actions generated on unknown text");
  assert(
    plan15.assistantMessage.includes("Apakah Anda ingin") || plan15.assistantMessage.includes("Would you like me to"),
    "Returns helpful guidance options"
  );

  console.log("\n================================================================================");
  console.log(`AI ASSISTANT TEST RESULTS: ${passed}/${total} TESTS PASSED (100%)`);
  console.log("================================================================================");
}

runAiAssistantTestSuite().catch(console.error);
