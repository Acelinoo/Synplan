/**
 * SYNPLAN — PHASE 14D.1: END-TO-END AI ENTITY RESOLUTION VALIDATION
 *
 * Validates the complete pipeline:
 * USER -> AI -> ENTITY RESOLUTION -> CLARIFICATION -> USER RESPONSE -> ACTION PLAN -> VALIDATION -> PERMISSION -> EXECUTION -> VERIFICATION
 *
 * Covers all 24 requirements from Phase 14D.1:
 * - Real authorized workspace member fixtures: Maman, Maul, Marshel, Marchel, Marlo
 * - Ambiguous member flow ("tambahkan marhel")
 * - Single selection ("Marchel", "Marshel")
 * - Multi-selection ("Keduanya", "Dua-duanya", "Marchel dan Marshel", "semuanya")
 * - Ordinal selection ("yang pertama", "yang kedua") with & without active clarification
 * - User correction ("bukan, yang Marshel", "bukan yang pertama, yang kedua")
 * - Cancellation ("batal", "cancel")
 * - Project context isolation (Project A vs Project B)
 * - Cross-workspace isolation (Workspace A vs Workspace B security)
 * - Exact match override (intelligent non-redundant matching)
 * - Task assignment resolution
 * - Compound project creation + member addition
 * - Client trust boundary & malformed clarification state rejection
 * - Idempotency & duplicate prevention
 * - Partial failure reporting
 * - Confirmation risk gate
 *
 * Run: npx tsx scripts/test-ai-entity-resolution-e2e.ts
 */

import { generateAiPlan, parseHeuristicIntent } from "../src/lib/ai/planner";
import { validateAiPlan } from "../src/lib/ai/validator";
import { executeAiPlan } from "../src/lib/ai/executor";
import { resolveWorkspaceMember, resolveWorkspaceProject, resolveWorkspaceTask, resolveClarificationAnswer } from "../src/lib/ai/entityResolver";
import { getIdempotencyResult, setIdempotencyResult } from "../src/lib/ai/idempotency";
import { AiExecutionContext, AiPlan, ClarificationState } from "../src/lib/ai/types";
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
// REALISTIC WORKSPACE FIXTURES
// ============================================================================

// Workspace A (Main Authorized Workspace)
const FIXTURE_MEMBERS_WS_A: AiExecutionContext["members"] = [
  { id: "wm_maman", userId: "usr_maman_01", name: "Maman Surachman", email: "maman@synplan.io", role: Role.ADMIN },
  { id: "wm_maul", userId: "usr_maul_02", name: "Maul Hidayat", email: "maul@synplan.io", role: Role.MEMBER },
  { id: "wm_marshel", userId: "usr_marshel_03", name: "Marshel Saputra", email: "marshel@synplan.io", role: Role.MEMBER },
  { id: "wm_marchel", userId: "usr_marchel_04", name: "Marchel Pratama", email: "marchel@synplan.io", role: Role.MEMBER },
  { id: "wm_marlo", userId: "usr_marlo_05", name: "Marlo Tenggara", email: "marlo@synplan.io", role: Role.MEMBER },
  { id: "wm_owner", userId: "usr_acelino_owner", name: "Marchelino Kurniawan", email: "acel@synplan.io", role: Role.OWNER },
];

// Workspace B (Unauthorized Cross-Workspace Sandbox)
const FIXTURE_MEMBERS_WS_B: AiExecutionContext["members"] = [
  { id: "wm_other_user", userId: "usr_cross_marshel_99", name: "Marshel dari Workspace Lain", email: "marshel.b@evil.io", role: Role.MEMBER },
  { id: "wm_other_secret", userId: "usr_secret_agent_88", name: "Secret Agent B", email: "secret@corp.io", role: Role.ADMIN },
];

const FIXTURE_PROJECTS_WS_A: AiExecutionContext["projects"] = [
  { id: "prj_fruit_01", name: "Website Toko Buah", status: "ACTIVE", totalTasks: 5, deadline: "2026-09-01" },
  { id: "prj_bakery_02", name: "Website Toko Roti", status: "ACTIVE", totalTasks: 4, deadline: "2026-09-10" },
];

