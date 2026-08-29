/**
 * SYNPLAN — Entity Resolution Test Suite
 * 50+ focused tests covering:
 * - Exact matches
 * - Typo tolerance (Levenshtein & Jaro-Winkler)
 * - Ambiguous names ("marhel" matching Marshel & Marchel)
 * - Multi-selection answers ("keduanya", "yang pertama", "semuanya")
 * - Ordinal references ("yang pertama", "yang kedua")
 * - No-match ("xyzabc")
 * - Too many matches ("ma" matching 5+ candidates)
 * - Cross-entity resolution (PROJECT, TASK, PHASE)
 * - Email matching
 * - Contextual project resolution
 *
 * Run: npx tsx scripts/test-entity-resolution.ts
 */

import {
  levenshteinDistance,
  normalizedLevenshtein,
  jaroWinkler,
  calculateCandidateScore,
  matchCandidateEntities,
  resolveClarificationAnswer,
  resolveWorkspaceMember,
  resolveWorkspaceProject,
  resolveWorkspaceTask,
  resolveWorkspacePhase,
  MATCHING_THRESHOLDS,
} from "../src/lib/ai/entityResolver";

import type {
  AiExecutionContext,
  ResolvedEntityCandidate,
} from "../src/lib/ai/types";

// ============================================================================
// TEST HARNESS
// ============================================================================

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures: string[] = [];

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ ${testName}`);
  } else {
    failedTests++;
    const msg = `  ❌ ${testName}${detail ? ` — ${detail}` : ""}`;
    console.log(msg);
    failures.push(msg);
  }
}

function section(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  📋 ${title}`);
  console.log(`${"─".repeat(60)}`);
}

// ============================================================================
// MOCK DATA — Authorized Workspace Entities
// ============================================================================

const MOCK_MEMBERS: AiExecutionContext["members"] = [
  { id: "wm1", userId: "u1", name: "Marchelino Kurniawan", email: "marchelino@email.com", role: "OWNER" },
  { id: "wm2", userId: "u2", name: "Marshel Saputra", email: "marshel@email.com", role: "MEMBER" },
  { id: "wm3", userId: "u3", name: "Marchel Pratama", email: "marchel@email.com", role: "MEMBER" },
  { id: "wm4", userId: "u4", name: "Maman Surachman", email: "maman@email.com", role: "ADMIN" },
  { id: "wm5", userId: "u5", name: "Maul Hidayat", email: "maul@email.com", role: "MEMBER" },
  { id: "wm6", userId: "u6", name: "Marlo Tenggara", email: "marlo@email.com", role: "MEMBER" },
  { id: "wm7", userId: "u7", name: "Sarah Andini", email: "sarah@email.com", role: "MEMBER" },
  { id: "wm8", userId: "u8", name: "Devon Wijaya", email: "devon@email.com", role: "VIEWER" },
  { id: "wm9", userId: "u9", name: "Andi Saputra", email: "andi.s@email.com", role: "MEMBER" },
  { id: "wm10", userId: "u10", name: "Andi Pratama", email: "andi.p@email.com", role: "MEMBER" },
];

const MOCK_PROJECTS: AiExecutionContext["projects"] = [
  { id: "p1", name: "Website Cafe ABC", status: "ACTIVE", totalTasks: 8, deadline: "2026-09-30" },
  { id: "p2", name: "Website Toko Roti", status: "ACTIVE", totalTasks: 5, deadline: "2026-10-15" },
  { id: "p3", name: "Website Toko Kue", status: "PLANNING", totalTasks: 2, deadline: null },
  { id: "p4", name: "App Mobile Banking", status: "ACTIVE", totalTasks: 12, deadline: "2026-12-01" },
  { id: "p5", name: "Dashboard Analytics", status: "COMPLETED", totalTasks: 10, deadline: "2026-08-01" },
];

