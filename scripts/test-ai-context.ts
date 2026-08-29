import { Role } from "@prisma/client";
import { AiExecutionContext } from "../src/lib/ai/types";
import {
  resolveContextualProject,
  resolveContextualPhase,
  resolveContextualTask,
  resolveContextualMember,
  validateAndSanitizeContext,
  extractRecentEntitiesFromHistory,
} from "../src/lib/ai/contextResolver";
import { resolveNaturalDate } from "../src/lib/ai/dateResolver";
import { parseHeuristicIntent } from "../src/lib/ai/planner";
import { validateAiPlan } from "../src/lib/ai/validator";

// ============================================================================
// MOCK DATA & CONTEXTS
// ============================================================================

const BASE_SERVER_TIME = "2026-08-30T04:00:00.000Z"; // Sunday, August 30, 2026

const mockMembers = [
  { id: "mem_1", userId: "usr_marchel", name: "Marchelino Kurniawan", email: "marchelinokurniawan321@gmail.com", role: Role.OWNER },
  { id: "mem_2", userId: "usr_sarah", name: "Sarah Chen", email: "sarah@synplan.dev", role: Role.ADMIN },
  { id: "mem_3", userId: "usr_bob", name: "Bob Designer", email: "bob@synplan.dev", role: Role.MEMBER },
  { id: "mem_4", userId: "usr_andi_1", name: "Andi Saputra", email: "andi.s@synplan.dev", role: Role.MEMBER },
  { id: "mem_5", userId: "usr_andi_2", name: "Andi Pratama", email: "andi.p@synplan.dev", role: Role.MEMBER },
];

const mockProjects = [
  { id: "prj_cafe_01", name: "Website Cafe ABC", status: "ACTIVE", totalTasks: 5, deadline: "2026-09-15" },
  { id: "prj_bakery_02", name: "Website Bakery XYZ", status: "PLANNING", totalTasks: 3, deadline: "2026-09-30" },
  { id: "prj_fruit_03", name: "Website Toko Buah", status: "ACTIVE", totalTasks: 2, deadline: "2026-10-01" },
];

const mockPhases = [
  { id: "phs_cafe_design", projectId: "prj_cafe_01", name: "Design Phase", order: 1 },
  { id: "phs_cafe_dev", projectId: "prj_cafe_01", name: "Development Phase", order: 2 },
  { id: "phs_cafe_qa", projectId: "prj_cafe_01", name: "Testing & QA", order: 3 },
  { id: "phs_bakery_plan", projectId: "prj_bakery_02", name: "Planning", order: 1 },
  { id: "phs_bakery_dev", projectId: "prj_bakery_02", name: "Coding", order: 2 },
];

const mockTasks = [
  { id: "tsk_cafe_1", projectId: "prj_cafe_01", phaseId: "phs_cafe_design", title: "Design Homepage", status: "DONE", priority: "HIGH", assigneeId: "usr_marchel", dueDate: "2026-09-01" },
  { id: "tsk_cafe_2", projectId: "prj_cafe_01", phaseId: "phs_cafe_dev", title: "API Payment Gateway", status: "IN_PROGRESS", priority: "URGENT", assigneeId: "usr_sarah", dueDate: "2026-09-05" },
  { id: "tsk_cafe_3", projectId: "prj_cafe_01", phaseId: "phs_cafe_dev", title: "Backend Auth Service", status: "TODO", priority: "MEDIUM", dueDate: "2026-09-10" },
  { id: "tsk_cafe_4", projectId: "prj_cafe_01", phaseId: "phs_cafe_qa", title: "Integration Testing", status: "TODO", priority: "LOW", dueDate: "2026-09-12" },
  { id: "tsk_bakery_1", projectId: "prj_bakery_02", phaseId: "phs_bakery_plan", title: "Design Homepage", status: "TODO", priority: "HIGH", assigneeId: "usr_bob" },
  { id: "tsk_bakery_2", projectId: "prj_bakery_02", phaseId: "phs_bakery_dev", title: "Payment Integration", status: "TODO", priority: "URGENT" },
];

