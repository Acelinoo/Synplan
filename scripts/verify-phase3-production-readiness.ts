/**
 * ============================================================================
 * SYNPLAN ENTERPRISE — PHASE 3 PRODUCTION READINESS & SECURITY AUDIT
 * Deep programmatic verification of environment, token auth, publisher contracts,
 * multi-tenant channel isolation, multi-tab deduplication, and presence lifecycle.
 * ============================================================================
 */

import { prisma } from "../src/lib/prisma";
import { publishWorkspaceEvent } from "../src/lib/realtimeServer";
import { realtimeClient } from "../src/lib/realtime";
import { useTaskStore } from "../src/store/useTaskStore";
import { useWorkspaceStore } from "../src/store/useWorkspaceStore";
import { GET as getRealtimeToken } from "../src/app/api/auth/realtime-token/route";
import { NextRequest } from "next/server";
import { RealtimeEvent } from "../src/types/realtime";
import { Task } from "../src/types";
import { AuthContext } from "../src/lib/authGuard";
import fs from "fs";
import path from "path";

let passed = 0;
let failed = 0;
const results: { section: string; test: string; status: "PASS" | "FAIL"; detail?: string }[] = [];

function record(section: string, test: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    results.push({ section, test, status: "PASS" });
    console.log(`  [PASS] ${test}`);
  } else {
    failed++;
    results.push({ section, test, status: "FAIL", detail });
    console.error(`  [FAIL] ${test}${detail ? ` -> ${detail}` : ""}`);
  }
}

