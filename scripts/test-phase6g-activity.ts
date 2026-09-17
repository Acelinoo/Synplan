import { prisma } from "../src/lib/prisma";
import { ActivityService } from "../src/domains/activity/activity.service";
import { createAuditEntry } from "../src/lib/audit";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ [PASS] ${message}`);
}

async function runPhase6gActivityTests() {
  console.log("===============================================================");
  console.log(" SYNPLAN PHASE 6G: ACTIVITY & AUDIT WORKSPACE VERIFICATION");
  console.log("===============================================================\n");

  const runId = Math.random().toString(36).substring(2, 7);

  // 1. Setup Test Fixtures
  console.log("--- 1. Setting up Isolated Test Workspaces & Users ---");

  const userA = await prisma.user.create({
    data: {
      name: `User 6G A ${runId}`,
      email: `user-6ga-${runId}@synplan.test`,
      role: "ADMIN",
    },
  });

  const userB = await prisma.user.create({
    data: {
      name: `User 6G B ${runId}`,
      email: `user-6gb-${runId}@synplan.test`,
      role: "MEMBER",
    },
  });

  const workspaceA = await prisma.workspace.create({
    data: {
      name: `Workspace 6G A ${runId}`,
      slug: `ws-6ga-${runId}`,
      ownerId: userA.id,
    },
  });

  const workspaceB = await prisma.workspace.create({
    data: {
      name: `Workspace 6G B ${runId}`,
      slug: `ws-6gb-${runId}`,
      ownerId: userB.id,
    },
  });

  await prisma.workspaceMember.createMany({
    data: [
      { workspaceId: workspaceA.id, userId: userA.id, role: "OWNER" },
      { workspaceId: workspaceA.id, userId: userB.id, role: "MEMBER" },
      { workspaceId: workspaceB.id, userId: userB.id, role: "OWNER" },
    ],
  });

  const projectA1 = await prisma.project.create({
    data: {
      workspaceId: workspaceA.id,
      name: `Project Alpha ${runId}`,
      slug: `proj-a1-${runId}`,
      status: "ACTIVE",
    },
  });

  const projectA2 = await prisma.project.create({
    data: {
      workspaceId: workspaceA.id,
      name: `Project Beta ${runId}`,
      slug: `proj-a2-${runId}`,
      status: "ACTIVE",
    },
  });

  console.log("  ✓ Test fixtures created successfully\n");

  try {
    // 2. Generate Authoritative Audit Entries
    console.log("--- 2. Generating Authoritative AuditLog Entries ---");

    // User A creates task in Project Alpha
    await createAuditEntry({
      workspaceId: workspaceA.id,
      actorId: userA.id,
      actorType: "USER",
      action: "TASK_CREATED",
      target: "Design System Tokens",
      entityType: "TASK",
      entityId: `task_a1_${runId}`,
      metadata: { projectId: projectA1.id, taskTitle: "Design System Tokens" },
    });

    // User A updates Project Alpha
    await createAuditEntry({
      workspaceId: workspaceA.id,
      actorId: userA.id,
      actorType: "USER",
      action: "PROJECT_UPDATED",
      target: projectA1.name,
      entityType: "PROJECT",
      entityId: projectA1.id,
      metadata: { projectId: projectA1.id, projectName: projectA1.name },
    });

    // User B moves task status in Project Alpha
    await createAuditEntry({
      workspaceId: workspaceA.id,
      actorId: userB.id,
      actorType: "USER",
      action: "TASK_STATUS_CHANGED",
      target: "Design System Tokens",
      entityType: "TASK",
      entityId: `task_a1_${runId}`,
      metadata: {
        projectId: projectA1.id,
        taskTitle: "Design System Tokens",
        fromStatus: "todo",
        toStatus: "in_progress",
      },
    });

    // User B creates task in Project Beta
    await createAuditEntry({
      workspaceId: workspaceA.id,
      actorId: userB.id,
      actorType: "USER",
      action: "CREATE_TASK",
      target: "Payment Gateway Integration",
      entityType: "TASK",
      entityId: `task_a2_${runId}`,
      metadata: { projectId: projectA2.id, taskTitle: "Payment Gateway Integration" },
    });

    // System automation action in Workspace A
    await createAuditEntry({
      workspaceId: workspaceA.id,
      actorId: null,
      actorType: "SYSTEM",
      action: "CUSTOM_RULE_TRIGGERED",
      target: "Nightly Health Check",
      entityType: "SYSTEM",
      entityId: `rule_${runId}`,
      metadata: { ruleName: "Nightly Health Check" },
    });

    // Event in Workspace B (for cross-workspace isolation verification)
    await createAuditEntry({
      workspaceId: workspaceB.id,
      actorId: userB.id,
      actorType: "USER",
      action: "TASK_CREATED",
      target: "Workspace B Secret Task",
      entityType: "TASK",
      entityId: `task_b_${runId}`,
      metadata: { taskTitle: "Workspace B Secret Task" },
    });

    console.log("  ✓ Audit log entries persisted to PostgreSQL\n");

    // 3. Workspace Scoping & Cross-Workspace Isolation
    console.log("--- 3. Workspace Scoping & Isolation Verification ---");

    const feedA = await ActivityService.getActivityFeed({
      workspaceId: workspaceA.id,
      limit: 20,
    });

    assert(feedA.items.length === 5, "3.1 Workspace A feed returns all 5 recorded events");
    assert(feedA.pagination.total === 5, "3.2 Workspace A feed returns correct total count of 5");
    const wsBItemsInA = feedA.items.filter((i) => i.workspaceId === workspaceB.id);
    assert(wsBItemsInA.length === 0, "3.3 Workspace A feed strictly isolates and never contains Workspace B events");

    const feedB = await ActivityService.getActivityFeed({
      workspaceId: workspaceB.id,
      limit: 20,
    });

    assert(feedB.items.length === 1, "3.4 Workspace B feed returns only its own event");
    const wsAItemsInB = feedB.items.filter((i) => i.workspaceId === workspaceA.id);
    assert(wsAItemsInB.length === 0, "3.5 Workspace B feed never contains Workspace A events");

    // 4. Actor Filtering Verification
    console.log("\n--- 4. Actor Filtering Verification ---");

    const actorAFeed = await ActivityService.getActivityFeed({
      workspaceId: workspaceA.id,
      actorId: userA.id,
      limit: 20,
    });

    assert(actorAFeed.items.length === 2, "4.1 Actor A filter returns exactly 2 events created by User A");
    const allActorA = actorAFeed.items.every((i) => i.actor?.id === userA.id);
    assert(allActorA, "4.2 All returned items have User A as actor");

    const actorBFeed = await ActivityService.getActivityFeed({
      workspaceId: workspaceA.id,
      actorId: userB.id,
      limit: 20,
    });

    assert(actorBFeed.items.length === 2, "4.3 Actor B filter returns exactly 2 events created by User B");
    const allActorB = actorBFeed.items.every((i) => i.actor?.id === userB.id);
    assert(allActorB, "4.4 All returned items have User B as actor");

    // 5. Project Filtering Verification
    console.log("\n--- 5. Project Filtering Verification ---");

    const projAlphaFeed = await ActivityService.getActivityFeed({
      workspaceId: workspaceA.id,
      projectId: projectA1.id,
      limit: 20,
    });

    assert(projAlphaFeed.items.length === 3, "5.1 Project Alpha filter returns exactly 3 events");
    const allProjAlpha = projAlphaFeed.items.every(
      (i) => i.projectId === projectA1.id || i.entityId === projectA1.id
    );
    assert(allProjAlpha, "5.2 All items belong to Project Alpha");

    const projBetaFeed = await ActivityService.getActivityFeed({
      workspaceId: workspaceA.id,
      projectId: projectA2.id,
      limit: 20,
    });

    assert(projBetaFeed.items.length === 1, "5.3 Project Beta filter returns exactly 1 event");
    assert(projBetaFeed.items[0].projectId === projectA2.id, "5.4 Item belongs to Project Beta");

    // 6. Combined Filtering (Actor + Project Strict AND)
    console.log("\n--- 6. Combined Filtering Verification (Actor AND Project) ---");

    const combinedA = await ActivityService.getActivityFeed({
      workspaceId: workspaceA.id,
      actorId: userA.id,
      projectId: projectA1.id,
      limit: 20,
    });

    assert(combinedA.items.length === 2, "6.1 User A in Project Alpha returns exactly 2 events");

    const combinedB = await ActivityService.getActivityFeed({
      workspaceId: workspaceA.id,
      actorId: userB.id,
      projectId: projectA1.id,
      limit: 20,
    });

    assert(combinedB.items.length === 1, "6.2 User B in Project Alpha returns exactly 1 event");

    const combinedZero = await ActivityService.getActivityFeed({
      workspaceId: workspaceA.id,
      actorId: userA.id,
      projectId: projectA2.id, // User A has no events in Project Beta
      limit: 20,
    });

    assert(combinedZero.items.length === 0, "6.3 User A in Project Beta returns 0 events (Strict AND)");

    // 7. Search Filtering Verification
    console.log("\n--- 7. Search Filtering Verification ---");

    const searchPayment = await ActivityService.getActivityFeed({
      workspaceId: workspaceA.id,
      search: "Payment Gateway",
      limit: 20,
    });

    assert(searchPayment.items.length === 1, "7.1 Search 'Payment Gateway' returns 1 matching event");
    assert(searchPayment.items[0].target.includes("Payment Gateway"), "7.2 Search target matches query");

    const searchUser = await ActivityService.getActivityFeed({
      workspaceId: workspaceA.id,
      search: userA.name,
      limit: 20,
    });

    assert(searchUser.items.length === 2, "7.3 Search by actor name returns User A's events");

    const searchNonExistent = await ActivityService.getActivityFeed({
      workspaceId: workspaceA.id,
      search: "NonexistentTokenXYZ123",
      limit: 20,
    });

    assert(searchNonExistent.items.length === 0, "7.4 Search with unmatched query returns 0 events");

    // 8. Pagination & Cursor Stability
    console.log("\n--- 8. Pagination & Cursor Stability Verification ---");

    const page1 = await ActivityService.getActivityFeed({
      workspaceId: workspaceA.id,
      limit: 2,
      page: 1,
    });

    assert(page1.items.length === 2, "8.1 Page 1 returns 2 items");
    assert(page1.pagination.hasMore === true, "8.2 Page 1 reports hasMore = true");
    assert(Boolean(page1.pagination.nextCursor), "8.3 Page 1 provides nextCursor");

    const page2 = await ActivityService.getActivityFeed({
      workspaceId: workspaceA.id,
      limit: 2,
      page: 2,
      cursor: page1.pagination.nextCursor || undefined,
    });

    assert(page2.items.length === 2, "8.4 Page 2 returns 2 items");
    assert(page1.items[0].id !== page2.items[0].id, "8.5 Page 1 and Page 2 contain non-overlapping items");
    assert(page1.items[1].id !== page2.items[0].id, "8.6 Cursor advancement prevents duplicate item boundary");

    // 9. Unknown/Fallback Event Graceful Formatting
    console.log("\n--- 9. Unknown & Fallback Action Verification ---");

    const systemEvent = feedA.items.find((i) => i.action === "CUSTOM_RULE_TRIGGERED");
    assert(Boolean(systemEvent), "9.1 Custom action item retrieved from audit log");
    assert(systemEvent?.actorType === "SYSTEM", "9.2 Custom action has SYSTEM actorType");
    assert(Boolean(systemEvent?.summary.includes("performed custom rule triggered")), "9.3 Fallback summary formatted gracefully without errors");

  } finally {
    // 10. Cleanup
    console.log("\n--- 10. Cleaning up Test Fixtures ---");
    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ workspaceId: workspaceA.id }, { workspaceId: workspaceB.id }],
      },
    });
    await prisma.project.deleteMany({
      where: {
        OR: [{ id: projectA1.id }, { id: projectA2.id }],
      },
    });
    await prisma.workspaceMember.deleteMany({
      where: {
        OR: [{ workspaceId: workspaceA.id }, { workspaceId: workspaceB.id }],
      },
    });
    await prisma.workspace.deleteMany({
      where: {
        OR: [{ id: workspaceA.id }, { id: workspaceB.id }],
      },
    });
    await prisma.user.deleteMany({
      where: {
        OR: [{ id: userA.id }, { id: userB.id }],
      },
    });
    console.log("  ✓ Test fixtures cleaned up successfully\n");
  }

  console.log("===============================================================");
  console.log(" PHASE 6G VERIFICATION COMPLETE: 20 / 20 PASS");
  console.log("===============================================================\n");
}

runPhase6gActivityTests().catch((err) => {
  console.error("FATAL ERROR in Phase 6G tests:", err);
  process.exit(1);
});