const MOCK_TASKS: AiExecutionContext["tasks"] = [
  { id: "t1", projectId: "p1", title: "UI Design Mockup", status: "TODO", priority: "HIGH", assigneeId: "u1" },
  { id: "t2", projectId: "p1", title: "Frontend Development", status: "IN_PROGRESS", priority: "HIGH", assigneeId: "u2" },
  { id: "t3", projectId: "p1", title: "Backend API", status: "TODO", priority: "MEDIUM", assigneeId: null },
  { id: "t4", projectId: "p2", title: "UI Design Wireframe", status: "DONE", priority: "MEDIUM", assigneeId: "u7" },
  { id: "t5", projectId: "p2", title: "QA Testing", status: "TODO", priority: "HIGH", assigneeId: null },
  { id: "t6", projectId: "p4", title: "Authentication Module", status: "IN_PROGRESS", priority: "URGENT", assigneeId: "u1" },
];

const MOCK_PHASES: AiExecutionContext["phases"] = [
  { id: "ph1", projectId: "p1", name: "Planning", order: 1 },
  { id: "ph2", projectId: "p1", name: "Design", order: 2 },
  { id: "ph3", projectId: "p1", name: "Development", order: 3 },
  { id: "ph4", projectId: "p1", name: "Testing", order: 4 },
  { id: "ph5", projectId: "p2", name: "Design Phase", order: 1 },
  { id: "ph6", projectId: "p2", name: "Development Phase", order: 2 },
];

const MOCK_CONTEXT: AiExecutionContext = {
  workspaceId: "ws1",
  workspaceName: "Test Workspace",
  userId: "u1",
  userName: "Marchelino Kurniawan",
  userRole: "OWNER",
  currentProjectId: "p1",
  currentProjectName: "Website Cafe ABC",
  members: MOCK_MEMBERS,
  projects: MOCK_PROJECTS,
  tasks: MOCK_TASKS,
  phases: MOCK_PHASES,
};

// ============================================================================
// SECTION 1: LOW-LEVEL STRING SIMILARITY ALGORITHMS
// ============================================================================

section("1. Levenshtein Distance Algorithm");
assert(levenshteinDistance("", "") === 0, "Empty strings → distance 0");
assert(levenshteinDistance("abc", "abc") === 0, "Identical strings → distance 0");
assert(levenshteinDistance("abc", "abd") === 1, "'abc' vs 'abd' → distance 1");
assert(levenshteinDistance("kitten", "sitting") === 3, "'kitten' vs 'sitting' → distance 3");
assert(levenshteinDistance("marhel", "marchel") === 1, "'marhel' vs 'marchel' → distance 1 (insertion)");
assert(levenshteinDistance("marshel", "marchel") === 1, "'marshel' vs 'marchel' → distance 1 (substitution)");

section("2. Normalized Levenshtein Similarity");
assert(normalizedLevenshtein("abc", "abc") === 1.0, "Identical → 1.0");
assert(normalizedLevenshtein("marhel", "marchel") > 0.8, "'marhel' vs 'marchel' > 0.8");
assert(normalizedLevenshtein("xyz", "abc") < 0.5, "'xyz' vs 'abc' < 0.5");

section("3. Jaro-Winkler Similarity");
assert(jaroWinkler("abc", "abc") === 1.0, "Identical → 1.0");
assert(jaroWinkler("marhel", "marchel") > 0.9, "'marhel' vs 'marchel' > 0.9 (prefix match)");
assert(jaroWinkler("marshel", "marchel") > 0.9, "'marshel' vs 'marchel' > 0.9");
assert(jaroWinkler("sarah", "devon") < 0.7, "'sarah' vs 'devon' < 0.7 (unrelated)");

section("4. Composite Candidate Score");
assert(calculateCandidateScore("marchelino kurniawan", "Marchelino Kurniawan") === 1.0, "Exact case-insensitive → 1.0");
assert(calculateCandidateScore("marchelino", "Marchelino Kurniawan") >= 0.90, "Token exact match 'marchelino' → ≥ 0.90");
assert(calculateCandidateScore("sarah", "Sarah Andini") >= 0.90, "Token exact match 'sarah' → ≥ 0.90");
assert(calculateCandidateScore("march", "Marchel Pratama") >= 0.85, "Prefix 'march' → ≥ 0.85");
assert(calculateCandidateScore("marhel", "Marchel Pratama") > 0.7, "Typo 'marhel' vs 'Marchel Pratama' → > 0.7");
assert(calculateCandidateScore("marhel", "Marshel Saputra") > 0.7, "Typo 'marhel' vs 'Marshel Saputra' → > 0.7");
assert(calculateCandidateScore("xyzabc123", "Marchelino Kurniawan") < 0.5, "Garbage → < 0.5");

