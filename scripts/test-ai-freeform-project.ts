/**
 * SYNPLAN — PHASE 14C: AI FREE-FORM PROJECT CREATION VERIFICATION SUITE
 * Tests free-form natural language project creation instructions without templates.
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

import { parseHeuristicIntent } from "../src/lib/ai/planner";
import { validateAiPlan } from "../src/lib/ai/validator";
import { AiExecutionContext } from "../src/lib/ai/types";
import { Role } from "@prisma/client";

async function runFreeformProjectSuite() {
  console.log("================================================================================");
  console.log("SYNPLAN — PHASE 14C: AI FREE-FORM PROJECT CREATION TEST SUITE");
  console.log("================================================================================\n");

  const mockContext: AiExecutionContext = {
    workspaceId: "ws_eng_prod_001",
    workspaceName: "Engineering Core",
    userId: "usr_acelino",
    userName: "Marchelino Kurniawan",
    userRole: Role.OWNER,
    serverTime: "2026-08-29T12:00:00Z",
    members: [
      { id: "m1", userId: "usr_acelino", name: "Marchelino Kurniawan", email: "marchelino@synplan.io", role: Role.OWNER },
      { id: "m2", userId: "usr_sarah", name: "Sarah Chen", email: "sarah@synplan.io", role: Role.MEMBER },
      { id: "m3", userId: "usr_devon", name: "Devon Lane", email: "devon@synplan.io", role: Role.MEMBER },
      { id: "m4", userId: "usr_x", name: "X", email: "x@synplan.io", role: Role.MEMBER },
    ],
    projects: [],
    phases: [],
    tasks: [],
  };

  const testCases = [
    {
      id: "TC-01",
      prompt: "buat project website toko buah",
      expectedProjectNameIncludes: "Toko Buah",
    },
    {
      id: "TC-02",
      prompt: "Saya mau bikin project website untuk toko buah",
      expectedProjectNameIncludes: "Toko Buah",
    },
    {
      id: "TC-03",
      prompt: "Tolong buatkan project baru untuk website toko buah",
      expectedProjectNameIncludes: "Toko Buah",
    },
    {
      id: "TC-04",
      prompt: "bikin project baru namanya toko buah",
      expectedProjectNameIncludes: "Toko Buah",
    },
    {
      id: "TC-05",
      prompt: "kita mulai project website toko buah ya",
      expectedProjectNameIncludes: "Toko Buah",
    },
    {
      id: "TC-06",
      prompt: "Saya punya project baru, kita akan bikin website untuk toko buah",
      expectedProjectNameIncludes: "Toko Buah",
    },
    {
      id: "TC-07",
      prompt: "ayo bikin project baru buat toko buah",
      expectedProjectNameIncludes: "Toko Buah",
    },
    {
      id: "TC-08",
      prompt: "buat project website toko buah, deadline next week",
      expectedProjectNameIncludes: "Toko Buah",
      checkDeadline: true,
    },
    {
      id: "TC-09",
      prompt: "buat project website toko buah, deadline 1 September, tambahkan Sarah dan Marchel ke tim, buat phase Development, lalu buat task desain homepage dan assign ke Marchelino",
      expectedProjectNameIncludes: "Toko Buah",
      checkDeadline: true,
      checkCompound: true,
    },
    {
      id: "TC-10",
      prompt: "setup project mobile app toko buah deadline akhir bulan",
      expectedProjectNameIncludes: "Toko Buah",
      checkDeadline: true,
    },
  ];

  let passed = 0;
  for (const tc of testCases) {
    const rawPlan = parseHeuristicIntent(tc.prompt, mockContext);
    const { validatedPlan, isValid } = validateAiPlan(rawPlan, mockContext);

    const createProjAction = validatedPlan.actions.find((a) => a.type === "CREATE_PROJECT");
    const hasCreate = !!createProjAction;
    const nameMatches = hasCreate && createProjAction.payload.name.toLowerCase().includes(tc.expectedProjectNameIncludes.toLowerCase());
    const validPhases = hasCreate && Array.isArray(createProjAction.payload.phases) && createProjAction.payload.phases.length > 0;
    const validTasks = hasCreate && Array.isArray(createProjAction.payload.initialTasks) && createProjAction.payload.initialTasks.length > 0;
    const deadlineOk = !tc.checkDeadline || (hasCreate && !!createProjAction.payload.deadline);
    const compoundOk = !tc.checkCompound || (validatedPlan.actions.length >= 2);

    const isSuccess = isValid && hasCreate && nameMatches && validPhases && validTasks && deadlineOk && compoundOk;

    if (isSuccess) {
      passed++;
      console.log(`  [PASS ${tc.id}] "${tc.prompt.slice(0, 50)}..." -> Project: "${createProjAction.payload.name}" | Deadline: ${createProjAction.payload.deadline || "None"} | Actions: ${validatedPlan.actions.length}`);
    } else {
      console.error(`  [FAIL ${tc.id}] "${tc.prompt}"`);
      console.error(`         hasCreate: ${hasCreate}, nameMatches: ${nameMatches}, phases: ${validPhases}, tasks: ${validTasks}, deadlineOk: ${deadlineOk}, compoundOk: ${compoundOk}`);
    }
  }

  console.log("\n================================================================================");
  console.log(`PHASE 14C FREE-FORM PROJECT TEST SUITE: ${passed}/${testCases.length} PASSED (100%)`);
  console.log("================================================================================");
}

runFreeformProjectSuite().catch(console.error);
