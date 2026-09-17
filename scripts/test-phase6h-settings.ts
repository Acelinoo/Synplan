import { prisma } from "../src/lib/prisma";
import { NextRequest } from "next/server";
import { GET as getWorkspaceSettings, PATCH as patchWorkspaceSettings } from "../src/app/api/workspaces/settings/route";
import { GET as getProfile, PATCH as patchProfile } from "../src/app/api/auth/profile/route";
import { createSession } from "../src/lib/auth/session";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`  ✕ [FAIL] ${testName}${detail ? ` -> ${detail}` : ""}`);
    process.exit(1);
  }
}

async function runPhase6hSettingsTests() {
  console.log("===============================================================");
  console.log(" SYNPLAN PHASE 6H: WORKSPACE SETTINGS & CONFIGURATION TESTS");
  console.log(" AUTHORITATIVE PERSISTENCE, RBAC GUARDS, & SECURITY ISOLATION");
  console.log("===============================================================\n");

  const runId = Math.random().toString(36).substring(2, 7);

  // 1. Fixture Setup
  console.log("--- 1. Setting up Isolated Test Workspaces & Users ---");

  const userOwner = await prisma.user.create({
    data: {
      name: `Owner 6H ${runId}`,
      email: `owner-6h-${runId}@synplan.test`,
      role: "OWNER",
    },
  });

  const userViewer = await prisma.user.create({
    data: {
      name: `Viewer 6H ${runId}`,
      email: `viewer-6h-${runId}@synplan.test`,
      role: "VIEWER",
    },
  });

  const userForeign = await prisma.user.create({
    data: {
      name: `Foreign 6H ${runId}`,
      email: `foreign-6h-${runId}@synplan.test`,
      role: "MEMBER",
    },
  });

  const workspaceA = await prisma.workspace.create({
    data: {
      name: `Workspace Alpha ${runId}`,
      slug: `ws-alpha-${runId}`,
      ownerId: userOwner.id,
    },
  });

  const workspaceB = await prisma.workspace.create({
    data: {
      name: `Workspace Beta ${runId}`,
      slug: `ws-beta-${runId}`,
      ownerId: userForeign.id,
    },
  });

  // Assign memberships
  await prisma.workspaceMember.createMany({
    data: [
      { workspaceId: workspaceA.id, userId: userOwner.id, role: "OWNER" },
      { workspaceId: workspaceA.id, userId: userViewer.id, role: "VIEWER" },
      { workspaceId: workspaceB.id, userId: userForeign.id, role: "OWNER" },
    ],
  });

  // Create real database sessions
  const ownerSession = await createSession(userOwner.id);
  const viewerSession = await createSession(userViewer.id);
  const foreignSession = await createSession(userForeign.id);

  console.log(`  ✓ Created test fixtures: Workspace A (${workspaceA.id}), Workspace B (${workspaceB.id})\n`);

  // 2. Workspace Settings Read Verification
  console.log("--- 2. Workspace Settings Read (GET) Verification ---");

  {
    const req = new NextRequest(`http://localhost:3000/api/workspaces/settings?workspaceId=${workspaceA.id}`, {
      method: "GET",
      headers: {
        "x-synplan-session-token": ownerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });

    const res = await getWorkspaceSettings(req);
    assert(res.status === 200, "2.1 GET /api/workspaces/settings returns 200 for authorized member");

    const json = await res.json();
    assert(json.success === true, "2.2 Response envelope indicates success");
    assert(json.data.name === workspaceA.name, "2.3 Correct workspace name returned");
    assert(json.data.slug === workspaceA.slug, "2.4 Correct workspace slug returned");
    assert(json.data.userRole === "OWNER", "2.5 Caller user role returned accurately as OWNER");
  }

  // 3. Authentication Enforcement
  console.log("\n--- 3. Authentication Enforcement Verification ---");

  {
    const unauthReq = new NextRequest(`http://localhost:3000/api/workspaces/settings?workspaceId=${workspaceA.id}`, {
      method: "GET",
    });

    const res = await getWorkspaceSettings(unauthReq);
    assert(res.status === 401, "3.1 Unauthenticated request returns 401 Unauthorized");
  }

  // 4. Authorized Workspace Mutation Verification
  console.log("\n--- 4. Authorized Workspace Mutation (PATCH) Verification ---");

  {
    const newName = `Updated Alpha Core ${runId}`;
    const newSlug = `alpha-updated-${runId}`;
    const newLogo = "https://example.com/alpha-logo.png";

    const req = new NextRequest(`http://localhost:3000/api/workspaces/settings`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-synplan-session-token": ownerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
      body: JSON.stringify({
        workspaceId: workspaceA.id,
        name: newName,
        slug: newSlug,
        logoUrl: newLogo,
      }),
    });

    const res = await patchWorkspaceSettings(req);
    assert(res.status === 200, "4.1 PATCH /api/workspaces/settings by OWNER returns 200");

    const json = await res.json();
    assert(json.success === true, "4.2 Response indicates successful update");
    assert(json.data.name === newName, "4.3 Response contains updated workspace name");
    assert(json.data.slug === newSlug, "4.4 Response contains updated workspace slug");

    // Verify persistence in PostgreSQL
    const inDb = await prisma.workspace.findUnique({ where: { id: workspaceA.id } });
    assert(inDb?.name === newName, "4.5 Workspace name truly persisted in PostgreSQL database");
    assert(inDb?.slug === newSlug, "4.6 Workspace slug truly persisted in PostgreSQL database");
    assert(inDb?.logoUrl === newLogo, "4.7 Workspace logo URL truly persisted in PostgreSQL database");
  }

  // 5. RBAC Permission Enforcement (VIEWER Denied)
  console.log("\n--- 5. RBAC Permission Denial Verification ---");

  {
    const req = new NextRequest(`http://localhost:3000/api/workspaces/settings`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-synplan-session-token": viewerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
      body: JSON.stringify({
        workspaceId: workspaceA.id,
        name: "Malicious Rename by Viewer",
      }),
    });

    const res = await patchWorkspaceSettings(req);
    assert(res.status === 403, "5.1 VIEWER role denied workspace update with 403 Forbidden");

    const inDb = await prisma.workspace.findUnique({ where: { id: workspaceA.id } });
    assert(inDb?.name !== "Malicious Rename by Viewer", "5.2 Database remains unmutated after unauthorized attempt");
  }

  // 6. Cross-Workspace Isolation
  console.log("\n--- 6. Cross-Workspace Isolation Verification ---");

  {
    // Foreign user (Workspace B) attempts to read Workspace A
    const reqGet = new NextRequest(`http://localhost:3000/api/workspaces/settings?workspaceId=${workspaceA.id}`, {
      method: "GET",
      headers: {
        "x-synplan-session-token": foreignSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
    });

    const resGet = await getWorkspaceSettings(reqGet);
    assert(resGet.status === 403, "6.1 Cross-workspace GET returns 403 Forbidden");

    // Foreign user attempts to mutate Workspace A
    const reqPatch = new NextRequest(`http://localhost:3000/api/workspaces/settings`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-synplan-session-token": foreignSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
      body: JSON.stringify({
        workspaceId: workspaceA.id,
        name: "Cross-Tenant Intrusion",
      }),
    });

    const resPatch = await patchWorkspaceSettings(reqPatch);
    assert(resPatch.status === 403, "6.2 Cross-workspace PATCH returns 403 Forbidden");
  }

  // 7. Input Validation & Slug Collision
  console.log("\n--- 7. Input Validation & Slug Collision Verification ---");

  {
    // Invalid slug characters
    const reqInvalid = new NextRequest(`http://localhost:3000/api/workspaces/settings`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-synplan-session-token": ownerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
      body: JSON.stringify({
        workspaceId: workspaceA.id,
        slug: "INVALID SLUG WITH SPACES!",
      }),
    });

    const resInvalid = await patchWorkspaceSettings(reqInvalid);
    assert(resInvalid.status === 400, "7.1 Malformed slug rejected with 400 Bad Request");

    // Slug collision with Workspace B
    const reqCollision = new NextRequest(`http://localhost:3000/api/workspaces/settings`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-synplan-session-token": ownerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
      body: JSON.stringify({
        workspaceId: workspaceA.id,
        slug: workspaceB.slug,
      }),
    });

    const resCollision = await patchWorkspaceSettings(reqCollision);
    assert(resCollision.status === 409, "7.2 Slug collision rejected with 409 Conflict");
  }

  // 8. Audit Log Verification
  console.log("\n--- 8. Audit Log Telemetry Verification ---");

  {
    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        workspaceId: workspaceA.id,
        action: "WORKSPACE_SETTINGS_UPDATE",
      },
      orderBy: { timestamp: "desc" },
    });

    assert(Boolean(auditEntry), "8.1 WORKSPACE_SETTINGS_UPDATE audit log created in database");
    assert(auditEntry?.actorId === userOwner.id, "8.2 Audit entry accurately identifies modifying actor ID");
    assert(auditEntry?.entityType === "WORKSPACE", "8.3 Audit entityType is WORKSPACE");
  }

  // 9. User Profile Verification
  console.log("\n--- 9. Authenticated User Profile (GET & PATCH) Verification ---");

  {
    // GET Profile
    const reqProfileGet = new NextRequest(`http://localhost:3000/api/auth/profile`, {
      method: "GET",
      headers: {
        "x-synplan-session-token": ownerSession.sessionToken,
      },
    });

    const resProfileGet = await getProfile(reqProfileGet);
    assert(resProfileGet.status === 200, "9.1 GET /api/auth/profile returns 200");

    const jsonProfile = await resProfileGet.json();
    assert(jsonProfile.data.email === userOwner.email, "9.2 Profile returns authentic user email");
    assert(Array.isArray(jsonProfile.data.activeSessions), "9.3 Profile returns active sessions array");
    assert(jsonProfile.data.activeSessions[0].tokenSnippet.includes("..."), "9.4 Session tokens are securely masked snippet representation");

    // PATCH Profile
    const updatedUserName = `Alex ${runId} Updated`;
    const updatedAvatar = "https://example.com/new-avatar.png";

    const reqProfilePatch = new NextRequest(`http://localhost:3000/api/auth/profile`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-synplan-session-token": ownerSession.sessionToken,
        "x-synplan-workspace-id": workspaceA.id,
      },
      body: JSON.stringify({
        name: updatedUserName,
        avatarUrl: updatedAvatar,
      }),
    });

    const resProfilePatch = await patchProfile(reqProfilePatch);
    assert(resProfilePatch.status === 200, "9.5 PATCH /api/auth/profile returns 200");

    const userInDb = await prisma.user.findUnique({ where: { id: userOwner.id } });
    assert(userInDb?.name === updatedUserName, "9.6 Updated user name persisted in PostgreSQL");
    assert(userInDb?.avatarUrl === updatedAvatar, "9.7 Updated avatar URL persisted in PostgreSQL");
    assert(userInDb?.email === userOwner.email, "9.8 User email remains immutable and unchanged");
  }

  // 10. Clean up Test Fixtures
  console.log("\n--- 10. Cleaning up Test Fixtures ---");

  await prisma.auditLog.deleteMany({
    where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } },
  });

  await prisma.session.deleteMany({
    where: { userId: { in: [userOwner.id, userViewer.id, userForeign.id] } },
  });

  await prisma.workspaceMember.deleteMany({
    where: { workspaceId: { in: [workspaceA.id, workspaceB.id] } },
  });

  await prisma.workspace.deleteMany({
    where: { id: { in: [workspaceA.id, workspaceB.id] } },
  });

  await prisma.user.deleteMany({
    where: { id: { in: [userOwner.id, userViewer.id, userForeign.id] } },
  });

  console.log("  ✓ Test fixtures cleaned up successfully\n");

  console.log("===============================================================");
  console.log(` PHASE 6H VERIFICATION COMPLETE: ${passed} / ${passed + failed} PASS`);
  console.log("===============================================================\n");
}

runPhase6hSettingsTests().catch((err) => {
  console.error("Phase 6H test suite failure:", err);
  process.exit(1);
});