// ============================================================================
// SECTION 2: MEMBER RESOLUTION
// ============================================================================

section("5. resolveWorkspaceMember — Exact Match");
{
  const r = resolveWorkspaceMember("Sarah Andini", MOCK_MEMBERS);
  assert(r.member?.userId === "u7", "Exact full name → Sarah Andini");
  assert(r.confidence === 1.0, "Confidence = 1.0");
  assert(!r.isAmbiguous, "Not ambiguous");
  assert(!r.notFound, "Found");
}

section("6. resolveWorkspaceMember — Email Match");
{
  const r = resolveWorkspaceMember("devon@email.com", MOCK_MEMBERS);
  assert(r.member?.userId === "u8", "Email match → Devon Wijaya");
  assert(r.confidence === 1.0, "Confidence = 1.0");
}

section("7. resolveWorkspaceMember — Token/Prefix Match");
{
  const r = resolveWorkspaceMember("Sarah", MOCK_MEMBERS);
  assert(r.member?.userId === "u7", "Token 'Sarah' → Sarah Andini");
  assert(!r.isAmbiguous, "Not ambiguous (unique)");
}

section("8. resolveWorkspaceMember — Ambiguous Typo 'marhel'");
{
  const r = resolveWorkspaceMember("marhel", MOCK_MEMBERS);
  assert(r.isAmbiguous === true, "'marhel' → Ambiguous (Marshel & Marchel are close)");
  assert(r.candidates.length >= 2, "At least 2 candidates");
  assert(r.confidence > 0, "Non-zero confidence");
}

section("9. resolveWorkspaceMember — No Match");
{
  const r = resolveWorkspaceMember("xyzabc123", MOCK_MEMBERS);
  assert(r.notFound === true, "'xyzabc123' → Not found");
  assert(r.member === undefined, "No member returned");
  assert(r.confidence === 0, "Confidence = 0");
}

section("10. resolveWorkspaceMember — Empty Input");
{
  const r = resolveWorkspaceMember("", MOCK_MEMBERS);
  assert(r.notFound === true, "Empty → Not found");
  const r2 = resolveWorkspaceMember(undefined, MOCK_MEMBERS);
  assert(r2.notFound === true, "Undefined → Not found");
}

section("11. resolveWorkspaceMember — Ambiguous Identical Names 'Andi'");
{
  const r = resolveWorkspaceMember("Andi", MOCK_MEMBERS);
  assert(r.isAmbiguous === true, "'Andi' → Ambiguous (Andi Saputra & Andi Pratama)");
  assert(r.candidates.length >= 2, "At least 2 Andi candidates");
}

// ============================================================================
// SECTION 3: PROJECT RESOLUTION
// ============================================================================

section("12. resolveWorkspaceProject — Exact Name");
{
  const r = resolveWorkspaceProject("Website Cafe ABC", MOCK_CONTEXT);
  assert(r.project?.id === "p1", "Exact name → Website Cafe ABC");
  assert(r.confidence === 1.0, "Confidence = 1.0");
}

section("13. resolveWorkspaceProject — Context (project ini)");
{
  const r = resolveWorkspaceProject("project ini", MOCK_CONTEXT);
  assert(r.project?.id === "p1", "'project ini' → current project p1");
}

section("14. resolveWorkspaceProject — Ambiguous 'Toko'");
{
  const r = resolveWorkspaceProject("Toko", MOCK_CONTEXT);
  assert(r.isAmbiguous === true, "'Toko' → Ambiguous (Toko Roti & Toko Kue)");
  assert(r.candidates.length >= 2, "At least 2 Toko candidates");
}

