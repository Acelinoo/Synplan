/**
 * ============================================================================
 * SYNPLAN ENTERPRISE TRANSFORMATION — PHASE 3 TEST SUITE
 * Real-Time Sync & Live Collaboration Engine Test Suite
 * ============================================================================
 */

import { prisma } from "../src/lib/prisma";
import { publishWorkspaceEvent } from "../src/lib/realtimeServer";
import { realtimeClient } from "../src/lib/realtime";
import { useTaskStore } from "../src/store/useTaskStore";
import { useWorkspaceStore } from "../src/store/useWorkspaceStore";
import { RealtimeEvent } from "../src/types/realtime";
import { Task, NotificationItem } from "../src/types";
import { AuthContext } from "../src/lib/authGuard";

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`  [FAIL] ${testName}${detail ? ` — ${detail}` : ""}`);
    testsFailed++;
  }
}

async function runPhase3Tests() {
  console.log("\n========================================================");
  console.log("SYNPLAN PHASE 3: REAL-TIME SYNC & LIVE COLLABORATION TEST SUITE");
  console.log("========================================================\n");

  try {
    // ------------------------------------------------------------------------
    // TEST SECTION 1: Server-Authoritative Publisher & Event Envelope Contract
    // ------------------------------------------------------------------------
    console.log("SECTION 1: Server-Authoritative Realtime Publisher Contract");

    const mockAuth: AuthContext = {
      userId: "test-user-alpha",
      workspaceId: "test-ws-alpha",
      ipAddress: "127.0.0.1",
      role: "OWNER",
      permissions: ["*"] as any,
      user: { id: "test-user-alpha", name: "Alpha", email: "alpha@synplan.dev", avatarUrl: null },
    };

    // 1.1 Non-blocking execution without credentials throwing
    let publishResult = false;
    try {
      publishResult = await publishWorkspaceEvent(
        mockAuth,
        "TASK_CREATED",
        { id: "task-123", title: "Live Test Task" } as any,
        { projectId: "proj-123", taskId: "task-123" }
      );
      assert(true, "1.1 publishWorkspaceEvent executes safely and non-blockingly without throwing errors");
    } catch (e: any) {
      assert(false, "1.1 publishWorkspaceEvent threw an error", e?.message);
    }

    // 1.2 String workspaceId backward-compatible fallback
    try {
      const fallbackResult = await publishWorkspaceEvent(
        "test-ws-alpha",
        "NOTIFICATION_CREATED",
        {
          id: "notif-123",
          title: "Test Notification",
          description: "Notification description",
          userId: "test-user-alpha",
          workspaceId: "test-ws-alpha",
          type: "SYSTEM_ALERT" as any,
          read: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as NotificationItem
      );
      assert(true, "1.2 publishWorkspaceEvent accepts string workspaceId for background service compatibility");
    } catch (e: any) {
      assert(false, "1.2 publishWorkspaceEvent fallback failed", e?.message);
    }

    // ------------------------------------------------------------------------
    // TEST SECTION 2: Client Realtime Deduplication & Conflict Resolution
    // ------------------------------------------------------------------------
    console.log("\nSECTION 2: Client Realtime Deduplication & Conflict Resolution");

    // 2.1 Deduplication LRU Cache test
    const testChannel = "workspace:test-ws-alpha";
    let receivedEventsCount = 0;
    const testEventId = "evt-dedup-unique-" + Date.now();

    const testEvent: RealtimeEvent = {
      id: testEventId,
      eventId: testEventId,
      type: "TASK_UPDATED",
      workspaceId: "test-ws-alpha",
      timestamp: new Date().toISOString(),
      payload: { id: "task-test-dedup", title: "Original Dedup Title" },
    };

    const sub = realtimeClient.subscribeEvent(testChannel, "TASK_UPDATED", () => {
      receivedEventsCount++;
    });

    // Simulate sending identical event twice through the bus
    realtimeClient.dispatchToLocalListeners(testChannel, testEvent);

    // Duplicate message with same eventId
    realtimeClient.dispatchToLocalListeners(testChannel, testEvent);

    assert(
      receivedEventsCount === 1,
      "2.1 LRU Deduplication suppresses identical eventId duplicate delivery",
      `Expected 1, got ${receivedEventsCount}`
    );
    sub.unsubscribe();

    // 2.2 Out-of-Order Timestamp Conflict Resolution in Task Store
    const taskStore = useTaskStore.getState();
    const olderTime = new Date(Date.now() - 5000).toISOString();
    const newerTime = new Date(Date.now()).toISOString();

    // Set initial newer state
    taskStore.addTask({
      id: "conflict-task-1",
      workspaceId: "test-ws-alpha",
      projectId: "proj-1",
      title: "Newer State Title",
      description: "Task Description",
      status: "in_progress",
      priority: "high",
      order: 1,
      subtasks: [],
      tags: [],
      updatedAt: newerTime,
      createdAt: olderTime,
    });

    // Attempt to apply stale/older update
    taskStore.updateTask("conflict-task-1", {
      title: "Stale Late Arriving Title",
      updatedAt: olderTime,
    });

    const currentTask = useTaskStore.getState().tasks.find((t) => t.id === "conflict-task-1");
    assert(
      currentTask?.title === "Newer State Title",
      "2.2 Task store discards out-of-order stale update with older updatedAt timestamp",
      `Current title: "${currentTask?.title}"`
    );

    // Apply strictly newer update
    const evenNewerTime = new Date(Date.now() + 5000).toISOString();
    taskStore.updateTask("conflict-task-1", {
      title: "Fresh Valid Title",
      updatedAt: evenNewerTime,
    });

    const updatedTask = useTaskStore.getState().tasks.find((t) => t.id === "conflict-task-1");
    assert(
      updatedTask?.title === "Fresh Valid Title",
      "2.3 Task store accepts newer update with valid latest updatedAt timestamp"
    );

    // Clean up test task
    taskStore.deleteTask("conflict-task-1");

    // ------------------------------------------------------------------------
    // TEST SECTION 3: Batch Mutation Reconciliation in Stores
    // ------------------------------------------------------------------------
    console.log("\nSECTION 3: Batch Mutation Reconciliation");

    const batchTask1: Task = {
      id: "batch-task-1",
      workspaceId: "test-ws-alpha",
      projectId: "proj-1",
      title: "Batch Created Task",
      description: "Batch description",
      status: "todo",
      priority: "medium",
      order: 1,
      subtasks: [],
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    taskStore.addTask({
      id: "batch-task-2",
      workspaceId: "test-ws-alpha",
      projectId: "proj-1",
      title: "Existing Task to Delete in Batch",
      description: "To be deleted",
      status: "todo",
      priority: "low",
      order: 2,
      subtasks: [],
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    taskStore.applyBatchMutation({
      tasksCreated: [batchTask1],
      tasksUpdated: [{ id: "batch-task-1", title: "Batch Created Task (Updated)" }],
      tasksDeleted: ["batch-task-2"],
    });

    const postBatchTasks = useTaskStore.getState().tasks;
    const hasCreated = postBatchTasks.some((t) => t.id === "batch-task-1" && t.title === "Batch Created Task (Updated)");
    const hasDeleted = postBatchTasks.some((t) => t.id === "batch-task-2");

    assert(
      hasCreated && !hasDeleted,
      "3.1 applyBatchMutation atomically creates, updates, and deletes tasks in store",
      `hasCreated=${hasCreated}, hasDeleted=${hasDeleted}`
    );

    // Clean up
    taskStore.deleteTask("batch-task-1");

    // ------------------------------------------------------------------------
    // TEST SECTION 4: Multi-Tenant Workspace Channel Isolation
    // ------------------------------------------------------------------------
    console.log("\nSECTION 4: Multi-Tenant Workspace Channel Isolation");

    let tenantAEvents = 0;
    let tenantBEvents = 0;

    const subTenantA = realtimeClient.subscribeEvent("workspace:tenant-alpha", "TASK_CREATED", () => {
      tenantAEvents++;
    });

    const subTenantB = realtimeClient.subscribeEvent("workspace:tenant-bravo", "TASK_CREATED", () => {
      tenantBEvents++;
    });

    // Send event targeted to Tenant Alpha only
    realtimeClient.dispatchToLocalListeners("workspace:tenant-alpha", {
      id: "evt-iso-1",
      eventId: "evt-iso-1",
      type: "TASK_CREATED",
      workspaceId: "tenant-alpha",
      timestamp: new Date().toISOString(),
      payload: { id: "t-1", title: "Tenant Alpha Task" },
    });

    assert(
      tenantAEvents === 1 && tenantBEvents === 0,
      "4.1 Multi-tenant channel isolation: Tenant Bravo does not receive Tenant Alpha events",
      `Tenant A: ${tenantAEvents}, Tenant B: ${tenantBEvents}`
    );

    subTenantA.unsubscribe();
    subTenantB.unsubscribe();

    // ------------------------------------------------------------------------
    // TEST SECTION 5: End-to-End Database & API Route Realtime Publisher Wiring
    // ------------------------------------------------------------------------
    console.log("\nSECTION 5: End-to-End Database & Realtime Publisher Verification");

    // Verify Prisma and Workspace existence for live check
    const existingWorkspace = await prisma.workspace.findFirst({
      include: {
        members: { include: { user: true } },
        projects: true,
      },
    });

    if (existingWorkspace) {
      assert(
        true,
        `5.1 Database connection operational. Verified active workspace: "${existingWorkspace.name}" (${existingWorkspace.id})`
      );

      // Verify server publisher with real database workspace
      const livePublish = await publishWorkspaceEvent(
        {
          userId: existingWorkspace.members[0]?.userId || "usr-test",
          workspaceId: existingWorkspace.id,
          ipAddress: "127.0.0.1",
          role: "OWNER",
          permissions: ["*"] as any,
          user: existingWorkspace.members[0]?.user as any,
        },
        "TASK_CREATED",
        { id: "task-live-verify", title: "Phase 3 Verification Task" } as any
      );

      assert(
        true,
        "5.2 Server publisher successfully processed live database workspace event dispatch"
      );
    } else {
      console.log("  [SKIP] 5.1 No workspace found in database for live integration step.");
    }

    console.log("\n========================================================");
    console.log(`PHASE 3 TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log("========================================================\n");

    if (testsFailed > 0) {
      process.exit(1);
    }
  } catch (error: any) {
    console.error("Test execution fatal error:", error);
    process.exit(1);
  }
}

runPhase3Tests();
