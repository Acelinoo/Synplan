import { validateAiPlan, generateActionPreviews } from "../src/lib/ai/validator";
import {
  createPlanFingerprint,
  registerPendingConfirmation,
  validatePendingConfirmation,
  invalidatePendingConfirmation,
  clearUserPendingConfirmations,
  markConfirmationExecuted,
  getUserActivePendingConfirmation,
  resetConfirmationStore,
  extractTargetEntitySnapshots,
} from "../src/lib/ai/confirmationStore";
import { executeAiPlan } from "../src/lib/ai/executor";
import { parseHeuristicIntent } from "../src/lib/ai/planner";
import { AiExecutionContext, AiPlan, AiAction } from "../src/lib/ai/types";
import { resetIdempotencyStore } from "../src/lib/ai/idempotency";
import { generateUndoPlanFromReceipt } from "../src/lib/ai/receiptStore";

/**
 * Phase 7: Confirmation, Safety & UX Hardening Security Verification Suite
 *
 * Covers:
 * 1. 4-Tier Risk Classification & Confirmation Policy
 * 2. Ground-Truth Action Previews & Diff Integrity
 * 3. Server-Authoritative Confirmation Tokens & Cryptographic Fingerprinting
 * 4. Plan/User/Workspace Binding & Multi-Tenant Isolation
 * 5. Stale Entity Detection & Revalidation
 * 6. Cancellation & Invalidation Handlers
 * 7. Replay Attack & Duplicate Execution Protection
 * 8. Batch Mutation Safety & 50-Item Threshold
 * 9. Clarification vs Confirmation Strict Separation
 * 10. Server-Side RBAC Preservation
 */

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    console.error(`  ✕ FAIL: ${testName}`);
    if (detail) {
      console.error(`    Detail: ${detail}`);
    }
  }
}

// Mock Test Environment Context
function createTestContext(overrides?: Partial<AiExecutionContext>): AiExecutionContext {
  return {
    workspaceId: "ws_security_test",
    workspaceName: "Security Test Corp",
    userId: "usr_admin_1",
    userName: "Marchelino Admin",
    userRole: "ADMIN",
    isMock: true,
    projects: [
      { id: "prj_alpha", name: "Website Cafe ABC", status: "ACTIVE", totalTasks: 2 },
      { id: "prj_beta", name: "Mobile App Bakery", status: "ACTIVE", totalTasks: 1 },
    ],
    phases: [
      { id: "ph_dev", name: "Development", projectId: "prj_alpha", order: 1 },
      { id: "ph_design", name: "Design", projectId: "prj_alpha", order: 2 },
    ],
    tasks: [
      {
        id: "tsk_101",
        title: "Setup Database Postgres",
        status: "TODO",
        priority: "MEDIUM",
        projectId: "prj_alpha",
        phaseId: "ph_dev",
        assigneeId: "usr_member_1",
        dueDate: "2026-09-01T00:00:00.000Z",
      },
      {
        id: "tsk_102",
        title: "Setup Database Postgres",
        status: "IN_PROGRESS",
        priority: "HIGH",
        projectId: "prj_beta",
        phaseId: "ph_dev",
        assigneeId: "usr_member_2",
      },
      {
        id: "tsk_103",
        title: "Desain Wireframe Homepage",
        status: "TODO",
        priority: "LOW",
        projectId: "prj_alpha",
        phaseId: "ph_design",
      },
    ],
    members: [
      { id: "m_1", userId: "usr_admin_1", name: "Marchelino", role: "ADMIN", email: "marchelino@test.com" },
      { id: "m_2", userId: "usr_member_1", name: "Sarah Designer", role: "MEMBER", email: "sarah@test.com" },
      { id: "m_3", userId: "usr_member_2", name: "Andi Backend", role: "MEMBER", email: "andi@test.com" },
      { id: "m_4", userId: "usr_viewer_1", name: "Budi Viewer", role: "VIEWER", email: "budi@test.com" },
    ],
    ...overrides,
  };
}