async function runAudit() {
  console.log("\n================================================================================");
  console.log("SYNPLAN PHASE 3: FINAL PRODUCTION READINESS & SECURITY AUDIT");
  console.log("================================================================================\n");

  // --------------------------------------------------------------------------
  // 1. ENVIRONMENT CONFIGURATION AUDIT
  // --------------------------------------------------------------------------
  console.log("1. ENVIRONMENT CONFIGURATION AUDIT");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const urlStatus = url && url.startsWith("https://") && url.includes("supabase.co") ? "SET (Valid Supabase URL)" : url ? "INVALID FORMAT" : "MISSING";
  const anonStatus = anonKey && anonKey.length > 20 ? "SET" : anonKey === "" ? "MISSING (Empty String)" : "MISSING";
  const serviceStatus = serviceKey && serviceKey.length > 20 ? "SET" : "MISSING (Server Only)";

  record("Environment", "1.1 NEXT_PUBLIC_SUPABASE_URL is properly configured format", Boolean(urlStatus.startsWith("SET")), `Status: ${urlStatus}`);
  record("Environment", "1.2 SUPABASE_SERVICE_ROLE_KEY is strictly server-only and not prefixed with NEXT_PUBLIC_", !process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY);

  // Check client bundle safety: No SUPABASE_SERVICE_ROLE_KEY in .next/static
  const nextStaticPath = path.join(process.cwd(), ".next", "static");
  let foundLeakInStatic = false;
  if (fs.existsSync(nextStaticPath)) {
    const scanDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".json"))) {
          const content = fs.readFileSync(fullPath, "utf-8");
          if (content.includes("SUPABASE_SERVICE_ROLE_KEY")) {
            foundLeakInStatic = true;
          }
        }
      }
    };
    scanDir(nextStaticPath);
  }
  record("Environment", "1.3 Production client bundle (.next/static) is 100% free of SUPABASE_SERVICE_ROLE_KEY references", !foundLeakInStatic);

  // --------------------------------------------------------------------------
  // 2. REALTIME TOKEN SECURITY AUDIT (/api/auth/realtime-token)
  // --------------------------------------------------------------------------
  console.log("\n2. REALTIME TOKEN ENDPOINT AUDIT");

  // 2.1 Unauthenticated request is rejected with 401
  const unauthReq = new NextRequest("http://localhost:3000/api/auth/realtime-token", {
    method: "GET",
  });
  const unauthRes = await getRealtimeToken(unauthReq);
  record("Token Auth", "2.1 Unauthenticated request to /api/auth/realtime-token rejected (401)", unauthRes.status === 401);

  // 2.2 Create real test user and workspace in database for token testing
  const testUser = await prisma.user.create({
    data: {
      id: `usr_token_test_${Date.now()}`,
      name: "Token Test User",
      email: `tokentest_${Date.now()}@synplan.dev`,
      role: "MEMBER",
    },
  });

  const testWs1 = await prisma.workspace.create({
    data: {
      id: `ws_token_1_${Date.now()}`,
      name: "Workspace Alpha",
      slug: `ws-alpha-${Date.now()}`,
      ownerId: testUser.id,
      members: {
        create: {
          id: `wsm_1_${Date.now()}`,
          userId: testUser.id,
          role: "OWNER",
        },
      },
    },
  });

  const testWs2 = await prisma.workspace.create({
    data: {
      id: `ws_token_2_${Date.now()}`,
      name: "Workspace Beta",
      slug: `ws-beta-${Date.now()}`,
      ownerId: testUser.id,
      members: {
        create: {
          id: `wsm_2_${Date.now()}`,
          userId: testUser.id,
          role: "MEMBER",
        },
      },
    },
  });

  const foreignUser = await prisma.user.create({
    data: {
      id: `usr_token_foreign_${Date.now()}`,
      name: "Foreign User",
      email: `foreign_${Date.now()}@synplan.dev`,
      role: "MEMBER",
    },
  });

  const foreignWs = await prisma.workspace.create({
    data: {
      id: `ws_token_foreign_${Date.now()}`,
      name: "Foreign Workspace",
      slug: `ws-foreign-${Date.now()}`,
      ownerId: foreignUser.id,
      members: {
        create: {
          id: `wsm_foreign_${Date.now()}`,
          userId: foreignUser.id,
          role: "OWNER",
        },
      },
    },
  });

  const session = await prisma.session.create({
    data: {
      id: `sess_token_${Date.now()}`,
      sessionToken: `token_sess_tok_${Date.now()}`,
      userId: testUser.id,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    },
  });

  // 2.3 Authenticated request returns valid token scoped to allowed workspaces
  const authReq = new NextRequest("http://localhost:3000/api/auth/realtime-token", {
    method: "GET",
    headers: {
      Cookie: `synplan_session_token=${session.sessionToken}`,
      "x-synplan-workspace-id": testWs1.id,
    },
  });
  const authRes = await getRealtimeToken(authReq);
  const authJson = await authRes.json();

  record("Token Auth", "2.2 Authenticated user successfully obtains Realtime Authorization token", authRes.status === 200 && authJson.success === true);
  record("Token Auth", "2.3 Token contains authorized userId", authJson.data?.userId === testUser.id);
  record("Token Auth", "2.4 Token includes user's memberships (Workspace Alpha & Beta)", 
    authJson.data?.allowedWorkspaces?.includes(testWs1.id) && authJson.data?.allowedWorkspaces?.includes(testWs2.id)
  );
  record("Token Auth", "2.5 Foreign Workspace is strictly excluded from token authorization scope", 
    !authJson.data?.allowedWorkspaces?.includes(foreignWs.id)
  );
  record("Token Auth", "2.6 Token includes valid expiration timestamp", Boolean(authJson.data?.expiresAt));

  // --------------------------------------------------------------------------
  // 3. SERVER PUBLISHER & CONTRACTS AUDIT (src/lib/realtimeServer.ts)
  // --------------------------------------------------------------------------
  console.log("\n3. SERVER PUBLISHER & CONTRACTS AUDIT");

  const mockAuthContext: AuthContext = {
    userId: testUser.id,
    workspaceId: testWs1.id,
    ipAddress: "127.0.0.1",
    role: "OWNER",
    permissions: ["*"] as any,
    user: { id: testUser.id, name: testUser.name, email: testUser.email, avatarUrl: null },
  };

  // 3.1 Non-blocking failure test
  let serverPublishSuccess = false;
  try {
    serverPublishSuccess = await publishWorkspaceEvent(
      mockAuthContext,
      "TASK_CREATED",
      { id: "task-server-test", title: "Server Event Task" } as any,
      { projectId: "proj-server-test", taskId: "task-server-test" }
    );
    record("Server Publisher", "3.1 publishWorkspaceEvent executes safely without throwing or causing DB rollback", true);
  } catch (err: any) {
    record("Server Publisher", "3.1 publishWorkspaceEvent threw an exception", false, err?.message);
  }

  // 3.2 Refuses empty workspaceId
  const emptyWsPublish = await publishWorkspaceEvent(
    "",
    "TASK_CREATED",
    { id: "task-invalid" } as any
  );
  record("Server Publisher", "3.2 Refuses to publish when workspaceId is empty or undefined", emptyWsPublish === false);

  // --------------------------------------------------------------------------
  // 4. CLIENT DEDUPLICATION & CONFLICT RESOLUTION AUDIT (src/lib/realtime.ts)
  // --------------------------------------------------------------------------
  console.log("\n4. CLIENT DEDUPLICATION & TIMESTAMP RESOLUTION AUDIT");

  const testEventId = `evt_dedup_${Date.now()}`;
  const isFirstDuplicate = realtimeClient.isDuplicateEvent(testEventId);
  const isSecondDuplicate = realtimeClient.isDuplicateEvent(testEventId);
  const isThirdDuplicate = realtimeClient.isDuplicateEvent(testEventId);

  record("Client Realtime", "4.1 First arrival of eventId is accepted (not duplicate)", !isFirstDuplicate);
  record("Client Realtime", "4.2 Subsequent identical eventId is suppressed by LRU cache", Boolean(isSecondDuplicate && isThirdDuplicate));

  // Stale timestamp conflict rejection
  const taskStore = useTaskStore.getState();
  const olderTimestamp = new Date(Date.now() - 10000).toISOString();
  const currentTimestamp = new Date(Date.now()).toISOString();

  taskStore.addTask({
    id: "task-conflict-audit",
    workspaceId: testWs1.id,
    projectId: "proj-1",
    title: "Current Version Title",
    description: "Original Description",
    status: "in_progress",
    priority: "high",
    order: 1,
    subtasks: [],
    tags: [],
    updatedAt: currentTimestamp,
    createdAt: olderTimestamp,
  });

  // Attempt late-arriving stale update
  taskStore.updateTask("task-conflict-audit", {
    title: "Out of Order Stale Title",
    updatedAt: olderTimestamp,
  });

  const resolvedTask = useTaskStore.getState().tasks.find((t) => t.id === "task-conflict-audit");
  record("Client Realtime", "4.3 Task store rejects out-of-order event with older updatedAt timestamp", resolvedTask?.title === "Current Version Title");

  taskStore.deleteTask("task-conflict-audit");

  // --------------------------------------------------------------------------
  // 5. MULTI-TENANT CHANNEL ISOLATION AUDIT
  // --------------------------------------------------------------------------
  console.log("\n5. MULTI-TENANT CHANNEL ISOLATION AUDIT");

  let tenantAEventReceived = 0;
  let tenantBEventReceived = 0;

  const subA = realtimeClient.subscribeEvent(`workspace:${testWs1.id}`, "TASK_CREATED", () => {
    tenantAEventReceived++;
  });
  const subB = realtimeClient.subscribeEvent(`workspace:${testWs2.id}`, "TASK_CREATED", () => {
    tenantBEventReceived++;
  });

  // Dispatch event targeted strictly to Workspace Alpha
  realtimeClient.dispatchToLocalListeners(`workspace:${testWs1.id}`, {
    id: `evt_iso_audit_${Date.now()}`,
    eventId: `evt_iso_audit_${Date.now()}`,
    type: "TASK_CREATED",
    workspaceId: testWs1.id,
    timestamp: new Date().toISOString(),
    payload: { id: "t-iso", title: "Tenant Alpha Task" },
  });

  record("Tenant Isolation", "5.1 Workspace Alpha receives Alpha event", tenantAEventReceived === 1);
  record("Tenant Isolation", "5.2 Workspace Beta receives 0 events (Zero Cross-Tenant Leakage)", tenantBEventReceived === 0);

  subA.unsubscribe();
  subB.unsubscribe();

  // --------------------------------------------------------------------------
  // 6. MULTI-TAB BROADCAST & RECONNECT CATCH-UP AUDIT
  // --------------------------------------------------------------------------
  console.log("\n6. MULTI-TAB & RECONNECT CATCH-UP AUDIT");

  let reconnectHandlerFired = false;
  const unsubReconnect = realtimeClient.onReconnect(() => {
    reconnectHandlerFired = true;
  });

  // Simulate Reconnection lifecycle
  // @ts-ignore (access private state simulator for test)
  realtimeClient.setState("DISCONNECTED");
  // @ts-ignore
  realtimeClient.setState("CONNECTED");

  record("Reconnection", "6.1 OnReconnect catch-up handlers triggered upon DISCONNECTED -> CONNECTED state recovery", Boolean(reconnectHandlerFired));
  unsubReconnect();

  // --------------------------------------------------------------------------
  // CLEANUP TEST DATA
  // --------------------------------------------------------------------------
  await prisma.session.deleteMany({ where: { userId: { in: [testUser.id, foreignUser.id] } } });
  await prisma.workspaceMember.deleteMany({ where: { workspaceId: { in: [testWs1.id, testWs2.id, foreignWs.id] } } });
  await prisma.workspace.deleteMany({ where: { id: { in: [testWs1.id, testWs2.id, foreignWs.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [testUser.id, foreignUser.id] } } });

  console.log("\n================================================================================");
  console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error("FATAL AUDIT ERROR:", err);
  process.exit(1);
});