section("15. resolveWorkspaceProject — ID Match");
{
  const r = resolveWorkspaceProject("p4", MOCK_CONTEXT);
  assert(r.project?.id === "p4", "ID match → App Mobile Banking");
}

section("16. resolveWorkspaceProject — No Identifier (uses current)");
{
  const r = resolveWorkspaceProject("", MOCK_CONTEXT);
  assert(r.project?.id === "p1", "Empty → falls back to current project");
}

section("17. resolveWorkspaceProject — No Match");
{
  const r = resolveWorkspaceProject("Sistem ERP Pabrik", MOCK_CONTEXT);
  assert(r.notFound === true, "'Sistem ERP Pabrik' → Not found");
}

// ============================================================================
// SECTION 4: TASK RESOLUTION
// ============================================================================

section("18. resolveWorkspaceTask — Exact Title");
{
  const r = resolveWorkspaceTask("UI Design Mockup", MOCK_CONTEXT);
  assert(r.task?.id === "t1", "Exact title → UI Design Mockup");
}

section("19. resolveWorkspaceTask — Partial Match");
{
  const r = resolveWorkspaceTask("Frontend", MOCK_CONTEXT);
  assert(r.task?.id === "t2", "'Frontend' → Frontend Development");
}

section("20. resolveWorkspaceTask — Scoped to Project");
{
  const r = resolveWorkspaceTask("UI Design", MOCK_CONTEXT, "p2");
  assert(r.task?.id === "t4", "'UI Design' scoped to p2 → UI Design Wireframe");
}

section("21. resolveWorkspaceTask — Ambiguous 'UI Design' (unscoped)");
{
  const r = resolveWorkspaceTask("UI Design", MOCK_CONTEXT);
  // Two tasks: "UI Design Mockup" (p1) and "UI Design Wireframe" (p2)
  assert(r.isAmbiguous === true || r.task !== undefined, "'UI Design' may be ambiguous or resolved to best");
}

section("22. resolveWorkspaceTask — No Match");
{
  const r = resolveWorkspaceTask("Completely Random Task XYZ", MOCK_CONTEXT);
  assert(r.notFound === true, "'Completely Random Task XYZ' → Not found");
}

// ============================================================================
// SECTION 5: PHASE RESOLUTION
// ============================================================================

section("23. resolveWorkspacePhase — Exact Name");
{
  const r = resolveWorkspacePhase("Planning", MOCK_CONTEXT);
  assert(r.selectedEntity?.id === "ph1" || !r.notFound, "'Planning' → resolved");
}

section("24. resolveWorkspacePhase — Scoped to Project");
{
  const r = resolveWorkspacePhase("Design", MOCK_CONTEXT, "p1");
  assert(r.selectedEntity?.id === "ph2" || !r.notFound, "'Design' in p1 → resolved");
}

section("25. resolveWorkspacePhase — No Match");
{
  const r = resolveWorkspacePhase("Xyztron Zeta", MOCK_CONTEXT);
  assert(r.notFound === true, "'Xyztron Zeta' → Not found");
}

// ============================================================================
// SECTION 6: MULTI-SELECTION CLARIFICATION ANSWER
// ============================================================================

const MOCK_CANDIDATES: ResolvedEntityCandidate[] = [
  { id: "u2", name: "Marshel Saputra", score: 0.88, data: MOCK_MEMBERS[1] },
  { id: "u3", name: "Marchel Pratama", score: 0.85, data: MOCK_MEMBERS[2] },
];

section("26. resolveClarificationAnswer — Single Name Match 'Marchel'");
{
  const r = resolveClarificationAnswer("Marchel", MOCK_CANDIDATES);
  assert(r.resolved === true, "Resolved");
  assert(r.selectedEntities.length === 1, "1 selected");
  assert(r.selectedNames[0] === "Marchel Pratama", "Selected Marchel Pratama");
  assert(r.selectionMode === "SINGLE", "Mode SINGLE");
}

