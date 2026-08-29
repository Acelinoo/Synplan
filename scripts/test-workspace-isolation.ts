import { prisma } from "../src/lib/prisma";
import { requireAuthGuard } from "../src/lib/authGuard";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";

interface IsolationResult {
  test: string;
  expected: string;
  actual: string;
  status: "PASS" | "FAIL";
  notes?: string;
}

const results: IsolationResult[] = [];

function createMockRequest(headers: Record<string, string>, url: string = "http://localhost:3000/api/test") {
  const req = new NextRequest(url, {
    headers: new Headers({
      "Content-Type": "application/json",
      ...headers,
    }),
  });
  return req;
}

async function runIsolationTestSuite() {
  console.log("===============================================================");
  console.log("   SYNPLAN MULTI-TENANT & WORKSPACE ISOLATION SECURITY SUITE   ");
  console.log("===============================================================\n");

  let userAId = "";
  let userBId = "";
  let userCId = "";
  let wsAId = "";
  let wsBId = "";
  let projAId = "";
  let projBId = "";
  let taskAId = "";
  let taskBId = "";

  try {
    // -------------------------------------------------------------
    // SETUP: Multi-Tenant Test Data
    // -------------------------------------------------------------
    console.log("1. Setting up Tenant Alpha (User A) and Tenant Beta (User B)...");

    // User A & Workspace A
    const userA = await prisma.user.create({
      data: { name: "User Alpha (Tenant A)", email: `user-a-${Date.now()}@isolation.dev`, role: "OWNER" },
    });
    userAId = userA.id;

    const wsA = await prisma.workspace.create({
      data: { name: "Workspace Alpha", slug: `ws-alpha-${Date.now()}`, ownerId: userAId },
    });
    wsAId = wsA.id;

    await prisma.workspaceMember.create({
      data: { workspaceId: wsAId, userId: userAId, role: Role.OWNER },
    });

    const projA = await prisma.project.create({
      data: { workspaceId: wsAId, name: "Alpha Confidential Initiative", color: "#6366F1", status: "ACTIVE" },
    });
    projAId = projA.id;

    const taskA = await prisma.task.create({
      data: { workspaceId: wsAId, projectId: projAId, title: "Alpha Security Architecture", status: "TODO", priority: "HIGH" },
    });
    taskAId = taskA.id;

    // User B & Workspace B
    const userB = await prisma.user.create({
      data: { name: "User Beta (Tenant B)", email: `user-b-${Date.now()}@isolation.dev`, role: "OWNER" },
    });
    userBId = userB.id;

    const wsB = await prisma.workspace.create({
      data: { name: "Workspace Beta", slug: `ws-beta-${Date.now()}`, ownerId: userBId },
    });
    wsBId = wsB.id;

    await prisma.workspaceMember.create({
      data: { workspaceId: wsBId, userId: userBId, role: Role.OWNER },
    });

    const projB = await prisma.project.create({
      data: { workspaceId: wsBB_id(wsB.id), name: "Beta Proprietary Engine", color: "#10B981", status: "ACTIVE" },
    });
    projBId = projB.id;

    const taskB = await prisma.task.create({
      data: { workspaceId: wsB.id, projectId: projBId, title: "Beta Kernel Compilation", status: "TODO", priority: "URGENT" },
    });
    taskBId = taskB.id;

    // User C: Viewer in Workspace A
    const userC = await prisma.user.create({
      data: { name: "User Charlie (Viewer in A)", email: `user-c-${Date.now()}@isolation.dev`, role: "VIEWER" },
    });
    userCId = userC.id;

    await prisma.workspaceMember.create({
      data: { workspaceId: wsAId, userId: userCId, role: Role.VIEWER },
    });

    console.log("  ✅ Test entities created across Tenant Alpha & Beta.\n");

    // -------------------------------------------------------------
    // TEST 1: User A accessing Workspace A (Allowed)
    // -------------------------------------------------------------
    const reqA_A = createMockRequest({ "x-synplan-user-id": userAId, "x-synplan-workspace-id": wsAId });
    const authA_A = await requireAuthGuard(reqA_A, Role.VIEWER, wsAId);
    if (authA_A.auth && authA_A.auth.workspaceId === wsAId) {
      results.push({ test: "Tenant A Accessing Workspace A", expected: "200 Allowed", actual: "200 Allowed", status: "PASS" });
    } else {
      results.push({ test: "Tenant A Accessing Workspace A", expected: "200 Allowed", actual: "Denied", status: "FAIL" });
    }

    // -------------------------------------------------------------
    // TEST 2: User A accessing Workspace B (Cross-Tenant Breach -> Denied 403)
    // -------------------------------------------------------------
    const reqA_B = createMockRequest({ "x-synplan-user-id": userAId, "x-synplan-workspace-id": wsBId });
    const authA_B = await requireAuthGuard(reqA_B, Role.VIEWER, wsBId);
    if (authA_B.errorResponse && authA_B.errorResponse.status === 403) {
      results.push({ test: "User A → Workspace B (Cross-Tenant Boundary)", expected: "403 Forbidden", actual: "403 Forbidden", status: "PASS" });
    } else {
      results.push({ test: "User A → Workspace B (Cross-Tenant Boundary)", expected: "403 Forbidden", actual: "Allowed / Wrong code", status: "FAIL" });
    }

    // -------------------------------------------------------------
    // TEST 3: User B accessing Workspace A (Cross-Tenant Breach -> Denied 403)
    // -------------------------------------------------------------
    const reqB_A = createMockRequest({ "x-synplan-user-id": userBId, "x-synplan-workspace-id": wsAId });
    const authB_A = await requireAuthGuard(reqB_A, Role.VIEWER, wsAId);
    if (authB_A.errorResponse && authB_A.errorResponse.status === 403) {
      results.push({ test: "User B → Workspace A (Cross-Tenant Boundary)", expected: "403 Forbidden", actual: "403 Forbidden", status: "PASS" });
    } else {
      results.push({ test: "User B → Workspace A (Cross-Tenant Boundary)", expected: "403 Forbidden", actual: "Allowed / Wrong code", status: "FAIL" });
    }

    // -------------------------------------------------------------
    // TEST 4: RBAC Privilege Enforcement - VIEWER attempting ADMIN operation
    // -------------------------------------------------------------
    const reqC_Admin = createMockRequest({ "x-synplan-user-id": userCId, "x-synplan-workspace-id": wsAId });
    const authC_Admin = await requireAuthGuard(reqC_Admin, Role.ADMIN, wsAId);
    if (authC_Admin.errorResponse && authC_Admin.errorResponse.status === 403) {
      results.push({ test: "User C (VIEWER) → ADMIN Action (RBAC Guard)", expected: "403 Forbidden", actual: "403 Forbidden", status: "PASS" });
    } else {
      results.push({ test: "User C (VIEWER) → ADMIN Action (RBAC Guard)", expected: "403 Forbidden", actual: "Allowed / Wrong code", status: "FAIL" });
    }

    // -------------------------------------------------------------
    // TEST 5: RBAC Privilege Enforcement - OWNER attempting ADMIN/OWNER operation (Allowed)
    // -------------------------------------------------------------
    const reqA_Admin = createMockRequest({ "x-synplan-user-id": userAId, "x-synplan-workspace-id": wsAId });
    const authA_Admin = await requireAuthGuard(reqA_Admin, Role.ADMIN, wsAId);
    if (authA_Admin.auth && authA_Admin.auth.role === Role.OWNER) {
      results.push({ test: "User A (OWNER) → ADMIN Action (RBAC Guard)", expected: "200 Allowed", actual: "200 Allowed", status: "PASS" });
    } else {
      results.push({ test: "User A (OWNER) → ADMIN Action (RBAC Guard)", expected: "200 Allowed", actual: "Denied", status: "FAIL" });
    }

    // -------------------------------------------------------------
    // TEST 6: Non-Existent User Spoofing (Rejected 401)
    // -------------------------------------------------------------
    const reqFakeUser = createMockRequest({ "x-synplan-user-id": "usr-fake-spoofed-id", "x-synplan-workspace-id": wsAId });
    const authFake = await requireAuthGuard(reqFakeUser, Role.VIEWER, wsAId);
    if (authFake.errorResponse && authFake.errorResponse.status === 401) {
      results.push({ test: "Spoofed Non-Existent User Identity", expected: "401 Unauthorized", actual: "401 Unauthorized", status: "PASS" });
    } else {
      results.push({ test: "Spoofed Non-Existent User Identity", expected: "401 Unauthorized", actual: "Allowed / Wrong code", status: "FAIL" });
    }

  } catch (err: any) {
    console.error("Test Suite Error:", err);
  } finally {
    // -------------------------------------------------------------
    // CLEAN UP: Remove all test records cleanly
    // -------------------------------------------------------------
    console.log("\nCleaning up isolation test entities from PostgreSQL...");
    if (taskAId) await prisma.task.deleteMany({ where: { id: taskAId } });
    if (taskBId) await prisma.task.deleteMany({ where: { id: taskBId } });
    if (projAId) await prisma.project.deleteMany({ where: { id: projAId } });
    if (projBId) await prisma.project.deleteMany({ where: { id: projBId } });
    if (wsAId) await prisma.workspaceMember.deleteMany({ where: { workspaceId: wsAId } });
    if (wsBId) await prisma.workspaceMember.deleteMany({ where: { workspaceId: wsBId } });
    if (wsAId) await prisma.workspace.deleteMany({ where: { id: wsAId } });
    if (wsBId) await prisma.workspace.deleteMany({ where: { id: wsBId } });
    if (userAId) await prisma.user.deleteMany({ where: { id: userAId } });
    if (userBId) await prisma.user.deleteMany({ where: { id: userBId } });
    if (userCId) await prisma.user.deleteMany({ where: { id: userCId } });
    console.log("  ✅ Cleanup completed. Zero test records left in database.\n");
  }

  console.log("===============================================================");
  console.log("            ISOLATION & RBAC TEST SUITE RESULTS                ");
  console.log("===============================================================");
  console.table(results);
}

function wsBB_id(id: string) { return id; }

runIsolationTestSuite()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
