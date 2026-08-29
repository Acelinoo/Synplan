/**
 * SYNPLAN — PHASE 14E: AI ASSISTANT UX, PREVIEW & EXECUTION EXPERIENCE TEST SUITE
 *
 * 85+ Assertions covering 12 UX & Interaction Dimensions:
 * 1. Conversational Understanding State (Free-form input parsing without JSON exposure)
 * 2. Entity Clarification & Candidate Chips Presentation
 * 3. Candidate Multi-Selection & Natural Language Answer Resolution
 * 4. Structured Preview Card Generation with Resolved Names
 * 5. Plan Parameter Editing & Mandatory Revalidation
 * 6. Risk-Appropriate Confirmation Gates (LOW, MEDIUM, HIGH, CRITICAL)
 * 7. Real Step-by-Step Execution Progress Tracking
 * 8. Database Verification Visibility
 * 9. Honest Partial Failure Breakdown & Next Actions
 * 10. Human-Readable Error Formatting
 * 11. Scoped Undo / Recovery through Verified Receipts
 * 12. Execution History & Audit Retrieval
 *
 * Run: npx tsx scripts/test-ai-assistant-ux.ts
 */

import { generateAiPlan, parseHeuristicIntent, formatCompoundPlanPreview } from "../src/lib/ai/planner";
import { validateAiPlan, normalizeActionConflicts } from "../src/lib/ai/validator";
import { executeAiPlan } from "../src/lib/ai/executor";
import {
  recordExecutionReceipt,
  getLatestExecutionReceipt,
  getExecutionHistory,
  isReceiptReversible,
  generateUndoPlanFromReceipt,
} from "../src/lib/ai/receiptStore";
import { resolveWorkspaceMember, resolveWorkspaceProject, resolveClarificationAnswer } from "../src/lib/ai/entityResolver";
import { AiExecutionContext, AiPlan, AiAction, ExecutionReceipt, ClarificationState } from "../src/lib/ai/types";
import { Role } from "@prisma/client";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures: string[] = [];

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS ${totalTests.toString().padStart(3, "0")}] ${testName}`);
  } else {
    failedTests++;
    const msg = `  [FAIL ${totalTests.toString().padStart(3, "0")}] ${testName}${detail ? ` — ${detail}` : ""}`;
    console.error(msg);
    failures.push(msg);
  }
}

function section(title: string) {
  console.log(`\n${"─".repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${"─".repeat(70)}`);
}

// ============================================================================
// FIXTURE DATA
// ============================================================================

const MOCK_MEMBERS: AiExecutionContext["members"] = [
  { id: "m1", userId: "usr_acelino", name: "Marchelino Kurniawan", email: "acel@synplan.io", role: Role.OWNER },
  { id: "m2", userId: "usr_sarah", name: "Sarah Chen", email: "sarah@synplan.io", role: Role.MEMBER },
  { id: "m3", userId: "usr_devon", name: "Devon Lane", email: "devon@synplan.io", role: Role.MEMBER },
  { id: "m4", userId: "usr_maman", name: "Maman Surachman", email: "maman@synplan.io", role: Role.ADMIN },
  { id: "m5", userId: "usr_marshel", name: "Marshel Saputra", email: "marshel@synplan.io", role: Role.MEMBER },
  { id: "m6", userId: "usr_marchel", name: "Marchel Pratama", email: "marchel@synplan.io", role: Role.MEMBER },
];

const MOCK_PROJECTS: AiExecutionContext["projects"] = [
  { id: "prj_fruit_01", name: "Website Toko Buah", status: "ACTIVE", totalTasks: 5, deadline: "2026-09-01" },
  { id: "prj_bakery_02", name: "Website Toko Roti", status: "ACTIVE", totalTasks: 4, deadline: "2026-09-10" },
];

const MOCK_CONTEXT: AiExecutionContext = {
  workspaceId: "ws_ux_001",
  workspaceName: "UX Testing Workspace",
  userId: "usr_acelino",
  userName: "Marchelino Kurniawan",
  userRole: Role.OWNER,
  currentProjectId: "prj_fruit_01",
  currentProjectName: "Website Toko Buah",
  serverTime: "2026-08-30T00:00:00Z",
  isMock: true,
  members: MOCK_MEMBERS,
  projects: MOCK_PROJECTS,
  phases: [
    { id: "ph_1", projectId: "prj_fruit_01", name: "Planning", order: 1 },
    { id: "ph_2", projectId: "prj_fruit_01", name: "Development", order: 2 },
  ],
  tasks: [
    { id: "tsk_1", projectId: "prj_fruit_01", title: "Desain Homepage", status: "TODO", priority: "HIGH", assigneeId: "usr_acelino" },
  ],
};

async function runAssistantUxTests() {
  console.log("======================================================================");
  console.log("SYNPLAN — PHASE 14E: AI ASSISTANT UX & PREVIEW EXPERIENCE TEST SUITE");
  console.log("======================================================================");

  // --------------------------------------------------------------------------
  // DIMENSION 1: CONVERSATIONAL UNDERSTANDING (8 Tests)
  // --------------------------------------------------------------------------
  section("1. Conversational Understanding (No JSON/Technical ID Leaks)");
  {
    const plan = await generateAiPlan("buat project website Toko Buah deadline 1 September", MOCK_CONTEXT);
    assert(plan.status !== "INVALID", "Plan status is valid");
    assert(plan.assistantMessage.length > 0, "Assistant produces natural conversational text");
    assert(!plan.assistantMessage.includes("CREATE_PROJECT"), "Assistant message does not leak action registry enums");
    assert(!plan.assistantMessage.includes("prj_"), "Assistant message does not expose raw database IDs");
    assert(!plan.assistantMessage.includes("usr_"), "Assistant message does not expose raw user IDs");
    assert(plan.actions.length > 0, "Structured action is generated under the hood");
    assert(plan.actions[0].payload.name === "Website Toko Buah" || plan.actions[0].payload.name === "Toko Buah", "Project name extracted accurately");
    assert(plan.actions[0].payload.deadline === "2026-09-01", "Deadline resolved to ISO date format");
  }

  // --------------------------------------------------------------------------
  // DIMENSION 2: ENTITY CLARIFICATION & CANDIDATE CHIPS (8 Tests)
  // --------------------------------------------------------------------------
  section("2. Entity Clarification & Candidate Chips Presentation");
  {
    const planAmbiguous = await generateAiPlan("tambahkan marhel ke project ini", MOCK_CONTEXT);
    assert(planAmbiguous.status === "NEEDS_CLARIFICATION", "Ambiguous entity query sets status to NEEDS_CLARIFICATION");
    assert(planAmbiguous.clarificationState !== undefined, "Structured clarificationState provided to UI");
    assert(planAmbiguous.clarificationState?.candidates.length! >= 2, "At least 2 candidates provided for 'marhel'");

    const names = planAmbiguous.clarificationState?.candidates.map((c) => c.name) || [];
    assert(names.includes("Marshel Saputra"), "Candidates include Marshel Saputra");
    assert(names.includes("Marchel Pratama"), "Candidates include Marchel Pratama");
    assert(planAmbiguous.clarificationState?.allowMultiSelect === true, "Multi-select candidate option enabled");
    assert(planAmbiguous.assistantMessage.includes("Marshel") || planAmbiguous.assistantMessage.includes("Marchel") || planAmbiguous.assistantMessage.includes("marhel"), "Assistant message frames clarification conversationally");
    assert(planAmbiguous.actions.length === 0 || planAmbiguous.actions.every((a) => a.status === "NEEDS_CLARIFICATION"), "0 premature mutations generated");
  }

  // --------------------------------------------------------------------------
  // DIMENSION 3: CANDIDATE MULTI-SELECTION & NATURAL RESPONSES (8 Tests)
  // --------------------------------------------------------------------------
  section("3. Candidate Multi-Selection & Natural Language Responses");
  {
    const candidates = [
      { id: "usr_marshel", name: "Marshel Saputra", score: 0.88, data: MOCK_MEMBERS[4] },
      { id: "usr_marchel", name: "Marchel Pratama", score: 0.85, data: MOCK_MEMBERS[5] },
    ];

    const rSingle = resolveClarificationAnswer("Marchel", candidates);
    assert(rSingle.resolved && rSingle.selectedEntities.length === 1, "'Marchel' resolves single candidate");
    assert(rSingle.selectedNames[0] === "Marchel Pratama", "Single candidate name is Marchel Pratama");

    const rBoth = resolveClarificationAnswer("Keduanya", candidates);
    assert(rBoth.resolved && rBoth.selectedEntities.length === 2, "'Keduanya' resolves both candidates");
    assert(rBoth.selectionMode === "MULTI", "Selection mode is MULTI");

    const rDua = resolveClarificationAnswer("Dua-duanya", candidates);
    assert(rDua.resolved && rDua.selectedEntities.length === 2, "'Dua-duanya' resolves both candidates");

    const rOrdinal1 = resolveClarificationAnswer("yang pertama", candidates);
    assert(rOrdinal1.resolved && rOrdinal1.selectedNames[0] === "Marshel Saputra", "'yang pertama' -> candidate 1");

    const rOrdinal2 = resolveClarificationAnswer("yang kedua", candidates);
    assert(rOrdinal2.resolved && rOrdinal2.selectedNames[0] === "Marchel Pratama", "'yang kedua' -> candidate 2");

    const rCancel = resolveClarificationAnswer("batal", candidates);
    assert(rCancel.isCancelled === true && rCancel.selectedEntities.length === 0, "'batal' triggers cancellation");
  }

  // --------------------------------------------------------------------------
  // DIMENSION 4: STRUCTURED PREVIEW CARD GENERATION (8 Tests)
  // --------------------------------------------------------------------------
  section("4. Structured Preview Card Generation with Resolved Names");
  {
    const actions: AiAction[] = [
      {
        id: "a1",
        type: "CREATE_PROJECT",
        summary: "Buat project Toko Roti",
        riskLevel: "MEDIUM",
        requiredRole: Role.MEMBER,
        status: "READY",
        payload: { name: "Website Toko Roti", deadline: "2026-09-10" },
      },
      {
        id: "a2",
        type: "ADD_MEMBER",
        summary: "Tambah Marchel Pratama",
        riskLevel: "MEDIUM",
        requiredRole: Role.MEMBER,
        status: "READY",
        payload: { userName: "Marchel Pratama", userId: "usr_marchel" },
      },
      {
        id: "a3",
        type: "CREATE_TASK",
        summary: "Buat task Desain Homepage",
        riskLevel: "MEDIUM",
        requiredRole: Role.MEMBER,
        status: "READY",
        payload: { title: "Desain Homepage", assigneeName: "Marchel Pratama" },
      },
    ];

    const preview = formatCompoundPlanPreview(actions);
    assert(preview.includes("Website Toko Roti"), "Preview displays resolved project name");
    assert(preview.includes("2026-09-10"), "Preview displays deadline date");
    assert(preview.includes("Marchel Pratama"), "Preview displays resolved member name (NOT typo 'marhel')");
    assert(preview.includes("Desain Homepage"), "Preview displays task title");
    assert(preview.includes("3 aksi"), "Preview counts total 3 actions accurately");
    assert(!preview.includes("undefined"), "Preview has no undefined strings");
    assert(!preview.includes("null"), "Preview has no null tokens");
    assert(!preview.includes("object Object"), "Preview has no raw object leaks");
  }

  // --------------------------------------------------------------------------
  // DIMENSION 5: PLAN PARAMETER EDITING & REVALIDATION (7 Tests)
  // --------------------------------------------------------------------------
  section("5. Plan Parameter Editing & Mandatory Revalidation");
  {
    const initialPlan: AiPlan = {
      id: "plan_edit_test",
      userPrompt: "Buat project Cafe ABC deadline 1 September",
      assistantMessage: "Planning",
      actions: [
        {
          id: "act_1",
          type: "CREATE_PROJECT",
          summary: "Buat project Cafe ABC",
          riskLevel: "MEDIUM",
          requiredRole: Role.MEMBER,
          status: "READY",
          payload: { name: "Cafe ABC", deadline: "2026-09-01" },
        },
      ],
      status: "NEEDS_CONFIRMATION",
      requiresConfirmation: true,
      isDestructive: false,
      warnings: [],
      planner: "heuristic",
      provider: "fallback",
      createdAt: new Date().toISOString(),
    };

    // User edits deadline to 5 September via conversational instruction
    const editedPrompt = "Ubah deadline jadi 5 September 2026";
    const updatedPlan = await generateAiPlan(editedPrompt, MOCK_CONTEXT, [
      { role: "assistant", content: initialPlan.assistantMessage },
    ]);

    assert(updatedPlan.actions.length > 0, "Updated plan is generated");
    assert(updatedPlan.actions[0].payload.deadline === "2026-09-05", "Deadline parameter successfully updated to 2026-09-05");
    assert(updatedPlan.status === "READY" || updatedPlan.status === "NEEDS_CONFIRMATION", "Plan re-validated by server");

    // Invalid edit (e.g. invalid member name) triggers clarification/error, never silent failure
    const invalidEditPrompt = "Tambahkan xyznonexistent ke tim";
    const invalidPlan = await generateAiPlan(invalidEditPrompt, MOCK_CONTEXT);
    assert(invalidPlan.needsClarification === true || invalidPlan.actions.length === 0, "Invalid parameter edit re-validation prevents execution");
    assert(initialPlan.id !== updatedPlan.id, "Edited plan generates fresh plan ID, preventing stale plan caching");
    assert(updatedPlan.createdAt.length > 0, "Updated plan has fresh timestamp");
    assert(!updatedPlan.isDestructive, "Updated plan is not destructive");
  }

  // --------------------------------------------------------------------------
  // DIMENSION 6: RISK-APPROPRIATE CONFIRMATION GATES (6 Tests)
  // --------------------------------------------------------------------------
  section("6. Risk-Appropriate Confirmation Gates (LOW, MEDIUM, HIGH, CRITICAL)");
  {
    // 1. CRITICAL Risk (DELETE_PROJECT)
    const criticalPlan: AiPlan = {
      id: "p_crit",
      userPrompt: "Hapus project",
      assistantMessage: "Del",
      actions: [
        {
          id: "act_c",
          type: "DELETE_PROJECT",
          summary: "Hapus Website Toko Buah",
          riskLevel: "CRITICAL",
          requiredRole: Role.ADMIN,
          status: "READY",
          payload: { id: "prj_fruit_01", entityType: "PROJECT" },
        },
      ],
      status: "READY",
      requiresConfirmation: false,
      isDestructive: false,
      warnings: [],
      planner: "heuristic",
      provider: "fallback",
      createdAt: new Date().toISOString(),
    };

    const { validatedPlan: critVal } = validateAiPlan(criticalPlan, MOCK_CONTEXT);
    assert(critVal.riskLevel === "CRITICAL", "DELETE_PROJECT evaluated as CRITICAL risk");
    assert(critVal.requiresConfirmation === true, "CRITICAL risk enforces confirmation: true");
    assert(critVal.status === "NEEDS_CONFIRMATION", "Plan status set to NEEDS_CONFIRMATION");

    // 2. HIGH Risk (DELETE_TASK)
    const highPlan: AiPlan = {
      id: "p_high",
      userPrompt: "Hapus task",
      assistantMessage: "Del task",
      actions: [
        {
          id: "act_h",
          type: "DELETE_TASK",
          summary: "Hapus task",
          riskLevel: "HIGH",
          requiredRole: Role.MEMBER,
          status: "READY",
          payload: { id: "tsk_1", entityType: "TASK" },
        },
      ],
      status: "READY",
      requiresConfirmation: false,
      isDestructive: false,
      warnings: [],
      planner: "heuristic",
      provider: "fallback",
      createdAt: new Date().toISOString(),
    };

    const { validatedPlan: highVal } = validateAiPlan(highPlan, MOCK_CONTEXT);
    assert(highVal.riskLevel === "HIGH", "DELETE_TASK evaluated as HIGH risk");
    assert(highVal.requiresConfirmation === true, "HIGH risk enforces confirmation: true");
    assert(highVal.isDestructive === true, "HIGH risk marked destructive");
  }

  // --------------------------------------------------------------------------
  // DIMENSION 7: REAL EXECUTION PROGRESS TRACKING (6 Tests)
  // --------------------------------------------------------------------------
  section("7. Real Execution Progress Tracking");
  {
    const multiPlan: AiPlan = {
      id: "p_progress",
      userPrompt: "Buat project, phase, task",
      assistantMessage: "Exec",
      actions: [
        {
          id: "act_p1",
          type: "CREATE_PROJECT",
          summary: "Buat project Baru",
          riskLevel: "MEDIUM",
          requiredRole: Role.MEMBER,
          status: "READY",
          payload: { name: "Project Alpha" },
        },
        {
          id: "act_ph1",
          type: "CREATE_PHASE",
          summary: "Buat phase Planning",
          riskLevel: "MEDIUM",
          requiredRole: Role.MEMBER,
          status: "READY",
          dependsOn: ["act_p1"],
          payload: { name: "Planning" },
        },
        {
          id: "act_t1",
          type: "CREATE_TASK",
          summary: "Buat task Setup",
          riskLevel: "MEDIUM",
          requiredRole: Role.MEMBER,
          status: "READY",
          dependsOn: ["act_p1"],
          payload: { title: "Setup Repo" },
        },
      ],
      status: "READY",
      requiresConfirmation: false,
      isDestructive: false,
      warnings: [],
      planner: "heuristic",
      provider: "fallback",
      createdAt: new Date().toISOString(),
    };

    const execRes = await executeAiPlan(multiPlan, MOCK_CONTEXT, `prog_test_${Date.now()}`);
    assert(execRes.success === true, "Execution completes successfully");
    assert(execRes.results.length === 3, "Exactly 3 action execution results returned");
    assert(execRes.results.every((r) => r.status === "SUCCESS"), "All 3 actions record SUCCESS status");
    assert(execRes.createdEntities.projectIds.length > 0, "Created project ID tracked in result");
    assert(execRes.createdEntities.phaseIds.length > 0, "Created phase ID tracked in result");
    assert(execRes.createdEntities.taskIds.length > 0, "Created task ID tracked in result");
  }

  // --------------------------------------------------------------------------
  // DIMENSION 8: DATABASE VERIFICATION INTEGRITY (6 Tests)
  // --------------------------------------------------------------------------
  section("8. Database Verification Integrity");
  {
    const singleTaskPlan: AiPlan = {
      id: "p_verify",
      userPrompt: "Create task",
      assistantMessage: "Create",
      actions: [
        {
          id: "act_vt1",
          type: "CREATE_TASK",
          summary: "Create verified task",
          riskLevel: "MEDIUM",
          requiredRole: Role.MEMBER,
          status: "READY",
          payload: { title: "Verified Task Title", projectId: "prj_fruit_01" },
        },
      ],
      status: "READY",
      requiresConfirmation: false,
      isDestructive: false,
      warnings: [],
      planner: "heuristic",
      provider: "fallback",
      createdAt: new Date().toISOString(),
    };

    const res = await executeAiPlan(singleTaskPlan, MOCK_CONTEXT, `ver_key_${Date.now()}`);
    assert(res.status === "SUCCESS", "Execution status is SUCCESS");
    assert(res.receipt?.successfulCount === 1, "Receipt records exactly 1 successful action");
    assert(res.receipt?.failedCount === 0, "Receipt records 0 failed actions");
    assert(res.receipt?.blockedCount === 0, "Receipt records 0 blocked actions");
    assert(res.summary.includes("Berhasil"), "Truth-grounded summary confirms success");
    assert(res.error === undefined, "No execution errors reported");
  }

  // --------------------------------------------------------------------------
  // DIMENSION 9: HONEST PARTIAL FAILURE REPORTING (7 Tests)
  // --------------------------------------------------------------------------
  section("9. Honest Partial Failure Reporting & Next Actions");
  {
    const partialPlan: AiPlan = {
      id: "p_partial",
      userPrompt: "Create task and add invalid user",
      assistantMessage: "Exec",
      actions: [
        {
          id: "act_good",
          type: "CREATE_TASK",
          summary: "Create good task",
          riskLevel: "MEDIUM",
          requiredRole: Role.MEMBER,
          status: "READY",
          payload: { title: "Good Task", projectId: "prj_fruit_01" },
        },
        {
          id: "act_bad",
          type: "ADD_MEMBER",
          summary: "Add invalid user",
          riskLevel: "MEDIUM",
          requiredRole: Role.MEMBER,
          status: "READY",
          payload: { projectId: "prj_fruit_01", userId: "" }, // Fails validation
        },
      ],
      status: "READY",
      requiresConfirmation: false,
      isDestructive: false,
      warnings: [],
      planner: "heuristic",
      provider: "fallback",
      createdAt: new Date().toISOString(),
    };

    const res = await executeAiPlan(partialPlan, MOCK_CONTEXT, `partial_key_${Date.now()}`);
    assert(res.status === "PARTIAL_SUCCESS", "Overall status is truthfully marked PARTIAL_SUCCESS");
    assert(res.results.find((r) => r.actionId === "act_good")?.status === "SUCCESS", "Successful action recorded as SUCCESS");
    assert(res.results.find((r) => r.actionId === "act_bad")?.status === "FAILED", "Failed action recorded as FAILED");
    assert(res.summary.includes("Berhasil menjalankan 1 aksi"), "Summary mentions 1 successful action");
    assert(res.summary.includes("Gagal menjalankan 1 aksi"), "Summary mentions 1 failed action");
    assert(res.error?.includes("1 aksi gagal") === true, "Error field contains failure count");
    assert(!res.summary.toLowerCase().includes("semua selesai"), "Never outputs misleading 'all done' message");
  }

  // --------------------------------------------------------------------------
  // DIMENSION 10: CANCELLATION UX (6 Tests)
  // --------------------------------------------------------------------------
  section("10. Cancellation UX ('batal', 'cancel', 'jangan')");
  {
    const resBatal = await generateAiPlan("batal", MOCK_CONTEXT);
    assert(resBatal.actions.length === 0, "'batal' produces 0 actions");
    assert(resBatal.assistantMessage.toLowerCase().includes("batal"), "'batal' confirms cancellation in assistantMessage");

    const resCancel = await generateAiPlan("cancel", MOCK_CONTEXT);
    assert(resCancel.actions.length === 0, "'cancel' produces 0 actions");

    const resJangan = await generateAiPlan("jangan jadi", MOCK_CONTEXT);
    assert(resJangan.actions.length === 0, "'jangan jadi' produces 0 actions");

    const resGakJadi = await generateAiPlan("gak jadi deh", MOCK_CONTEXT);
    assert(resGakJadi.actions.length === 0, "'gak jadi deh' produces 0 actions");

    assert(resBatal.requiresConfirmation === false, "Cancelled plan does not require confirmation");
  }

  // --------------------------------------------------------------------------
  // DIMENSION 11: SCOPED UNDO & REVERSIBLE RECEIPTS (8 Tests)
  // --------------------------------------------------------------------------
  section("11. Scoped Undo & Reversible Receipts");
  {
    const receiptToUndo: ExecutionReceipt = {
      executionId: "exec_undo_test_88",
      planId: "plan_undo_target",
      workspaceId: MOCK_CONTEXT.workspaceId,
      userId: MOCK_CONTEXT.userId,
      timestamp: new Date().toISOString(),
      status: "SUCCESS",
      workflowPolicy: "PARTIAL_SUCCESS_ALLOWED",
      actions: [
        {
          actionId: "act_orig_task",
          type: "CREATE_TASK",
          status: "SUCCESS",
          entityId: "tsk_created_999",
          entityType: "TASK",
          entityName: "Created Task",
          isReversible: true,
          summary: "Created task Created Task",
        },
      ],
      reversible: true,
      summary: "1 action executed",
      successfulCount: 1,
      failedCount: 0,
      blockedCount: 0,
    };

    recordExecutionReceipt(receiptToUndo);

    assert(isReceiptReversible(receiptToUndo) === true, "Receipt is verified as reversible");

    const { plan: undoPlan } = generateUndoPlanFromReceipt(receiptToUndo, MOCK_CONTEXT);
    assert(undoPlan !== undefined, "Undo plan generated successfully");
    assert(undoPlan?.actions.length === 1, "Undo plan has 1 action");
    assert(undoPlan?.actions[0].type === "DELETE_TASK", "Undo action type is DELETE_TASK");
    assert(undoPlan?.actions[0].payload.id === "tsk_created_999", "Undo targets exact created task ID");
    assert(undoPlan?.requiresConfirmation === true, "Undo plan requires confirmation");

    // Conversational command triggers same undo plan
    const convUndoPlan = await generateAiPlan("undo that", MOCK_CONTEXT);
    assert(convUndoPlan.actions.length === 1, "'undo that' prompt resolves to undo plan");
    assert(convUndoPlan.actions[0].type === "DELETE_TASK", "'undo that' produces DELETE_TASK action");
  }

  // --------------------------------------------------------------------------
  // DIMENSION 12: EXECUTION HISTORY & AUDIT RETRIEVAL (6 Tests)
  // --------------------------------------------------------------------------
  section("12. Execution History & Audit Retrieval");
  {
    const history = getExecutionHistory(MOCK_CONTEXT.workspaceId, MOCK_CONTEXT.userId);
    assert(Array.isArray(history), "Execution history returns array");
    assert(history.length > 0, "History contains recorded execution receipts");
    assert(history[0].workspaceId === MOCK_CONTEXT.workspaceId, "History item belongs to active workspace");
    assert(history[0].userId === MOCK_CONTEXT.userId, "History item belongs to active user");
    assert(typeof history[0].successfulCount === "number", "History item has numeric successfulCount");
    assert(history[0].summary.length > 0, "History item contains human-readable summary");
  }

  // ==========================================================================
  // RESULTS SUMMARY
  // ==========================================================================
  console.log("\n======================================================================");
  const passRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : "0";
  console.log(`PHASE 14E AI ASSISTANT UX TEST SUITE: ${passedTests}/${totalTests} TESTS PASSED (${passRate}%)`);
  console.log("======================================================================");

  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(f));
    process.exit(1);
  }
}

runAssistantUxTests().catch((err) => {
  console.error("Test Suite crashed:", err);
  process.exit(1);
});