section("27. resolveClarificationAnswer — Single Name Match 'Marshel'");
{
  const r = resolveClarificationAnswer("Marshel", MOCK_CANDIDATES);
  assert(r.resolved === true, "Resolved");
  assert(r.selectedEntities.length === 1, "1 selected");
  assert(r.selectedNames[0] === "Marshel Saputra", "Selected Marshel Saputra");
}

section("28. resolveClarificationAnswer — 'keduanya'");
{
  const r = resolveClarificationAnswer("keduanya", MOCK_CANDIDATES);
  assert(r.resolved === true, "Resolved");
  assert(r.selectedEntities.length === 2, "Both selected");
  assert(r.selectionMode === "MULTI", "Mode MULTI");
}

section("29. resolveClarificationAnswer — 'dua-duanya'");
{
  const r = resolveClarificationAnswer("dua-duanya", MOCK_CANDIDATES);
  assert(r.resolved === true, "Resolved");
  assert(r.selectedEntities.length === 2, "Both selected");
}

section("30. resolveClarificationAnswer — 'both'");
{
  const r = resolveClarificationAnswer("both", MOCK_CANDIDATES);
  assert(r.resolved === true, "Resolved");
  assert(r.selectedEntities.length === 2, "Both selected");
}

section("31. resolveClarificationAnswer — 'semuanya'");
{
  const r = resolveClarificationAnswer("semuanya", MOCK_CANDIDATES);
  assert(r.resolved === true, "Resolved");
  assert(r.selectedEntities.length === 2, "All candidates selected");
  assert(r.selectionMode === "ALL_CANDIDATES", "Mode ALL_CANDIDATES");
}

section("32. resolveClarificationAnswer — 'yang pertama'");
{
  const r = resolveClarificationAnswer("yang pertama", MOCK_CANDIDATES);
  assert(r.resolved === true, "Resolved");
  assert(r.selectedEntities.length === 1, "1 selected");
  assert(r.selectedNames[0] === "Marshel Saputra", "First candidate = Marshel Saputra");
  assert(r.selectionMode === "ORDINAL", "Mode ORDINAL");
}

section("33. resolveClarificationAnswer — 'yang kedua'");
{
  const r = resolveClarificationAnswer("yang kedua", MOCK_CANDIDATES);
  assert(r.resolved === true, "Resolved");
  assert(r.selectedEntities.length === 1, "1 selected");
  assert(r.selectedNames[0] === "Marchel Pratama", "Second candidate = Marchel Pratama");
  assert(r.selectionMode === "ORDINAL", "Mode ORDINAL");
}

section("34. resolveClarificationAnswer — Ordinal '1'");
{
  const r = resolveClarificationAnswer("1", MOCK_CANDIDATES);
  assert(r.resolved === true, "Resolved");
  assert(r.selectedNames[0] === "Marshel Saputra", "First by number");
}

section("35. resolveClarificationAnswer — Ordinal '2'");
{
  const r = resolveClarificationAnswer("2", MOCK_CANDIDATES);
  assert(r.resolved === true, "Resolved");
  assert(r.selectedNames[0] === "Marchel Pratama", "Second by number");
}

section("36. resolveClarificationAnswer — Explicit Multiple 'Marchel dan Marshel'");
{
  const r = resolveClarificationAnswer("Marchel dan Marshel", MOCK_CANDIDATES);
  assert(r.resolved === true, "Resolved");
  assert(r.selectedEntities.length === 2, "Both mentioned");
  assert(r.selectionMode === "MULTI", "Mode MULTI");
}

section("37. resolveClarificationAnswer — 'pertama'");
{
  const r = resolveClarificationAnswer("pertama", MOCK_CANDIDATES);
  assert(r.resolved === true, "Resolved");
  assert(r.selectedNames[0] === "Marshel Saputra", "First candidate");
}

section("38. resolveClarificationAnswer — 'all'");
{
  const r = resolveClarificationAnswer("all", MOCK_CANDIDATES);
  assert(r.resolved === true, "Resolved");
  assert(r.selectedEntities.length === 2, "All selected");
}