async function runPhase7SecuritySuite() {
  console.log("\n=======================================================");
  console.log("  SYNPLAN PHASE 7: CONFIRMATION, SAFETY & UX HARDENING");
  console.log("=======================================================\n");

  resetConfirmationStore();
  resetIdempotencyStore();

  const ctx = createTestContext();

  // -------------------------------------------------------------
  // 1. RISK POLICY & CONFIRMATION CLASSIFICATION
  // -------------------------------------------------------------
  console.log("--- 1. Risk Policy & Confirmation Classification ---");

  // 1.1 Read-only query -> LOW risk, NO confirmation
  const readPlan: AiPlan = {
    id: "plan_read_1",
    userPrompt: "tampilkan semua task di Website Cafe ABC",
    assistantMessage: "Berikut daftar task:",
    actions: [],
    status: "READY",
    requiresConfirmation: false,
    isDestructive: false,
    riskLevel: "LOW",
    warnings: [],
    planner: "heuristic",
    provider: "fallback",
    createdAt: new Date().toISOString(),
  };
  const validRead = validateAiPlan(readPlan, ctx);
  assert(
    validRead.validatedPlan.riskLevel === "LOW" && !validRead.validatedPlan.requiresConfirmation,
    "1.1 Read-only operation classifies as LOW risk without confirmation"
  );

  // 1.2 Single Non-destructive mutation (CREATE_TASK) -> MEDIUM risk, NO confirmation
  const createTaskPlan: AiPlan = {
    id: "plan_create_1",
    userPrompt: "buat task Buat Banner di Website Cafe ABC",
    assistantMessage: "Menambahkan task baru",
    actions: [
      {
        id: "act_c1",
        type: "CREATE_TASK",
        payload: { title: "Buat Banner", projectId: "prj_alpha" },
        summary: "Buat task Buat Banner",
        riskLevel: "MEDIUM",
        requiredRole: "MEMBER",
        status: "READY",
      },
    ],
    status: "READY",
    requiresConfirmation: false,
    isDestructive: false,
    warnings: [],
    planner: "heuristic",
    provider: "fallback",
    createdAt: new Date().toISOString(),
  };
  const validCreate = validateAiPlan(createTaskPlan, ctx);
  assert(
    validCreate.validatedPlan.riskLevel === "MEDIUM" && !validCreate.validatedPlan.requiresConfirmation,
    "1.2 CREATE_TASK classifies as MEDIUM risk without requiring confirmation"
  );

  // 1.3 Destructive mutation (DELETE_TASK) -> HIGH risk, REQUIRES confirmation
  const deleteTaskPlan: AiPlan = {
    id: "plan_del_task_1",
    userPrompt: "hapus task Desain Wireframe Homepage",
    assistantMessage: "Menghapus task",
    actions: [
      {
        id: "act_d1",
        type: "DELETE_TASK",
        payload: { id: "tsk_103", entityType: "TASK", name: "Desain Wireframe Homepage" },
        summary: "Hapus task Desain Wireframe Homepage",
        riskLevel: "HIGH",
        requiredRole: "MEMBER",
        isDestructive: true,
        status: "READY",
      },
    ],
    status: "READY",
    requiresConfirmation: false,
    isDestructive: true,
    warnings: [],
    planner: "heuristic",
    provider: "fallback",
    createdAt: new Date().toISOString(),
  };
  const validDelTask = validateAiPlan(deleteTaskPlan, ctx);
  assert(
    validDelTask.validatedPlan.riskLevel === "HIGH" &&
      validDelTask.validatedPlan.requiresConfirmation &&
      validDelTask.validatedPlan.status === "NEEDS_CONFIRMATION",
    "1.3 DELETE_TASK classifies as HIGH risk and enforces NEEDS_CONFIRMATION"
  );

  // 1.4 Highly destructive operation (DELETE_PROJECT) -> CRITICAL risk, REQUIRES confirmation
  const delProjPlan: AiPlan = {
    id: "plan_del_proj_1",
    userPrompt: "hapus project Website Cafe ABC",
    assistantMessage: "Menghapus project",
    actions: [
      {
        id: "act_dp1",
        type: "DELETE_PROJECT",
        payload: { id: "prj_alpha", entityType: "PROJECT", name: "Website Cafe ABC" },
        summary: "Hapus project Website Cafe ABC",
        riskLevel: "CRITICAL",
        requiredRole: "ADMIN",
        isDestructive: true,
        status: "READY",
      },
    ],
    status: "READY",
    requiresConfirmation: false,
    isDestructive: true,
    warnings: [],
    planner: "heuristic",
    provider: "fallback",
    createdAt: new Date().toISOString(),
  };
  const validDelProj = validateAiPlan(delProjPlan, ctx);
  assert(
    validDelProj.validatedPlan.riskLevel === "CRITICAL" &&
      validDelProj.validatedPlan.requiresConfirmation &&
      validDelProj.validatedPlan.status === "NEEDS_CONFIRMATION",
    "1.4 DELETE_PROJECT classifies as CRITICAL risk and strictly enforces confirmation"
  );

  // -------------------------------------------------------------
  // 2. GROUND-TRUTH ACTION PREVIEW GENERATOR
  // -------------------------------------------------------------
  console.log("\n--- 2. Ground-Truth Action Preview Generator ---");

  // 2.1 Diff integrity for UPDATE_TASK
  const updateTaskActions: AiAction[] = [
    {
      id: "act_up_1",
      type: "UPDATE_TASK",
      payload: {
        taskId: "tsk_101",
        status: "DONE",
        priority: "URGENT",
        assigneeName: "Sarah Designer",
      },
      summary: "Ubah status dan priority task",
      riskLevel: "HIGH",
      requiredRole: "MEMBER",
      status: "READY",
    },
  ];
  const previews = generateActionPreviews(updateTaskActions, ctx);
  assert(previews.length === 1, "2.1 generateActionPreviews produces 1 preview item");
  assert(previews[0].entityType === "TASK", "2.2 Preview item identifies TASK entity type");
  assert(
    Boolean(previews[0].changes?.some((c) => c.field === "Status" && c.from === "TODO" && c.to === "DONE")),
    "2.3 Preview captures Status diff: TODO -> DONE"
  );
  assert(
    Boolean(previews[0].changes?.some((c) => c.field === "Priority" && c.from === "MEDIUM" && c.to === "URGENT")),
    "2.4 Preview captures Priority diff: MEDIUM -> URGENT"
  );
  assert(
    Boolean(
      previews[0].changes?.some((c) => c.field === "Assignee" && c.from === "Sarah Designer" && c.to === "Sarah Designer") ||
        previews[0].changes?.some((c) => c.field === "Assignee")
    ),
    "2.5 Preview captures Assignee field"
  );

  // 2.2 Destructive Warning Banner on DELETE_PROJECT
  const delProjPreviews = generateActionPreviews(delProjPlan.actions, ctx);
  assert(
    Boolean(delProjPreviews[0].warning?.includes("PERMANEN")),
    "2.6 DELETE_PROJECT generates permanent deletion warning banner"
  );

  // -------------------------------------------------------------
  // 3. SERVER-AUTHORITATIVE CONFIRMATION & CRYPTOGRAPHIC FINGERPRINTS
  // -------------------------------------------------------------
  console.log("\n--- 3. Server Confirmation & Cryptographic Fingerprints ---");

  // 3.1 Fingerprint generation is deterministic
  const fp1 = createPlanFingerprint({
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    planId: "plan_test_fp",
    actions: updateTaskActions,
  });
  const fp2 = createPlanFingerprint({
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    planId: "plan_test_fp",
    actions: updateTaskActions,
  });
  assert(fp1 === fp2 && fp1.length === 64, "3.1 createPlanFingerprint produces deterministic SHA-256 hash");

  // 3.2 Fingerprint alters when action payload changes
  const modifiedActions: AiAction[] = [
    {
      ...updateTaskActions[0],
      payload: { ...updateTaskActions[0].payload, priority: "LOW" },
    },
  ];
  const fpModified = createPlanFingerprint({
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    planId: "plan_test_fp",
    actions: modifiedActions,
  });
  assert(fp1 !== fpModified, "3.2 Payload change produces different plan fingerprint");

  // 3.3 Register pending confirmation
  const pendingRecord = registerPendingConfirmation(validDelTask.validatedPlan, ctx);
  assert(pendingRecord.token.startsWith("conf_"), "3.3 registerPendingConfirmation generates valid token");
  assert(pendingRecord.status === "PENDING", "3.4 Initial confirmation status is PENDING");

  // 3.4 Successful validation of matching confirmation
  const valSuccess = validatePendingConfirmation({
    token: pendingRecord.token,
    fingerprint: pendingRecord.planFingerprint,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });
  assert(Boolean(valSuccess.isValid), "3.5 validatePendingConfirmation succeeds for valid token & fingerprint");

  // 3.5 Rejection on altered fingerprint
  const valMismatch = validatePendingConfirmation({
    token: pendingRecord.token,
    fingerprint: "tampered_fingerprint_hash_value_1234567890",
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });
  assert(Boolean(!valMismatch.isValid && valMismatch.error?.includes("tidak cocok")), "3.6 Fingerprint mismatch is rejected");

  // -------------------------------------------------------------
  // 4. MULTI-TENANT & USER AUTHORIZATION ISOLATION
  // -------------------------------------------------------------
  console.log("\n--- 4. Multi-Tenant & User Authorization Isolation ---");

  // 4.1 Rejection when confirmed by different user
  const valWrongUser = validatePendingConfirmation({
    token: pendingRecord.token,
    userId: "usr_attacker_99",
    workspaceId: ctx.workspaceId,
  });
  assert(Boolean(!valWrongUser.isValid && valWrongUser.error?.includes("milik pengguna lain")), "4.1 Confirmation from wrong user is rejected");

  // 4.2 Rejection when confirmed from different workspace
  const valWrongWs = validatePendingConfirmation({
    token: pendingRecord.token,
    userId: ctx.userId,
    workspaceId: "ws_foreign_tenant_99",
  });
  assert(Boolean(!valWrongWs.isValid && valWrongWs.error?.includes("workspace aktif")), "4.2 Cross-workspace confirmation is rejected");

  // 4.3 Fake / Spoofed token is rejected
  const valFakeToken = validatePendingConfirmation({
    token: "conf_fake_token_random_123",
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });
  assert(Boolean(!valFakeToken.isValid && valFakeToken.error?.includes("tidak valid")), "4.3 Spoofed confirmation token is rejected");

  // -------------------------------------------------------------
  // 5. CANCELLATION & EXPIRATION HANDLERS
  // -------------------------------------------------------------
  console.log("\n--- 5. Cancellation & Expiration Handlers ---");

  // 5.1 Invalidate pending confirmation
  const invRes = invalidatePendingConfirmation(pendingRecord.token, "CANCELLED");
  assert(invRes === true, "5.1 invalidatePendingConfirmation succeeds");
  const valCancelled = validatePendingConfirmation({
    token: pendingRecord.token,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });
  assert(Boolean(!valCancelled.isValid && valCancelled.error?.includes("CANCELLED")), "5.2 Cancelled confirmation cannot be executed");

  // 5.2 clearUserPendingConfirmations on cancel prompt
  const newPending = registerPendingConfirmation(validDelProj.validatedPlan, ctx);
  const clearedCount = clearUserPendingConfirmations(ctx.userId, ctx.workspaceId);
  assert(clearedCount >= 1, "5.3 clearUserPendingConfirmations clears user active confirmation");
  assert(
    getUserActivePendingConfirmation(ctx.userId, ctx.workspaceId) === null,
    "5.4 Active confirmation index is cleared"
  );

  // -------------------------------------------------------------
  // 6. REPLAY ATTACK & IDEMPOTENCY EXECUTION PROTECTION
  // -------------------------------------------------------------
  console.log("\n--- 6. Replay Attack & Idempotency Execution Protection ---");

  // 6.1 Mark executed prevents replay
  const execPending = registerPendingConfirmation(validDelTask.validatedPlan, ctx);
  markConfirmationExecuted(execPending.token);
  const valReplayed = validatePendingConfirmation({
    token: execPending.token,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });
  assert(Boolean(!valReplayed.isValid && valReplayed.error?.includes("EXECUTED")), "6.1 Executed confirmation token cannot be reused (Replay Protection)");

  // 6.2 Idempotency execution protection
  const testPlanToExec: AiPlan = {
    id: "plan_idempotent_1",
    userPrompt: "update task",
    assistantMessage: "Updating task",
    actions: [
      {
        id: "act_idem_1",
        type: "UPDATE_TASK",
        payload: { taskId: "tsk_101", status: "IN_PROGRESS" },
        summary: "Update task to IN_PROGRESS",
        riskLevel: "MEDIUM",
        requiredRole: "MEMBER",
        status: "READY",
      },
    ],
    status: "READY",
    requiresConfirmation: false,
    isDestructive: false,
    warnings: [],
    planner: "heuristic",
    provider: "fallback",
    createdAt: new Date().toISOString(),
  };

  const execRes1 = await executeAiPlan(testPlanToExec, ctx, "idem_key_unique_123");
  assert(execRes1.success, "6.2 First execution succeeds");

  const execRes2 = await executeAiPlan(testPlanToExec, ctx, "idem_key_unique_123");
  assert(Boolean(execRes2.success && execRes2.receipt?.executionId === execRes1.receipt?.executionId), "6.3 Duplicate execution returns cached idempotency receipt");

  // -------------------------------------------------------------
  // 7. BATCH MUTATION SAFETY & THRESHOLD GUARDS
  // -------------------------------------------------------------
  console.log("\n--- 7. Batch Mutation Safety & Threshold Guards ---");

  // 7.1 Batch of 5 actions requires confirmation and classifies as HIGH risk
  const batchCtx = createTestContext({
    tasks: Array.from({ length: 5 }, (_, i) => ({
      id: `tsk_batch_${i}`,
      title: `Task Batch ${i}`,
      status: "TODO",
      priority: "MEDIUM",
      projectId: "prj_alpha",
      phaseId: "ph_dev",
    })),
  });
  const batchActions: AiAction[] = Array.from({ length: 5 }, (_, i) => ({
    id: `act_b_${i}`,
    type: "UPDATE_TASK",
    payload: { taskId: `tsk_batch_${i}`, status: "DONE" },
    summary: `Update mock task ${i}`,
    riskLevel: "MEDIUM",
    requiredRole: "MEMBER",
    status: "READY",
  }));
  const batchPlan: AiPlan = {
    id: "plan_batch_5",
    userPrompt: "tandai semua task done",
    assistantMessage: "Mengubah 5 task",
    actions: batchActions,
    status: "READY",
    requiresConfirmation: false,
    isDestructive: false,
    warnings: [],
    planner: "heuristic",
    provider: "fallback",
    createdAt: new Date().toISOString(),
  };
  const validBatch = validateAiPlan(batchPlan, batchCtx);
  assert(
    validBatch.validatedPlan.requiresConfirmation && validBatch.validatedPlan.status === "NEEDS_CONFIRMATION",
    "7.1 Batch mutation with >2 actions enforces NEEDS_CONFIRMATION"
  );
  assert(validBatch.validatedPlan.actionPreviews?.length === 5, "7.2 Batch generates exact 5 action previews");

  // 7.2 Exceeding MAX_BATCH_ACTIONS (50) rejected
  const oversizedBatchActions: AiAction[] = Array.from({ length: 55 }, (_, i) => ({
    id: `act_over_${i}`,
    type: "UPDATE_TASK",
    payload: { taskId: `tsk_mock_${i}`, status: "DONE" },
    summary: `Update mock task ${i}`,
    riskLevel: "MEDIUM",
    requiredRole: "MEMBER",
    status: "READY",
  }));
  const oversizedPlan: AiPlan = {
    id: "plan_batch_55",
    userPrompt: "bulk update 55 tasks",
    assistantMessage: "Updating 55 tasks",
    actions: oversizedBatchActions,
    status: "READY",
    requiresConfirmation: false,
    isDestructive: false,
    warnings: [],
    planner: "heuristic",
    provider: "fallback",
    createdAt: new Date().toISOString(),
  };
  const validOversized = validateAiPlan(oversizedPlan, ctx);
  assert(
    !validOversized.isValid && validOversized.errors.some((e) => e.includes("maksimum 50")),
    "7.3 Batch mutation exceeding 50 actions is rejected before execution"
  );

  // -------------------------------------------------------------
  // 8. CLARIFICATION VS CONFIRMATION STRICT SEPARATION
  // -------------------------------------------------------------
  console.log("\n--- 8. Clarification vs Confirmation Separation ---");

  // 8.1 Ambiguous Task ("Setup Database Postgres" exists in 2 projects) -> NEEDS_CLARIFICATION, NOT NEEDS_CONFIRMATION
  const ambiguousPromptPlan = parseHeuristicIntent(
    "hapus task Setup Database Postgres",
    ctx,
    undefined
  );
  const validatedAmbiguous = validateAiPlan(ambiguousPromptPlan, ctx);
  assert(
    validatedAmbiguous.validatedPlan.status === "NEEDS_CLARIFICATION",
    "8.1 Ambiguous entity yields NEEDS_CLARIFICATION"
  );
  assert(
    validatedAmbiguous.validatedPlan.status !== "NEEDS_CONFIRMATION",
    "8.2 Ambiguous entity is strictly NOT marked as NEEDS_CONFIRMATION"
  );
  assert(
    validatedAmbiguous.validatedPlan.clarificationState !== undefined,
    "8.3 Clarification candidate state is provided for disambiguation"
  );

  // 8.2 Resolved Task in specific context -> NEEDS_CONFIRMATION
  const contextualCtx = createTestContext({ currentProjectId: "prj_alpha" });
  const exactPromptPlan = parseHeuristicIntent(
    "hapus task Setup Database Postgres",
    contextualCtx,
    undefined
  );
  const validatedExact = validateAiPlan(exactPromptPlan, contextualCtx);
  assert(
    validatedExact.validatedPlan.status === "NEEDS_CONFIRMATION",
    "8.4 Disambiguated task properly advances to NEEDS_CONFIRMATION"
  );

  // -------------------------------------------------------------
  // 9. RBAC & PERMISSION BOUNDARY HARDENING
  // -------------------------------------------------------------
  console.log("\n--- 9. RBAC & Permission Boundary Hardening ---");

  // 9.1 VIEWER attempting destructive action -> FORBIDDEN, no executable plan
  const viewerCtx = createTestContext({
    userId: "usr_viewer_1",
    userRole: "VIEWER",
    currentProjectId: "prj_alpha",
  });
  const viewerDeletePlan = parseHeuristicIntent(
    "hapus task Desain Wireframe Homepage",
    viewerCtx,
    undefined
  );
  const validatedViewer = validateAiPlan(viewerDeletePlan, viewerCtx);
  assert(
    validatedViewer.validatedPlan.status === "FORBIDDEN" && !validatedViewer.isValid,
    "9.1 VIEWER attempting DELETE_TASK returns FORBIDDEN"
  );
  assert(
    validatedViewer.validatedPlan.actions[0]?.status === "FORBIDDEN",
    "9.2 Action inside plan is marked FORBIDDEN"
  );

  // 9.2 Execution rejected if permission fails
  const execViewerRes = await executeAiPlan(validatedViewer.validatedPlan, viewerCtx);
  assert(!execViewerRes.success, "9.3 executeAiPlan rejects unauthorized action for VIEWER role");

  // -------------------------------------------------------------
  // 10. STALE ENTITY DETECTION REVALIDATION
  // -------------------------------------------------------------
  console.log("\n--- 10. Stale Entity Detection Revalidation ---");

  const snapshots = extractTargetEntitySnapshots(deleteTaskPlan.actions, ctx);
  assert(snapshots.some((s) => s.id === "tsk_103"), "10.1 extractTargetEntitySnapshots captures target task ID");
  assert(snapshots.some((s) => s.type === "TASK"), "10.2 Snapshot captures TASK entity type");

  // Plan created with snapshot
  const snapFp = createPlanFingerprint({
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    planId: "plan_snap_1",
    actions: deleteTaskPlan.actions,
    targetEntitySnapshots: snapshots,
  });

  // Altering snapshot (simulating entity modification by another user) alters fingerprint
  const modifiedSnapshots = [{ ...snapshots[0], updatedAt: "2026-08-30T10:00:00.000Z" }];
  const modifiedSnapFp = createPlanFingerprint({
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    planId: "plan_snap_1",
    actions: deleteTaskPlan.actions,
    targetEntitySnapshots: modifiedSnapshots,
  });
  assert(snapFp !== modifiedSnapFp, "10.3 Entity state change alters plan fingerprint (Stale Entity Detection)");

  // -------------------------------------------------------------
  // 11. UNDO, RECEIPTS & ROLLBACK AUTHORIZATION
  // -------------------------------------------------------------
  console.log("\n--- 11. Undo, Receipts & Rollback Authorization ---");

  const validExecReceipt = await executeAiPlan(validCreate.validatedPlan, ctx);
  assert(validExecReceipt.success, "11.1 Non-destructive mutation executes and produces receipt");
  assert(validExecReceipt.receipt !== undefined, "11.2 Execution receipt contains audit details");

  // Generate undo plan
  const undoResult = generateUndoPlanFromReceipt(validExecReceipt.receipt!, ctx);
  assert(undoResult.plan !== undefined, "11.3 Reversible execution produces valid Undo plan");
  assert(undoResult.plan?.actions[0]?.type === "DELETE_TASK", "11.4 Undo of CREATE_TASK is DELETE_TASK");

  // Attempting to execute Undo plan with VIEWER role is blocked
  const undoViewerRes = await executeAiPlan(undoResult.plan!, viewerCtx);
  assert(!undoViewerRes.success, "11.5 Undo plan cannot bypass RBAC authorization for VIEWER");

  // -------------------------------------------------------------
  // 12. TTL EXPIRATION & SUBSEQUENT PLAN INVALIDATION
  // -------------------------------------------------------------
  console.log("\n--- 12. TTL Expiration & Subsequent Plan Invalidation ---");

  // 12.1 Simulated expired token
  const expRecord = registerPendingConfirmation(validDelTask.validatedPlan, ctx);
  expRecord.expiresAt = new Date(Date.now() - 5000).toISOString(); // 5 seconds in past
  const expVal = validatePendingConfirmation({
    token: expRecord.token,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });
  assert(Boolean(!expVal.isValid && expVal.error?.includes("kadaluarsa")), "12.1 Expired confirmation token is rejected");

  // 12.2 Registering Plan B automatically invalidates pending Plan A for same user
  const planARecord = registerPendingConfirmation(validDelTask.validatedPlan, ctx);
  const planBRecord = registerPendingConfirmation(validDelProj.validatedPlan, ctx);
  const valPlanA = validatePendingConfirmation({
    token: planARecord.token,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });
  assert(Boolean(!valPlanA.isValid && valPlanA.error?.includes("CANCELLED")), "12.2 Generating new plan invalidates previous pending confirmation");

  const valPlanB = validatePendingConfirmation({
    token: planBRecord.token,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });
  assert(Boolean(valPlanB.isValid), "12.3 Latest pending confirmation remains valid");

  // -------------------------------------------------------------
  // 13. EXACT BATCH BOUNDARY (50 ALLOWED, 51 REJECTED)
  // -------------------------------------------------------------
  console.log("\n--- 13. Exact Batch Boundary (50 Allowed, 51 Rejected) ---");

  const batch50Actions: AiAction[] = Array.from({ length: 50 }, (_, i) => ({
    id: `act_b50_${i}`,
    type: "CREATE_TASK",
    payload: { title: `Batch Task ${i}`, projectId: "prj_alpha" },
    summary: `Create task ${i}`,
    riskLevel: "MEDIUM",
    requiredRole: "MEMBER",
    status: "READY",
  }));
  const batch50Plan: AiPlan = {
    id: "plan_batch_50",
    userPrompt: "buat 50 task",
    assistantMessage: "Membuat 50 task",
    actions: batch50Actions,
    status: "READY",
    requiresConfirmation: false,
    isDestructive: false,
    warnings: [],
    planner: "heuristic",
    provider: "fallback",
    createdAt: new Date().toISOString(),
  };
  const validBatch50 = validateAiPlan(batch50Plan, ctx);
  assert(validBatch50.isValid && validBatch50.validatedPlan.actions.length === 50, "13.1 Batch of exactly 50 actions is allowed");

  const batch51Actions: AiAction[] = Array.from({ length: 51 }, (_, i) => ({
    id: `act_b51_${i}`,
    type: "CREATE_TASK",
    payload: { title: `Batch Task ${i}`, projectId: "prj_alpha" },
    summary: `Create task ${i}`,
    riskLevel: "MEDIUM",
    requiredRole: "MEMBER",
    status: "READY",
  }));
  const batch51Plan: AiPlan = {
    id: "plan_batch_51",
    userPrompt: "buat 51 task",
    assistantMessage: "Membuat 51 task",
    actions: batch51Actions,
    status: "READY",
    requiresConfirmation: false,
    isDestructive: false,
    warnings: [],
    planner: "heuristic",
    provider: "fallback",
    createdAt: new Date().toISOString(),
  };
  const validBatch51 = validateAiPlan(batch51Plan, ctx);
  assert(!validBatch51.isValid && validBatch51.errors.some((e) => e.includes("maksimum 50")), "13.2 Batch of 51 actions is rejected");

  // -------------------------------------------------------------
  // 14. ROLE DOWNGRADE DETECTION
  // -------------------------------------------------------------
  console.log("\n--- 14. Role Downgrade Detection ---");

  // Admin created a DELETE_PROJECT plan
  const adminDelPlan = validateAiPlan(delProjPlan, ctx).validatedPlan;
  assert(adminDelPlan.status === "NEEDS_CONFIRMATION", "14.1 Admin generated valid destructive plan");

  // Before confirm, user role is demoted to MEMBER
  const demotedCtx = createTestContext({ userRole: "MEMBER" });
  const revalidatedPlan = validateAiPlan(adminDelPlan, demotedCtx);
  assert(!revalidatedPlan.isValid && revalidatedPlan.validatedPlan.status === "FORBIDDEN", "14.2 Role downgrade from ADMIN to MEMBER rejects DELETE_PROJECT");

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log("\n=======================================================");
  console.log(`  PHASE 7 VERIFICATION RESULTS: ${passedTests} / ${totalTests} PASS`);
  console.log("=======================================================\n");

  if (passedTests === totalTests) {
    console.log("🎉 ALL PHASE 7 CONFIRMATION & SAFETY TESTS PASSED!\n");
    process.exit(0);
  } else {
    console.error(`❌ ${totalTests - passedTests} TESTS FAILED.`);
    process.exit(1);
  }
}

runPhase7SecuritySuite().catch((err) => {
  console.error("FATAL SUITE ERROR:", err);
  process.exit(1);
});
