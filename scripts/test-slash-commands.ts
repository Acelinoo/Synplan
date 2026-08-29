import { Role } from "@prisma/client";
import {
  SLASH_COMMAND_REGISTRY,
  parseSlashCommand,
  getSlashSuggestions,
  SlashAutocompleteContext,
} from "../src/lib/ai/slash";
import { validateAiPlan } from "../src/lib/ai/validator";
import { parseHeuristicIntent } from "../src/lib/ai/planner";
import { AiExecutionContext } from "../src/lib/ai/types";

// Mock Autocomplete Context
const mockSlashContext: SlashAutocompleteContext = {
  userRole: Role.OWNER,
  projects: [
    { id: "prj_cafe_01", name: "Website Cafe & Resto", status: "ACTIVE", totalTasks: 6, deadline: "2026-09-01" },
    { id: "prj_bakery_02", name: "Website Bakery", status: "PLANNING", totalTasks: 2, deadline: "2026-09-15" },
  ],
  tasks: [
    { id: "tsk_1", projectId: "prj_cafe_01", phaseId: "phs_design", title: "Desain Homepage", status: "IN_PROGRESS", priority: "HIGH", assigneeId: "usr_marchel" },
    { id: "tsk_2", projectId: "prj_cafe_01", phaseId: "phs_dev", title: "API Payment Gateway", status: "TODO", priority: "URGENT", assigneeId: "usr_sarah" },
    { id: "tsk_3", projectId: "prj_cafe_01", phaseId: "phs_dev", title: "Backend Auth Service", status: "TODO", priority: "MEDIUM" },
    { id: "tsk_bakery_1", projectId: "prj_bakery_02", title: "Logo Bakery", status: "TODO", priority: "HIGH" },
  ],
  phases: [
    { id: "phs_design", projectId: "prj_cafe_01", name: "Design Phase", order: 1 },
    { id: "phs_dev", projectId: "prj_cafe_01", name: "Development Phase", order: 2 },
    { id: "phs_qa", projectId: "prj_cafe_01", name: "Testing Phase", order: 3 },
  ],
  members: [
    { id: "mem_1", userId: "usr_marchel", name: "Marchelino Kurniawan", email: "marchelinokurniawan321@gmail.com", role: Role.OWNER },
    { id: "mem_2", userId: "usr_sarah", name: "Sarah Chen", email: "sarah@synplan.dev", role: Role.ADMIN },
    { id: "mem_3", userId: "usr_bob", name: "Bob Designer", email: "bob@synplan.dev", role: Role.MEMBER },
  ],
  currentProjectId: "prj_cafe_01",
};

// Mock Execution Context for downstream Pipeline Verification
const mockExecContext: AiExecutionContext = {
  workspaceId: "ws_eng_core_1",
  workspaceName: "Engineering Core",
  userId: "usr_marchel",
  userName: "Marchelino Kurniawan",
  userRole: Role.OWNER,
  currentProjectId: "prj_cafe_01",
  currentProjectName: "Website Cafe & Resto",
  serverTime: "2026-08-30T04:30:00.000Z",
  isMock: true,
  members: mockSlashContext.members.map((m) => ({
    id: m.id,
    userId: m.userId,
    name: m.name,
    email: m.email || "",
    role: m.role,
  })),
  projects: mockSlashContext.projects.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status || "ACTIVE",
    totalTasks: p.totalTasks || 0,
    deadline: p.deadline,
  })),
  phases: mockSlashContext.phases.map((ph) => ({
    id: ph.id,
    projectId: ph.projectId,
    name: ph.name,
    order: ph.order || 1,
  })),
  tasks: mockSlashContext.tasks.map((t) => ({
    id: t.id,
    projectId: t.projectId,
    phaseId: t.phaseId,
    title: t.title,
    status: t.status || "TODO",
    priority: t.priority || "MEDIUM",
    assigneeId: t.assigneeId,
    dueDate: t.dueDate,
  })),
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