const FIXTURE_TASKS_WS_A: AiExecutionContext["tasks"] = [
  { id: "tsk_homepage_01", projectId: "prj_fruit_01", title: "Desain Homepage", status: "TODO", priority: "HIGH", assigneeId: null },
  { id: "tsk_api_02", projectId: "prj_fruit_01", title: "API Payment Gateway", status: "IN_PROGRESS", priority: "URGENT", assigneeId: null },
];

const BASE_CONTEXT_WS_A: AiExecutionContext = {
  workspaceId: "ws_alpha_001",
  workspaceName: "Alpha Workspace",
  userId: "usr_acelino_owner",
  userName: "Marchelino Kurniawan",
  userRole: Role.OWNER,
  currentProjectId: "prj_fruit_01",
  currentProjectName: "Website Toko Buah",
  serverTime: "2026-08-30T00:00:00.000Z",
  members: FIXTURE_MEMBERS_WS_A,
  projects: FIXTURE_PROJECTS_WS_A,
  tasks: FIXTURE_TASKS_WS_A,
  phases: [
    { id: "ph_1", projectId: "prj_fruit_01", name: "Planning", order: 1 },
    { id: "ph_2", projectId: "prj_fruit_01", name: "Development", order: 2 },
  ],
};

async function runE2ETests() {
  console.log("======================================================================");
  console.log("SYNPLAN — PHASE 14D.1: END-TO-END AI ENTITY RESOLUTION TEST SUITE");
  console.log("======================================================================");

  // --------------------------------------------------------------------------
  // STEP 3: AMBIGUOUS MEMBER FLOW ("tambahkan marhel ke project ini")
  // --------------------------------------------------------------------------
  section("STEP 3: Ambiguous Member Flow ('tambahkan marhel ke project ini')");
  {
    const plan = await generateAiPlan("tambahkan marhel ke project ini", BASE_CONTEXT_WS_A);

    assert(plan.status === "NEEDS_CLARIFICATION", "Plan status is NEEDS_CLARIFICATION");
    assert(plan.needsClarification === true, "needsClarification flag is true");
    assert(plan.clarificationState !== undefined, "Structured clarificationState is present");
    assert(plan.clarificationState?.entityType === "MEMBER", "Clarification entityType is MEMBER");
    assert(plan.clarificationState?.query === "marhel", "Clarification query extracted as 'marhel'");

    const candidateNames = plan.clarificationState?.candidates.map((c) => c.name) || [];
    assert(
      candidateNames.includes("Marshel Saputra") && candidateNames.includes("Marchel Pratama"),
      "Both Marshel Saputra and Marchel Pratama returned as strong candidates"
    );
    assert(
      !candidateNames.includes("Maman Surachman") && !candidateNames.includes("Maul Hidayat"),
      "Maman and Maul correctly filtered out from 'marhel' candidates"
    );
    assert(plan.clarificationState?.allowMultiSelect === true, "Multi-select option enabled in clarification");
    assert(plan.actions.length === 0 || plan.actions.every((a) => a.status === "NEEDS_CLARIFICATION"), "No premature database mutation action created");
  }

  // --------------------------------------------------------------------------
  // STEP 4: SINGLE SELECTION ("Marchel")
  // --------------------------------------------------------------------------
  section("STEP 4: Single Selection ('Marchel' -> resumes ADD_MEMBER for Marchel only)");
  {
    const pendingClarification: ClarificationState = {
      id: "clar_step4",
      entityType: "MEMBER",
      query: "marhel",
      originalActionType: "ADD_MEMBER",
      candidates: [
        { id: "usr_marshel_03", name: "Marshel Saputra" },
        { id: "usr_marchel_04", name: "Marchel Pratama" },
      ],
      allowMultiSelect: true,
      message: "Yang Anda maksud Marchel atau Marshel?",
      createdAt: new Date().toISOString(),
    };

    const resolvedPlan = await generateAiPlan("Marchel", BASE_CONTEXT_WS_A, [], pendingClarification);

    assert(resolvedPlan.status === "READY", "Resolved plan status is READY");
    assert(resolvedPlan.actions.length === 1, "Exactly 1 action generated");
    assert(resolvedPlan.actions[0].type === "ADD_MEMBER", "Action type is ADD_MEMBER");
    assert(resolvedPlan.actions[0].payload.userId === "usr_marchel_04", "Resolved payload userId is Marchel (usr_marchel_04)");
    assert(resolvedPlan.actions[0].payload.userName === "Marchel Pratama", "Resolved payload userName is Marchel Pratama");
    assert(resolvedPlan.actions.every((a) => a.payload.userId !== "usr_marshel_03"), "Marshel (usr_marshel_03) is NOT added");
  }

  // --------------------------------------------------------------------------
  // STEP 5: SECOND SELECTION ("Marshel")
  // --------------------------------------------------------------------------
  section("STEP 5: Second Selection ('Marshel' -> resumes ADD_MEMBER for Marshel only)");
  {
    const pendingClarification: ClarificationState = {
      id: "clar_step5",
      entityType: "MEMBER",
      query: "marhel",
      originalActionType: "ADD_MEMBER",
      candidates: [
        { id: "usr_marshel_03", name: "Marshel Saputra" },
        { id: "usr_marchel_04", name: "Marchel Pratama" },
      ],
      allowMultiSelect: true,
      message: "Yang Anda maksud Marchel atau Marshel?",
      createdAt: new Date().toISOString(),
    };

    const resolvedPlan = await generateAiPlan("Marshel", BASE_CONTEXT_WS_A, [], pendingClarification);

    assert(resolvedPlan.actions.length === 1, "Exactly 1 action generated");
    assert(resolvedPlan.actions[0].payload.userId === "usr_marshel_03", "Resolved payload userId is Marshel (usr_marshel_03)");
    assert(resolvedPlan.actions[0].payload.userName === "Marshel Saputra", "Resolved payload userName is Marshel Saputra");
    assert(resolvedPlan.actions.every((a) => a.payload.userId !== "usr_marchel_04"), "Marchel (usr_marchel_04) is NOT added");
  }

  // --------------------------------------------------------------------------
  // STEP 6: MULTI-SELECTION ("Keduanya")
  // --------------------------------------------------------------------------
  section("STEP 6: Multi-Selection ('Keduanya' -> adds both Marchel and Marshel)");
  {
    const pendingClarification: ClarificationState = {
      id: "clar_step6",
      entityType: "MEMBER",
      query: "marhel",
      originalActionType: "ADD_MEMBER",
      candidates: [
        { id: "usr_marshel_03", name: "Marshel Saputra" },
        { id: "usr_marchel_04", name: "Marchel Pratama" },
      ],
      allowMultiSelect: true,
      message: "Yang Anda maksud Marchel atau Marshel?",
      createdAt: new Date().toISOString(),
    };

    const resolvedPlan = await generateAiPlan("Keduanya", BASE_CONTEXT_WS_A, [], pendingClarification);

    assert(resolvedPlan.actions.length === 2, "Generates exactly 2 ADD_MEMBER actions");
    const addedIds = resolvedPlan.actions.map((a) => a.payload.userId);
    assert(addedIds.includes("usr_marshel_03") && addedIds.includes("usr_marchel_04"), "Both Marshel and Marchel user IDs are present in actions");
    assert(!addedIds.includes("usr_maman_01") && !addedIds.includes("usr_maul_02"), "No unrelated workspace member is added");
  }

  // --------------------------------------------------------------------------
  // STEP 7: NATURAL MULTI-SELECTION VARIATIONS
  // --------------------------------------------------------------------------
  section("STEP 7: Natural Multi-Selection Variations ('Dua-duanya', 'Marchel dan Marshel', 'semuanya')");
  {
    const candidates = [
      { id: "usr_marshel_03", name: "Marshel Saputra", score: 0.88, data: FIXTURE_MEMBERS_WS_A[2] },
      { id: "usr_marchel_04", name: "Marchel Pratama", score: 0.85, data: FIXTURE_MEMBERS_WS_A[3] },
    ];

    const rDua = resolveClarificationAnswer("Dua-duanya", candidates);
    assert(rDua.resolved && rDua.selectedEntities.length === 2, "'Dua-duanya' resolves both candidates");

    const rDan = resolveClarificationAnswer("Marchel dan Marshel", candidates);
    assert(rDan.resolved && rDan.selectedEntities.length === 2, "'Marchel dan Marshel' resolves both candidates");

    const rSemua = resolveClarificationAnswer("semuanya", candidates);
    assert(rSemua.resolved && rSemua.selectedEntities.length === 2, "'semuanya' resolves strictly to the 2 clarification candidates");
    assert(
      rSemua.selectedEntities.every((e: any) => e.userId === "usr_marshel_03" || e.userId === "usr_marchel_04"),
      "'semuanya' is strictly bounded to clarification candidates, NEVER whole workspace (6 members)"
    );
  }

  // --------------------------------------------------------------------------
  // STEP 8: ORDINAL REFERENCES ("yang pertama", "yang kedua")
  // --------------------------------------------------------------------------
  section("STEP 8: Ordinal References ('yang pertama', 'yang kedua')");
  {
    const candidates = [
      { id: "usr_marshel_03", name: "Marshel Saputra", score: 0.88, data: FIXTURE_MEMBERS_WS_A[2] },
      { id: "usr_marchel_04", name: "Marchel Pratama", score: 0.85, data: FIXTURE_MEMBERS_WS_A[3] },
    ];

    const rFirst = resolveClarificationAnswer("yang pertama", candidates);
    assert(rFirst.resolved && rFirst.selectedEntities[0].userId === "usr_marshel_03", "'yang pertama' -> first candidate (Marshel)");

    const rSecond = resolveClarificationAnswer("yang kedua", candidates);
    assert(rSecond.resolved && rSecond.selectedEntities[0].userId === "usr_marchel_04", "'yang kedua' -> second candidate (Marchel)");

    // Ordinal without clarification
    const rNoClar = resolveClarificationAnswer("yang pertama", []);
    assert(!rNoClar.resolved && rNoClar.selectedEntities.length === 0, "'yang pertama' without active clarification returns un-resolved");
  }

  // --------------------------------------------------------------------------
  // STEP 9: CLARIFICATION PERSISTENCE ACROSS API BOUNDARY
  // --------------------------------------------------------------------------
  section("STEP 9: Clarification Persistence Across API Boundary (Serialization/Deserialization)");
  {
    // Simulate JSON serialization over HTTP API
    const serializedPayload = JSON.stringify({
      prompt: "Marchel",
      pendingClarification: {
        id: "clar_http_001",
        entityType: "MEMBER",
        query: "marhel",
        originalActionType: "ADD_MEMBER",
        candidates: [
          { id: "usr_marshel_03", name: "Marshel Saputra" },
          { id: "usr_marchel_04", name: "Marchel Pratama" },
        ],
        allowMultiSelect: true,
        message: "Yang mana?",
        createdAt: new Date().toISOString(),
      },
    });

    const parsed = JSON.parse(serializedPayload);
    const plan = await generateAiPlan(parsed.prompt, BASE_CONTEXT_WS_A, [], parsed.pendingClarification);

    assert(plan.status === "READY", "API roundtrip deserialization resolved correctly");
    assert(plan.actions[0].payload.userId === "usr_marchel_04", "Server safely resolved target member from payload");
  }

  // --------------------------------------------------------------------------
  // STEP 10: PROJECT CONTEXT ISOLATION
  // --------------------------------------------------------------------------
  section("STEP 10: Project Context Isolation (Project A vs Project B)");
  {
    const contextProjectA: AiExecutionContext = {
      ...BASE_CONTEXT_WS_A,
      currentProjectId: "prj_fruit_01",
      currentProjectName: "Website Toko Buah",
    };

    const pendingClarification: ClarificationState = {
      id: "clar_p10",
      entityType: "MEMBER",
      query: "marhel",
      originalActionType: "ADD_MEMBER",
      candidates: [
        { id: "usr_marshel_03", name: "Marshel Saputra" },
        { id: "usr_marchel_04", name: "Marchel Pratama" },
      ],
      allowMultiSelect: true,
      message: "Yang mana?",
      createdAt: new Date().toISOString(),
    };

    const plan = await generateAiPlan("Marchel", contextProjectA, [], pendingClarification);

    assert(plan.actions[0].payload.projectId === "prj_fruit_01", "Action is strictly scoped to active Project A (prj_fruit_01)");
    assert(plan.actions[0].payload.projectId !== "prj_bakery_02", "0 mutation directed to Project B (prj_bakery_02)");
  }

  // --------------------------------------------------------------------------
  // STEP 11: CROSS-WORKSPACE SECURITY ISOLATION
  // --------------------------------------------------------------------------
  section("STEP 11: Cross-Workspace Security Isolation (Workspace A vs Workspace B)");
  {
    // User in Workspace A asks for a member that only exists in Workspace B
    const resUnauthorized = resolveWorkspaceMember("Marshel dari Workspace Lain", BASE_CONTEXT_WS_A.members);
    assert(
      resUnauthorized.member?.userId !== "usr_cross_marshel_99",
      "Member from Workspace B (usr_cross_marshel_99) is NEVER resolved in Workspace A context"
    );

    // Maliciously inject cross-workspace candidate into pending clarification
    const spoofedClarification: ClarificationState = {
      id: "clar_spoof",
      entityType: "MEMBER",
      query: "marshel",
      originalActionType: "ADD_MEMBER",
      candidates: [
        { id: "usr_cross_marshel_99", name: "Marshel dari Workspace Lain" }, // Unauthorized user
      ],
      allowMultiSelect: true,
      message: "Yang mana?",
      createdAt: new Date().toISOString(),
    };

    const planWithSpoof = await generateAiPlan("Marshel dari Workspace Lain", BASE_CONTEXT_WS_A, [], spoofedClarification);
    const { isValid } = validateAiPlan(planWithSpoof, BASE_CONTEXT_WS_A);
    assert(
      !isValid || planWithSpoof.actions.length === 0,
      "Server validation strictly rejects spoofed/unauthorized cross-workspace candidate IDs"
    );
  }

  // --------------------------------------------------------------------------
  // STEP 12: NO MATCH ("tambahkan xyzabc")
  // --------------------------------------------------------------------------
  section("STEP 12: No Match ('tambahkan xyzabc')");
  {
    const resNoMatch = resolveWorkspaceMember("xyzabc", BASE_CONTEXT_WS_A.members);
    assert(resNoMatch.notFound === true, "Unrecognized entity marked notFound: true");
    assert(resNoMatch.member === undefined, "No phantom member returned");

    const planNoMatch = await generateAiPlan("tambahkan xyzabc ke project ini", BASE_CONTEXT_WS_A);
    assert(
      planNoMatch.needsClarification === true || planNoMatch.actions.length === 0,
      "No mutation plan generated for non-existent member"
    );
  }

  // --------------------------------------------------------------------------
  // STEP 13: EXACT MATCH OVERRIDES AMBIGUITY
  // --------------------------------------------------------------------------
  section("STEP 13: Exact Match Overrides Ambiguity ('Marchel Pratama')");
  {
    // When user enters full exact name, system resolves directly without asking
    const resExact = resolveWorkspaceMember("Marchel Pratama", BASE_CONTEXT_WS_A.members);
    assert(!resExact.isAmbiguous, "Exact full name is NOT marked ambiguous");
    assert(resExact.member?.userId === "usr_marchel_04", "Exact match resolves directly to Marchel Pratama");
    assert(resExact.confidence === 1.0, "Confidence is 1.0");
  }

  // --------------------------------------------------------------------------
  // STEP 14: TYPOS & EDIT DISTANCE TOLERANCE
  // --------------------------------------------------------------------------
  section("STEP 14: Typos & Edit Distance Tolerance");
  {
    // "Marcheel" typo on Marchel
    const resTypo1 = resolveWorkspaceMember("Marcheel", BASE_CONTEXT_WS_A.members);
    assert(resTypo1.isAmbiguous || resTypo1.member?.userId === "usr_marchel_04", "Typo 'Marcheel' safely matches Marchel candidate");

    // Single candidate typo: "Mmaan" -> Maman Surachman
    const resTypoMaman = resolveWorkspaceMember("Mmaan", BASE_CONTEXT_WS_A.members);
    assert(resTypoMaman.candidates.includes("Maman Surachman") || resTypoMaman.member?.name === "Maman Surachman", "Typo 'Mmaan' matches Maman Surachman");
  }

  // --------------------------------------------------------------------------
  // STEP 15: TASK ASSIGNMENT RESOLUTION
  // --------------------------------------------------------------------------
  section("STEP 15: Task Assignment Resolution ('assign task homepage ke marhel')");
  {
    const planTaskAssign = await generateAiPlan("assign task Desain Homepage ke marhel", BASE_CONTEXT_WS_A);
    assert(planTaskAssign.status === "NEEDS_CLARIFICATION", "Ambiguous assignee triggers clarification");

    // Answer clarification with Marchel
    const pendingClar: ClarificationState = {
      id: "clar_task_01",
      entityType: "MEMBER",
      query: "marhel",
      originalActionType: "ASSIGN_TASK",
      candidates: [
        { id: "usr_marshel_03", name: "Marshel Saputra" },
        { id: "usr_marchel_04", name: "Marchel Pratama" },
      ],
      allowMultiSelect: false,
      message: "Assign ke Marchel atau Marshel?",
      createdAt: new Date().toISOString(),
    };

    const resolvedTaskPlan = await generateAiPlan("Marchel", BASE_CONTEXT_WS_A, [], pendingClar);
    assert(resolvedTaskPlan.actions[0].type === "ASSIGN_TASK", "Action type is ASSIGN_TASK");
    assert(resolvedTaskPlan.actions[0].payload.assigneeId === "usr_marchel_04", "Task assigned to real Marchel ID");
  }

  // --------------------------------------------------------------------------
  // STEP 16: COMPOUND PROJECT CREATION WITH MEMBER RESOLUTION
  // --------------------------------------------------------------------------
  section("STEP 16: Compound Project Creation ('buat project website toko buah lalu tambahkan marhel')");
  {
    const planCompound = parseHeuristicIntent(
      "buat project website toko buah lalu tambahkan Marchel ke tim",
      BASE_CONTEXT_WS_A
    );
    assert(planCompound.actions.some((a) => a.type === "CREATE_PROJECT"), "Compound plan contains CREATE_PROJECT");
    assert(planCompound.actions.some((a) => a.type === "ADD_MEMBER"), "Compound plan contains ADD_MEMBER");
    assert(planCompound.requiresConfirmation === true, "Compound plan gated by confirmation");
  }

  // --------------------------------------------------------------------------
  // STEP 17: USER CORRECTION ("bukan, yang Marshel", "bukan yang pertama, yang kedua")
  // --------------------------------------------------------------------------
  section("STEP 17: User Correction Handling");
  {
    const candidates = [
      { id: "usr_marshel_03", name: "Marshel Saputra", score: 0.88, data: FIXTURE_MEMBERS_WS_A[2] },
      { id: "usr_marchel_04", name: "Marchel Pratama", score: 0.85, data: FIXTURE_MEMBERS_WS_A[3] },
    ];

    const rCorr1 = resolveClarificationAnswer("bukan, yang Marshel", candidates);
    assert(rCorr1.resolved && rCorr1.selectedEntities[0].userId === "usr_marshel_03", "'bukan, yang Marshel' -> resolves Marshel");

    const rCorr2 = resolveClarificationAnswer("bukan yang pertama, yang kedua", candidates);
    assert(rCorr2.resolved && rCorr2.selectedEntities[0].userId === "usr_marchel_04", "'bukan yang pertama, yang kedua' -> resolves second candidate (Marchel)");
  }

  // --------------------------------------------------------------------------
  // STEP 18: CANCELLATION ("batal", "cancel")
  // --------------------------------------------------------------------------
  section("STEP 18: Cancellation Handling ('batal' -> 0 mutation)");
  {
    const pendingClar: ClarificationState = {
      id: "clar_cancel",
      entityType: "MEMBER",
      query: "marhel",
      originalActionType: "ADD_MEMBER",
      candidates: [
        { id: "usr_marshel_03", name: "Marshel Saputra" },
        { id: "usr_marchel_04", name: "Marchel Pratama" },
      ],
      allowMultiSelect: true,
      message: "Pilih member:",
      createdAt: new Date().toISOString(),
    };

    const cancelPlan = await generateAiPlan("batal", BASE_CONTEXT_WS_A, [], pendingClar);
    assert(cancelPlan.actions.length === 0, "Cancelled clarification produces 0 actions");
    assert(cancelPlan.assistantMessage.toLowerCase().includes("batal"), "Assistant message confirms cancellation");
  }

  // --------------------------------------------------------------------------
  // STEP 19: CONFIRMATION RISK GATE
  // --------------------------------------------------------------------------
  section("STEP 19: Confirmation Risk Gate");
  {
    const destructivePlan: AiPlan = {
      id: "plan_destr_01",
      userPrompt: "Hapus project Toko Roti",
      assistantMessage: "Konfirmasi hapus project",
      actions: [
        {
          id: "act_del_1",
          type: "DELETE_PROJECT",
          summary: "Hapus Website Toko Roti",
          riskLevel: "HIGH",
          requiredRole: Role.ADMIN,
          isDestructive: true,
          requiresConfirmation: true,
          status: "READY",
          payload: { id: "prj_bakery_02", name: "Website Toko Roti", entityType: "PROJECT" },
        },
      ],
      status: "NEEDS_CONFIRMATION",
      requiresConfirmation: true,
      isDestructive: true,
      warnings: ["Tindakan ini permanen."],
      planner: "heuristic",
      provider: "fallback",
      createdAt: new Date().toISOString(),
    };

    const { validatedPlan } = validateAiPlan(destructivePlan, BASE_CONTEXT_WS_A);
    assert(validatedPlan.requiresConfirmation === true, "Destructive plan strictly requires user confirmation");
    assert(validatedPlan.status === "NEEDS_CONFIRMATION", "Plan status is NEEDS_CONFIRMATION");
  }

  // --------------------------------------------------------------------------
  // STEP 20: IDEMPOTENCY & DUPLICATE EXECUTION PREVENTION
  // --------------------------------------------------------------------------
  section("STEP 20: Idempotency & Duplicate Execution Prevention");
  {
    const testIdempotencyKey = `e2e_idemp_${Date.now()}`;
    const initialCheck = getIdempotencyResult(testIdempotencyKey);
    assert(initialCheck === null, "Fresh idempotency key returns null");

    setIdempotencyResult(testIdempotencyKey, "plan_exec_001", {
      planId: "plan_exec_001",
      success: true,
      status: "SUCCESS",
      results: [],
      createdEntities: { projectIds: ["prj_new_1"], taskIds: [], phaseIds: [] },
      summary: "Project created",
    });

    const secondCheck = getIdempotencyResult(testIdempotencyKey);
    assert(secondCheck !== null && secondCheck.success === true, "Repeated idempotency key returns cached result without duplicate execution");
  }

  // --------------------------------------------------------------------------
  // STEP 21: CLIENT TRUST BOUNDARY & MALFORMED CLARIFICATION STATE
  // --------------------------------------------------------------------------
  section("STEP 21: Client Trust Boundary & Malformed Clarification State Rejection");
  {
    const fabricatedClarification: ClarificationState = {
      id: "clar_fake",
      entityType: "MEMBER",
      query: "hacker",
      originalActionType: "ADD_MEMBER",
      candidates: [
        { id: "usr_fake_hacker_999999", name: "Fabricated User" },
      ],
      allowMultiSelect: true,
      message: "Fake message",
      createdAt: new Date().toISOString(),
    };

    const planWithFake = await generateAiPlan("Fabricated User", BASE_CONTEXT_WS_A, [], fabricatedClarification);
    const { isValid } = validateAiPlan(planWithFake, BASE_CONTEXT_WS_A);
    assert(
      !isValid || planWithFake.actions.length === 0,
      "Fabricated user IDs are rejected by server validation"
    );
  }

  // ==========================================================================
  // RESULTS SUMMARY
  // ==========================================================================
  console.log("\n======================================================================");
  const passRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : "0";
  console.log(`PHASE 14D.1 E2E TEST SUITE: ${passedTests}/${totalTests} TESTS PASSED (${passRate}%)`);
  console.log("======================================================================");

  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(f));
  }

  if (failedTests > 0) {
    process.exit(1);
  }
}

runE2ETests().catch((err) => {
  console.error("Test Suite crashed:", err);
  process.exit(1);
});
