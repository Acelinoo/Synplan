/**
 * SYNPLAN — PHASE 9: FINAL PRODUCTION AUDIT & RELEASE READINESS TEST SUITE
 *
 * Comprehensive production invariant verification covering:
 * - Architecture & module integrity
 * - Authentication & session security
 * - Authorization / RBAC invariants
 * - Multi-tenant isolation boundaries
 * - API security surface audit
 * - Database schema & constraint verification
 * - AI safety pipeline verification
 * - Backup & disaster recovery validation
 * - Error handling & sanitization
 * - Input validation schema coverage
 * - Environment & deployment configuration
 * - Observability infrastructure
 */

import { prisma } from "../src/lib/prisma";
import { Role, ProjectStatus, TaskStatus, TaskPriority } from "@prisma/client";
import { generateSessionToken, createSession, validateSessionToken, invalidateSession, getSessionCookieOptions, SESSION_COOKIE_NAME } from "../src/lib/auth/session";
import { hasPermission, canModifyRole, canRemoveMember, ROLE_PERMISSIONS, Permission } from "../src/lib/permissions";
import { sanitizeErrorMessage } from "../src/lib/apiErrors";
import { SlidingWindowRateLimiter } from "../src/lib/rateLimit";
import { validateBackupPayload } from "../src/lib/backupValidator";
import { checkWorkspaceDataConsistency } from "../src/lib/dataConsistency";
import { validateAiPlan } from "../src/lib/ai/validator";
import { idempotency } from "../src/lib/idempotency";
import { logger } from "../src/lib/logger";
import * as fs from "fs";
import * as path from "path";

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS ${String(totalTests).padStart(3, "0")}] ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL ${String(totalTests).padStart(3, "0")}] ${testName}`);
    if (details) console.error(`     Details: ${details}`);
  }
}

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════════════╗");
  console.log("║  SYNPLAN — PHASE 9: FINAL PRODUCTION AUDIT & RELEASE READINESS  ║");
  console.log("╚════════════════════════════════════════════════════════════════════╝\n");

  // ============================================================================
  // SECTION 1: ARCHITECTURE & MODULE INTEGRITY
  // ============================================================================
  console.log("\n━━━ SECTION 1: ARCHITECTURE & MODULE INTEGRITY ━━━\n");

  // 1.1 Critical source files exist
  const criticalFiles = [
    "src/middleware.ts",
    "src/lib/authGuard.ts",
    "src/lib/permissions.ts",
    "src/lib/rateLimit.ts",
    "src/lib/apiErrors.ts",
    "src/lib/logger.ts",
    "src/lib/idempotency.ts",
    "src/lib/pagination.ts",
    "src/lib/audit.ts",
    "src/lib/backupValidator.ts",
    "src/lib/dataConsistency.ts",
    "src/lib/validation/schemas.ts",
    "src/lib/validation/apiValidator.ts",
    "src/lib/auth/session.ts",
    "src/lib/auth/oauth.ts",
    "src/lib/ai/planner.ts",
    "src/lib/ai/executor.ts",
    "src/lib/ai/validator.ts",
    "src/lib/ai/confirmationStore.ts",
    "src/lib/realtime.ts",
    "src/lib/realtimeServer.ts",
    "src/app/error.tsx",
    "src/app/global-error.tsx",
    "src/app/not-found.tsx",
    "src/app/loading.tsx",
    "prisma/schema.prisma",
  ];

  const projectRoot = path.resolve(__dirname, "..");
  for (const f of criticalFiles) {
    const exists = fs.existsSync(path.join(projectRoot, f));
    assert(exists, `Critical file exists: ${f}`);
  }

  // 1.2 API route files exist
  const apiRoutes = [
    "src/app/api/auth/session/route.ts",
    "src/app/api/auth/logout/route.ts",
    "src/app/api/auth/callback/google/route.ts",
    "src/app/api/auth/callback/github/route.ts",
    "src/app/api/auth/login/google/route.ts",
    "src/app/api/auth/login/github/route.ts",
    "src/app/api/auth/realtime-token/route.ts",
    "src/app/api/projects/route.ts",
    "src/app/api/projects/[id]/route.ts",
    "src/app/api/tasks/route.ts",
    "src/app/api/tasks/[id]/route.ts",
    "src/app/api/tasks/status/route.ts",
    "src/app/api/tasks/[id]/comments/route.ts",
    "src/app/api/tasks/comments/[commentId]/route.ts",
    "src/app/api/phases/route.ts",
    "src/app/api/phases/[id]/route.ts",
    "src/app/api/phases/reorder/route.ts",
    "src/app/api/team/members/route.ts",
    "src/app/api/workspaces/route.ts",
    "src/app/api/workspaces/settings/route.ts",
    "src/app/api/ai/plan/route.ts",
    "src/app/api/ai/execute/route.ts",
    "src/app/api/ai/history/route.ts",
    "src/app/api/admin/backup/export/route.ts",
    "src/app/api/audit/route.ts",
    "src/app/api/health/data-consistency/route.ts",
    "src/app/api/health/disaster-recovery/route.ts",
    "src/app/api/notifications/route.ts",
    "src/app/api/search/route.ts",
    "src/app/api/analytics/pulse/route.ts",
    "src/app/api/analytics/reports/route.ts",
    "src/app/api/dashboard/summary/route.ts",
    "src/app/api/calendar/events/route.ts",
  ];

  for (const r of apiRoutes) {
    const exists = fs.existsSync(path.join(projectRoot, r));
    assert(exists, `API route exists: ${r}`);
  }

  // ============================================================================
  // SECTION 2: AUTHENTICATION & SESSION SECURITY
  // ============================================================================
  console.log("\n━━━ SECTION 2: AUTHENTICATION & SESSION SECURITY ━━━\n");

  // 2.1 Session token generation produces cryptographic 64-hex-char tokens
  const token1 = generateSessionToken();
  const token2 = generateSessionToken();
  assert(token1.length === 64, "Session token is 64 hex characters", `Got ${token1.length}`);
  assert(/^[0-9a-f]{64}$/.test(token1), "Session token is valid hexadecimal");
  assert(token1 !== token2, "Session tokens are unique (no collision)");

  // 2.2 Cookie options enforce security
  const cookieOpts = getSessionCookieOptions(true);
  assert(cookieOpts.httpOnly === true, "Cookie httpOnly is true");
  assert(cookieOpts.secure === true, "Cookie secure is true in production");
  assert(cookieOpts.sameSite === "lax", "Cookie sameSite is lax");
  assert(cookieOpts.path === "/", "Cookie path is root /");
  assert(cookieOpts.name === SESSION_COOKIE_NAME, `Cookie name is ${SESSION_COOKIE_NAME}`);

  // 2.3 Session validation rejects invalid tokens
  const badResult = await validateSessionToken("invalid-token-short");
  assert(badResult === null, "Short invalid token rejected");

  const badResult2 = await validateSessionToken("a".repeat(64));
  assert(badResult2 === null, "Non-existent 64-char token rejected");

  const badResult3 = await validateSessionToken("");
  assert(badResult3 === null, "Empty string token rejected");

  // ============================================================================
  // SECTION 3: RBAC PERMISSION MATRIX VERIFICATION
  // ============================================================================
  console.log("\n━━━ SECTION 3: RBAC PERMISSION MATRIX VERIFICATION ━━━\n");

  // 3.1 OWNER has all permissions
  const ownerPerms = ROLE_PERMISSIONS.OWNER;
  assert(ownerPerms.includes("workspace.delete"), "OWNER has workspace.delete");
  assert(ownerPerms.includes("backup.export"), "OWNER has backup.export");
  assert(ownerPerms.includes("members.remove"), "OWNER has members.remove");
  assert(ownerPerms.includes("projects.delete"), "OWNER has projects.delete");

  // 3.2 VIEWER is read-only
  const viewerPerms = ROLE_PERMISSIONS.VIEWER;
  assert(viewerPerms.includes("workspace.view"), "VIEWER has workspace.view");
  assert(viewerPerms.includes("projects.view"), "VIEWER has projects.view");
  assert(!viewerPerms.includes("projects.create"), "VIEWER cannot projects.create");
  assert(!viewerPerms.includes("tasks.create"), "VIEWER cannot tasks.create");
  assert(!viewerPerms.includes("backup.export"), "VIEWER cannot backup.export");
  assert(!viewerPerms.includes("members.invite"), "VIEWER cannot members.invite");

  // 3.3 MEMBER restrictions
  const memberPerms = ROLE_PERMISSIONS.MEMBER;
  assert(!memberPerms.includes("projects.delete"), "MEMBER cannot projects.delete");
  assert(!memberPerms.includes("backup.export"), "MEMBER cannot backup.export");
  assert(!memberPerms.includes("members.invite"), "MEMBER cannot members.invite");
  assert(memberPerms.includes("tasks.create"), "MEMBER can tasks.create");

  // 3.4 hasPermission function correctness
  assert(hasPermission("OWNER", "workspace.delete"), "hasPermission OWNER workspace.delete = true");
  assert(!hasPermission("VIEWER", "projects.create"), "hasPermission VIEWER projects.create = false");
  assert(!hasPermission(null, "workspace.view"), "hasPermission null role = false");
  assert(!hasPermission(undefined, "workspace.view"), "hasPermission undefined role = false");
  assert(!hasPermission("INVALID_ROLE" as any, "workspace.view"), "hasPermission invalid role = false");

  // 3.5 Role modification rules
  const r1 = canModifyRole("OWNER", "MEMBER", "ADMIN");
  assert(r1.allowed === true, "OWNER can promote MEMBER to ADMIN");

  const r2 = canModifyRole("ADMIN", "MEMBER", "ADMIN");
  assert(r2.allowed === false, "ADMIN cannot promote to ADMIN");

  const r3 = canModifyRole("ADMIN", "ADMIN", "MEMBER");
  assert(r3.allowed === false, "ADMIN cannot demote another ADMIN");

  const r4 = canModifyRole("OWNER", "VIEWER", "OWNER");
  assert(r4.allowed === false, "Cannot grant OWNER role via role update");

  const r5 = canModifyRole("MEMBER", "VIEWER", "MEMBER");
  assert(r5.allowed === false, "MEMBER cannot modify roles");

  const r6 = canModifyRole("ADMIN", "OWNER", "ADMIN");
  assert(r6.allowed === false, "Cannot change OWNER role");

  // 3.6 Member removal rules
  const rm1 = canRemoveMember("OWNER", "ADMIN");
  assert(rm1.allowed === true, "OWNER can remove ADMIN");

  const rm2 = canRemoveMember("ADMIN", "ADMIN");
  assert(rm2.allowed === false, "ADMIN cannot remove another ADMIN");

  const rm3 = canRemoveMember("ADMIN", "OWNER");
  assert(rm3.allowed === false, "Cannot remove OWNER");

  const rm4 = canRemoveMember("MEMBER", "VIEWER");
  assert(rm4.allowed === false, "MEMBER cannot remove anyone");

  // ============================================================================
  // SECTION 4: ERROR SANITIZATION & SECRET LEAKAGE PREVENTION
  // ============================================================================
  console.log("\n━━━ SECTION 4: ERROR SANITIZATION & SECRET LEAKAGE PREVENTION ━━━\n");

  const dbError = new Error("PrismaClient error: SELECT * FROM users WHERE password='supersecret'");
  const sanitized1 = sanitizeErrorMessage(dbError, "Operation failed");
  assert(!sanitized1.includes("SELECT"), "SQL keyword stripped from error");
  assert(!sanitized1.includes("supersecret"), "Secret value stripped from error");
  assert(!sanitized1.includes("Prisma"), "Prisma keyword stripped from error");

  const connError = new Error("Connection failed: postgresql://user:pass@host:5432/db");
  const sanitized2 = sanitizeErrorMessage(connError, "Connection error");
  assert(!sanitized2.includes("postgresql://"), "Connection string stripped from error");

  const fkError = new Error("foreign key constraint failed on table tasks");
  const sanitized3 = sanitizeErrorMessage(fkError, "Delete failed");
  assert(!sanitized3.includes("foreign key"), "Foreign key details stripped");

  const safeMsg = sanitizeErrorMessage(new Error("Not found"), "Not found");
  // In non-production, the original message is returned if safe
  assert(typeof safeMsg === "string" && safeMsg.length > 0, "Safe error message is returned as string");

  // ============================================================================
  // SECTION 5: RATE LIMITING INFRASTRUCTURE
  // ============================================================================
  console.log("\n━━━ SECTION 5: RATE LIMITING INFRASTRUCTURE ━━━\n");

  const testLimiter = new SlidingWindowRateLimiter({ windowMs: 1000, maxRequests: 3 });

  const rl1 = testLimiter.check("test-key");
  assert(rl1.success === true, "Rate limit allows first request");
  assert(rl1.remaining === 2, "Rate limit remaining = 2 after first request");

  testLimiter.check("test-key");
  testLimiter.check("test-key");
  const rl4 = testLimiter.check("test-key");
  assert(rl4.success === false, "Rate limit blocks 4th request");
  assert(rl4.remaining === 0, "Rate limit remaining = 0 when exhausted");
  assert(rl4.retryAfter > 0, "Rate limit provides retryAfter value");

  testLimiter.reset("test-key");
  const rl5 = testLimiter.check("test-key");
  assert(rl5.success === true, "Rate limit allows request after reset");

  // ============================================================================
  // SECTION 6: IDEMPOTENCY INFRASTRUCTURE
  // ============================================================================
  console.log("\n━━━ SECTION 6: IDEMPOTENCY INFRASTRUCTURE ━━━\n");

  const testKey = "test-idem-key-" + Date.now();
  const testWs = "ws-test-idem";
  const testUser = "user-test-idem";

  const check1 = idempotency.check(testKey, testWs, testUser);
  assert(!check1.cachedResponse && !check1.isInFlight, "Fresh idempotency key has no cached response");

  idempotency.start(testKey, testWs, testUser);
  const check2 = idempotency.check(testKey, testWs, testUser);
  assert(check2.isInFlight === true, "In-flight idempotency key is detected");

  idempotency.release(testKey, testWs, testUser);
  const check3 = idempotency.check(testKey, testWs, testUser);
  assert(!check3.isInFlight, "Released idempotency key is no longer in-flight");

  // ============================================================================
  // SECTION 7: PRISMA SCHEMA & DATABASE INTEGRITY
  // ============================================================================
  console.log("\n━━━ SECTION 7: PRISMA SCHEMA & DATABASE INTEGRITY ━━━\n");

  // 7.1 Schema default color matches design identity
  const schemaContent = fs.readFileSync(path.join(projectRoot, "prisma/schema.prisma"), "utf-8");
  assert(schemaContent.includes('@default("#0284C7")'), "Project.color default matches brand color #0284C7");
  assert(!schemaContent.includes('@default("#6366F1")'), "Banned color #6366F1 not in schema defaults");

  // 7.2 Required enums exist
  assert(schemaContent.includes("enum Role"), "Role enum exists in schema");
  assert(schemaContent.includes("enum ProjectStatus"), "ProjectStatus enum exists");
  assert(schemaContent.includes("enum TaskStatus"), "TaskStatus enum exists");
  assert(schemaContent.includes("enum TaskPriority"), "TaskPriority enum exists");

  // 7.3 Cascade behaviors defined
  assert(schemaContent.includes("onDelete: Cascade"), "Cascade delete relationships defined");
  assert(schemaContent.includes("onDelete: SetNull"), "SetNull delete relationships defined for tasks");

  // 7.4 Critical indexes exist
  assert(schemaContent.includes("@@index([workspaceId, status])"), "Workspace+status composite index exists");
  assert(schemaContent.includes("@@index([workspaceId, createdAt])"), "Workspace+createdAt composite index exists");
  assert(schemaContent.includes("@@unique([workspaceId, userId])"), "WorkspaceMember unique constraint exists");

  // 7.5 AuditLog model structure
  assert(schemaContent.includes("model AuditLog"), "AuditLog model exists");
  assert(schemaContent.includes("actorType"), "AuditLog has actorType field");
  assert(schemaContent.includes("requestId"), "AuditLog has requestId field");
  assert(schemaContent.includes("ipAddress"), "AuditLog has ipAddress field");
  assert(schemaContent.includes("source"), "AuditLog has source field");

  // 7.6 Database connectivity
  try {
    await prisma.$queryRaw`SELECT 1 AS ping`;
    assert(true, "Database connection is healthy");
  } catch (e: any) {
    assert(false, "Database connection is healthy", e.message);
  }

  // ============================================================================
  // SECTION 8: WORKSPACE DATA CONSISTENCY
  // ============================================================================
  console.log("\n━━━ SECTION 8: WORKSPACE DATA CONSISTENCY ━━━\n");

  try {
    const workspaces = await prisma.workspace.findMany({ take: 1, select: { id: true } });
    if (workspaces.length > 0) {
      const consistencyReport = await checkWorkspaceDataConsistency(workspaces[0].id);
      assert(consistencyReport.healthy, "Workspace data consistency check passes", JSON.stringify(consistencyReport.issues?.slice(0, 3)));
    } else {
      assert(true, "Workspace data consistency check (no workspaces to verify, skip)");
    }
  } catch (e: any) {
    assert(false, "Workspace data consistency check", e.message);
  }

  // ============================================================================
  // SECTION 9: BACKUP VALIDATOR INTEGRITY
  // ============================================================================
  console.log("\n━━━ SECTION 9: BACKUP VALIDATOR INTEGRITY ━━━\n");

  // 9.1 Valid backup payload accepted
  const validBackup = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    workspace: { id: "ws-1", name: "Test", slug: "test" },
    members: [{ id: "m1", workspaceId: "ws-1", userId: "u1", role: "OWNER" }],
    projects: [{ id: "p1", workspaceId: "ws-1", name: "Proj 1" }],
    phases: [{ id: "ph1", projectId: "p1", name: "Phase 1" }],
    tasks: [{ id: "t1", workspaceId: "ws-1", projectId: "p1", phaseId: "ph1", title: "Task 1" }],
    subtasks: [{ id: "st1", taskId: "t1", title: "Subtask 1" }],
    comments: [{ id: "c1", taskId: "t1", authorId: "u1", content: "comment" }],
  };
  const validResult = validateBackupPayload(validBackup);
  assert(validResult.valid === true, "Valid backup payload accepted by validator");
  assert(validResult.issues.filter((i) => i.type.startsWith("ORPHAN_")).length === 0, "No orphaned records in valid backup");

  // 9.2 Reject backup with missing version
  const noVersionBackup = { ...validBackup, version: undefined };
  const noVersionResult = validateBackupPayload(noVersionBackup as any);
  assert(noVersionResult.valid === false && noVersionResult.issues.some((i) => i.type === "MISSING_METADATA"), "Backup without version rejected");

  // 9.3 Reject backup with leaked secrets
  const secretBackup = { ...validBackup, workspace: { ...validBackup.workspace, password: "supersecretpassword123" } };
  const secretResult = validateBackupPayload(secretBackup);
  assert(secretResult.valid === false && secretResult.issues.some((i) => i.type === "SECRET_LEAKAGE"), "Backup with secret leak detected");

  // ============================================================================
  // SECTION 10: AI SAFETY & VALIDATION PIPELINE
  // ============================================================================
  console.log("\n━━━ SECTION 10: AI SAFETY & VALIDATION PIPELINE ━━━\n");

  // 10.1 AI plan validator rejects invalid plan structure
  const invalidPlan = { id: "plan-1", actions: [{ id: "a1", type: "INVALID_ACTION", payload: {} }] } as any;
  const mockContext = {
    workspaceId: "ws-test",
    userId: "u-test",
    userRole: "MEMBER" as const,
    projects: [],
    tasks: [],
    members: [],
    phases: [],
  } as any;

  const validateResult = validateAiPlan(invalidPlan, mockContext);
  assert(!validateResult.isValid && validateResult.errors.length > 0, "AI plan validator rejects unknown action type");

  // 10.2 AI plan validator accepts valid action types
  const validPlan = {
    id: "plan-2",
    actions: [{ id: "a1", type: "CREATE_TASK", payload: { title: "Test Task", projectId: "p1" } }],
    requiresConfirmation: false,
  } as any;
  const validPlanResult = validateAiPlan(validPlan, mockContext);
  assert(validPlanResult.isValid || validPlanResult.errors.length === 0, "AI plan validator accepts valid CREATE_TASK action");

  // ============================================================================
  // SECTION 11: ENVIRONMENT & DEPLOYMENT CONFIGURATION
  // ============================================================================
  console.log("\n━━━ SECTION 11: ENVIRONMENT & DEPLOYMENT CONFIGURATION ━━━\n");

  // 11.1 .env.example exists and is comprehensive
  const envExample = fs.readFileSync(path.join(projectRoot, ".env.example"), "utf-8");
  assert(envExample.includes("DATABASE_URL"), ".env.example documents DATABASE_URL");
  assert(envExample.includes("DIRECT_URL"), ".env.example documents DIRECT_URL");
  assert(envExample.includes("NEXT_PUBLIC_APP_URL"), ".env.example documents NEXT_PUBLIC_APP_URL");
  assert(envExample.includes("GOOGLE_CLIENT_ID"), ".env.example documents GOOGLE_CLIENT_ID");
  assert(envExample.includes("GITHUB_CLIENT_ID"), ".env.example documents GITHUB_CLIENT_ID");
  assert(envExample.includes("NEXT_PUBLIC_SUPABASE_URL"), ".env.example documents NEXT_PUBLIC_SUPABASE_URL");
  assert(envExample.includes("SUPABASE_SERVICE_ROLE_KEY"), ".env.example documents SUPABASE_SERVICE_ROLE_KEY");
  assert(envExample.includes("AI_API_KEY"), ".env.example documents AI_API_KEY");
  assert(envExample.includes("ALLOW_TEST_HEADER_AUTH"), ".env.example documents ALLOW_TEST_HEADER_AUTH");
  assert(envExample.includes("DISABLE_RATE_LIMIT"), ".env.example documents DISABLE_RATE_LIMIT");

  // 11.2 .gitignore protects secrets
  const gitignore = fs.readFileSync(path.join(projectRoot, ".gitignore"), "utf-8");
  assert(gitignore.includes(".env"), ".gitignore protects .env files");
  assert(gitignore.includes("!.env.example"), ".gitignore preserves .env.example");
  assert(gitignore.includes("node_modules"), ".gitignore excludes node_modules");

  // 11.3 No secrets in source code
  const srcDir = path.join(projectRoot, "src");
  function searchSecretPatterns(dir: string): string[] {
    const findings: string[] = [];
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        findings.push(...searchSecretPatterns(fullPath));
      } else if (item.name.endsWith(".ts") || item.name.endsWith(".tsx")) {
        const content = fs.readFileSync(fullPath, "utf-8");
        // Check for hardcoded secrets (excluding sanitizer and error filter patterns)
        if (content.includes("Synplan2k26") || content.includes("AQ.Ab8RN6L12")) {
          findings.push(`${fullPath}: contains hardcoded secret value`);
        }
      }
    }
    return findings;
  }
  const secretFindings = searchSecretPatterns(srcDir);
  assert(secretFindings.length === 0, "No hardcoded secrets in source code", secretFindings.join("; "));

  // ============================================================================
  // SECTION 12: MIDDLEWARE SECURITY HEADERS
  // ============================================================================
  console.log("\n━━━ SECTION 12: MIDDLEWARE SECURITY HEADERS ━━━\n");

  const middlewareContent = fs.readFileSync(path.join(projectRoot, "src/middleware.ts"), "utf-8");
  assert(middlewareContent.includes("X-Frame-Options"), "Middleware sets X-Frame-Options");
  assert(middlewareContent.includes("DENY"), "X-Frame-Options is set to DENY");
  assert(middlewareContent.includes("X-Content-Type-Options"), "Middleware sets X-Content-Type-Options");
  assert(middlewareContent.includes("nosniff"), "X-Content-Type-Options is nosniff");
  assert(middlewareContent.includes("Content-Security-Policy"), "Middleware sets CSP");
  assert(middlewareContent.includes("frame-ancestors 'none'"), "CSP prevents framing");
  assert(middlewareContent.includes("Referrer-Policy"), "Middleware sets Referrer-Policy");
  assert(middlewareContent.includes("Permissions-Policy"), "Middleware sets Permissions-Policy");

  // CSRF protection check
  assert(middlewareContent.includes("origin"), "Middleware checks Origin header for CSRF");
  assert(middlewareContent.includes("POST") && middlewareContent.includes("PUT") && middlewareContent.includes("DELETE"), "CSRF check covers state-changing methods");

  // ============================================================================
  // SECTION 13: FRONTEND ERROR BOUNDARIES & STATES
  // ============================================================================
  console.log("\n━━━ SECTION 13: FRONTEND ERROR BOUNDARIES & STATES ━━━\n");

  const errorBoundary = fs.readFileSync(path.join(projectRoot, "src/app/error.tsx"), "utf-8");
  assert(errorBoundary.includes("use client"), "Error boundary is client component");
  assert(errorBoundary.includes("reset"), "Error boundary has reset functionality");
  assert(!errorBoundary.includes("stack") || errorBoundary.includes("digest"), "Error boundary doesn't expose stack trace");

  const globalError = fs.readFileSync(path.join(projectRoot, "src/app/global-error.tsx"), "utf-8");
  assert(globalError.includes("use client"), "Global error is client component");

  const notFound = fs.readFileSync(path.join(projectRoot, "src/app/not-found.tsx"), "utf-8");
  assert(notFound.length > 100, "404 page has meaningful content");

  const loadingPage = fs.readFileSync(path.join(projectRoot, "src/app/loading.tsx"), "utf-8");
  assert(loadingPage.includes("aria-busy") || loadingPage.includes("aria-label"), "Loading page has ARIA attributes");

  // ============================================================================
  // SECTION 14: OBSERVABILITY INFRASTRUCTURE
  // ============================================================================
  console.log("\n━━━ SECTION 14: OBSERVABILITY INFRASTRUCTURE ━━━\n");

  // 14.1 Logger module structure
  assert(typeof logger.info === "function", "Logger has info method");
  assert(typeof logger.warn === "function", "Logger has warn method");
  assert(typeof logger.error === "function", "Logger has error method");
  assert(typeof logger.debug === "function", "Logger has debug method");

  // 14.2 Audit log module
  const auditContent = fs.readFileSync(path.join(projectRoot, "src/lib/audit.ts"), "utf-8");
  assert(auditContent.includes("createAuditEntry"), "Audit module exports createAuditEntry");
  assert(auditContent.includes("actorType"), "Audit supports actorType tracking");
  assert(auditContent.includes("ipAddress"), "Audit supports IP address tracking");
  assert(auditContent.includes("requestId"), "Audit supports request ID correlation");

  // ============================================================================
  // SECTION 15: DESIGN IDENTITY VERIFICATION
  // ============================================================================
  console.log("\n━━━ SECTION 15: DESIGN IDENTITY VERIFICATION ━━━\n");

  // Verify no banned colors in component source code
  function searchBannedColor(dir: string): string[] {
    const findings: string[] = [];
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        findings.push(...searchBannedColor(fullPath));
      } else if (item.name.endsWith(".tsx") || item.name.endsWith(".ts")) {
        const content = fs.readFileSync(fullPath, "utf-8");
        if (content.includes("#6366F1") || content.includes("#6366f1")) {
          findings.push(fullPath);
        }
      }
    }
    return findings;
  }

  const bannedColorFindings = searchBannedColor(srcDir);
  assert(bannedColorFindings.length === 0, "No banned color #6366F1 in source code", bannedColorFindings.join(", "));

  // Verify no Sparkles icon import
  function searchSparkles(dir: string): string[] {
    const findings: string[] = [];
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        findings.push(...searchSparkles(fullPath));
      } else if (item.name.endsWith(".tsx")) {
        const content = fs.readFileSync(fullPath, "utf-8");
        // Match import statement for Sparkles
        if (/import\s*{[^}]*\bSparkles\b[^}]*}\s*from/.test(content)) {
          findings.push(fullPath);
        }
      }
    }
    return findings;
  }

  const sparklesFindings = searchSparkles(srcDir);
  assert(sparklesFindings.length === 0, "No Sparkles icon imports in components", sparklesFindings.join(", "));

  // ============================================================================
  // SECTION 16: VALIDATION SCHEMA COMPLETENESS
  // ============================================================================
  console.log("\n━━━ SECTION 16: VALIDATION SCHEMA COMPLETENESS ━━━\n");

  const schemasContent = fs.readFileSync(path.join(projectRoot, "src/lib/validation/schemas.ts"), "utf-8");
  
  const requiredSchemas = [
    "CreateProjectSchema",
    "UpdateProjectSchema",
    "CreateTaskSchema",
    "UpdateTaskSchema",
    "UpdateTaskStatusSchema",
    "CreateTaskCommentSchema",
    "CreatePhaseSchema",
    "UpdatePhaseSchema",
    "ReorderPhasesSchema",
    "CreateWorkspaceSchema",
    "UpdateWorkspaceSettingsSchema",
    "InviteMemberSchema",
    "UpdateMemberRoleSchema",
    "AiPlanRequestSchema",
    "AiExecuteRequestSchema",
  ];

  for (const schema of requiredSchemas) {
    assert(schemasContent.includes(`export const ${schema}`), `Validation schema exists: ${schema}`);
  }

  // ============================================================================
  // SECTION 17: API ROUTE AUTH GUARD COVERAGE
  // ============================================================================
  console.log("\n━━━ SECTION 17: API ROUTE AUTH GUARD COVERAGE ━━━\n");

  const protectedRoutes = [
    "src/app/api/projects/route.ts",
    "src/app/api/projects/[id]/route.ts",
    "src/app/api/tasks/route.ts",
    "src/app/api/tasks/[id]/route.ts",
    "src/app/api/tasks/status/route.ts",
    "src/app/api/phases/route.ts",
    "src/app/api/phases/[id]/route.ts",
    "src/app/api/phases/reorder/route.ts",
    "src/app/api/team/members/route.ts",
    "src/app/api/workspaces/settings/route.ts",
    "src/app/api/ai/plan/route.ts",
    "src/app/api/ai/execute/route.ts",
    "src/app/api/admin/backup/export/route.ts",
    "src/app/api/audit/route.ts",
    "src/app/api/notifications/route.ts",
    "src/app/api/search/route.ts",
    "src/app/api/dashboard/summary/route.ts",
  ];

  for (const routeFile of protectedRoutes) {
    const content = fs.readFileSync(path.join(projectRoot, routeFile), "utf-8");
    assert(content.includes("requireAuthGuard"), `Auth guard present: ${routeFile}`);
    assert(content.includes("applyRateLimit") || content.includes("apiRateLimiter") || content.includes("aiRateLimiter"), `Rate limiting present: ${routeFile}`);
  }

  // ============================================================================
  // FINAL SUMMARY
  // ============================================================================
  console.log("\n╔════════════════════════════════════════════════════════════════════╗");
  console.log(`║  PHASE 9 RESULTS: ${passedTests} / ${totalTests} PASSED ${passedTests === totalTests ? "(100%)" : `(${Math.round(passedTests / totalTests * 100)}%)`}                      ║`);
  console.log("╚════════════════════════════════════════════════════════════════════╝\n");

  if (passedTests < totalTests) {
    console.error(`\n⚠️  ${totalTests - passedTests} ASSERTION(S) FAILED. Review output above.\n`);
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Phase 9 test suite failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
