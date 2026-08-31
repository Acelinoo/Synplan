/**
 * SYNPLAN — PHASE 1: SECURITY & PRODUCTION FOUNDATION TEST SUITE
 *
 * Automated Regression & Security Assertions:
 * 1. Route Protection & Middleware Security Headers (CSP, Frame-Options, XSS)
 * 2. Server-Authoritative Identity (Header impersonation rejection)
 * 3. Cross-Workspace Tenant Boundary Guard (403 Forbidden)
 * 4. Zod Schema Validation & Malformed Input Rejection (400 Bad Request)
 * 5. Rate Limiting Engine (429 Too Many Requests on threshold)
 * 6. IP Tracking in AuthContext & Audit Logging
 * 7. Error Sanitization (No sensitive database leak in production)
 *
 * Run: npx tsx scripts/test-phase1-security.ts
 */

import { NextRequest } from "next/server";
import { middleware } from "../src/middleware";
import { requireAuthGuard } from "../src/lib/authGuard";
import { createSession } from "../src/lib/auth/session";
import { prisma } from "../src/lib/prisma";
import { Role } from "@prisma/client";
import { SlidingWindowRateLimiter, getClientIp, applyRateLimit } from "../src/lib/rateLimit";
import { validateRequestBody } from "../src/lib/validation/apiValidator";
import {
  CreateProjectSchema,
  CreateTaskSchema,
  InviteMemberSchema,
  UpdateWorkspaceSettingsSchema,
  ReorderPhasesSchema,
} from "../src/lib/validation/schemas";
import { createApiErrorResponse } from "../src/lib/apiErrors";

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

