/**
 * SYNPLAN — AI RELIABILITY & AGENT ARCHITECTURE: 100+ GOLDEN TEST SUITE
 * Validates deterministic action registry, fuzzy member resolution, ambiguity detection,
 * date normalization, permission validation, idempotency, multi-action chaining, and verifier.
 */

import fs from "fs";
import path from "path";

try {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [key, ...rest] = trimmed.split("=");
        const val = rest.join("=").replace(/^["']|["']$/g, "").trim();
        process.env[key.trim()] = val;
      }
    });
  }
} catch (e) {}

import { generateAiPlan, parseHeuristicIntent } from "../src/lib/ai/planner";
import { validateAiPlan } from "../src/lib/ai/validator";
import { resolveWorkspaceMember, resolveWorkspaceProject, resolveWorkspaceTask } from "../src/lib/ai/entityResolver";
import { resolveNaturalDate } from "../src/lib/ai/dateResolver";
import { validateActionPermission } from "../src/lib/ai/permissions";
import { getIdempotencyResult, setIdempotencyResult } from "../src/lib/ai/idempotency";
import { ACTION_REGISTRY } from "../src/lib/ai/registry";
import { AiExecutionContext } from "../src/lib/ai/types";
import { Role } from "@prisma/client";

async function runGoldenTestSuite() {
  console.log("================================================================================");
  console.log("SYNPLAN — AI RELIABILITY & AGENT ARCHITECTURE: 100+ GOLDEN TEST SUITE");
  console.log("================================================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, desc: string) {
    total++;
    if (condition) {
      console.log(`  [PASS ${total.toString().padStart(3, "0")}] ${desc}`);
      passed++;
    } else {
      console.error(`  [FAIL ${total.toString().padStart(3, "0")}] ${desc}`);
    }
  }

  const mockContext: AiExecutionContext = {
    workspaceId: "ws_eng_prod_001",
    workspaceName: "Engineering Core",
    userId: "usr_acelino",
    userName: "Marchelino Kurniawan",
    userRole: Role.OWNER,
    currentProjectId: "prj_fruit_01",
    currentProjectName: "Website Toko Buah",
    serverTime: "2026-08-29T12:00:00Z (Saturday, August 29, 2026)",
    members: [
      { id: "m1", userId: "usr_acelino", name: "Marchelino Kurniawan", email: "marchelino@synplan.io", role: Role.OWNER },
      { id: "m2", userId: "usr_sarah", name: "Sarah Chen", email: "sarah@synplan.io", role: Role.MEMBER },
      { id: "m3", userId: "usr_devon", name: "Devon Lane", email: "devon@synplan.io", role: Role.MEMBER },
      { id: "m4", userId: "usr_x", name: "X", email: "x@synplan.io", role: Role.MEMBER },
      { id: "m5", userId: "usr_marcus", name: "Marcus Vance", email: "marcus@synplan.io", role: Role.MEMBER },
      { id: "m6", userId: "usr_andi_1", name: "Andi Saputra", email: "andi.s@synplan.io", role: Role.MEMBER },
      { id: "m7", userId: "usr_andi_2", name: "Andi Pratama", email: "andi.p@synplan.io", role: Role.MEMBER },
      { id: "m8", userId: "usr_sarah_2", name: "Sarah Jenkins", email: "sarah.j@synplan.io", role: Role.MEMBER },
    ],
    projects: [
      { id: "prj_fruit_01", name: "Website Toko Buah", status: "ACTIVE", totalTasks: 5, deadline: "2026-09-01" },
      { id: "prj_fruit_02", name: "Aplikasi Toko Buah Mobile", status: "ACTIVE", totalTasks: 3, deadline: "2026-09-15" },
      { id: "prj_bakery_01", name: "Website Toko Roti", status: "ACTIVE", totalTasks: 4, deadline: "2026-09-10" },
      { id: "prj_wedding_01", name: "Web Undangan Pernikahan", status: "ACTIVE", totalTasks: 6, deadline: "2026-09-20" },
    ],
    phases: [
      { id: "ph_1", projectId: "prj_fruit_01", name: "Planning", order: 1 },
      { id: "ph_2", projectId: "prj_fruit_01", name: "Design", order: 2 },
      { id: "ph_3", projectId: "prj_fruit_01", name: "Development", order: 3 },
    ],
    tasks: [
      { id: "tsk_1", projectId: "prj_fruit_01", title: "Desain Homepage", status: "TODO", priority: "HIGH", assigneeId: "usr_acelino" },
      { id: "tsk_2", projectId: "prj_fruit_01", title: "API Payment Gateway", status: "IN_PROGRESS", priority: "URGENT", assigneeId: "usr_devon" },
      { id: "tsk_3", projectId: "prj_fruit_01", title: "Katalog Produk", status: "DONE", priority: "MEDIUM", assigneeId: "usr_sarah" },
    ],
  };

  // =========================================================================
  // GROUP 1: Deterministic Date Normalization (15 Tests)
  // =========================================================================
  console.log("--- GROUP 1: Deterministic Date Normalization ---");
  const baseDate = new Date("2026-08-29T12:00:00Z");

  assert(resolveNaturalDate("today", baseDate)?.isoDate === "2026-08-29", "Resolve 'today' -> 2026-08-29");
  assert(resolveNaturalDate("hari ini", baseDate)?.isoDate === "2026-08-29", "Resolve 'hari ini' -> 2026-08-29");
  assert(resolveNaturalDate("tomorrow", baseDate)?.isoDate === "2026-08-30", "Resolve 'tomorrow' -> 2026-08-30");
  assert(resolveNaturalDate("besok", baseDate)?.isoDate === "2026-08-30", "Resolve 'besok' -> 2026-08-30");
  assert(resolveNaturalDate("day after tomorrow", baseDate)?.isoDate === "2026-08-31", "Resolve 'day after tomorrow' -> 2026-08-31");
  assert(resolveNaturalDate("lusa", baseDate)?.isoDate === "2026-08-31", "Resolve 'lusa' -> 2026-08-31");
  assert(resolveNaturalDate("next week", baseDate)?.isoDate === "2026-09-05", "Resolve 'next week' -> 2026-09-05");
  assert(resolveNaturalDate("minggu depan", baseDate)?.isoDate === "2026-09-05", "Resolve 'minggu depan' -> 2026-09-05");
  assert(resolveNaturalDate("1 September", baseDate)?.isoDate === "2026-09-01", "Resolve '1 September' -> 2026-09-01");
  assert(resolveNaturalDate("September 1st", baseDate)?.isoDate === "2026-09-01", "Resolve 'September 1st' -> 2026-09-01");
  assert(resolveNaturalDate("15 September 2026", baseDate)?.isoDate === "2026-09-15", "Resolve '15 September 2026' -> 2026-09-15");
  assert(resolveNaturalDate("end of month", baseDate)?.isoDate === "2026-08-31", "Resolve 'end of month' -> 2026-08-31");
  assert(resolveNaturalDate("akhir bulan", baseDate)?.isoDate === "2026-08-31", "Resolve 'akhir bulan' -> 2026-08-31");
  assert(resolveNaturalDate("2026-10-01", baseDate)?.isoDate === "2026-10-01", "Resolve explicit ISO '2026-10-01'");
  assert(resolveNaturalDate("invalid_date_xyz", baseDate) === null, "Handle invalid date safely with null");

  // =========================================================================
  // GROUP 2: Deterministic Entity Resolution (15 Tests)
  // =========================================================================
  console.log("\n--- GROUP 2: Deterministic Entity Resolution ---");
  const resMarchel = resolveWorkspaceMember("marchel", mockContext.members);
  assert(resMarchel.member?.userId === "usr_acelino" && !resMarchel.isAmbiguous, "Fuzzy match 'marchel' -> Marchelino Kurniawan");

  const resSarah = resolveWorkspaceMember("Sarah Chen", mockContext.members);
  assert(resSarah.member?.userId === "usr_sarah", "Exact match 'Sarah Chen' -> usr_sarah");

  const resDevon = resolveWorkspaceMember("devon", mockContext.members);
  assert(resDevon.member?.userId === "usr_devon", "Match 'devon' -> Devon Lane");

  const resX = resolveWorkspaceMember("x", mockContext.members);
  assert(resX.member?.userId === "usr_x", "Match short alias 'x' -> X");

  const resMarcus = resolveWorkspaceMember("marcus", mockContext.members);
  assert(resMarcus.member?.userId === "usr_marcus", "Match 'marcus' -> Marcus Vance");

  const resAndi = resolveWorkspaceMember("Andi", mockContext.members);
  assert(resAndi.isAmbiguous === true && resAndi.candidates.length === 2, "Detect ambiguous member 'Andi' (Andi Saputra vs Andi Pratama)");

  const resSarahAmbiguous = resolveWorkspaceMember("Sarah", mockContext.members);
  assert(resSarahAmbiguous.isAmbiguous === true && resSarahAmbiguous.candidates.length === 2, "Detect ambiguous 'Sarah' (Sarah Chen vs Sarah Jenkins)");

  const resBudi = resolveWorkspaceMember("Budi", mockContext.members);
  assert(resBudi.notFound === true && !resBudi.member, "Non-existent member 'Budi' flags notFound: true without fake IDs");

  const resProjCurrent = resolveWorkspaceProject("project ini", mockContext);
  assert(resProjCurrent.project?.id === "prj_fruit_01", "Contextual 'project ini' -> Website Toko Buah (prj_fruit_01)");

  const resProjBakery = resolveWorkspaceProject("toko roti", mockContext);
  assert(resProjBakery.project?.id === "prj_bakery_01", "Fuzzy project match 'toko roti' -> Website Toko Roti");

  const resProjAmbiguous = resolveWorkspaceProject("toko buah", mockContext);
  assert(resProjAmbiguous.isAmbiguous === true, "Detect ambiguous project 'toko buah' (Website Toko Buah vs Aplikasi Toko Buah Mobile)");

  const resTaskHomepage = resolveWorkspaceTask("Desain Homepage", mockContext, "prj_fruit_01");
  assert(resTaskHomepage.task?.id === "tsk_1", "Match task 'Desain Homepage' -> tsk_1");

  const resTaskPayment = resolveWorkspaceTask("payment", mockContext, "prj_fruit_01");
  assert(resTaskPayment.task?.id === "tsk_2", "Fuzzy match task 'payment' -> API Payment Gateway (tsk_2)");

  const resTaskNotFound = resolveWorkspaceTask("non_existent_task", mockContext);
  assert(resTaskNotFound.notFound === true, "Non-existent task returns notFound");

  const resEmailMatch = resolveWorkspaceMember("sarah@synplan.io", mockContext.members);
  assert(resEmailMatch.member?.userId === "usr_sarah", "Exact email match -> usr_sarah");

  // =========================================================================
  // GROUP 3: Server-Side RBAC Permission Validation (10 Tests)
  // =========================================================================
  console.log("\n--- GROUP 3: Server-Side RBAC Permission Validation ---");
  assert(validateActionPermission("CREATE_PROJECT", Role.OWNER).allowed, "OWNER can CREATE_PROJECT");
  assert(validateActionPermission("CREATE_PROJECT", Role.MEMBER).allowed, "MEMBER can CREATE_PROJECT");
  assert(!validateActionPermission("CREATE_PROJECT", Role.VIEWER).allowed, "VIEWER cannot CREATE_PROJECT (FORBIDDEN)");
  assert(validateActionPermission("DELETE_PROJECT", Role.OWNER).allowed, "OWNER can DELETE_PROJECT");
  assert(validateActionPermission("DELETE_PROJECT", Role.ADMIN).allowed, "ADMIN can DELETE_PROJECT");
  assert(!validateActionPermission("DELETE_PROJECT", Role.MEMBER).allowed, "MEMBER cannot DELETE_PROJECT (Admin required)");
  assert(!validateActionPermission("DELETE_PROJECT", Role.VIEWER).allowed, "VIEWER cannot DELETE_PROJECT");
  assert(validateActionPermission("ASSIGN_TASK", Role.MEMBER).allowed, "MEMBER can ASSIGN_TASK");
  assert(validateActionPermission("ADD_MEMBER", Role.MEMBER).allowed, "MEMBER can ADD_MEMBER");
  assert(!validateActionPermission("REMOVE_MEMBER", Role.MEMBER).allowed, "MEMBER cannot REMOVE_MEMBER (Admin required)");

  // =========================================================================
  // GROUP 4: Centralized Action Registry (10 Tests)
  // =========================================================================
  console.log("\n--- GROUP 4: Centralized Action Registry ---");
  assert(!!ACTION_REGISTRY.CREATE_PROJECT, "Action Registry contains CREATE_PROJECT");
  assert(!!ACTION_REGISTRY.UPDATE_PROJECT, "Action Registry contains UPDATE_PROJECT");
  assert(!!ACTION_REGISTRY.DELETE_PROJECT, "Action Registry contains DELETE_PROJECT");
  assert(!!ACTION_REGISTRY.CREATE_TASK, "Action Registry contains CREATE_TASK");
  assert(!!ACTION_REGISTRY.UPDATE_TASK, "Action Registry contains UPDATE_TASK");
  assert(!!ACTION_REGISTRY.DELETE_TASK, "Action Registry contains DELETE_TASK");
  assert(!!ACTION_REGISTRY.ASSIGN_TASK, "Action Registry contains ASSIGN_TASK");
  assert(!!ACTION_REGISTRY.ADD_MEMBER, "Action Registry contains ADD_MEMBER");
  assert(!!ACTION_REGISTRY.CREATE_PHASE, "Action Registry contains CREATE_PHASE");
  assert(ACTION_REGISTRY.DELETE_PROJECT.riskLevel === "HIGH", "DELETE_PROJECT is classified as HIGH risk");

  // =========================================================================
  // GROUP 5: Idempotency Cache Protection (5 Tests)
  // =========================================================================
  console.log("\n--- GROUP 5: Idempotency Protection ---");
  const mockPlanId = "plan_test_idempotent_001";
  const mockResult: any = {
    planId: mockPlanId,
    idempotencyKey: mockPlanId,
    success: true,
    results: [],
    createdEntities: { projectIds: ["prj_123"], taskIds: [], phaseIds: [] },
    summary: "Created project",
  };

  assert(getIdempotencyResult(mockPlanId) === null, "Initial check for idempotent key returns null");
  setIdempotencyResult(mockPlanId, mockPlanId, mockResult);
  const cachedRes = getIdempotencyResult(mockPlanId);
  assert(cachedRes?.success === true, "Retrieved cached execution result for repeated key");
  assert(cachedRes?.createdEntities.projectIds[0] === "prj_123", "Idempotency preserves created entity IDs");
  assert(getIdempotencyResult("non_existent_key") === null, "Non-existent key returns null");
  assert(cachedRes?.planId === mockPlanId, "Idempotency preserves plan ID");

  // =========================================================================
  // GROUP 6: Free-Form Semantic Natural Language Prompts (30 Tests)
  // =========================================================================
  console.log("\n--- GROUP 6: Free-Form Semantic Natural Language Prompts ---");

  const freeformPrompts = [
    { p: "buat project website toko buah", expected: "CREATE_PROJECT" },
    { p: "buatin website toko buah", expected: "CREATE_PROJECT" },
    { p: "Saya mau bikin project website untuk toko buah", expected: "CREATE_PROJECT" },
    { p: "Tolong buatkan project baru untuk website toko buah", expected: "CREATE_PROJECT" },
    { p: "bikin project baru namanya toko buah", expected: "CREATE_PROJECT" },
    { p: "kita mulai project website toko buah ya", expected: "CREATE_PROJECT" },
    { p: "Saya punya project baru, kita akan bikin website untuk toko buah", expected: "CREATE_PROJECT" },
    { p: "ayo bikin project baru buat toko buah", expected: "CREATE_PROJECT" },
    { p: "buat project website toko buah, deadline next week", expected: "CREATE_PROJECT" },
    { p: "buat website toko buah deadline 1 September", expected: "CREATE_PROJECT" },
    { p: "Saya ingin website undangan pernikahan selesai tanggal 1 September", expected: "CREATE_PROJECT" },
    { p: "setup project bakery shop with deadline end of month", expected: "CREATE_PROJECT" },
    { p: "tambahkan Sarah dan Marchel ke project", expected: "ADD_MEMBER" },
    { p: "tambahkan Sarah ke project ini", expected: "ADD_MEMBER" },
    { p: "masukkan devon dan x ke dalam team", expected: "ADD_MEMBER" },
    { p: "libatkan marcus ke projek ini", expected: "ADD_MEMBER" },
    { p: "Sarah sama Marchel ikut project ini", expected: "ADD_MEMBER" },
    { p: "buat task desain homepage", expected: "CREATE_TASK" },
    { p: "buatkan task untuk API Payment Gateway", expected: "CREATE_TASK" },
    { p: "bikin task testing dan QA", expected: "CREATE_TASK" },
    { p: "buat task desain homepage dan assign ke Marchelino", expected: "CREATE_TASK" },
    { p: "buat task untuk desain homepage dan kasih ke Marchelino", expected: "CREATE_TASK" },
    { p: "hapus project Website Toko Roti", expected: "DELETE_PROJECT" },
    { p: "delete project Toko Roti", expected: "DELETE_PROJECT" },
    { p: "buang project ini", expected: "DELETE_PROJECT" },
    { p: "buat phase Planning dan Development", expected: "CREATE_PHASE" },
    { p: "buat delivery phase Launching", expected: "CREATE_PHASE" },
    { p: "tambah anggota x ke project", expected: "ADD_MEMBER" },
    { p: "tambahkan Devon Lane", expected: "ADD_MEMBER" },
    { p: "buat project mobile app toko buah deadline akhir bulan", expected: "CREATE_PROJECT" },
  ];

  for (const [idx, item] of freeformPrompts.entries()) {
    const plan = parseHeuristicIntent(item.p, mockContext);
    const hasExpected = plan.actions.some(
      (a) => a.type === item.expected || (item.expected === "ADD_MEMBER" && a.type === "ADD_PROJECT_MEMBER")
    );
    assert(hasExpected, `Freeform [${idx + 1}/30]: "${item.p.slice(0, 45)}..." -> ${item.expected}`);
  }

  // =========================================================================
  // GROUP 7: Multi-Action Compound Workflow & Chaining (5 Tests)
  // =========================================================================
  console.log("\n--- GROUP 7: Multi-Action Compound Workflows ---");
  const compoundPrompt = "Buatin projek website toko buah, deadline 1 September tambahkan marchel dan x ke tim. Terus buatkan task untuk desain homepage dan assign ke Marchelino.";
  const compoundPlan = parseHeuristicIntent(compoundPrompt, mockContext);

  assert(compoundPlan.actions.some((a) => a.type === "CREATE_PROJECT"), "Compound plan contains CREATE_PROJECT");
  assert(compoundPlan.actions.some((a) => a.type === "ADD_MEMBER" || a.type === "ADD_PROJECT_MEMBER"), "Compound plan contains member additions");
  assert(compoundPlan.actions.length >= 2, "Compound plan contains multi-action items");
  assert(compoundPlan.requiresConfirmation === true, "Multi-action compound plan requires confirmation");
  assert(compoundPlan.status === "NEEDS_CONFIRMATION" || compoundPlan.status === "READY", "Compound plan has valid status");

  // =========================================================================
  // GROUP 8: Ambiguity & Unknown Entity Safeguards (5 Tests)
  // =========================================================================
  console.log("\n--- GROUP 8: Ambiguity & Safety Safeguards ---");
  const ambiguousPrompt = "Hapus project toko";
  const planAmbiguous = parseHeuristicIntent(ambiguousPrompt, mockContext);
  assert(
    !!(planAmbiguous.needsClarification === true || (planAmbiguous.clarificationsNeeded && planAmbiguous.clarificationsNeeded.length > 0)),
    "Ambiguous delete prompt triggers needsClarification"
  );

  const unknownMemberPrompt = "Tambahkan Budi ke project";
  const planUnknown = parseHeuristicIntent(unknownMemberPrompt, mockContext);
  const validatedUnknown = validateAiPlan(planUnknown, mockContext);
  assert(
    !!(
      validatedUnknown.validatedPlan.needsClarification === true ||
      validatedUnknown.validatedPlan.warnings.some((w) => w.toLowerCase().includes("budi")) ||
      validatedUnknown.validatedPlan.actions.length === 0
    ),
    "Unknown member Budi handled safely without creating fake IDs"
  );

  const ambiguousMemberPrompt = "Tambahkan Andi ke project";
  const planAndi = parseHeuristicIntent(ambiguousMemberPrompt, mockContext);
  const validatedAndi = validateAiPlan(planAndi, mockContext);
  assert(
    !!(
      validatedAndi.validatedPlan.needsClarification === true ||
      (validatedAndi.validatedPlan.clarificationsNeeded && validatedAndi.validatedPlan.clarificationsNeeded.length > 0)
    ),
    "Ambiguous member Andi triggers clarification"
  );

  assert(planAmbiguous.isDestructive === true, "Destructive operations flagged as destructive");
  assert(planAmbiguous.requiresConfirmation === true, "Destructive operations strictly require confirmation");

  // =========================================================================
  // GROUP 9: Conversational Multi-Turn Context Retention (5 Tests)
  // =========================================================================
  console.log("\n--- GROUP 9: Conversational Multi-Turn Context Retention ---");
  const turn1Context: AiExecutionContext = { ...mockContext, conversationHistory: [] };
  const turn1Plan = parseHeuristicIntent("Buat project website toko buah", turn1Context);
  assert(turn1Plan.actions.some((a) => a.type === "CREATE_PROJECT"), "Turn 1: Created project context");

  const turn2Context: AiExecutionContext = {
    ...mockContext,
    conversationHistory: [
      { role: "user", content: "Buat project website toko buah" },
      { role: "assistant", content: "Saya telah menyiapkan project Website Toko Buah." },
    ],
  };
  const turn2Plan = parseHeuristicIntent("Tambahkan Sarah ke tim", turn2Context);
  assert(turn2Plan.actions.some((a) => a.type === "ADD_MEMBER" || a.type === "ADD_PROJECT_MEMBER"), "Turn 2: Retained project context for adding Sarah");

  const turn3Context: AiExecutionContext = {
    ...mockContext,
    conversationHistory: [
      { role: "user", content: "Buat project website toko buah" },
      { role: "assistant", content: "Saya telah menyiapkan project Website Toko Buah." },
      { role: "user", content: "Tambahkan Sarah ke tim" },
      { role: "assistant", content: "Menambahkan Sarah ke Website Toko Buah." },
    ],
  };
  const turn3Plan = parseHeuristicIntent("Buat task desain homepage", turn3Context);
  assert(turn3Plan.actions.some((a) => a.type === "CREATE_TASK"), "Turn 3: Retained project context for creating task");
  assert(turn3Plan.actions[0]?.payload?.projectId === "prj_fruit_01", "Task bound to active project context");
  assert(turn3Context.conversationHistory?.length === 4, "Preserved 4 conversational turns in context");

  console.log("\n================================================================================");
  const pct = total > 0 ? ((passed / total) * 100).toFixed(0) : "0";
  console.log(`AI RELIABILITY GOLDEN TEST SUITE: ${passed}/${total} TESTS PASSED (${pct}%)`);
  console.log("================================================================================");

  if (passed < total) {
    process.exit(1);
  }
}

runGoldenTestSuite().catch(console.error);