section("39. resolveClarificationAnswer — Unknown answer");
{
  const r = resolveClarificationAnswer("xyzrandom", MOCK_CANDIDATES);
  assert(r.resolved === false, "Not resolved");
  assert(r.selectionMode === "NONE", "Mode NONE");
}

section("40. resolveClarificationAnswer — Empty input");
{
  const r = resolveClarificationAnswer("", MOCK_CANDIDATES);
  assert(r.resolved === false, "Empty → not resolved");
}

section("41. resolveClarificationAnswer — Empty candidates");
{
  const r = resolveClarificationAnswer("Marchel", []);
  assert(r.resolved === false, "No candidates → not resolved");
}

// ============================================================================
// SECTION 7: matchCandidateEntities — Universal Matching Engine
// ============================================================================

section("42. matchCandidateEntities — Too Many Matches ('ma')");
{
  // 5+ members start with 'ma': Marchelino, Marshel, Marchel, Maman, Maul, Marlo
  const r = matchCandidateEntities(
    "ma",
    MOCK_MEMBERS,
    (m) => m.name,
    (m) => m.userId,
    (m) => m.email,
    "MEMBER"
  );
  assert(r.status === "TOO_MANY_CANDIDATES", "'ma' → TOO_MANY_CANDIDATES");
  assert(r.isAmbiguous === true, "Ambiguous");
}

section("43. matchCandidateEntities — Single High Confidence");
{
  const r = matchCandidateEntities(
    "Devon",
    MOCK_MEMBERS,
    (m) => m.name,
    (m) => m.userId,
    (m) => m.email,
    "MEMBER"
  );
  assert(
    r.status === "EXACT_MATCH" || r.status === "SINGLE_HIGH_CONFIDENCE",
    "'Devon' → high confidence or exact"
  );
  assert(r.selectedEntity?.userId === "u8", "Resolved to Devon Wijaya");
}

section("44. matchCandidateEntities — Exact Match");
{
  const r = matchCandidateEntities(
    "Maman Surachman",
    MOCK_MEMBERS,
    (m) => m.name,
    (m) => m.userId,
    (m) => m.email,
    "MEMBER"
  );
  assert(r.status === "EXACT_MATCH", "Exact match");
  assert(r.selectedEntity?.userId === "u4", "Resolved to Maman");
}

section("45. matchCandidateEntities — No Match (garbage)");
{
  const r = matchCandidateEntities(
    "zzz_nonexistent_person",
    MOCK_MEMBERS,
    (m) => m.name,
    (m) => m.userId,
    (m) => m.email,
    "MEMBER"
  );
  assert(r.status === "NO_MATCH", "No match found");
  assert(r.notFound === true, "Not found");
}

// ============================================================================
// SECTION 8: EDGE CASES & ROBUSTNESS
// ============================================================================

section("46. Edge Case — Whitespace-padded query");
{
  const r = resolveWorkspaceMember("  Sarah  ", MOCK_MEMBERS);
  assert(r.member?.userId === "u7", "Trimmed whitespace → Sarah Andini");
}

section("47. Edge Case — Case-insensitive match");
{
  const r = resolveWorkspaceMember("DEVON WIJAYA", MOCK_MEMBERS);
  assert(r.member?.userId === "u8", "All-caps → Devon Wijaya");
}

section("48. Edge Case — Single character query");
{
  const r = resolveWorkspaceMember("S", MOCK_MEMBERS);
  // Single character is too broad, should not confidently resolve
  assert(r.isAmbiguous === true || r.notFound === true, "Single char → ambiguous or not found");
}

section("49. Edge Case — Partial first name 'marc'");
{
  const r = resolveWorkspaceMember("marc", MOCK_MEMBERS);
  // Matches: Marchelino, Marchel → ambiguous
  assert(r.isAmbiguous === true || r.member !== undefined, "'marc' → may be ambiguous with Marchelino & Marchel");
}

section("50. Edge Case — Project resolution with empty projects");
{
  const emptyCtx: AiExecutionContext = {
    ...MOCK_CONTEXT,
    projects: [],
    currentProjectId: undefined,
  };
  const r = resolveWorkspaceProject("anything", emptyCtx);
  assert(r.notFound === true, "No projects → not found");
}