async function runSecurityTestSuite() {
  console.log("======================================================================");
  console.log("SYNPLAN — PHASE 1: SECURITY & PRODUCTION FOUNDATION AUDIT VERIFICATION");
  console.log("======================================================================");

  // --------------------------------------------------------------------------
  // SECTION 1: ROUTE PROTECTION & SECURITY HEADERS (MIDDLEWARE)
  // --------------------------------------------------------------------------
  section("1. Route Protection & Security Headers (Middleware)");
  {
    // Test 1.1: Unauthenticated request to / -> Redirects to /login
    const reqRootUnauth = new NextRequest("http://localhost:3000/");
    const resRootUnauth = middleware(reqRootUnauth);
    assert(
      resRootUnauth.status === 307 && resRootUnauth.headers.get("location") === "http://localhost:3000/login",
      "Unauthenticated request to / redirects to /login (307)"
    );

    // Test 1.2: Unauthenticated request to /projects -> Redirects to /login?returnTo=%2Fprojects
    const reqProjUnauth = new NextRequest("http://localhost:3000/projects");
    const resProjUnauth = middleware(reqProjUnauth);
    assert(
      resProjUnauth.status === 307 &&
        resProjUnauth.headers.get("location") === "http://localhost:3000/login?returnTo=%2Fprojects",
      "Unauthenticated request to /projects preserves returnTo in redirect"
    );

    // Test 1.3: Unauthenticated request to public /login -> Allowed
    const reqLoginUnauth = new NextRequest("http://localhost:3000/login");
    const resLoginUnauth = middleware(reqLoginUnauth);
    assert(
      resLoginUnauth.status === 200,
      "Unauthenticated request to /login is allowed (200)"
    );

    // Test 1.4: Authenticated user visiting /login -> Redirects to /
    const reqLoginAuth = new NextRequest("http://localhost:3000/login", {
      headers: {
        cookie: "synplan_session_token=mock_session_token_1234567890abcdef",
      },
    });
    const resLoginAuth = middleware(reqLoginAuth);
    assert(
      resLoginAuth.status === 307 && resLoginAuth.headers.get("location") === "http://localhost:3000/",
      "Authenticated user visiting /login is redirected to /"
    );

    // Test 1.5: Security Headers Verification
    const headers = resLoginUnauth.headers;
    assert(headers.get("X-Frame-Options") === "DENY", "X-Frame-Options header is DENY");
    assert(headers.get("X-Content-Type-Options") === "nosniff", "X-Content-Type-Options header is nosniff");
    assert(headers.get("X-XSS-Protection") === "1; mode=block", "X-XSS-Protection header is active");
    assert(headers.get("Referrer-Policy") === "strict-origin-when-cross-origin", "Referrer-Policy header is strict-origin-when-cross-origin");
    assert(Boolean(headers.get("Permissions-Policy")?.includes("camera=()")), "Permissions-Policy restricts sensitive APIs");
    assert(Boolean(headers.get("Content-Security-Policy")?.includes("default-src 'self'")), "Content-Security-Policy is configured");
  }

  // --------------------------------------------------------------------------
  // SECTION 2: SERVER-AUTHORITATIVE IDENTITY & TEST BYPASS GATING
  // --------------------------------------------------------------------------
  section("2. Server-Authoritative Identity & Bypass Gating");
  {
    const testUser = await prisma.user.create({
      data: {
        name: "Security Tester",
        email: `sec_test_${Date.now()}@synplan.test`,
        role: Role.MEMBER,
      },
    });

    const testWs = await prisma.workspace.create({
      data: {
        name: "Security Test Workspace",
        slug: `sec-ws-${Date.now()}`,
        ownerId: testUser.id,
        members: {
          create: { userId: testUser.id, role: Role.MEMBER },
        },
      },
    });

    // Test 2.1: Request with NO credentials -> 401 Unauthorized
    const reqNoCreds = new NextRequest("http://localhost:3000/api/projects");
    const resNoCreds = await requireAuthGuard(reqNoCreds, "projects.view", testWs.id);
    assert(
      resNoCreds.errorResponse?.status === 401,
      "Request with no credentials rejected (401 Unauthorized)"
    );

    // Test 2.2: Spoofed user ID header when ALLOW_TEST_HEADER_AUTH is disabled -> 401 Unauthorized
    const prevAllow = process.env.ALLOW_TEST_HEADER_AUTH;
    process.env.ALLOW_TEST_HEADER_AUTH = "false";

    const reqSpoofedHeader = new NextRequest("http://localhost:3000/api/projects", {
      headers: {
        "x-synplan-user-id": testUser.id,
      },
    });
    const resSpoofedHeader = await requireAuthGuard(reqSpoofedHeader, "projects.view", testWs.id);
    assert(
      resSpoofedHeader.errorResponse?.status === 401,
      "Spoofed x-synplan-user-id header rejected when test bypass disabled (401 Unauthorized)"
    );

    process.env.ALLOW_TEST_HEADER_AUTH = prevAllow;

    // Test 2.3: Valid Session Token -> 200 Allowed
    const { sessionToken } = await createSession(testUser.id);
    const reqValidSession = new NextRequest("http://localhost:3000/api/projects", {
      headers: {
        cookie: `synplan_session_token=${sessionToken}`,
      },
    });
    const resValidSession = await requireAuthGuard(reqValidSession, "projects.view", testWs.id);
    assert(
      !resValidSession.errorResponse && resValidSession.auth?.userId === testUser.id,
      "Valid cryptographic session token authenticated successfully"
    );

    // Test 2.4: Cross-Workspace Access (User belongs to Ws A, accessing foreign Ws B) -> 403 Forbidden
    const foreignWs = await prisma.workspace.create({
      data: {
        name: "Foreign Workspace",
        slug: `foreign-ws-${Date.now()}`,
        ownerId: testUser.id,
      },
    });

    const resForeignAccess = await requireAuthGuard(reqValidSession, "projects.view", foreignWs.id);
    assert(
      resForeignAccess.errorResponse?.status === 403,
      "Cross-workspace access attempt blocked (403 Forbidden)"
    );
  }

  // --------------------------------------------------------------------------
  // SECTION 3: ZOD INPUT VALIDATION & MALFORMED PAYLOAD REJECTION
  // --------------------------------------------------------------------------
  section("3. Zod Input Validation & Malformed Payload Rejection");
  {
    // Test 3.1: CreateProjectSchema with empty name -> Rejected
    const emptyNameProjectReq = new NextRequest("http://localhost:3000/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: "" }),
    });
    const valEmptyProj = await validateRequestBody(emptyNameProjectReq, CreateProjectSchema);
    assert(
      valEmptyProj.errorResponse?.status === 400,
      "Project creation with empty name rejected by Zod (400 Bad Request)"
    );

    // Test 3.2: CreateProjectSchema with invalid hex color -> Rejected
    const invalidColorReq = new NextRequest("http://localhost:3000/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: "Valid Name", color: "invalid-color-not-hex" }),
    });
    const valInvalidColor = await validateRequestBody(invalidColorReq, CreateProjectSchema);
    assert(
      valInvalidColor.errorResponse?.status === 400,
      "Project creation with invalid color rejected by Zod (400 Bad Request)"
    );

    // Test 3.3: CreateTaskSchema with invalid status enum -> Rejected
    const invalidStatusTaskReq = new NextRequest("http://localhost:3000/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Valid Task", status: "NOT_A_VALID_STATUS" }),
    });
    const valInvalidTask = await validateRequestBody(invalidStatusTaskReq, CreateTaskSchema);
    assert(
      valInvalidTask.errorResponse?.status === 400,
      "Task creation with invalid status enum rejected by Zod (400 Bad Request)"
    );

    // Test 3.4: Malformed JSON body syntax -> Rejected with clean 400
    const malformedJsonReq = new NextRequest("http://localhost:3000/api/tasks", {
      method: "POST",
      body: "{ invalid_json: missing_quotes ",
    });
    const valMalformed = await validateRequestBody(malformedJsonReq, CreateTaskSchema);
    assert(
      valMalformed.errorResponse?.status === 400,
      "Malformed JSON payload syntax rejected safely without crashing (400 Bad Request)"
    );

    // Test 3.5: InviteMemberSchema with invalid email -> Rejected
    const invalidEmailReq = new NextRequest("http://localhost:3000/api/team/members", {
      method: "POST",
      body: JSON.stringify({ name: "John Doe", email: "not-an-email" }),
    });
    const valInvalidEmail = await validateRequestBody(invalidEmailReq, InviteMemberSchema);
    assert(
      valInvalidEmail.errorResponse?.status === 400,
      "Member invitation with invalid email rejected by Zod (400 Bad Request)"
    );

    // Test 3.6: UpdateWorkspaceSettingsSchema with invalid logo URL -> Rejected
    const invalidUrlReq = new NextRequest("http://localhost:3000/api/workspaces/settings", {
      method: "PUT",
      body: JSON.stringify({ logoUrl: "not-a-valid-url" }),
    });
    const valInvalidUrl = await validateRequestBody(invalidUrlReq, UpdateWorkspaceSettingsSchema);
    assert(
      valInvalidUrl.errorResponse?.status === 400,
      "Workspace settings update with invalid URL rejected by Zod (400 Bad Request)"
    );
  }

  // --------------------------------------------------------------------------
  // SECTION 4: RATE LIMITING ENGINE
  // --------------------------------------------------------------------------
  section("4. Rate Limiting Engine");
  {
    const testLimiter = new SlidingWindowRateLimiter({
      windowMs: 1000,
      maxRequests: 5,
    });
    const testKey = `test_ip_${Date.now()}`;

    // Make 5 allowed requests
    for (let i = 1; i <= 5; i++) {
      const res = testLimiter.check(testKey);
      assert(res.success, `Rate limiter request ${i}/5 allowed (remaining: ${res.remaining})`);
    }

    // 6th request must be rejected with 429
    const blockedRes = testLimiter.check(testKey);
    assert(
      !blockedRes.success && blockedRes.remaining === 0 && blockedRes.retryAfter > 0,
      "Rate limiter 6th request exceeding limit blocked (429 Rate Limit Exceeded)"
    );

    // Reset limiter
    testLimiter.reset(testKey);
    const resetRes = testLimiter.check(testKey);
    assert(
      resetRes.success && resetRes.remaining === 4,
      "Rate limiter reset restores allowed capacity"
    );
  }

  // --------------------------------------------------------------------------
  // SECTION 5: CLIENT IP EXTRACTION & ERROR SANITIZATION
  // --------------------------------------------------------------------------
  section("5. Client IP Extraction & Error Sanitization");
  {
    // Test 5.1: IP extraction from X-Forwarded-For
    const reqWithProxyIp = new NextRequest("http://localhost:3000/api/projects", {
      headers: {
        "x-forwarded-for": "203.0.113.195, 70.41.3.18",
      },
    });
    const ip = getClientIp(reqWithProxyIp);
    assert(ip === "203.0.113.195", "Client IP correctly extracted from X-Forwarded-For header");

    // Test 5.2: Error sanitization prevents database connection string leakage
    const rawDbError = new Error("PrismaClientKnownRequestError: Invalid postgresql://user:secretpass@db.example.com/synplan relation does not exist");
    const prevEnv = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = "production";

    const errorRes = createApiErrorResponse(rawDbError, "Failed to retrieve projects");
    const errorJson = await errorRes.json();

    assert(
      !errorJson.message.includes("secretpass") &&
        !errorJson.message.includes("postgresql://") &&
        !errorJson.message.includes("PrismaClient"),
      "Production error response sanitizes sensitive database connection strings and ORM traces"
    );

    (process.env as any).NODE_ENV = prevEnv;
  }

  // --------------------------------------------------------------------------
  // TEST SUMMARY
  // --------------------------------------------------------------------------
  console.log("\n======================================================================");
  console.log(`PHASE 1 SECURITY TEST SUITE RESULTS: ${passedTests}/${totalTests} PASSED`);
  if (failedTests > 0) {
    console.error(`FAILED TESTS (${failedTests}):`);
    failures.forEach((f) => console.error(f));
  } else {
    console.log("ALL PHASE 1 SECURITY ASSERTIONS PASSED PERFECTLY!");
  }
  console.log("======================================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSecurityTestSuite()
  .catch((err) => {
    console.error("FATAL TEST SUITE ERROR:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