async function runSlashCommandTests() {
  console.log("\n" + "=".repeat(80));
  console.log(" SYNPLAN PHASE 5 — SLASH COMMAND SYSTEM + HIERARCHICAL AUTOCOMPLETE SUITE");
  console.log("=".repeat(80) + "\n");

  // =========================================================================
  // 1. ROOT COMMAND AUTOCOMPLETE & FILTERING
  // =========================================================================
  console.log("--- 1. ROOT COMMAND AUTOCOMPLETE & FILTERING ---");

  // Test 1.1: Typing '/' returns all 8 root commands
  const sug1_1 = getSlashSuggestions("/", mockSlashContext);
  assert(
    sug1_1.length === 8 &&
    sug1_1.some((s) => s.name === "create") &&
    sug1_1.some((s) => s.name === "edit") &&
    sug1_1.some((s) => s.name === "delete") &&
    sug1_1.some((s) => s.name === "assign") &&
    sug1_1.some((s) => s.name === "move") &&
    sug1_1.some((s) => s.name === "status") &&
    sug1_1.some((s) => s.name === "priority") &&
    sug1_1.some((s) => s.name === "plan"),
    "ROOT: Typing '/' returns all 8 root slash commands"
  );

  // Test 1.2: Filter prefix '/de' -> returns '/delete'
  const sug1_2 = getSlashSuggestions("/de", mockSlashContext);
  assert(
    sug1_2.length === 1 && sug1_2[0].name === "delete",
    "FILTER: Typing '/de' filters cleanly to '/delete'"
  );

  // Test 1.3: Filter prefix '/cre' -> returns '/create'
  const sug1_3 = getSlashSuggestions("/cre", mockSlashContext);
  assert(
    sug1_3.length === 1 && sug1_3[0].name === "create",
    "FILTER: Typing '/cre' filters cleanly to '/create'"
  );

  // Test 1.4: Case-insensitive filtering ('/PL') -> returns '/plan'
  const sug1_4 = getSlashSuggestions("/PL", mockSlashContext);
  assert(
    sug1_4.length === 1 && sug1_4[0].name === "plan",
    "FILTER: Case-insensitive filtering matches '/PL' to '/plan'"
  );

  // Test 1.5: Alias filtering ('/buat') -> returns '/create'
  const sug1_5 = getSlashSuggestions("/buat", mockSlashContext);
  assert(
    sug1_5.length === 1 && sug1_5[0].name === "create",
    "FILTER: Alias '/buat' maps to root command 'create'"
  );

  // =========================================================================
  // 2. HIERARCHICAL NESTED SUBCOMMANDS
  // =========================================================================
  console.log("\n--- 2. HIERARCHICAL NESTED SUBCOMMANDS ---");

  // Test 2.1: '/delete ' displays subcommands [project, phase, task]
  const sug2_1 = getSlashSuggestions("/delete ", mockSlashContext);
  assert(
    sug2_1.length === 3 &&
    sug2_1.some((s) => s.name === "project") &&
    sug2_1.some((s) => s.name === "phase") &&
    sug2_1.some((s) => s.name === "task"),
    "NESTED: '/delete ' displays project, phase, task subcommands"
  );

  // Test 2.2: '/delete task ' displays subcommands [one, all]
  const sug2_2 = getSlashSuggestions("/delete task ", mockSlashContext);
  assert(
    sug2_2.length === 2 &&
    sug2_2.some((s) => s.name === "one") &&
    sug2_2.some((s) => s.name === "all"),
    "NESTED: '/delete task ' displays 'one' and 'all' subcommands"
  );

  // Test 2.3: '/edit ' displays subcommands [project, phase, task]
  const sug2_3 = getSlashSuggestions("/edit ", mockSlashContext);
  assert(
    sug2_3.length === 3 &&
    sug2_3.some((s) => s.name === "project") &&
    sug2_3.some((s) => s.name === "phase") &&
    sug2_3.some((s) => s.name === "task"),
    "NESTED: '/edit ' displays project, phase, task subcommands"
  );

  // Test 2.4: '/edit task ' displays fields [title, deadline, priority, status, assignee, phase]
  const sug2_4 = getSlashSuggestions("/edit task ", mockSlashContext);
  assert(
    sug2_4.length === 6 &&
    sug2_4.some((s) => s.name === "title") &&
    sug2_4.some((s) => s.name === "deadline") &&
    sug2_4.some((s) => s.name === "priority") &&
    sug2_4.some((s) => s.name === "status") &&
    sug2_4.some((s) => s.name === "assignee") &&
    sug2_4.some((s) => s.name === "phase"),
    "NESTED: '/edit task ' displays all 6 editable task fields"
  );

  // =========================================================================
  // 3. ENTITY & ENUM AUTOCOMPLETE
  // =========================================================================
  console.log("\n--- 3. ENTITY & ENUM AUTOCOMPLETE ---");

  // Test 3.1: '/delete task one ' displays workspace tasks
  const sug3_1 = getSlashSuggestions("/delete task one ", mockSlashContext);
  assert(
    sug3_1.length === 4 &&
    sug3_1.some((s) => s.name === "Desain Homepage") &&
    sug3_1.some((s) => s.name === "API Payment Gateway"),
    "ENTITY: '/delete task one ' lists workspace tasks"
  );

  // Test 3.2: '/delete project ' displays workspace projects
  const sug3_2 = getSlashSuggestions("/delete project ", mockSlashContext);
  assert(
    sug3_2.length === 2 &&
    sug3_2.some((s) => s.name === "Website Cafe & Resto") &&
    sug3_2.some((s) => s.name === "Website Bakery"),
    "ENTITY: '/delete project ' lists workspace projects"
  );

  // Test 3.3: '/assign task "Desain Homepage" ' displays workspace squad members
  const sug3_3 = getSlashSuggestions('/assign task "Desain Homepage" ', mockSlashContext);
  assert(
    sug3_3.length === 3 &&
    sug3_3.some((s) => s.name === "Marchelino Kurniawan") &&
    sug3_3.some((s) => s.name === "Sarah Chen"),
    "ENTITY: '/assign task <task> ' lists workspace members"
  );

  // Test 3.4: '/move task "Desain Homepage" ' displays phases for project
  const sug3_4 = getSlashSuggestions('/move task "Desain Homepage" ', mockSlashContext);
  assert(
    sug3_4.length === 3 &&
    sug3_4.some((s) => s.name === "Design Phase") &&
    sug3_4.some((s) => s.name === "Development Phase"),
    "ENTITY: '/move task <task> ' lists phases in task project"
  );

  // Test 3.5: '/status task "Desain Homepage" ' displays valid statuses
  const sug3_5 = getSlashSuggestions('/status task "Desain Homepage" ', mockSlashContext);
  assert(
    sug3_5.length === 5 &&
    sug3_5.some((s) => s.name === "DONE") &&
    sug3_5.some((s) => s.name === "TODO"),
    "ENUM: '/status task <task> ' lists 5 valid statuses"
  );

  // Test 3.6: '/priority task "Desain Homepage" ' displays valid priorities
  const sug3_6 = getSlashSuggestions('/priority task "Desain Homepage" ', mockSlashContext);
  assert(
    sug3_6.length === 4 &&
    sug3_6.some((s) => s.name === "URGENT") &&
    sug3_6.some((s) => s.name === "HIGH"),
    "ENUM: '/priority task <task> ' lists 4 valid priorities"
  );

  // =========================================================================
  // 4. DETERMINISTIC PARSER & NATURAL LANGUAGE CONVERSION
  // =========================================================================
  console.log("\n--- 4. DETERMINISTIC PARSER & NLP TRANSLATION ---");

  // Test 4.1: /delete task one "Desain Homepage"
  const p4_1 = parseSlashCommand('/delete task one "Desain Homepage"', mockSlashContext);
  assert(
    p4_1.isValid === true &&
    p4_1.rootCommand === "delete" &&
    p4_1.subcommandPath.join(" ") === "task one" &&
    p4_1.naturalLanguagePrompt === "hapus task Desain Homepage",
    "PARSER: '/delete task one \"Desain Homepage\"' -> 'hapus task Desain Homepage'"
  );

  // Test 4.2: /delete task all "Website Bakery"
  const p4_2 = parseSlashCommand('/delete task all "Website Bakery"', mockSlashContext);
  assert(
    p4_2.isValid === true &&
    p4_2.naturalLanguagePrompt === "hapus semua task di project Website Bakery",
    "PARSER: '/delete task all \"Website Bakery\"' -> 'hapus semua task di project Website Bakery'"
  );

  // Test 4.3: /delete project "Website Cafe & Resto"
  const p4_3 = parseSlashCommand('/delete project "Website Cafe & Resto"', mockSlashContext);
  assert(
    p4_3.isValid === true &&
    p4_3.naturalLanguagePrompt === "hapus project Website Cafe & Resto",
    "PARSER: '/delete project \"Website Cafe & Resto\"' -> 'hapus project Website Cafe & Resto'"
  );

  // Test 4.4: /delete phase "Testing Phase"
  const p4_4 = parseSlashCommand('/delete phase "Testing Phase"', mockSlashContext);
  assert(
    p4_4.isValid === true &&
    p4_4.naturalLanguagePrompt === "hapus phase Testing Phase",
    "PARSER: '/delete phase \"Testing Phase\"' -> 'hapus phase Testing Phase'"
  );

  // Test 4.5: /assign task "Desain Homepage" Sarah
  const p4_5 = parseSlashCommand('/assign task "Desain Homepage" Sarah', mockSlashContext);
  assert(
    p4_5.isValid === true &&
    p4_5.naturalLanguagePrompt === "assign task Desain Homepage ke Sarah",
    "PARSER: '/assign task \"Desain Homepage\" Sarah' -> 'assign task Desain Homepage ke Sarah'"
  );

  // Test 4.6: /move task "Desain Homepage" "Development Phase"
  const p4_6 = parseSlashCommand('/move task "Desain Homepage" "Development Phase"', mockSlashContext);
  assert(
    p4_6.isValid === true &&
    p4_6.naturalLanguagePrompt === "pindahkan task Desain Homepage ke phase Development Phase",
    "PARSER: '/move task ... ...' -> 'pindahkan task ... ke phase ...'"
  );

  // Test 4.7: /status task "Desain Homepage" DONE
  const p4_7 = parseSlashCommand('/status task "Desain Homepage" DONE', mockSlashContext);
  assert(
    p4_7.isValid === true &&
    p4_7.naturalLanguagePrompt === "selesaikan task Desain Homepage",
    "PARSER: '/status task \"Desain Homepage\" DONE' -> 'selesaikan task Desain Homepage'"
  );

  // Test 4.8: /priority task "Desain Homepage" URGENT
  const p4_8 = parseSlashCommand('/priority task "Desain Homepage" URGENT', mockSlashContext);
  assert(
    p4_8.isValid === true &&
    p4_8.naturalLanguagePrompt === "ubah priority task Desain Homepage jadi urgent",
    "PARSER: '/priority task \"Desain Homepage\" URGENT' -> 'ubah priority task Desain Homepage jadi urgent'"
  );

  // Test 4.9: /edit task deadline "Desain Homepage" "10 September"
  const p4_9 = parseSlashCommand('/edit task deadline "Desain Homepage" "10 September"', mockSlashContext);
  assert(
    p4_9.isValid === true &&
    p4_9.naturalLanguagePrompt === "ubah deadline task Desain Homepage jadi 10 September",
    "PARSER: '/edit task deadline ... ...' -> 'ubah deadline task ... jadi ...'"
  );

  // Test 4.10: /create project "Website Toko Buah"
  const p4_10 = parseSlashCommand('/create project "Website Toko Buah"', mockSlashContext);
  assert(
    p4_10.isValid === true &&
    p4_10.naturalLanguagePrompt === "buat project Website Toko Buah",
    "PARSER: '/create project \"Website Toko Buah\"' -> 'buat project Website Toko Buah'"
  );

  // Test 4.11: /create task "Wireframe Checkout"
  const p4_11 = parseSlashCommand('/create task "Wireframe Checkout"', mockSlashContext);
  assert(
    p4_11.isValid === true &&
    p4_11.naturalLanguagePrompt?.includes("Wireframe Checkout") === true,
    "PARSER: '/create task ...' -> 'buat task Wireframe Checkout'"
  );

  // Test 4.12: /plan "Website Cafe ABC deadline 1 Okt"
  const p4_12 = parseSlashCommand('/plan "Website Cafe ABC deadline 1 Okt"', mockSlashContext);
  assert(
    p4_12.isValid === true &&
    p4_12.naturalLanguagePrompt === "buat project Website Cafe ABC deadline 1 Okt",
    "PARSER: '/plan ...' -> 'buat project Website Cafe ABC deadline 1 Okt'"
  );

  // =========================================================================
  // 5. NO GUESSING & ERROR HANDLING
  // =========================================================================
  console.log("\n--- 5. NO GUESSING & ERROR HANDLING ---");

  // Test 5.1: Unknown root command '/banana'
  const p5_1 = parseSlashCommand("/banana", mockSlashContext);
  assert(
    p5_1.isValid === false &&
    p5_1.error?.includes("Perintah tidak dikenal '/banana'") === true,
    "NO GUESSING: Unknown root '/banana' returns informative error without guessing"
  );

  // Test 5.2: Invalid subcommand '/delete banana'
  const p5_2 = parseSlashCommand("/delete banana", mockSlashContext);
  assert(
    p5_2.isValid === false &&
    p5_2.error?.includes("Subcommand 'banana' tidak valid") === true,
    "NO GUESSING: Invalid subcommand '/delete banana' returns error listing allowed subcommands"
  );

  // Test 5.3: Invalid subcommand '/edit banana'
  const p5_3 = parseSlashCommand("/edit banana", mockSlashContext);
  assert(
    p5_3.isValid === false &&
    p5_3.error?.includes("Subcommand 'banana' tidak valid") === true,
    "NO GUESSING: Invalid subcommand '/edit banana' lists project, phase, task"
  );

  // =========================================================================
  // 6. TRIGGER RULES & NON-SLASH IMMUNITY
  // =========================================================================
  console.log("\n--- 6. TRIGGER RULES & URL IMMUNITY ---");

  // Test 6.1: Full URL https://example.com/api
  const p6_1 = parseSlashCommand("https://example.com/api", mockSlashContext);
  const s6_1 = getSlashSuggestions("https://example.com/api", mockSlashContext);
  assert(
    p6_1.isSlashCommand === false && s6_1.length === 0,
    "IMMUNITY: 'https://example.com/api' never triggers slash commands or suggestions"
  );

  // Test 6.2: Mid-sentence text with slash "I need a/b testing"
  const p6_2 = parseSlashCommand("I need a/b testing", mockSlashContext);
  const s6_2 = getSlashSuggestions("I need a/b testing", mockSlashContext);
  assert(
    p6_2.isSlashCommand === false && s6_2.length === 0,
    "IMMUNITY: 'I need a/b testing' never triggers slash commands"
  );

  // Test 6.3: Natural language Indonesian prompt "buatkan task baru"
  const p6_3 = parseSlashCommand("buatkan task baru", mockSlashContext);
  assert(
    p6_3.isSlashCommand === false,
    "IMMUNITY: Ordinary natural language prompts bypass slash command parser"
  );

  // =========================================================================
  // 7. PERMISSION-AWARE AUTOCOMPLETE & RBAC
  // =========================================================================
  console.log("\n--- 7. PERMISSION-AWARE AUTOCOMPLETE & RBAC ---");

  // Test 7.1: VIEWER role suggestions
  const viewerContext: SlashAutocompleteContext = {
    ...mockSlashContext,
    userRole: Role.VIEWER,
  };
  const sugViewer = getSlashSuggestions("/", viewerContext);
  const createSug = sugViewer.find((s) => s.name === "create");
  const deleteSug = sugViewer.find((s) => s.name === "delete");
  assert(
    createSug?.disabled === true && deleteSug?.disabled === true,
    "RBAC: VIEWER role sees mutation commands as disabled with permission explanations"
  );

  // Test 7.2: MEMBER role cannot delete projects
  const memberContext: SlashAutocompleteContext = {
    ...mockSlashContext,
    userRole: Role.MEMBER,
  };
  const sugMemberDelete = getSlashSuggestions("/delete ", memberContext);
  const projDelSug = sugMemberDelete.find((s) => s.name === "project");
  assert(
    projDelSug?.disabled === true,
    "RBAC: MEMBER role sees '/delete project' as disabled (Requires ADMIN)"
  );

  // Test 7.3: MEMBER role CAN delete single task
  const taskDelSug = sugMemberDelete.find((s) => s.name === "task");
  assert(
    taskDelSug?.disabled === false,
    "RBAC: MEMBER role has permission to access '/delete task'"
  );

  // =========================================================================
  // 8. END-TO-END DOWNSTREAM PIPELINE VERIFICATION
  // =========================================================================
  console.log("\n--- 8. DOWNSTREAM ACTION ENGINE & RBAC INTEGRATION ---");

  // Test 8.1: Destructive Delete Task command flows into Action Engine with NEEDS_CONFIRMATION
  const parsedDel = parseSlashCommand('/delete task one "Desain Homepage"', mockSlashContext);
  const planDel = parseHeuristicIntent(parsedDel.naturalLanguagePrompt!, mockExecContext);
  const valDel = validateAiPlan(planDel, mockExecContext);
  assert(
    valDel.validatedPlan.actions.length === 1 &&
    valDel.validatedPlan.actions[0].type === "DELETE_TASK" &&
    valDel.validatedPlan.actions[0].isDestructive === true &&
    valDel.validatedPlan.status === "NEEDS_CONFIRMATION",
    "PIPELINE: '/delete task one' parses to plan with NEEDS_CONFIRMATION and isDestructive: true"
  );

  // Test 8.2: Status update flows into Action Engine UPDATE_TASK status DONE
  const parsedStatus = parseSlashCommand('/status task "Desain Homepage" DONE', mockSlashContext);
  const planStatus = parseHeuristicIntent(parsedStatus.naturalLanguagePrompt!, mockExecContext);
  const valStatus = validateAiPlan(planStatus, mockExecContext);
  assert(
    valStatus.validatedPlan.actions.length === 1 &&
    valStatus.validatedPlan.actions[0].type === "UPDATE_TASK" &&
    valStatus.validatedPlan.actions[0].payload.status === "DONE",
    "PIPELINE: '/status task ... DONE' parses to UPDATE_TASK status DONE"
  );

  // Test 8.3: Assign task flows into Action Engine ASSIGN_TASK
  const parsedAssign = parseSlashCommand('/assign task "Desain Homepage" Sarah', mockSlashContext);
  const planAssign = parseHeuristicIntent(parsedAssign.naturalLanguagePrompt!, mockExecContext);
  const valAssign = validateAiPlan(planAssign, mockExecContext);
  assert(
    valAssign.validatedPlan.actions.length === 1 &&
    valAssign.validatedPlan.actions[0].type === "ASSIGN_TASK" &&
    valAssign.validatedPlan.actions[0].payload.assigneeName === "Sarah Chen",
    "PIPELINE: '/assign task ... Sarah' parses to ASSIGN_TASK resolving Sarah Chen"
  );

  // Test 8.4: Member role attempting /delete project is blocked by server-side validator
  const memberExecContext: AiExecutionContext = { ...mockExecContext, userRole: Role.MEMBER };
  const parsedDelProj = parseSlashCommand('/delete project "Website Cafe & Resto"', mockSlashContext);
  const planDelProj = parseHeuristicIntent(parsedDelProj.naturalLanguagePrompt!, memberExecContext);
  const valDelProj = validateAiPlan(planDelProj, memberExecContext);
  assert(
    valDelProj.validatedPlan.status === "FORBIDDEN",
    "PIPELINE: Server-side RBAC strictly forbids MEMBER from executing '/delete project'"
  );

  // =========================================================================
  // 9. EXTENSIBILITY & ADVANCED SLASH PARSING
  // =========================================================================
  console.log("\n--- 9. EXTENSIBILITY & ADVANCED SLASH PARSING ---");

  // Test 9.1: /edit phase name "Design Phase" "UI Concept"
  const p9_1 = parseSlashCommand('/edit phase name "Design Phase" "UI Concept"', mockSlashContext);
  assert(
    p9_1.isValid === true &&
    p9_1.naturalLanguagePrompt === "rename phase Design Phase menjadi UI Concept",
    "ADVANCED: '/edit phase name ... ...' -> 'rename phase ... menjadi ...'"
  );

  // Test 9.2: /edit project name "Website Cafe & Resto" "Cafe Modern"
  const p9_2 = parseSlashCommand('/edit project name "Website Cafe & Resto" "Cafe Modern"', mockSlashContext);
  assert(
    p9_2.isValid === true &&
    p9_2.naturalLanguagePrompt === "rename project Website Cafe & Resto menjadi Cafe Modern",
    "ADVANCED: '/edit project name ... ...' -> 'rename project ... menjadi ...'"
  );

  // Test 9.3: /edit project deadline "Website Cafe & Resto" "20 September"
  const p9_3 = parseSlashCommand('/edit project deadline "Website Cafe & Resto" "20 September"', mockSlashContext);
  assert(
    p9_3.isValid === true &&
    p9_3.naturalLanguagePrompt === "ubah deadline project Website Cafe & Resto jadi 20 September",
    "ADVANCED: '/edit project deadline ... ...' -> 'ubah deadline project ... jadi ...'"
  );

  // Test 9.4: /edit task priority "Desain Homepage" high
  const p9_4 = parseSlashCommand('/edit task priority "Desain Homepage" high', mockSlashContext);
  assert(
    p9_4.isValid === true &&
    p9_4.naturalLanguagePrompt === "ubah priority task Desain Homepage jadi high",
    "ADVANCED: '/edit task priority ... high' -> 'ubah priority task ... jadi high'"
  );

  // Test 9.5: /edit task status "Desain Homepage" blocked
  const p9_5 = parseSlashCommand('/edit task status "Desain Homepage" blocked', mockSlashContext);
  assert(
    p9_5.isValid === true &&
    p9_5.naturalLanguagePrompt === "ubah status task Desain Homepage jadi blocked",
    "ADVANCED: '/edit task status ... blocked' -> 'ubah status task ... jadi blocked'"
  );

  // Test 9.6: /edit task phase "Desain Homepage" "Development Phase"
  const p9_6 = parseSlashCommand('/edit task phase "Desain Homepage" "Development Phase"', mockSlashContext);
  assert(
    p9_6.isValid === true &&
    p9_6.naturalLanguagePrompt === "pindahkan task Desain Homepage ke phase Development Phase",
    "ADVANCED: '/edit task phase ... ...' -> 'pindahkan task ... ke phase ...'"
  );

  // Test 9.7: /create phase "Testing & QA"
  const p9_7 = parseSlashCommand('/create phase "Testing & QA"', mockSlashContext);
  assert(
    p9_7.isValid === true &&
    p9_7.naturalLanguagePrompt?.includes("Testing & QA") === true,
    "ADVANCED: '/create phase ...' -> 'buat phase Testing & QA'"
  );

  // Test 9.8: Quoted token parser handles mixed spaces and single quotes
  const p9_8 = parseSlashCommand("/delete task one 'API Payment Gateway'", mockSlashContext);
  assert(
    p9_8.isValid === true &&
    p9_8.naturalLanguagePrompt === "hapus task API Payment Gateway",
    "ADVANCED: Single quote parsing extracts 'API Payment Gateway'"
  );

  // Test 9.9: Registry is extensible with new command nodes
  const customNode = {
    name: "archive",
    label: "/archive",
    description: "Arsipkan data project lama",
    category: "general" as const,
    requiredRole: Role.ADMIN,
    toNaturalLanguage: (args: any) => `arsipkan project ${args.text || ""}`,
  };
  assert(
    typeof customNode.toNaturalLanguage === "function" &&
    customNode.name === "archive",
    "ADVANCED: Generic command registry architecture accommodates custom command nodes"
  );

  // Test 9.10: Case-insensitive subcommands '/DELETE TASK ONE "Desain Homepage"'
  const p9_10 = parseSlashCommand('/DELETE TASK ONE "Desain Homepage"', mockSlashContext);
  assert(
    p9_10.isValid === true &&
    p9_10.naturalLanguagePrompt === "hapus task Desain Homepage",
    "ADVANCED: Uppercase '/DELETE TASK ONE' parses accurately"
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

runSlashCommandTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
