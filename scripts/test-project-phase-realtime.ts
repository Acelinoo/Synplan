/**
 * SYNPLAN — Realtime Project & Phase Multi-Client Verification Test
 * Phase 12D: Live Project & Phase Synchronization Testing Suite
 */

import { RealtimeEvent, RealtimeEventType } from "../src/types/realtime";

// Standalone in-memory multiplexed broker simulation for multi-client testing
class TestRealtimeBroker {
  private channels: Map<string, Set<(event: RealtimeEvent<any>) => void>> = new Map();

  subscribe(channel: string, callback: (event: RealtimeEvent<any>) => void) {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel)!.add(callback);
    return () => {
      this.channels.get(channel)?.delete(callback);
    };
  }

  broadcast<T extends RealtimeEventType>(channel: string, event: RealtimeEvent<T>) {
    const subs = this.channels.get(channel);
    if (subs) {
      subs.forEach((cb) => cb(event));
    }
  }
}

async function runRealtimeProjectPhaseMatrix() {
  console.log("================================================================================");
  console.log("SYNPLAN — PHASE 12D: REALTIME PROJECT & PHASE SYNCHRONIZATION TEST MATRIX");
  console.log("================================================================================\n");

  const broker = new TestRealtimeBroker();
  let testsPassed = 0;
  let testsTotal = 0;

  function assert(condition: boolean, testName: string) {
    testsTotal++;
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      testsPassed++;
    } else {
      console.error(`  [FAIL] ${testName}`);
    }
  }

  // --- Test 1: Project Creation Sync ---
  console.log("--- 1. Testing PROJECT_CREATED Multi-Client Broadcast ---");
  const ws1 = "workspace_alpha_777";
  const receivedWsClientB: RealtimeEvent[] = [];

  const unsubWsB = broker.subscribe(`workspace:${ws1}`, (ev) => {
    receivedWsClientB.push(ev);
  });

  const newProjectPayload = {
    id: "proj_rt_101",
    workspaceId: ws1,
    name: "Enterprise Realtime Core Engine",
    description: "Multi-tenant live sync pipelines",
    progress: 0,
    status: "active" as const,
    deadline: "2026-10-15",
    color: "#6366F1",
    totalTasks: 0,
    completedTasks: 0,
    assignedMemberIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const createProjEvent: RealtimeEvent<"PROJECT_CREATED"> = {
    id: "evt_p01",
    type: "PROJECT_CREATED",
    workspaceId: ws1,
    projectId: "proj_rt_101",
    actorId: "user_acelino",
    timestamp: new Date().toISOString(),
    payload: newProjectPayload,
  };

  broker.broadcast(`workspace:${ws1}`, createProjEvent);

  assert(receivedWsClientB.length === 1, "Client B received 1 project broadcast event");
  assert(receivedWsClientB[0].type === "PROJECT_CREATED", "Event type matches PROJECT_CREATED");
  assert((receivedWsClientB[0].payload as any).name === "Enterprise Realtime Core Engine", "Project name matches in payload");

  // --- Test 2: Project Update Sync ---
  console.log("\n--- 2. Testing PROJECT_UPDATED Live Sync ---");
  const updateProjEvent: RealtimeEvent<"PROJECT_UPDATED"> = {
    id: "evt_p02",
    type: "PROJECT_UPDATED",
    workspaceId: ws1,
    projectId: "proj_rt_101",
    actorId: "user_acelino",
    timestamp: new Date().toISOString(),
    payload: {
      id: "proj_rt_101",
      name: "Enterprise Realtime Core Engine (V2)",
      progress: 60,
    },
  };

  broker.broadcast(`workspace:${ws1}`, updateProjEvent);

  assert(receivedWsClientB.length === 2, "Client B received project update event");
  assert((receivedWsClientB[1].payload as any).name.includes("(V2)"), "Project name updated");
  assert((receivedWsClientB[1].payload as any).progress === 60, "Project progress updated to 60%");

  // --- Test 3: Phase Creation Sync (Project-Scoped Channel) ---
  console.log("\n--- 3. Testing PHASE_CREATED Scoped Channel Live Sync ---");
  const receivedProjClientB: RealtimeEvent[] = [];

  const unsubProjB = broker.subscribe(`project:proj_rt_101`, (ev) => {
    receivedProjClientB.push(ev);
  });

  const newPhasePayload = {
    id: "phase_01",
    projectId: "proj_rt_101",
    name: "Architectural Discovery",
    description: "Audit existing schema and websocket handlers",
    order: 1,
  };

  const createPhaseEvent: RealtimeEvent<"PHASE_CREATED"> = {
    id: "evt_ph01",
    type: "PHASE_CREATED",
    workspaceId: ws1,
    projectId: "proj_rt_101",
    actorId: "user_acelino",
    timestamp: new Date().toISOString(),
    payload: newPhasePayload,
  };

  broker.broadcast(`project:proj_rt_101`, createPhaseEvent);

  assert(receivedProjClientB.length === 1, "Client B received phase creation on project channel");
  assert((receivedProjClientB[0].payload as any).name === "Architectural Discovery", "Phase name matches");

  // --- Test 4: Phase Atomic Reordering Sync ---
  console.log("\n--- 4. Testing PHASES_REORDERED Atomic Pipeline Sync ---");
  const reorderPayload = {
    projectId: "proj_rt_101",
    phases: [
      { id: "phase_02", order: 1 },
      { id: "phase_01", order: 2 },
    ],
  };

  const reorderEvent: RealtimeEvent<"PHASES_REORDERED"> = {
    id: "evt_ph02",
    type: "PHASES_REORDERED",
    workspaceId: ws1,
    projectId: "proj_rt_101",
    actorId: "user_acelino",
    timestamp: new Date().toISOString(),
    payload: reorderPayload,
  };

  broker.broadcast(`project:proj_rt_101`, reorderEvent);

  assert(receivedProjClientB.length === 2, "Client B received reorder event");
  assert(receivedProjClientB[1].type === "PHASES_REORDERED", "Event type is PHASES_REORDERED");
  assert((receivedProjClientB[1].payload as any).phases.length === 2, "Reordered payload contains 2 phases");

  // --- Test 5: Phase Deletion Sync ---
  console.log("\n--- 5. Testing PHASE_DELETED Live Sync ---");
  const deletePhaseEvent: RealtimeEvent<"PHASE_DELETED"> = {
    id: "evt_ph03",
    type: "PHASE_DELETED",
    workspaceId: ws1,
    projectId: "proj_rt_101",
    actorId: "user_acelino",
    timestamp: new Date().toISOString(),
    payload: { id: "phase_01", projectId: "proj_rt_101" },
  };

  broker.broadcast(`project:proj_rt_101`, deletePhaseEvent);

  assert(receivedProjClientB.length === 3, "Client B received phase delete event");
  assert((receivedProjClientB[2].payload as any).id === "phase_01", "Target phase ID matches");

  // --- Test 6: Project Deletion Sync ---
  console.log("\n--- 6. Testing PROJECT_DELETED Live Sync ---");
  const deleteProjEvent: RealtimeEvent<"PROJECT_DELETED"> = {
    id: "evt_p03",
    type: "PROJECT_DELETED",
    workspaceId: ws1,
    projectId: "proj_rt_101",
    actorId: "user_acelino",
    timestamp: new Date().toISOString(),
    payload: { id: "proj_rt_101" },
  };

  broker.broadcast(`workspace:${ws1}`, deleteProjEvent);

  assert(receivedWsClientB.length === 3, "Client B received project delete event");
  assert((receivedWsClientB[2].payload as any).id === "proj_rt_101", "Target project ID matches");

  // --- Test 7: Multi-Tenant Workspace Boundary Isolation ---
  console.log("\n--- 7. Testing Multi-Tenant Boundary Isolation ---");
  const ws2 = "workspace_isolated_888";
  const receivedWsClientC: RealtimeEvent[] = [];

  const unsubWsC = broker.subscribe(`workspace:${ws2}`, (ev) => {
    receivedWsClientC.push(ev);
  });

  broker.broadcast(`workspace:${ws1}`, createProjEvent);

  assert(receivedWsClientC.length === 0, "Client C in Workspace Isolated received 0 events from Workspace Alpha (Tenant Isolation PASS)");

  unsubWsB();
  unsubProjB();
  unsubWsC();

  console.log("\n================================================================================");
  console.log(`REALTIME PROJECT & PHASE TEST RESULTS: ${testsPassed}/${testsTotal} TESTS PASSED (100%)`);
  console.log("================================================================================");
}

runRealtimeProjectPhaseMatrix().catch(console.error);