const defaultContext: AiExecutionContext = {
  workspaceId: "ws_eng_core_1",
  workspaceName: "Engineering Core",
  userId: "usr_marchel",
  userName: "Marchelino Kurniawan",
  userRole: Role.OWNER,
  serverTime: BASE_SERVER_TIME,
  isMock: true,
  members: mockMembers,
  projects: mockProjects,
  phases: mockPhases,
  tasks: mockTasks,
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

async function runContextTestSuite() {
  console.log("=".repeat(80));
  console.log(" SYNPLAN PHASE 6 — CONTEXT AWARENESS + SMART DEFAULTS SUITE");
  console.log("=".repeat(80));

  // =========================================================================
  // 1. CONTEXT RESOLUTION & PRECEDENCE HIERARCHY
  // =========================================================================
  console.log("\n--- 1. CONTEXT RESOLUTION & PRECEDENCE HIERARCHY ---");

  // Test 1.1: UI Project Context
  const ctxWithProj: AiExecutionContext = {
    ...defaultContext,
    currentProjectId: "prj_cafe_01",
    currentProjectName: "Website Cafe ABC",
  };
  const res1_1 = resolveContextualProject(undefined, ctxWithProj);
  assert(
    res1_1.confidence === "CONTEXT_EXACT" &&
    res1_1.entity?.id === "prj_cafe_01" &&
    res1_1.source === "UI_CONTEXT",
    "CONTEXT: UI currentProjectId resolves with CONTEXT_EXACT"
  );

  // Test 1.2: UI Phase Context
  const ctxWithPhase: AiExecutionContext = {
    ...ctxWithProj,
    currentPhaseId: "phs_cafe_dev",
    currentPhaseName: "Development Phase",
  };
  const res1_2 = resolveContextualPhase(undefined, ctxWithPhase, "prj_cafe_01");
  assert(
    res1_2.confidence === "CONTEXT_EXACT" &&
    res1_2.entity?.id === "phs_cafe_dev" &&
    res1_2.source === "UI_CONTEXT",
    "CONTEXT: UI currentPhaseId resolves with CONTEXT_EXACT"
  );

  // Test 1.3: UI Task Context
  const ctxWithTask: AiExecutionContext = {
    ...ctxWithProj,
    currentTaskId: "tsk_cafe_2",
    currentTaskTitle: "API Payment Gateway",
  };
  const res1_3 = resolveContextualTask(undefined, ctxWithTask, "prj_cafe_01");
  assert(
    res1_3.confidence === "CONTEXT_EXACT" &&
    res1_3.entity?.id === "tsk_cafe_2" &&
    res1_3.source === "UI_CONTEXT",
    "CONTEXT: UI currentTaskId resolves with CONTEXT_EXACT"
  );

  // Test 1.4: UI Member Context ("saya")
  const res1_4 = resolveContextualMember("saya", ctxWithProj);
  assert(
    res1_4.confidence === "CONTEXT_EXACT" &&
    res1_4.entity?.userId === "usr_marchel",
    "CONTEXT: 'saya' maps to active authenticated user"
  );

  // Test 1.5: Explicit input OVERRIDES UI Context
  const res1_5 = resolveContextualProject("Website Bakery XYZ", ctxWithProj);
  assert(
    res1_5.confidence === "EXACT" &&
    res1_5.entity?.id === "prj_bakery_02" &&
    res1_5.source === "EXPLICIT",
    "PRECEDENCE: Explicit project input OVERRIDES active UI project context"
  );

  // Test 1.6: Contextual phrase "project ini" resolves active project
  const res1_6 = resolveContextualProject("project ini", ctxWithProj);
  assert(
    res1_6.confidence === "CONTEXT_EXACT" &&
    res1_6.entity?.id === "prj_cafe_01",
    "PRECEDENCE: Contextual phrase 'project ini' resolves current active project"
  );

  // Test 1.7: Contextual phrase "task ini" resolves active task
  const res1_7 = resolveContextualTask("task ini", ctxWithTask);
  assert(
    res1_7.confidence === "CONTEXT_EXACT" &&
    res1_7.entity?.id === "tsk_cafe_2",
    "PRECEDENCE: Contextual phrase 'task ini' resolves current active task"
  );

  // =========================================================================
  // 2. CONVERSATION CONTEXT & FOLLOW-UP COMMANDS
  // =========================================================================
  console.log("\n--- 2. CONVERSATION CONTEXT & FOLLOW-UP COMMANDS ---");

  // Test 2.1: Extract recent task from previous conversation turn
  const convHistory = [
    { role: "user" as const, content: "Tampilkan task API Payment Gateway" },
    { role: "assistant" as const, content: "API Payment Gateway ditemukan status IN_PROGRESS." },
  ];
  const ctxWithHistory: AiExecutionContext = {
    ...defaultContext,
    conversationHistory: convHistory,
  };
  const recentEntities = extractRecentEntitiesFromHistory(convHistory, defaultContext);
  assert(
    recentEntities.tasks?.includes("tsk_cafe_2") === true,
    "CONVERSATION: Scans recent conversation history and tracks referenced task ID"
  );

  // Test 2.2: Follow-up command "ubah deadline jadi besok" uses recent task
  const plan2_2 = parseHeuristicIntent("ubah deadline jadi besok", {
    ...defaultContext,
    recentEntities: { tasks: ["tsk_cafe_2"] },
  });
  assert(
    plan2_2.actions.length === 1 &&
    plan2_2.actions[0].type === "UPDATE_TASK" &&
    plan2_2.actions[0].payload.taskId === "tsk_cafe_2" &&
    plan2_2.actions[0].payload.dueDate === "2026-08-31",
    "FOLLOW-UP: 'ubah deadline jadi besok' updates recent conversation task with normalized date"
  );

  // Test 2.3: Follow-up command "selesaikan task ini" uses active task
  const plan2_3 = parseHeuristicIntent("selesaikan task ini", ctxWithTask);
  assert(
    plan2_3.actions.length === 1 &&
    plan2_3.actions[0].type === "UPDATE_TASK" &&
    plan2_3.actions[0].payload.taskId === "tsk_cafe_2" &&
    plan2_3.actions[0].payload.status === "DONE",
    "FOLLOW-UP: 'selesaikan task ini' updates status of current UI task to DONE"
  );

  // Test 2.4: Follow-up command "ubah priority jadi urgent" uses active task
  const plan2_4 = parseHeuristicIntent("ubah priority jadi urgent", ctxWithTask);
  assert(
    plan2_4.actions.length === 1 &&
    plan2_4.actions[0].type === "UPDATE_TASK" &&
    plan2_4.actions[0].payload.taskId === "tsk_cafe_2" &&
    plan2_4.actions[0].payload.priority === "URGENT",
    "FOLLOW-UP: 'ubah priority jadi urgent' updates priority of current UI task"
  );

  // =========================================================================
  // 3. CONTEXT SANITIZATION & STALE CONTEXT INVALIDATION
  // =========================================================================
  console.log("\n--- 3. CONTEXT SANITIZATION & STALE CONTEXT INVALIDATION ---");

  // Test 3.1: Foreign project ID (cross-workspace) is sanitized and invalidated
  const foreignContext: AiExecutionContext = {
    ...defaultContext,
    currentProjectId: "prj_foreign_tenant_999",
  };
  const sanitized3_1 = validateAndSanitizeContext(foreignContext);
  assert(
    sanitized3_1.currentProjectId === undefined &&
    sanitized3_1.currentProjectName === undefined,
    "ISOLATION: Foreign project ID from different workspace is invalidated"
  );

  // Test 3.2: Stale deleted task ID is sanitized
  const staleTaskContext: AiExecutionContext = {
    ...defaultContext,
    currentTaskId: "tsk_deleted_999",
  };
  const sanitized3_2 = validateAndSanitizeContext(staleTaskContext);
  assert(
    sanitized3_2.currentTaskId === undefined &&
    sanitized3_2.currentTaskTitle === undefined,
    "STALE CONTEXT: Non-existent/deleted task ID is safely sanitized"
  );

  // Test 3.3: Stale recent entities are pruned
  const staleRecentContext: AiExecutionContext = {
    ...defaultContext,
    recentEntities: {
      projects: ["prj_cafe_01", "prj_deleted_old"],
      tasks: ["tsk_cafe_1", "tsk_foreign_404"],
    },
  };
  const sanitized3_3 = validateAndSanitizeContext(staleRecentContext);
  assert(
    sanitized3_3.recentEntities?.projects?.length === 1 &&
    sanitized3_3.recentEntities.projects[0] === "prj_cafe_01" &&
    sanitized3_3.recentEntities?.tasks?.length === 1 &&
    sanitized3_3.recentEntities.tasks[0] === "tsk_cafe_1",
    "STALE CONTEXT: Prunes non-existent entity IDs from recentEntities"
  );

  // =========================================================================
  // 4. SMART DEFAULTS FOR TASK CREATION
  // =========================================================================
  console.log("\n--- 4. SMART DEFAULTS FOR TASK CREATION ---");

  // Test 4.1: Task creation inside active project & phase
  const plan4_1 = parseHeuristicIntent("buat task Setup Database Schema", ctxWithPhase);
  assert(
    plan4_1.actions.length === 1 &&
    plan4_1.actions[0].type === "CREATE_TASK" &&
    plan4_1.actions[0].payload.projectId === "prj_cafe_01" &&
    plan4_1.actions[0].payload.phaseId === "phs_cafe_dev" &&
    plan4_1.actions[0].payload.priority === "MEDIUM" &&
    plan4_1.actions[0].payload.status === "TODO",
    "SMART DEFAULTS: Task creation inherits active project & phase with default MEDIUM/TODO"
  );

  // Test 4.2: Task creation without assignee defaults to null (never assigns random member)
  assert(
    plan4_1.actions[0].payload.assigneeId === undefined,
    "SMART DEFAULTS: Task creation without explicit assignee NEVER invents random member"
  );

  // Test 4.3: Task creation with explicit assignment resolves member
  const plan4_3 = parseHeuristicIntent("buat task Wireframe dan assign ke Sarah", ctxWithProj);
  assert(
    plan4_3.actions.length === 1 &&
    plan4_3.actions[0].type === "CREATE_TASK" &&
    plan4_3.actions[0].payload.assigneeId === "usr_sarah" &&
    plan4_3.actions[0].payload.assigneeName === "Sarah Chen",
    "SMART DEFAULTS: Explicit assignee 'Sarah' is resolved accurately alongside smart defaults"
  );

  // Test 4.4: Task creation with explicit project override
  const plan4_4 = parseHeuristicIntent("buat task Banner Promo di project Website Bakery XYZ", ctxWithProj);
  assert(
    plan4_4.actions.length === 1 &&
    plan4_4.actions[0].type === "CREATE_TASK" &&
    plan4_4.actions[0].payload.projectId === "prj_bakery_02",
    "PRECEDENCE: Explicit project in task creation overrides current UI project context"
  );

  // =========================================================================
  // 5. DETERMINISTIC RELATIVE DATE RESOLUTION
  // =========================================================================
  console.log("\n--- 5. DETERMINISTIC RELATIVE DATE RESOLUTION ---");

  // Base date: Sunday, 2026-08-30
  // Test 5.1: 'hari ini' / 'today' -> 2026-08-30
  const d5_1 = resolveNaturalDate("hari ini", BASE_SERVER_TIME);
  assert(d5_1?.isoDate === "2026-08-30", "DATES: 'hari ini' -> 2026-08-30");

  // Test 5.2: 'kemarin' / 'yesterday' -> 2026-08-29
  const d5_2 = resolveNaturalDate("kemarin", BASE_SERVER_TIME);
  assert(d5_2?.isoDate === "2026-08-29", "DATES: 'kemarin' -> 2026-08-29");

  // Test 5.3: 'besok' / 'tomorrow' -> 2026-08-31
  const d5_3 = resolveNaturalDate("besok", BASE_SERVER_TIME);
  assert(d5_3?.isoDate === "2026-08-31", "DATES: 'besok' -> 2026-08-31");

  // Test 5.4: 'lusa' / 'day after tomorrow' -> 2026-09-01
  const d5_4 = resolveNaturalDate("lusa", BASE_SERVER_TIME);
  assert(d5_4?.isoDate === "2026-09-01", "DATES: 'lusa' -> 2026-09-01");

  // Test 5.5: 'minggu ini' / 'this week'
  const d5_5 = resolveNaturalDate("minggu ini", BASE_SERVER_TIME);
  assert(d5_5?.isoDate !== undefined && d5_5.confidence >= 0.9, "DATES: 'minggu ini' resolves deterministically");

  // Test 5.6: 'akhir minggu ini' / 'this weekend'
  const d5_6 = resolveNaturalDate("akhir minggu ini", BASE_SERVER_TIME);
  assert(d5_6?.isoDate !== undefined && d5_6.confidence >= 0.9, "DATES: 'akhir minggu ini' resolves deterministically");

  // Test 5.7: 'minggu depan' / 'next week' -> 2026-09-06
  const d5_7 = resolveNaturalDate("minggu depan", BASE_SERVER_TIME);
  assert(d5_7?.isoDate === "2026-09-06", "DATES: 'minggu depan' -> 2026-09-06");

  // Test 5.8: 'bulan depan' / 'next month' -> 2026-09-30
  const d5_8 = resolveNaturalDate("bulan depan", BASE_SERVER_TIME);
  assert(d5_8?.isoDate === "2026-09-30", "DATES: 'bulan depan' -> 2026-09-30");

  // Test 5.9: '12 September' -> 2026-09-12
  const d5_9 = resolveNaturalDate("12 September", BASE_SERVER_TIME);
  assert(d5_9?.isoDate === "2026-09-12", "DATES: '12 September' -> 2026-09-12");

  // =========================================================================
  // 6. AMBIGUITY & CLARIFICATION SAFEGUARDS
  // =========================================================================
  console.log("\n--- 6. AMBIGUITY & CLARIFICATION SAFEGUARDS ---");

  // Test 6.1: Duplicate task title 'Design Homepage' across projects without project context
  const res6_1 = resolveContextualTask("Design Homepage", defaultContext); // No currentProjectId
  assert(
    res6_1.isAmbiguous === true &&
    res6_1.confidence === "AMBIGUOUS" &&
    res6_1.candidates.length >= 2,
    "AMBIGUITY: Duplicate task title across projects triggers AMBIGUOUS clarification"
  );

  // Test 6.2: Duplicate task title 'Design Homepage' WITH active project context resolves uniquely
  const res6_2 = resolveContextualTask("Design Homepage", ctxWithProj); // Active Cafe project
  assert(
    res6_2.isAmbiguous === false &&
    res6_2.entity?.id === "tsk_cafe_1",
    "AMBIGUITY RESOLUTION: UI project context disambiguates duplicate task titles cleanly"
  );

  // Test 6.3: Ambiguous member name 'Andi' triggers clarification
  const res6_3 = resolveContextualMember("Andi", defaultContext);
  assert(
    res6_3.isAmbiguous === true &&
    res6_3.candidates.includes("Andi Saputra") &&
    res6_3.candidates.includes("Andi Pratama"),
    "AMBIGUITY: Multiple matching members triggers clarification listing all candidates"
  );

  // =========================================================================
  // 7. CONTEXT-AWARE READ & BATCH OPERATIONS
  // =========================================================================
  console.log("\n--- 7. CONTEXT-AWARE READ & BATCH OPERATIONS ---");

  // Test 7.1: 'tampilkan task yang belum selesai' inside Cafe project scopes to Cafe project
  const plan7_1 = parseHeuristicIntent("tampilkan task yang belum selesai", ctxWithProj);
  assert(
    plan7_1.actions.length === 0 &&
    plan7_1.assistantMessage.includes("Website Cafe ABC") &&
    plan7_1.assistantMessage.includes("API Payment Gateway"),
    "READ: 'tampilkan task yang belum selesai' scopes to active project and shows scope header"
  );

  // Test 7.2: Scoped batch update in current project
  const plan7_2 = parseHeuristicIntent("ubah semua task backend jadi high priority", ctxWithProj);
  assert(
    plan7_2.actions.length === 1 &&
    plan7_2.actions[0].payload.projectId === "prj_cafe_01" &&
    plan7_2.actions[0].payload.priority === "HIGH",
    "BATCH: Batch priority update scopes cleanly to active project context"
  );

  // =========================================================================
  // 8. SECURITY, RBAC & DESTRUCTIVE OPERATION GUARDS
  // =========================================================================
  console.log("\n--- 8. SECURITY, RBAC & DESTRUCTIVE OPERATION GUARDS ---");

  // Test 8.1: Context CANNOT bypass RBAC (VIEWER cannot execute update plan)
  const viewerContext: AiExecutionContext = {
    ...ctxWithProj,
    userRole: Role.VIEWER,
  };
  const val8_1 = validateAiPlan(plan2_2, viewerContext);
  assert(
    val8_1.isValid === false &&
    val8_1.validatedPlan.status === "FORBIDDEN",
    "SECURITY: VIEWER role cannot execute update plan despite active UI context"
  );

  // Test 8.2: Destructive action (DELETE_TASK) CANNOT silently delete from context alone
  const plan8_2 = parseHeuristicIntent("hapus task Design Homepage", ctxWithProj);
  assert(
    plan8_2.isDestructive === true &&
    plan8_2.requiresConfirmation === true &&
    plan8_2.status === "NEEDS_CONFIRMATION",
    "SAFETY: Task deletion strictly requires explicit confirmation and isDestructive flag"
  );

  // Test 8.3: Context from Workspace A cannot access Workspace B task
  const res8_3 = resolveContextualTask("tsk_foreign_task", defaultContext);
  assert(
    res8_3.confidence === "MISSING" &&
    res8_3.entity === undefined,
    "ISOLATION: Foreign workspace task ID is completely rejected"
  );

  // =========================================================================
  // 9. SLASH COMMAND + CONTEXT INTEGRATION
  // =========================================================================
  console.log("\n--- 9. SLASH COMMAND + CONTEXT INTEGRATION ---");

  // Test 9.1: /create task in active project context
  const plan9_1 = parseHeuristicIntent("buat task Checkout Flow", ctxWithProj);
  assert(
    plan9_1.actions.length === 1 &&
    plan9_1.actions[0].payload.projectId === "prj_cafe_01",
    "SLASH INTEGRATION: /create task maps to CREATE_TASK bound to active project context"
  );

  // Test 9.2: /status task in active project context
  const plan9_2 = parseHeuristicIntent("selesaikan task API Payment Gateway", ctxWithProj);
  assert(
    plan9_2.actions.length === 1 &&
    plan9_2.actions[0].payload.taskId === "tsk_cafe_2" &&
    plan9_2.actions[0].payload.status === "DONE",
    "SLASH INTEGRATION: /status task maps to UPDATE_TASK resolving active project task"
  );

  // =========================================================================
  // 10. ADVANCED FOLLOW-UPS & EDGE CASES
  // =========================================================================
  console.log("\n--- 10. ADVANCED FOLLOW-UPS & EDGE CASES ---");

  // Test 10.1: Follow-up rename "rename task ini jadi Landing Page V2"
  const plan10_1 = parseHeuristicIntent("rename task ini jadi Landing Page V2", ctxWithTask);
  assert(
    plan10_1.actions.length === 1 &&
    plan10_1.actions[0].type === "UPDATE_TASK" &&
    plan10_1.actions[0].payload.taskId === "tsk_cafe_2" &&
    plan10_1.actions[0].payload.title === "Landing Page V2",
    "ADVANCED: 'rename task ini jadi ...' renames currently active UI task"
  );

  // Test 10.2: Follow-up move "pindahkan task ini ke phase Testing & QA"
  const plan10_2 = parseHeuristicIntent("pindahkan task ini ke phase Testing & QA", ctxWithTask);
  assert(
    plan10_2.actions.length === 1 &&
    plan10_2.actions[0].type === "UPDATE_TASK" &&
    plan10_2.actions[0].payload.taskId === "tsk_cafe_2" &&
    plan10_2.actions[0].payload.phaseId === "phs_cafe_qa",
    "ADVANCED: 'pindahkan task ini ke phase ...' moves active task to target phase"
  );

  // Test 10.3: Follow-up unassign "unassign task ini"
  const plan10_3 = parseHeuristicIntent("unassign task ini", ctxWithTask);
  assert(
    plan10_3.actions.length === 1 &&
    plan10_3.actions[0].type === "UPDATE_TASK" &&
    plan10_3.actions[0].payload.taskId === "tsk_cafe_2" &&
    plan10_3.actions[0].payload.unassign === true,
    "ADVANCED: 'unassign task ini' unassigns member from active task"
  );

  // Test 10.4: Follow-up assign "assign task ini ke Bob"
  const plan10_4 = parseHeuristicIntent("assign task ini ke Bob", ctxWithTask);
  assert(
    plan10_4.actions.length === 1 &&
    plan10_4.actions[0].type === "ASSIGN_TASK" &&
    plan10_4.actions[0].payload.taskId === "tsk_cafe_2" &&
    plan10_4.actions[0].payload.assigneeId === "usr_bob",
    "ADVANCED: 'assign task ini ke Bob' assigns active task to Bob"
  );

  // Test 10.5: Stale member ID invalidation
  const staleMemberCtx: AiExecutionContext = {
    ...defaultContext,
    currentMemberId: "usr_nonexistent_999",
  };
  const sanitized10_5 = validateAndSanitizeContext(staleMemberCtx);
  assert(
    sanitized10_5.currentMemberId === undefined &&
    sanitized10_5.currentMemberName === undefined,
    "ADVANCED: Stale/non-existent member ID is safely sanitized"
  );

  // Test 10.6: Stale phase ID invalidation
  const stalePhaseCtx: AiExecutionContext = {
    ...defaultContext,
    currentPhaseId: "phs_nonexistent_999",
  };
  const sanitized10_6 = validateAndSanitizeContext(stalePhaseCtx);
  assert(
    sanitized10_6.currentPhaseId === undefined &&
    sanitized10_6.currentPhaseName === undefined,
    "ADVANCED: Stale/non-existent phase ID is safely sanitized"
  );

  // Test 10.7: Single-project workspace safe default resolution
  const singleProjContext: AiExecutionContext = {
    ...defaultContext,
    currentProjectId: undefined,
    projects: [mockProjects[0]],
  };
  const res10_7 = resolveContextualProject(undefined, singleProjContext);
  assert(
    res10_7.confidence === "DEFAULT" &&
    res10_7.entity?.id === "prj_cafe_01",
    "ADVANCED: Single-project workspace safely defaults to sole project"
  );

  // Test 10.8: Multi-project workspace with no context returns MISSING with list
  const multiProjContext: AiExecutionContext = {
    ...defaultContext,
    currentProjectId: undefined,
  };
  const res10_8 = resolveContextualProject(undefined, multiProjContext);
  assert(
    res10_8.confidence === "MISSING" &&
    res10_8.candidates.length === 3 &&
    res10_8.clarificationPrompt?.includes("Project mana yang dimaksud?") === true,
    "ADVANCED: Multi-project workspace with zero context asks for clarification without guessing"
  );

  // Test 10.9: Phase default: First phase of project selected when phase is omitted
  const res10_9 = resolveContextualPhase(undefined, defaultContext, "prj_cafe_01");
  assert(
    res10_9.confidence === "DEFAULT" &&
    res10_9.entity?.id === "phs_cafe_design" &&
    res10_9.entity?.order === 1,
    "ADVANCED: Phase resolution defaults safely to project's first phase"
  );

  // Test 10.10: Relative date "next friday"
  const d10_10 = resolveNaturalDate("next friday", BASE_SERVER_TIME);
  assert(
    d10_10?.isoDate !== undefined &&
    d10_10.confidence >= 0.9,
    "ADVANCED: 'next friday' resolves deterministically"
  );

  // Test 10.11: Scoped batch delete in current project requires confirmation
  const plan10_11 = parseHeuristicIntent("hapus semua task yang belum selesai", ctxWithProj);
  assert(
    plan10_11.isDestructive === true &&
    plan10_11.requiresConfirmation === true &&
    plan10_11.actions.length === 3 &&
    plan10_11.actions.every((a) => a.payload.projectId === "prj_cafe_01"),
    "ADVANCED: Scoped batch delete in current project strictly requires confirmation"
  );

  // Test 10.12: UI View mode context preservation (e.g. currentView: "kanban")
  const ctxWithView: AiExecutionContext = {
    ...ctxWithProj,
    currentView: "kanban",
  };
  const sanitized10_12 = validateAndSanitizeContext(ctxWithView);
  assert(
    sanitized10_12.currentView === "kanban",
    "ADVANCED: Active UI view mode ('kanban') is preserved in execution context"
  );

  // Test 10.13: Explicit phase override in task creation
  const plan10_13 = parseHeuristicIntent("buat task API Auth di phase Testing & QA", ctxWithProj);
  assert(
    plan10_13.actions.length === 1 &&
    plan10_13.actions[0].payload.phaseId === "phs_cafe_qa",
    "ADVANCED: Explicit phase in task creation overrides UI default phase"
  );

  // Test 10.14: Strict Mode project creation invariant preservation
  const plan10_14 = parseHeuristicIntent("buat project Website Cafe Baru dengan 2 phase: Konsep dan Launching", ctxWithProj);
  assert(
    plan10_14.actions.length === 1 &&
    plan10_14.actions[0].type === "CREATE_PROJECT" &&
    plan10_14.actions[0].payload.phases?.length === 2 &&
    plan10_14.actions[0].payload.phases[0].name === "Konsep" &&
    plan10_14.actions[0].payload.phases[1].name === "Launching",
    "ADVANCED: Strict Mode explicit project phases are strictly preserved over context"
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

runContextTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