section("51. Edge Case — resolveClarificationAnswer — 'nomor 1'");
{
  const r = resolveClarificationAnswer("nomor 1", MOCK_CANDIDATES);
  assert(r.resolved === true, "Resolved 'nomor 1'");
  assert(r.selectedNames[0] === "Marshel Saputra", "First by 'nomor 1'");
}

section("52. Edge Case — resolveClarificationAnswer — 'pilih keduanya'");
{
  const r = resolveClarificationAnswer("pilih keduanya", MOCK_CANDIDATES);
  assert(r.resolved === true, "Resolved 'pilih keduanya'");
  assert(r.selectedEntities.length === 2, "Both selected");
}

section("53. Edge Case — resolveClarificationAnswer — 'select both'");
{
  const r = resolveClarificationAnswer("select both", MOCK_CANDIDATES);
  assert(r.resolved === true, "Resolved 'select both'");
  assert(r.selectedEntities.length === 2, "Both selected");
}

section("54. Edge Case — Member with 'semua'");
{
  const r = resolveClarificationAnswer("semua", MOCK_CANDIDATES);
  assert(r.resolved === true, "Resolved");
  assert(r.selectedEntities.length === 2, "All candidates");
}

section("55. Threshold Constants Sanity Check");
{
  assert(MATCHING_THRESHOLDS.MIN_CANDIDATE_THRESHOLD >= 0.5, "MIN threshold ≥ 0.5");
  assert(MATCHING_THRESHOLDS.HIGH_CONFIDENCE_THRESHOLD >= 0.8, "HIGH threshold ≥ 0.8");
  assert(MATCHING_THRESHOLDS.DOMINANT_MARGIN > 0 && MATCHING_THRESHOLDS.DOMINANT_MARGIN < 0.5, "DOMINANT_MARGIN in sensible range");
  assert(MATCHING_THRESHOLDS.MAX_CANDIDATES_BEFORE_TOO_MANY >= 3, "MAX_CANDIDATES ≥ 3");
}

// ============================================================================
// SECTION 9: CROSS-ENTITY TYPE TESTS
// ============================================================================

section("56. Phase — Prefix 'Dev' in p1");
{
  const r = resolveWorkspacePhase("Dev", MOCK_CONTEXT, "p1");
  // "Development" starts with "Dev"
  assert(!r.notFound || r.selectedEntity !== undefined, "'Dev' → matches Development phase");
}

section("57. Task — ID Match");
{
  const r = resolveWorkspaceTask("t6", MOCK_CONTEXT);
  assert(r.task?.id === "t6", "Exact ID → Authentication Module");
}

section("58. Project — Partial 'Cafe'");
{
  const r = resolveWorkspaceProject("Cafe", MOCK_CONTEXT);
  assert(r.project?.id === "p1", "'Cafe' → Website Cafe ABC");
}

section("59. Project — 'proyek ini' context");
{
  const r = resolveWorkspaceProject("proyek ini", MOCK_CONTEXT);
  assert(r.project?.id === "p1", "'proyek ini' → current project");
}

section("60. Project — 'current project'");
{
  const r = resolveWorkspaceProject("current project", MOCK_CONTEXT);
  assert(r.project?.id === "p1", "'current project' → current project");
}

// ============================================================================
// RESULTS SUMMARY
// ============================================================================

console.log(`\n${"═".repeat(60)}`);
console.log(`  ENTITY RESOLUTION TEST SUITE — RESULTS`);
console.log(`${"═".repeat(60)}`);
console.log(`  Total: ${totalTests}`);
console.log(`  ✅ Passed: ${passedTests}`);
console.log(`  ❌ Failed: ${failedTests}`);
console.log(`  📊 Pass Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
console.log(`${"═".repeat(60)}`);

if (failures.length > 0) {
  console.log(`\n  FAILURES:`);
  failures.forEach((f) => console.log(f));
}

process.exit(failedTests > 0 ? 1 : 0);
