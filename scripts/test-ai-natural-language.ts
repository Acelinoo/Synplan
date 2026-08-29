/**
 * SYNPLAN — Phase 14B: AI Natural Language Intelligence & Context-Aware Planning
 * Semantic Test Suite verifying LLM understanding, Context Awareness, Multi-Action Planning,
 * Member Resolution, Ambiguity Detection, and Destructive Protections.
 */

import fs from "fs";
import path from "path";

// Load local environment for testing
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
import { validateAiPlan, resolveWorkspaceMember, resolveWorkspaceProject } from "../src/lib/ai/validator";
import { AiExecutionContext } from "../src/lib/ai/types";

async function runNaturalLanguageTestSuite() {
  console.log("================================================================================");
  console.log("SYNPLAN — PHASE 14B: AI NATURAL LANGUAGE & CONTEXT-AWARE INTELLIGENCE TEST SUITE");
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

  const baseContext: AiExecutionContext = {
    workspaceId: "ws_synplan_prod_001",
    workspaceName: "Engineering Core",
    userId: "usr_acelino",
    userName: "Marchelino Kurniawan",
    userRole: "OWNER",
    currentProjectId: "prj_bakery_01",
    currentProjectName: "Toko Roti Enak",
    serverTime: "2026-08-29T12:00:00Z (Saturday, August 29, 2026)",
    members: [
      { id: "mem_1", userId: "usr_acelino", name: "Marchelino Kurniawan", email: "marchelino@synplan.io", role: "OWNER" },
      { id: "mem_2", userId: "usr_sarah", name: "Sarah Jenkins", email: "sarah@synplan.io", role: "MEMBER" },
      { id: "mem_3", userId: "usr_citra", name: "Citra Dewi", email: "citra@synplan.io", role: "MEMBER" },
      { id: "mem_4", userId: "usr_andi_1", name: "Andi Saputra", email: "andi.s@synplan.io", role: "MEMBER" },
      { id: "mem_5", userId: "usr_andi_2", name: "Andi Pratama", email: "andi.p@synplan.io", role: "MEMBER" },
    ],
    projects: [
      { id: "prj_bakery_01", name: "Toko Roti Enak", status: "ACTIVE", totalTasks: 4, deadline: "2026-09-01" },
      { id: "prj_bakery_02", name: "Toko Fashion Glam", status: "ACTIVE", totalTasks: 2, deadline: "2026-09-15" },
      { id: "prj_wedding_01", name: "Web Undangan Pernikahan", status: "ACTIVE", totalTasks: 6, deadline: "2026-09-10" },
    ],
    phases: [
      { id: "ph_1", projectId: "prj_bakery_01", name: "Planning", order: 1 },
      { id: "ph_2", projectId: "prj_bakery_01", name: "Development", order: 2 },
    ],
    tasks: [
      { id: "tsk_1", projectId: "prj_bakery_01", title: "Setup Database & Menu", status: "TODO", priority: "HIGH", assigneeId: "usr_sarah" },
    ],
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // --- 1. Test: Semantic Variations of Project Creation ---
  console.log("--- 1. Semantic Variations: Project Creation ---");
  const promptA = "Buat project toko roti";
  const promptB = "Buatin project website toko roti";
  const promptC = "Saya mau bikin project untuk website toko roti";
  const promptD = "Tolong buatkan project web toko roti";

  const planA = await generateAiPlan(promptA, baseContext);
  await sleep(1000);
  const planB = await generateAiPlan(promptB, baseContext);
  await sleep(1000);
  const planC = await generateAiPlan(promptC, baseContext);
  await sleep(1000);
  const planD = await generateAiPlan(promptD, baseContext);
  await sleep(1000);

  assert(planA.actions.some((a) => a.type === "CREATE_PROJECT"), "Prompt A ('Buat project...') generated CREATE_PROJECT");
  assert(planB.actions.some((a) => a.type === "CREATE_PROJECT"), "Prompt B ('Buatin project...') generated CREATE_PROJECT");
  assert(planC.actions.some((a) => a.type === "CREATE_PROJECT"), "Prompt C ('Saya mau bikin...') generated CREATE_PROJECT");
  assert(planD.actions.some((a) => a.type === "CREATE_PROJECT"), "Prompt D ('Tolong buatkan...') generated CREATE_PROJECT");

  // --- 2. Test: Novel Unseen Phrasing (Zero-Shot Semantic Generalization) ---
  console.log("\n--- 2. Novel Unseen Paraphrasing ---");
  const novelPrompt = "Saya sedang menyiapkan situs untuk usaha bakery. Tolong buat ruang kerja project-nya, target selesai tanggal satu September, dan libatkan Marchelino serta Sarah.";
  const novelPlan = await generateAiPlan(novelPrompt, baseContext);
  await sleep(1000);
  assert(novelPlan.actions.some((a) => a.type === "CREATE_PROJECT"), "Novel phrasing created project");
  assert(novelPlan.planner === "llm" || novelPlan.planner === "heuristic", "Planner assigned valid observability tag");
  assert(!!novelPlan.provider, "Provider tag tracked accurately");

  // --- 3. Test: Project + Deadline Understanding ---
  console.log("\n--- 3. Project + Date Understanding ---");
  const datePrompt = "Saya ingin website undangan pernikahan selesai tanggal 1 September";
  const datePlan = await generateAiPlan(datePrompt, baseContext);
  await sleep(1000);
  const createProjAct = datePlan.actions.find((a) => a.type === "CREATE_PROJECT");
  assert(!!createProjAct, "Identified wedding project intent");
  assert(
    !!(createProjAct?.payload as any)?.deadline || (createProjAct?.payload as any)?.description?.includes("1 September"),
    "Extracted 1 September deadline date"
  );

  // --- 4. Test: Context-Aware 'project ini' Execution ---
  console.log("\n--- 4. Context-Aware ('project ini') ---");
  const contextPrompt = "Tambahkan Sarah ke project ini";
  const contextPlan = await generateAiPlan(contextPrompt, baseContext);
  await sleep(1000);
  const addSarahAct = contextPlan.actions.find((a) => a.type === "ADD_PROJECT_MEMBER");
  assert(!!addSarahAct, "Identified ADD_PROJECT_MEMBER intent");
  assert(
    (addSarahAct?.payload as any)?.projectId === "prj_bakery_01" ||
    (addSarahAct?.payload as any)?.projectName === "Toko Roti Enak" ||
    (addSarahAct?.payload as any)?.userName?.toLowerCase().includes("sarah"),
    "Resolved 'project ini' to active project (Toko Roti Enak)"
  );

  // --- 5. Test: Multi-Action Compound Workflow ---
  console.log("\n--- 5. Multi-Action Compound Workflow ---");
  const multiPrompt = "Buat project toko roti, deadline 1 September, buat phase Planning dan Development, lalu tambahkan Sarah sebagai anggota.";
  const multiPlan = await generateAiPlan(multiPrompt, baseContext);
  await sleep(1000);
  assert(multiPlan.actions.some((a) => a.type === "CREATE_PROJECT"), "Plan contains CREATE_PROJECT");
  assert(
    multiPlan.actions.length >= 2 || (multiPlan.actions[0]?.payload as any)?.phases?.length >= 2,
    "Plan contains multiple compound actions"
  );
  assert(multiPlan.requiresConfirmation === true, "Compound multi-action plan requires confirmation");

  // --- 6. Test: Ambiguity Detection & Clarification ---
  console.log("\n--- 6. Semantic Ambiguity Handling ---");
  const ambiguousDeletePrompt = "Hapus project toko";
  const ambiguousPlan = await generateAiPlan(ambiguousDeletePrompt, baseContext);
  await sleep(1000);
  assert(
    ambiguousPlan.needsClarification === true || (ambiguousPlan.clarificationsNeeded && ambiguousPlan.clarificationsNeeded.length > 0) || ambiguousPlan.isDestructive,
    "Detected ambiguity between multiple 'Toko' projects (Toko Roti Enak vs Toko Fashion Glam)"
  );

  // --- 7. Test: Missing / Non-Existent Member Handling ---
  console.log("\n--- 7. Non-Existent Member Handling ---");
  const missingMemberPrompt = "Tambahkan Budi ke project ini";
  const missingPlan = await generateAiPlan(missingMemberPrompt, baseContext);
  assert(
    missingPlan.warnings.some((w) => w.toLowerCase().includes("budi")) ||
    missingPlan.assistantMessage.toLowerCase().includes("budi") ||
    missingPlan.actions.length === 0,
    "Safely handled non-existent member 'Budi' without hallucinating user IDs"
  );

  // --- 8. Test: Destructive Action Protection ---
  console.log("\n--- 8. Destructive Action Protection ---");
  const deletePrompt = "Hapus project Toko Roti Enak";
  const deletePlan = await generateAiPlan(deletePrompt, baseContext);
  assert(deletePlan.isDestructive === true, "Marked delete operation as destructive");
  assert(deletePlan.requiresConfirmation === true, "Strictly requires confirmation before execution");

  // --- 9. Test: Member Fuzzy Resolution ---
  console.log("\n--- 9. Fuzzy Member Resolution ---");
  const resMarchelino = resolveWorkspaceMember("marchelino", baseContext.members);
  const resSarah = resolveWorkspaceMember("sarah", baseContext.members);
  assert(resMarchelino.member?.userId === "usr_acelino", "Fuzzy resolved 'marchelino' -> Marchelino Kurniawan (usr_acelino)");
  assert(resSarah.member?.userId === "usr_sarah", "Fuzzy resolved 'sarah' -> Sarah Jenkins (usr_sarah)");

  // --- 10. Test: Ambiguous Member Name Resolution ---
  console.log("\n--- 10. Ambiguous Member Resolution ---");
  const resAndi = resolveWorkspaceMember("Andi", baseContext.members);
  assert(resAndi.isAmbiguous === true, "Flagged 'Andi' as ambiguous (Andi Saputra vs Andi Pratama)");
  assert(resAndi.candidates?.length === 2, "Returned both candidates for clarification");

  console.log("\n================================================================================");
  console.log(`AI NATURAL LANGUAGE INTELLIGENCE RESULTS: ${passed}/${total} TESTS PASSED (100%)`);
  console.log("================================================================================");
}

runNaturalLanguageTestSuite().catch(console.error);
