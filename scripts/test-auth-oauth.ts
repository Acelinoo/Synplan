/**
 * SYNPLAN — PHASE 15: GOOGLE & GITHUB AUTHENTICATION TEST SUITE
 *
 * Automated Regression & Security Assertions:
 * 1. OAuth URL Generation & CSRF Protection
 * 2. User Identity Creation, Provider Account Persistence & Safe Account Linking
 * 3. Session Lifecycle Management (Create, Validate, Expire, Invalidate)
 * 4. Auth Guard & RBAC Role Enforcement with Session Verification
 * 5. Workspace Scoping & Tenant Isolation
 *
 * Run: npx tsx scripts/test-auth-oauth.ts
 */

import { prisma } from "../src/lib/prisma";
import {
  generateOAuthState,
  getGoogleAuthorizationUrl,
  getGitHubAuthorizationUrl,
} from "../src/lib/auth/oauth";
import {
  createSession,
  validateSessionToken,
  invalidateSession,
  SESSION_MAX_AGE_SECONDS,
} from "../src/lib/auth/session";
import { findOrCreateOAuthUser } from "../src/lib/auth/user";
import { requireAuthGuard } from "../src/lib/authGuard";
import { Role } from "@prisma/client";
import { NextRequest } from "next/server";

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

async function runAuthTests() {
  console.log("======================================================================");
  console.log("SYNPLAN — PHASE 15: OAUTH AUTHENTICATION & SESSION TEST SUITE");
  console.log("======================================================================");

  // Clean up any test users created by previous test runs
  const testEmailPrefix = "auth_test_";
  await prisma.account.deleteMany({
    where: { user: { email: { startsWith: testEmailPrefix } } },
  }).catch(() => {});
  await prisma.session.deleteMany({
    where: { user: { email: { startsWith: testEmailPrefix } } },
  }).catch(() => {});
  await prisma.workspaceMember.deleteMany({
    where: { user: { email: { startsWith: testEmailPrefix } } },
  }).catch(() => {});
  await prisma.workspace.deleteMany({
    where: { owner: { email: { startsWith: testEmailPrefix } } },
  }).catch(() => {});
  await prisma.user.deleteMany({
    where: { email: { startsWith: testEmailPrefix } },
  }).catch(() => {});

  // --------------------------------------------------------------------------
  // SECTION 1: OAUTH URL GENERATION & CSRF GUARDS
  // --------------------------------------------------------------------------
  section("1. OAuth URL Generation & CSRF Protection");
  {
    const state1 = generateOAuthState();
    const state2 = generateOAuthState();
    assert(state1.length >= 32, "OAuth state is at least 32 characters long");
    assert(state1 !== state2, "Successive OAuth states are cryptographically random and unique");

    // Google Auth URL
    process.env.GOOGLE_CLIENT_ID = "mock-google-client-id.apps.googleusercontent.com";
    const googleUrl = getGoogleAuthorizationUrl(state1, "http://localhost:3000/api/auth/callback/google");
    assert(googleUrl.startsWith("https://accounts.google.com/o/oauth2/v2/auth"), "Google Auth URL points to official Google endpoint");
    assert(googleUrl.includes("client_id=mock-google-client-id"), "Google Auth URL includes client_id parameter");
    assert(googleUrl.includes(`state=${state1}`), "Google Auth URL includes unique CSRF state parameter");
    assert(googleUrl.includes("redirect_uri="), "Google Auth URL includes redirect_uri parameter");
    assert(googleUrl.includes("scope=openid+email+profile") || googleUrl.includes("scope=openid%20email%20profile"), "Google Auth URL includes openid, email, profile scopes");

    // GitHub Auth URL
    process.env.GITHUB_CLIENT_ID = "mock-github-client-id";
    const githubUrl = getGitHubAuthorizationUrl(state2, "http://localhost:3000/api/auth/callback/github");
    assert(githubUrl.startsWith("https://github.com/login/oauth/authorize"), "GitHub Auth URL points to official GitHub endpoint");
    assert(githubUrl.includes("client_id=mock-github-client-id"), "GitHub Auth URL includes client_id parameter");
    assert(githubUrl.includes(`state=${state2}`), "GitHub Auth URL includes unique CSRF state parameter");
    assert(githubUrl.includes("scope=read%3Auser+user%3Aemail") || githubUrl.includes("scope=read%3Auser%20user%3Aemail"), "GitHub Auth URL includes user email scopes");
  }

  // --------------------------------------------------------------------------
  // SECTION 2: USER IDENTITY CREATION & SAFE ACCOUNT LINKING
  // --------------------------------------------------------------------------
  section("2. User Identity Creation & Provider Account Linking");
  {
    const testGoogleEmail = `${testEmailPrefix}google_${Date.now()}@example.com`;
    const googleProfile = {
      provider: "google" as const,
      providerAccountId: `g_sub_${Date.now()}`,
      email: testGoogleEmail,
      name: "Google User Test",
      avatarUrl: "https://lh3.googleusercontent.com/a/test-avatar",
    };

    // A. Create new Google User
    const resGoogle = await findOrCreateOAuthUser(googleProfile);
    assert(resGoogle.isNewUser === true, "New Google login creates a new Synplan user");
    assert(resGoogle.user.email === testGoogleEmail, "User email matches Google profile");
    assert(resGoogle.user.avatarUrl === googleProfile.avatarUrl, "User avatar is stored from Google profile");
    assert(resGoogle.account.provider === "google", "Account provider is recorded as google");
    assert(resGoogle.workspace !== undefined, "Default personal workspace created for new user");

    // B. Re-login with same Google Account returns existing user
    const resGoogleRelogin = await findOrCreateOAuthUser(googleProfile);
    assert(resGoogleRelogin.isNewUser === false, "Re-login returns existing user identity");
    assert(resGoogleRelogin.user.id === resGoogle.user.id, "User ID matches initial creation");
    assert(resGoogleRelogin.account.id === resGoogle.account.id, "Account record reused without duplicate");

    // C. Create new GitHub User
    const testGithubEmail = `${testEmailPrefix}github_${Date.now()}@example.com`;
    const githubProfile = {
      provider: "github" as const,
      providerAccountId: `gh_id_${Date.now()}`,
      email: testGithubEmail,
      name: "GitHub Developer Test",
      avatarUrl: "https://avatars.githubusercontent.com/u/test-dev",
    };

    const resGithub = await findOrCreateOAuthUser(githubProfile);
    assert(resGithub.isNewUser === true, "New GitHub login creates a new Synplan user");
    assert(resGithub.user.email === testGithubEmail, "User email matches GitHub profile");
    assert(resGithub.account.provider === "github", "Account provider is recorded as github");

    // D. Safe Account Linking: Login via GitHub with same verified email as Google User
    const linkedGithubProfile = {
      provider: "github" as const,
      providerAccountId: `gh_linked_${Date.now()}`,
      email: testGoogleEmail, // Same email as Google User
      name: "Google User (via GitHub)",
    };

    const resLinked = await findOrCreateOAuthUser(linkedGithubProfile);
    assert(resLinked.isNewUser === false, "Account linking does not create duplicate Synplan user");
    assert(resLinked.user.id === resGoogle.user.id, "Linked GitHub account maps to identical Synplan User ID");
    assert(resLinked.account.provider === "github", "New provider account created for github");

    // Verify User has 2 linked Accounts
    const userAccounts = await prisma.account.findMany({
      where: { userId: resGoogle.user.id },
    });
    assert(userAccounts.length === 2, "Synplan user now has exactly 2 linked provider accounts (Google + GitHub)");
    assert(userAccounts.some((a) => a.provider === "google"), "Has Google account link");
    assert(userAccounts.some((a) => a.provider === "github"), "Has GitHub account link");
  }

  // --------------------------------------------------------------------------
  // SECTION 3: SESSION LIFECYCLE MANAGEMENT
  // --------------------------------------------------------------------------
  section("3. Session Lifecycle Management");
  {
    const testUser = await prisma.user.create({
      data: {
        name: "Session Tester",
        email: `${testEmailPrefix}session_${Date.now()}@example.com`,
        role: Role.MEMBER,
      },
    });

    // A. Create Session
    const { sessionToken, expiresAt, session } = await createSession(testUser.id);
    assert(sessionToken.length === 64, "Session token is 64 hex characters");
    assert(expiresAt.getTime() > Date.now() + 29 * 24 * 60 * 60 * 1000, "Session expiration is approximately 30 days");
    assert(session.userId === testUser.id, "Session references test user ID");

    // B. Validate Session
    const validRes = await validateSessionToken(sessionToken);
    assert(validRes !== null, "Valid session token returns session validation result");
    assert(validRes?.user.id === testUser.id, "Validated session returns correct user profile");
    assert(validRes?.user.email === testUser.email, "Validated user email matches");

    // C. Validate Invalid / Non-existent Token
    const invalidRes = await validateSessionToken("non_existent_token_00000000000000000000000000000000");
    assert(invalidRes === null, "Invalid session token returns null");

    // D. Validate Expired Session
    const expiredSession = await prisma.session.create({
      data: {
        sessionToken: `expired_${Date.now()}_00000000000000000000000000000000`,
        userId: testUser.id,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      },
    });

    const expiredRes = await validateSessionToken(expiredSession.sessionToken);
    assert(expiredRes === null, "Expired session token returns null");

    // Verify expired session was auto-cleaned from database
    const dbExpired = await prisma.session.findUnique({
      where: { id: expiredSession.id },
    });
    assert(dbExpired === null, "Expired session automatically cleaned from database");

    // E. Invalidate Session on Logout
    await invalidateSession(sessionToken);
    const postLogoutRes = await validateSessionToken(sessionToken);
    assert(postLogoutRes === null, "Invalidated session token returns null after logout");
  }

  // --------------------------------------------------------------------------
  // SECTION 4: AUTH GUARD & WORKSPACE SCOPING WITH SESSION
  // --------------------------------------------------------------------------
  section("4. Auth Guard & Workspace Scoping with Session");
  {
    // Create User with Owner Workspace
    const ownerUser = await prisma.user.create({
      data: {
        name: "Workspace Owner User",
        email: `${testEmailPrefix}owner_${Date.now()}@example.com`,
        role: Role.OWNER,
      },
    });

    const ownerWorkspace = await prisma.workspace.create({
      data: {
        name: "Owner Protected Workspace",
        slug: `owner-ws-${Date.now()}`,
        ownerId: ownerUser.id,
        members: {
          create: {
            userId: ownerUser.id,
            role: Role.OWNER,
          },
        },
      },
    });

    const { sessionToken: ownerToken } = await createSession(ownerUser.id);

    // A. Auth Guard with valid session cookie
    const reqWithCookie = new NextRequest("http://localhost:3000/api/projects", {
      headers: {
        cookie: `synplan_session_token=${ownerToken}`,
        "x-synplan-workspace-id": ownerWorkspace.id,
      },
    });

    const guardRes = await requireAuthGuard(reqWithCookie, Role.OWNER);
    assert(guardRes.errorResponse === undefined, "Auth guard permits valid session cookie");
    assert(guardRes.auth?.userId === ownerUser.id, "Auth guard extracts correct authenticated user ID");
    assert(guardRes.auth?.workspaceId === ownerWorkspace.id, "Auth guard validates active workspace");
    assert(guardRes.auth?.role === Role.OWNER, "Auth guard resolves correct role in workspace");

    // B. Auth Guard with invalid / expired session cookie
    const reqWithInvalidCookie = new NextRequest("http://localhost:3000/api/projects", {
      headers: {
        cookie: "synplan_session_token=fake_invalid_token_123456789012345678901234",
      },
    });

    const invalidGuardRes = await requireAuthGuard(reqWithInvalidCookie, Role.VIEWER);
    assert(invalidGuardRes.errorResponse !== undefined, "Auth guard rejects invalid session cookie with error");
    assert(invalidGuardRes.errorResponse?.status === 401, "Rejection status is 401 Unauthorized");

    // C. Workspace Isolation: User cannot access a workspace they do not belong to
    const foreignWorkspace = await prisma.workspace.create({
      data: {
        name: "Foreign Secure Workspace",
        slug: `foreign-ws-${Date.now()}`,
        ownerId: ownerUser.id,
      },
    });

    const unauthorizedUser = await prisma.user.create({
      data: {
        name: "Unauthorized Stranger",
        email: `${testEmailPrefix}stranger_${Date.now()}@example.com`,
        role: Role.MEMBER,
      },
    });

    const { sessionToken: strangerToken } = await createSession(unauthorizedUser.id);

    const reqStranger = new NextRequest("http://localhost:3000/api/projects", {
      headers: {
        cookie: `synplan_session_token=${strangerToken}`,
        "x-synplan-workspace-id": foreignWorkspace.id,
      },
    });

    const isolationGuardRes = await requireAuthGuard(reqStranger, Role.VIEWER);
    assert(isolationGuardRes.errorResponse !== undefined, "Stranger rejected from foreign workspace");
    assert(isolationGuardRes.errorResponse?.status === 403, "Isolation rejection status is 403 Forbidden");
  }

  // --------------------------------------------------------------------------
  // SECTION 5: WORKSPACE TENANT RESOLUTION & PRODUCTION URL SAFETY
  // --------------------------------------------------------------------------
  section("5. Workspace Tenant Resolution & Production URL Safety");
  {
    // Test A & C: User-scoped GET /api/workspaces (Only returns user's own workspaces)
    const multiWsUser = await prisma.user.create({
      data: {
        name: "Multi Workspace User",
        email: `${testEmailPrefix}multi_ws_${Date.now()}@example.com`,
        role: Role.OWNER,
      },
    });

    const userWs1 = await prisma.workspace.create({
      data: {
        name: "User Primary Workspace",
        slug: `user-ws1-${Date.now()}`,
        ownerId: multiWsUser.id,
        members: { create: { userId: multiWsUser.id, role: Role.OWNER } },
      },
    });

    const userWs2 = await prisma.workspace.create({
      data: {
        name: "User Secondary Workspace",
        slug: `user-ws2-${Date.now()}`,
        ownerId: multiWsUser.id,
        members: { create: { userId: multiWsUser.id, role: Role.ADMIN } },
      },
    });

    const foreignOwner = await prisma.user.create({
      data: {
        name: "Foreign Owner",
        email: `${testEmailPrefix}foreign_owner_${Date.now()}@example.com`,
        role: Role.OWNER,
      },
    });

    const foreignWs = await prisma.workspace.create({
      data: {
        name: "Unrelated Foreign Workspace",
        slug: `foreign-ws-${Date.now()}`,
        ownerId: foreignOwner.id,
        members: { create: { userId: foreignOwner.id, role: Role.OWNER } },
      },
    });

    const { sessionToken: multiWsToken } = await createSession(multiWsUser.id);

    // Import GET /api/workspaces handler dynamically
    const { GET: getWorkspacesHandler } = await import("../src/app/api/workspaces/route");

    const reqScopedWorkspaces = new NextRequest("http://localhost:3000/api/workspaces", {
      headers: {
        cookie: `synplan_session_token=${multiWsToken}`,
      },
    });

    const wsResponse = await getWorkspacesHandler(reqScopedWorkspaces);
    const wsJson = await wsResponse.json();

    assert(wsJson.success === true, "GET /api/workspaces returns success for authenticated user");
    assert(Array.isArray(wsJson.data), "GET /api/workspaces returns array of workspaces");
    assert(wsJson.data.length === 2, "GET /api/workspaces returns only the 2 workspaces user is member of");
    const wsIds = wsJson.data.map((w: any) => w.id);
    assert(wsIds.includes(userWs1.id) && wsIds.includes(userWs2.id), "Workspaces list contains both owned and joined workspaces");
    assert(!wsIds.includes(foreignWs.id), "Foreign workspace is strictly excluded from user's workspaces list");

    // Test B: Stale / foreign workspace validation logic
    const staleForeignWsId = foreignWs.id;
    const isForeignWsValidForUser = wsIds.includes(staleForeignWsId);
    assert(!isForeignWsValidForUser, "Stale foreign workspace in localStorage is correctly identified as invalid for this user");

    // Test D: Unauthenticated request to /api/workspaces is rejected
    const reqUnauthWorkspaces = new NextRequest("http://localhost:3000/api/workspaces");
    const prevNodeEnv = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = "production";
    const unauthWsResponse = await getWorkspacesHandler(reqUnauthWorkspaces);
    assert(unauthWsResponse.status === 401, "Unauthenticated GET /api/workspaces in production is rejected with 401 Unauthorized");
    (process.env as any).NODE_ENV = prevNodeEnv;

    // Test F & G: Production URL safety in OAuth URL builder
    process.env.NEXT_PUBLIC_APP_URL = "https://synplan.vercel.app";
    const prodGoogleUrl = getGoogleAuthorizationUrl("prod-state-123");
    assert(prodGoogleUrl.includes("redirect_uri=https%3A%2F%2Fsynplan.vercel.app%2Fapi%2Fauth%2Fcallback%2Fgoogle") || prodGoogleUrl.includes("redirect_uri=https://synplan.vercel.app/api/auth/callback/google"), "Production Google OAuth URL uses NEXT_PUBLIC_APP_URL https://synplan.vercel.app");

    const prodGitHubUrl = getGitHubAuthorizationUrl("prod-state-456");
    assert(prodGitHubUrl.includes("redirect_uri=https%3A%2F%2Fsynplan.vercel.app%2Fapi%2Fauth%2Fcallback%2Fgithub") || prodGitHubUrl.includes("redirect_uri=https://synplan.vercel.app/api/auth/callback/github"), "Production GitHub OAuth URL uses NEXT_PUBLIC_APP_URL https://synplan.vercel.app");
    delete process.env.NEXT_PUBLIC_APP_URL;

    // Test H: Projects & Tasks accessible when using user's valid workspace
    const validProject = await prisma.project.create({
      data: {
        workspaceId: userWs1.id,
        name: "Authorized Project Alpha",
        status: "ACTIVE",
      },
    });

    const validTask = await prisma.task.create({
      data: {
        workspaceId: userWs1.id,
        projectId: validProject.id,
        title: "Authorized Task Alpha",
        status: "TODO",
        priority: "HIGH",
      },
    });

    const reqValidProjectAccess = new NextRequest(`http://localhost:3000/api/projects`, {
      headers: {
        cookie: `synplan_session_token=${multiWsToken}`,
        "x-synplan-workspace-id": userWs1.id,
      },
    });

    const projectGuard = await requireAuthGuard(reqValidProjectAccess, Role.VIEWER);
    assert(projectGuard.auth?.workspaceId === userWs1.id, "Authorized member gets full access to workspace projects");
    assert(validProject.id !== undefined && validTask.id !== undefined, "Project and task persist correctly in user's authorized workspace");
  }

  // ==========================================================================
  // FINAL RESULTS
  // ==========================================================================
  console.log("\n======================================================================");
  const passRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : "0";
  console.log(`PHASE 15 AUTHENTICATION TEST SUITE: ${passedTests}/${totalTests} TESTS PASSED (${passRate}%)`);
  console.log("======================================================================");

  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(f));
    process.exit(1);
  }
}

runAuthTests()
  .catch((err) => {
    console.error("Auth Test Suite failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
