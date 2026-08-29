import { Role } from "@prisma/client";
import {
  Permission,
  ROLE_PERMISSIONS,
  hasPermission,
  canModifyRole,
  canRemoveMember,
} from "../src/lib/permissions";
import { requireAuthGuard } from "../src/lib/authGuard";
import { prisma } from "../src/lib/prisma";
import { NextRequest } from "next/server";

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, suite: string, name: string, message?: string) {
  if (condition) {
    results.push({ suite, name, passed: true });
    console.log(`  ✓ [PASS] ${name}`);
  } else {
    results.push({ suite, name, passed: false, error: message || "Assertion failed" });
    console.error(`  ✗ [FAIL] ${name}: ${message || "Assertion failed"}`);
  }
}

async function runTestSuite() {
  console.log("\n=======================================================");
  console.log("SYNPLAN PHASE 1 — RBAC & AUTHORIZATION TEST SUITE");
  console.log("=======================================================\n");

  // -------------------------------------------------------------
  // SUITE 1: Permission Matrix Verification
  // -------------------------------------------------------------
  console.log("--- SUITE 1: Role-to-Permission Matrix ---");

  // OWNER checks
  assert(hasPermission(Role.OWNER, "workspace.view"), "Suite 1: OWNER", "OWNER can workspace.view");
  assert(hasPermission(Role.OWNER, "workspace.update"), "Suite 1: OWNER", "OWNER can workspace.update");
  assert(hasPermission(Role.OWNER, "workspace.delete"), "Suite 1: OWNER", "OWNER can workspace.delete");
  assert(hasPermission(Role.OWNER, "members.invite"), "Suite 1: OWNER", "OWNER can members.invite");
  assert(hasPermission(Role.OWNER, "members.update_role"), "Suite 1: OWNER", "OWNER can members.update_role");
  assert(hasPermission(Role.OWNER, "members.remove"), "Suite 1: OWNER", "OWNER can members.remove");
  assert(hasPermission(Role.OWNER, "projects.create"), "Suite 1: OWNER", "OWNER can projects.create");
  assert(hasPermission(Role.OWNER, "projects.delete"), "Suite 1: OWNER", "OWNER can projects.delete");
  assert(hasPermission(Role.OWNER, "tasks.delete"), "Suite 1: OWNER", "OWNER can tasks.delete");

  // ADMIN checks
  assert(hasPermission(Role.ADMIN, "workspace.view"), "Suite 1: ADMIN", "ADMIN can workspace.view");
  assert(hasPermission(Role.ADMIN, "workspace.update"), "Suite 1: ADMIN", "ADMIN can workspace.update");
  assert(!hasPermission(Role.ADMIN, "workspace.delete"), "Suite 1: ADMIN", "ADMIN cannot workspace.delete (Strict Owner Guard)");
  assert(hasPermission(Role.ADMIN, "members.invite"), "Suite 1: ADMIN", "ADMIN can members.invite");
  assert(hasPermission(Role.ADMIN, "projects.create"), "Suite 1: ADMIN", "ADMIN can projects.create");
  assert(hasPermission(Role.ADMIN, "projects.delete"), "Suite 1: ADMIN", "ADMIN can projects.delete");
  assert(hasPermission(Role.ADMIN, "tasks.create"), "Suite 1: ADMIN", "ADMIN can tasks.create");
  assert(hasPermission(Role.ADMIN, "tasks.delete"), "Suite 1: ADMIN", "ADMIN can tasks.delete");
  assert(hasPermission(Role.ADMIN, "phases.delete"), "Suite 1: ADMIN", "ADMIN can phases.delete");

  // MEMBER checks
  assert(hasPermission(Role.MEMBER, "workspace.view"), "Suite 1: MEMBER", "MEMBER can workspace.view");
  assert(!hasPermission(Role.MEMBER, "workspace.update"), "Suite 1: MEMBER", "MEMBER cannot workspace.update");
  assert(!hasPermission(Role.MEMBER, "workspace.delete"), "Suite 1: MEMBER", "MEMBER cannot workspace.delete");
  assert(!hasPermission(Role.MEMBER, "members.invite"), "Suite 1: MEMBER", "MEMBER cannot members.invite");
  assert(!hasPermission(Role.MEMBER, "members.update_role"), "Suite 1: MEMBER", "MEMBER cannot members.update_role");
  assert(!hasPermission(Role.MEMBER, "members.remove"), "Suite 1: MEMBER", "MEMBER cannot members.remove");
  assert(hasPermission(Role.MEMBER, "projects.view"), "Suite 1: MEMBER", "MEMBER can projects.view");
  assert(hasPermission(Role.MEMBER, "projects.create"), "Suite 1: MEMBER", "MEMBER can projects.create");
  assert(hasPermission(Role.MEMBER, "projects.update"), "Suite 1: MEMBER", "MEMBER can projects.update");
  assert(!hasPermission(Role.MEMBER, "projects.delete"), "Suite 1: MEMBER", "MEMBER cannot projects.delete");
  assert(hasPermission(Role.MEMBER, "tasks.view"), "Suite 1: MEMBER", "MEMBER can tasks.view");
  assert(hasPermission(Role.MEMBER, "tasks.create"), "Suite 1: MEMBER", "MEMBER can tasks.create");
  assert(hasPermission(Role.MEMBER, "tasks.update"), "Suite 1: MEMBER", "MEMBER can tasks.update");
  assert(hasPermission(Role.MEMBER, "tasks.delete"), "Suite 1: MEMBER", "MEMBER can tasks.delete");
  assert(hasPermission(Role.MEMBER, "tasks.assign"), "Suite 1: MEMBER", "MEMBER can tasks.assign");
  assert(hasPermission(Role.MEMBER, "tasks.change_status"), "Suite 1: MEMBER", "MEMBER can tasks.change_status");
  assert(!hasPermission(Role.MEMBER, "phases.delete"), "Suite 1: MEMBER", "MEMBER cannot phases.delete");

  // VIEWER checks (Read-Only)
  assert(hasPermission(Role.VIEWER, "workspace.view"), "Suite 1: VIEWER", "VIEWER can workspace.view");
  assert(hasPermission(Role.VIEWER, "projects.view"), "Suite 1: VIEWER", "VIEWER can projects.view");
  assert(hasPermission(Role.VIEWER, "tasks.view"), "Suite 1: VIEWER", "VIEWER can tasks.view");
  assert(hasPermission(Role.VIEWER, "members.view"), "Suite 1: VIEWER", "VIEWER can members.view");
  assert(!hasPermission(Role.VIEWER, "projects.create"), "Suite 1: VIEWER", "VIEWER cannot projects.create");
  assert(!hasPermission(Role.VIEWER, "projects.update"), "Suite 1: VIEWER", "VIEWER cannot projects.update");
  assert(!hasPermission(Role.VIEWER, "projects.delete"), "Suite 1: VIEWER", "VIEWER cannot projects.delete");
  assert(!hasPermission(Role.VIEWER, "tasks.create"), "Suite 1: VIEWER", "VIEWER cannot tasks.create");
  assert(!hasPermission(Role.VIEWER, "tasks.update"), "Suite 1: VIEWER", "VIEWER cannot tasks.update");
  assert(!hasPermission(Role.VIEWER, "tasks.delete"), "Suite 1: VIEWER", "VIEWER cannot tasks.delete");
  assert(!hasPermission(Role.VIEWER, "tasks.assign"), "Suite 1: VIEWER", "VIEWER cannot tasks.assign");
  assert(!hasPermission(Role.VIEWER, "tasks.change_status"), "Suite 1: VIEWER", "VIEWER cannot tasks.change_status");
  assert(!hasPermission(Role.VIEWER, "members.invite"), "Suite 1: VIEWER", "VIEWER cannot members.invite");
  assert(!hasPermission(Role.VIEWER, "members.update_role"), "Suite 1: VIEWER", "VIEWER cannot members.update_role");
  assert(!hasPermission(Role.VIEWER, "members.remove"), "Suite 1: VIEWER", "VIEWER cannot members.remove");

  // -------------------------------------------------------------
  // SUITE 2: Member Management Hierarchy & Invariants
  // -------------------------------------------------------------
  console.log("\n--- SUITE 2: Member Management Hierarchy & Invariants ---");

  // OWNER role modifications
  assert(canModifyRole(Role.OWNER, Role.ADMIN, Role.MEMBER).allowed, "Suite 2: Role Management", "OWNER can demote ADMIN to MEMBER");
  assert(canModifyRole(Role.OWNER, Role.MEMBER, Role.ADMIN).allowed, "Suite 2: Role Management", "OWNER can promote MEMBER to ADMIN");
  assert(!canModifyRole(Role.OWNER, Role.OWNER, Role.MEMBER).allowed, "Suite 2: Role Management", "OWNER cannot directly demote themselves (Must transfer)");

  // ADMIN role modifications
  assert(canModifyRole(Role.ADMIN, Role.MEMBER, Role.VIEWER).allowed, "Suite 2: Role Management", "ADMIN can change MEMBER to VIEWER");
  assert(canModifyRole(Role.ADMIN, Role.VIEWER, Role.MEMBER).allowed, "Suite 2: Role Management", "ADMIN can change VIEWER to MEMBER");
  assert(!canModifyRole(Role.ADMIN, Role.OWNER, Role.MEMBER).allowed, "Suite 2: Role Management", "ADMIN cannot modify OWNER");
  assert(!canModifyRole(Role.ADMIN, Role.MEMBER, Role.OWNER).allowed, "Suite 2: Role Management", "ADMIN cannot grant OWNER");
  assert(!canModifyRole(Role.ADMIN, Role.MEMBER, Role.ADMIN).allowed, "Suite 2: Role Management", "ADMIN cannot promote anyone to ADMIN");
  assert(!canModifyRole(Role.ADMIN, Role.ADMIN, Role.MEMBER).allowed, "Suite 2: Role Management", "ADMIN cannot demote another ADMIN");

  // MEMBER & VIEWER modifications
  assert(!canModifyRole(Role.MEMBER, Role.VIEWER, Role.MEMBER).allowed, "Suite 2: Role Management", "MEMBER cannot modify roles");
  assert(!canModifyRole(Role.VIEWER, Role.MEMBER, Role.VIEWER).allowed, "Suite 2: Role Management", "VIEWER cannot modify roles");

  // Member Removals
  assert(!canRemoveMember(Role.ADMIN, Role.OWNER).allowed, "Suite 2: Member Removal", "Cannot remove workspace OWNER (ADMIN caller)");
  assert(!canRemoveMember(Role.OWNER, Role.OWNER).allowed, "Suite 2: Member Removal", "Cannot remove workspace OWNER (OWNER caller)");
  assert(canRemoveMember(Role.OWNER, Role.ADMIN).allowed, "Suite 2: Member Removal", "OWNER can remove ADMIN");
  assert(canRemoveMember(Role.OWNER, Role.MEMBER).allowed, "Suite 2: Member Removal", "OWNER can remove MEMBER");
  assert(!canRemoveMember(Role.ADMIN, Role.ADMIN).allowed, "Suite 2: Member Removal", "ADMIN cannot remove another ADMIN");
  assert(canRemoveMember(Role.ADMIN, Role.MEMBER).allowed, "Suite 2: Member Removal", "ADMIN can remove MEMBER");
  assert(canRemoveMember(Role.ADMIN, Role.VIEWER).allowed, "Suite 2: Member Removal", "ADMIN can remove VIEWER");
  assert(!canRemoveMember(Role.MEMBER, Role.VIEWER).allowed, "Suite 2: Member Removal", "MEMBER cannot remove members");
  assert(!canRemoveMember(Role.VIEWER, Role.MEMBER).allowed, "Suite 2: Member Removal", "VIEWER cannot remove members");

  // -------------------------------------------------------------
  // SUITE 3: Server-side AuthGuard & Cross-Workspace Boundary Test
  // -------------------------------------------------------------
  console.log("\n--- SUITE 3: Database & Cross-Workspace Isolation ---");

  // Create two isolated test users and workspaces in DB
  const testEmailA = `test-user-a-${Date.now()}@synplan.test`;
  const testEmailB = `test-user-b-${Date.now()}@synplan.test`;

  const userA = await prisma.user.create({
    data: { name: "User A", email: testEmailA, role: Role.MEMBER },
  });

  const userB = await prisma.user.create({
    data: { name: "User B", email: testEmailB, role: Role.MEMBER },
  });

  const wsA = await prisma.workspace.create({
    data: {
      name: "Workspace A",
      slug: `workspace-a-${Date.now()}`,
      ownerId: userA.id,
      members: { create: { userId: userA.id, role: Role.MEMBER } },
    },
  });

  const wsB = await prisma.workspace.create({
    data: {
      name: "Workspace B",
      slug: `workspace-b-${Date.now()}`,
      ownerId: userB.id,
      members: { create: { userId: userB.id, role: Role.OWNER } },
    },
  });

  try {
    // Test 3.1: User A accessing Workspace A with authorized permission
    const reqA_A = new NextRequest("http://localhost:3000/api/projects", {
      headers: {
        "x-synplan-user-id": userA.id,
        "x-synplan-workspace-id": wsA.id,
      },
    });
    const resA_A = await requireAuthGuard(reqA_A, "projects.view", wsA.id);
    assert(!resA_A.errorResponse && resA_A.auth?.userId === userA.id, "Suite 3: Isolation", "User A accessing Workspace A -> ALLOWED (200)");

    // Test 3.2: User A attempting to access Workspace B (CROSS-WORKSPACE ATTACK)
    const reqA_B = new NextRequest("http://localhost:3000/api/projects", {
      headers: {
        "x-synplan-user-id": userA.id,
        "x-synplan-workspace-id": wsB.id,
      },
    });
    const resA_B = await requireAuthGuard(reqA_B, "projects.view", wsB.id);
    assert(!!resA_B.errorResponse, "Suite 3: Isolation", "User A accessing Workspace B -> REJECTED (403 Forbidden)");

    // Test 3.3: User A attempting mutation requiring ADMIN in Workspace A (MEMBER level)
    const reqA_Admin = new NextRequest("http://localhost:3000/api/workspaces/settings", {
      headers: {
        "x-synplan-user-id": userA.id,
        "x-synplan-workspace-id": wsA.id,
      },
    });
    const resA_Admin = await requireAuthGuard(reqA_Admin, "workspace.update", wsA.id);
    assert(!!resA_Admin.errorResponse, "Suite 3: Privilege Boundary", "User A (MEMBER) attempting workspace.update -> REJECTED (403 Forbidden)");

    // Test 3.4: Unauthenticated Request (No cookie, no header) -> 401 Unauthorized
    const reqUnauth = new NextRequest("http://localhost:3000/api/projects");
    const resUnauth = await requireAuthGuard(reqUnauth, "projects.view");
    assert(!!resUnauth.errorResponse, "Suite 3: Authentication", "Unauthenticated Request -> REJECTED (401 Unauthorized)");

  } finally {
    // Cleanup test data cleanly
    await prisma.workspaceMember.deleteMany({ where: { workspaceId: { in: [wsA.id, wsB.id] } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [wsA.id, wsB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  }

  // -------------------------------------------------------------
  // Test Summary
  // -------------------------------------------------------------
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log("\n=======================================================");
  console.log(`TEST SUMMARY: ${passed}/${total} PASSED (${failed} FAILED)`);
  console.log("=======================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite()
  .catch((err) => {
    console.error("Test Suite Fatal Error:", err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
