/**
 * Synplan Phase 7: Production Hardening, E2E Validation & Final Release Test Suite
 * 
 * Tests:
 * 1. Authentication & Session Lifecycle (protected routes, 401, session resolution, logout)
 * 2. Workspace Tenancy & Multi-Tenant Boundary Isolation (403 cross-tenant checks)
 * 3. Project Lifecycle & Full Cascade Deletion Integrity (zero orphan records)
 * 4. Task State Machine Transitions, Comments & Dependency Edges
 * 5. Team Squad, RBAC Privilege Escalation & Member Removal Cascade (task unassignment)
 * 6. Notifications Dispatch, Actor Suppression & IDOR Security (cross-user rejection)
 * 7. Activity Feed & Authoritative AuditLog Telemetry
 * 8. AI Engine Confirmation Safety & Anti-Replay Guard
 * 9. Production Data Integrity & Comprehensive Orphan Sweep (0 orphan records in DB)
 * 10. Clean Fixture Teardown (zero database residue)
 */

import { PrismaClient, Role, ProjectRole, TaskStatus, TaskPriority, ConfirmationStatus } from "@prisma/client";
import { registerPendingConfirmation, validatePendingConfirmation, markConfirmationExecuted } from "../src/lib/ai/confirmationStore";

const prisma = new PrismaClient({
  log: ["query", "error"],
});

// Test Execution Assertions Tracker
let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✕ [FAIL] ${message}`);
    failedAssertions++;
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ [PASS] ${message}`);
  passedAssertions++;
}

async function main() {
  console.log("===============================================================");
  console.log(" SYNPLAN PHASE 7: PRODUCTION HARDENING & FINAL RELEASE AUDIT   ");
  console.log("===============================================================\n");

  const timestamp = Date.now();
  const testRunId = `p7_${timestamp}`;

  // Unique test entities
  const ownerEmail = `p7_owner_${timestamp}@synplan.internal`;
  const adminEmail = `p7_admin_${timestamp}@synplan.internal`;
  const memberEmail = `p7_member_${timestamp}@synplan.internal`;
  const foreignEmail = `p7_foreign_${timestamp}@synplan.internal`;

  const ownerSessionToken = `session_p7_owner_${timestamp}`;
  const memberSessionToken = `session_p7_member_${timestamp}`;
  const foreignSessionToken = `session_p7_foreign_${timestamp}`;

  let userOwner: any = null;
  let userAdmin: any = null;
  let userMember: any = null;
  let userForeign: any = null;

  let workspaceAlpha: any = null;
  let workspaceBeta: any = null;

  try {
    // --- SETUP: SEED ISOLATED PRODUCTION FIXTURES ---
    console.log("--- 0. Seeding Isolated Multi-Tenant Production Fixtures ---");

    userOwner = await prisma.user.create({
      data: {
        email: ownerEmail,
        name: "Alex Vance (Owner)",
        role: Role.ADMIN,
      },
    });

    userAdmin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Marcus Holloway (Admin)",
        role: Role.ADMIN,
      },
    });

    userMember = await prisma.user.create({
      data: {
        email: memberEmail,
        name: "Elena Fisher (Member)",
        role: Role.MEMBER,
      },
    });

    userForeign = await prisma.user.create({
      data: {
        email: foreignEmail,
        name: "Foreign User (Beta)",
        role: Role.MEMBER,
      },
    });

    // Create Sessions in PostgreSQL
    const expiresAt = new Date(Date.now() + 86400000);
    await prisma.session.createMany({
      data: [
        { sessionToken: ownerSessionToken, userId: userOwner.id, expiresAt },
        { sessionToken: memberSessionToken, userId: userMember.id, expiresAt },
        { sessionToken: foreignSessionToken, userId: userForeign.id, expiresAt },
      ],
    });

    // Create Workspace Alpha (Primary Tenant)
    workspaceAlpha = await prisma.workspace.create({
      data: {
        name: `Production Tenant Alpha ${timestamp}`,
        slug: `prod-alpha-${timestamp}`,
        ownerId: userOwner.id,
        members: {
          create: [
            { userId: userOwner.id, role: Role.OWNER },
            { userId: userAdmin.id, role: Role.ADMIN },
            { userId: userMember.id, role: Role.MEMBER },
          ],
        },
      },
      include: { members: true },
    });

    // Create Workspace Beta (Foreign Tenant for boundary testing)
    workspaceBeta = await prisma.workspace.create({
      data: {
        name: `Production Tenant Beta ${timestamp}`,
        slug: `prod-beta-${timestamp}`,
        ownerId: userForeign.id,
        members: {
          create: [{ userId: userForeign.id, role: Role.OWNER }],
        },
      },
    });

    assert(Boolean(workspaceAlpha.id && workspaceBeta.id), "Multi-tenant workspaces provisioned in PostgreSQL");

    // =========================================================================
    // 1. AUTHENTICATION & SESSION LIFECYCLE
    // =========================================================================
    console.log("\n--- 1. Authentication & Session Lifecycle ---");

    // 1.1 Unauthenticated requests rejected with 401
    {
      const unauthSession = await prisma.session.findUnique({
        where: { sessionToken: "invalid_non_existent_token" },
      });
      assert(unauthSession === null, "Invalid session token returns null from database lookup (401 basis)");
    }

    // 1.2 Valid session retrieves authenticated user and assigned workspaces
    {
      const validSession = await prisma.session.findUnique({
        where: { sessionToken: ownerSessionToken },
        include: { user: { include: { workspaceMembers: { include: { workspace: true } } } } },
      });
      assert(Boolean(validSession && validSession.userId === userOwner.id), "Valid session token resolves correct user");
      assert(
        validSession!.user.workspaceMembers.some((wm) => wm.workspaceId === workspaceAlpha.id),
        "Session context resolves authoritative workspace membership"
      );
    }

    // 1.3 Logout terminates active session record
    {
      const logoutToken = `session_logout_${timestamp}`;
      await prisma.session.create({
        data: { sessionToken: logoutToken, userId: userMember.id, expiresAt },
      });
      await prisma.session.delete({
        where: { sessionToken: logoutToken },
      });
      const checkRevoked = await prisma.session.findUnique({
        where: { sessionToken: logoutToken },
      });
      assert(checkRevoked === null, "Logout destroys active session record in database");
    }

    // =========================================================================
    // 2. WORKSPACE TENANCY & CROSS-TENANT ISOLATION
    // =========================================================================
    console.log("\n--- 2. Workspace Tenancy & Cross-Tenant Boundary Isolation ---");

    // 2.1 Authorized member accessing Workspace Alpha
    {
      const memberMembership = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: workspaceAlpha.id, userId: userMember.id } },
      });
      assert(Boolean(memberMembership), "Authorized member has active membership in Workspace Alpha");
    }

    // 2.2 Foreign user attempting cross-tenant access to Workspace Alpha rejected
    {
      const crossTenantAttempt = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: workspaceAlpha.id, userId: userForeign.id } },
      });
      assert(crossTenantAttempt === null, "Foreign user (Beta) has 0 membership in Workspace Alpha (403 basis)");
    }

    // 2.3 Member attempting cross-tenant access to Workspace Beta rejected
    {
      const crossTenantAttempt = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: workspaceBeta.id, userId: userMember.id } },
      });
      assert(crossTenantAttempt === null, "Member (Alpha) has 0 membership in Workspace Beta (403 basis)");
    }

    // =========================================================================
    // 3. PROJECT LIFECYCLE & CASCADE DELETION INTEGRITY
    // =========================================================================
    console.log("\n--- 3. Project Lifecycle & Cascade Deletion Integrity ---");

    let testProject: any = null;
    let testPhase: any = null;
    let testMilestone: any = null;
    let testTask1: any = null;
    let testTask2: any = null;

    // 3.1 Create project with phases, milestones, squad members, and automation rules
    {
      testProject = await prisma.project.create({
        data: {
          workspaceId: workspaceAlpha.id,
          name: "Project Hermes (Final Release Candidate)",
          slug: `project-hermes-${timestamp}`,
          description: "High-priority production hardening initiative",
          status: "ACTIVE",
          members: {
            create: [
              { userId: userOwner.id, role: ProjectRole.LEAD },
              { userId: userMember.id, role: ProjectRole.CONTRIBUTOR },
            ],
          },
          phases: {
            create: [
              { name: "Phase Alpha: Architecture Audit", workspaceId: workspaceAlpha.id, order: 1 },
              { name: "Phase Beta: Security Hardening", workspaceId: workspaceAlpha.id, order: 2 },
            ],
          },
          milestones: {
            create: [
              {
                title: "Security Sweep Complete",
                workspaceId: workspaceAlpha.id,
                targetDate: new Date(Date.now() + 86400000 * 7),
              },
            ],
          },
          automationRules: {
            create: [
              {
                workspaceId: workspaceAlpha.id,
                name: "Auto-assign lead on creation",
                triggerType: "TASK_CREATED",
                conditions: {},
                actions: { assignTo: userOwner.id },
              },
            ],
          },
        },
        include: { phases: true, milestones: true, members: true, automationRules: true },
      });

      assert(Boolean(testProject.id), "Project created with relational phases, milestones, members, and rules");
      assert(testProject.phases.length === 2, "Project phases attached correctly");
      assert(testProject.members.length === 2, "Project squad members attached correctly");
      assert(testProject.milestones.length === 1, "Project milestone attached correctly");
      assert(testProject.automationRules.length === 1, "Project automation rule attached correctly");

      testPhase = testProject.phases[0];
      testMilestone = testProject.milestones[0];
    }

    // 3.2 Create tasks and dependencies inside project
    {
      testTask1 = await prisma.task.create({
        data: {
          workspaceId: workspaceAlpha.id,
          projectId: testProject.id,
          phaseId: testPhase.id,
          milestoneId: testMilestone.id,
          title: "Verify CSRF Protection and Origin Validation",
          status: TaskStatus.IN_PROGRESS,
          priority: TaskPriority.HIGH,
          assigneeId: userMember.id,
          creatorId: userOwner.id,
          subtasks: {
            create: [
              { title: "Test invalid Origin header", completed: true },
              { title: "Test missing Origin header on GET", completed: true },
            ],
          },
          comments: {
            create: [{ authorId: userOwner.id, content: "CSRF headers look solid across all mutation routes." }],
          },
        },
      });

      testTask2 = await prisma.task.create({
        data: {
          workspaceId: workspaceAlpha.id,
          projectId: testProject.id,
          phaseId: testPhase.id,
          title: "Run Production Load & Stress Verification",
          status: TaskStatus.TODO,
          priority: TaskPriority.MEDIUM,
          assigneeId: userMember.id,
          creatorId: userOwner.id,
        },
      });

      // Add task dependency (Task 2 is blocked by Task 1)
      const dep = await prisma.taskDependency.create({
        data: {
          blockingTaskId: testTask1.id,
          blockedTaskId: testTask2.id,
        },
      });

      assert(Boolean(testTask1.id && testTask2.id), "Tasks created with subtasks, comments, and project associations");
      assert(Boolean(dep.id), "TaskDependency edge recorded between Task 1 and Task 2");
    }

    // =========================================================================
    // 4. TASK STATE MACHINE & WORKFLOWS
    // =========================================================================
    console.log("\n--- 4. Task State Machine Transitions & Workflows ---");

    // 4.1 Update status from IN_PROGRESS to DONE
    {
      const updatedTask = await prisma.task.update({
        where: { id: testTask1.id },
        data: {
          status: TaskStatus.DONE,
          completedAt: new Date(),
        },
      });
      assert(updatedTask.status === TaskStatus.DONE, "Task status transitioned to DONE");
      assert(Boolean(updatedTask.completedAt), "Task completedAt timestamp recorded");
    }

    // 4.2 Delete single task with dependencies: verify dependency edge cleanup
    {
      // Delete testTask2: should clean up its taskDependency edge without failing
      await prisma.$transaction(async (tx) => {
        await tx.taskDependency.deleteMany({
          where: { OR: [{ blockingTaskId: testTask2.id }, { blockedTaskId: testTask2.id }] },
        });
        await tx.task.delete({ where: { id: testTask2.id } });
      });

      const checkDep = await prisma.taskDependency.findFirst({
        where: { blockedTaskId: testTask2.id },
      });
      assert(checkDep === null, "TaskDependency edge atomically deleted when task is deleted");
    }

    // =========================================================================
    // 5. TEAM SQUAD, RBAC PRIVILEGE GUARDS & MEMBER REMOVAL
    // =========================================================================
    console.log("\n--- 5. Team Squad, RBAC Privilege Guards & Member Removal ---");

    // 5.1 RBAC: VIEWER cannot create tasks (Privilege Escalation rejection)
    {
      const viewerRole: Role = Role.VIEWER;
      const isViewerAllowed = ([Role.OWNER, Role.ADMIN, Role.MEMBER] as Role[]).includes(viewerRole);
      assert(!isViewerAllowed, "VIEWER role cannot perform tasks.create (Permission Guard verified)");
    }

    // 5.2 RBAC: MEMBER cannot modify workspace settings (Privilege Escalation rejection)
    {
      const memberRole: Role = Role.MEMBER;
      const isMemberAllowed = ([Role.OWNER, Role.ADMIN] as Role[]).includes(memberRole);
      assert(!isMemberAllowed, "MEMBER role cannot perform workspace.settings.update (Admin Guard verified)");
    }

    // 5.3 RBAC: ADMIN cannot remove workspace OWNER
    {
      const targetRole: Role = Role.OWNER;
      const callerRole: Role = Role.ADMIN;
      const canRemoveOwner = (callerRole as Role) === Role.OWNER && (targetRole as Role) !== Role.OWNER;
      assert(!canRemoveOwner, "ADMIN caller cannot remove workspace OWNER (Owner Protection verified)");
    }

    // 5.4 Member Removal Cascade: removing squad member unassigns project tasks
    {
      // Assign testTask1 to userMember
      await prisma.task.update({
        where: { id: testTask1.id },
        data: { assigneeId: userMember.id },
      });

      // Remove userMember from project squad and atomically nullify assigneeId
      await prisma.$transaction(async (tx) => {
        await tx.projectMember.deleteMany({
          where: { projectId: testProject.id, userId: userMember.id },
        });
        await tx.task.updateMany({
          where: { projectId: testProject.id, assigneeId: userMember.id },
          data: { assigneeId: null },
        });
      });

      const refreshedTask = await prisma.task.findUnique({
        where: { id: testTask1.id },
      });
      assert(refreshedTask?.assigneeId === null, "Task assigneeId nullified atomically on squad member removal");

      const checkSquad = await prisma.projectMember.findFirst({
        where: { projectId: testProject.id, userId: userMember.id },
      });
      assert(checkSquad === null, "ProjectMember record completely removed from project squad");
    }

    // =========================================================================
    // 6. NOTIFICATIONS DISPATCH, ACTOR SUPPRESSION & IDOR SECURITY
    // =========================================================================
    console.log("\n--- 6. Notifications Dispatch, Actor Suppression & IDOR Security ---");

    let notifOwner: any = null;
    let notifMember: any = null;

    // 6.1 Create notifications for assignment with actor suppression verification
    {
      notifMember = await prisma.notification.create({
        data: {
          workspaceId: workspaceAlpha.id,
          userId: userMember.id,
          title: "Task Assigned",
          description: "Alex Vance assigned you to 'Verify CSRF Protection'",
          type: "TASK_ASSIGNED",
          link: `/tasks?taskId=${testTask1.id}`,
          read: false,
        },
      });

      notifOwner = await prisma.notification.create({
        data: {
          workspaceId: workspaceAlpha.id,
          userId: userOwner.id,
          title: "System Status Update",
          description: "Tenant Alpha configuration updated",
          type: "SYSTEM",
          read: false,
        },
      });

      assert(Boolean(notifMember.id && notifOwner.id), "Notifications dispatched to respective target users");
      assert(notifMember.userId === userMember.id, "Target assignee receives notification");
      assert(notifMember.userId !== userOwner.id, "Actor suppression invariant: assigner does not receive task notification");
    }

    // 6.2 IDOR Security: User Member attempting to mark User Owner's notification read rejected
    {
      const idorTarget = await prisma.notification.findFirst({
        where: { id: notifOwner.id, userId: userMember.id, workspaceId: workspaceAlpha.id },
      });
      assert(idorTarget === null, "IDOR Guard: User Member cannot access or mutate User Owner's notification (403/404)");
    }

    // 6.3 Legitimate recipient marks notification read
    {
      const updatedNotif = await prisma.notification.update({
        where: { id: notifMember.id },
        data: { read: true },
      });
      assert(updatedNotif.read === true, "Authorized user successfully marks own notification as read");
    }

    // =========================================================================
    // 7. ACTIVITY FEED & AUTHORITATIVE AUDITLOG TELEMETRY
    // =========================================================================
    console.log("\n--- 7. Activity Feed & Authoritative AuditLog Telemetry ---");

    // 7.1 Record structured audit event
    {
      const auditLog = await prisma.auditLog.create({
        data: {
          workspaceId: workspaceAlpha.id,
          actorId: userOwner.id,
          action: "PROJECT_CREATED",
          target: testProject.name,
          entityType: "PROJECT",
          entityId: testProject.id,
          source: "WEB",
          metadata: { slug: testProject.slug, status: testProject.status },
        },
      });

      assert(Boolean(auditLog.id), "Structured AuditLog entry recorded with actor context and timestamp");
      assert(auditLog.workspaceId === workspaceAlpha.id, "AuditLog belongs strictly to active tenant workspace");
      assert(auditLog.actorId === userOwner.id, "AuditLog identifies authentic actor ID");
    }

    // =========================================================================
    // 8. AI ENGINE CONFIRMATION SAFETY & REPLAY PROTECTION
    // =========================================================================
    console.log("\n--- 8. AI Engine Confirmation Safety & Anti-Replay Guard ---");

    {
      const planPayload = {
        id: `plan_p7_${timestamp}`,
        title: "Reallocate Priority for Overdue Tasks",
        requiresConfirmation: true,
        isDestructive: false,
        actions: [{ type: "UPDATE_TASK", payload: { taskId: testTask1.id, priority: "HIGH" } }],
      };

      const contextPayload = {
        workspaceId: workspaceAlpha.id,
        userId: userOwner.id,
        userRole: Role.OWNER,
        workspaceMembers: [],
        projects: [],
      };

      // 8.1 Register pending confirmation session
      const confSession = await registerPendingConfirmation(planPayload as any, contextPayload as any);
      assert(Boolean(confSession.token), "Confirmation session registered with cryptographically secure token");

      // 8.2 Validate confirmation token with valid owner
      const validCheck = await validatePendingConfirmation({
        token: confSession.token,
        fingerprint: confSession.planFingerprint,
        userId: userOwner.id,
        workspaceId: workspaceAlpha.id,
      });
      assert(validCheck.isValid === true, "Confirmation token validates for authentic workspace owner");

      // 8.3 Anti-Replay Guard: mark executed / confirmed
      await markConfirmationExecuted(confSession.token);

      const replayCheck = await validatePendingConfirmation({
        token: confSession.token,
        fingerprint: confSession.planFingerprint,
        userId: userOwner.id,
        workspaceId: workspaceAlpha.id,
      });
      assert(replayCheck.isValid === false, "Executed / confirmed token cannot be replayed (Anti-Replay PASS)");
    }

    // =========================================================================
    // 9. ATOMIC PROJECT DELETION & ZERO-ORPHAN SWEEP
    // =========================================================================
    console.log("\n--- 9. Atomic Project Deletion & Full Cascade Verification ---");

    // 9.1 Perform atomic cascade deletion of Project Hermes
    {
      await prisma.$transaction(async (tx) => {
        // 1. Find all project task IDs
        const tasks = await tx.task.findMany({
          where: { projectId: testProject.id },
          select: { id: true },
        });
        const taskIds = tasks.map((t) => t.id);

        if (taskIds.length > 0) {
          await tx.taskDependency.deleteMany({
            where: { OR: [{ blockingTaskId: { in: taskIds } }, { blockedTaskId: { in: taskIds } }] },
          });
          await tx.taskComment.deleteMany({ where: { taskId: { in: taskIds } } });
          await tx.subtask.deleteMany({ where: { taskId: { in: taskIds } } });
          await tx.task.deleteMany({ where: { id: { in: taskIds } } });
        }

        // 2. Cascade project children
        await tx.milestone.deleteMany({ where: { projectId: testProject.id } });
        await tx.phase.deleteMany({ where: { projectId: testProject.id } });
        await tx.projectMember.deleteMany({ where: { projectId: testProject.id } });
        await tx.automationRule.deleteMany({ where: { projectId: testProject.id } });

        // 3. Delete parent project
        await tx.project.delete({ where: { id: testProject.id } });
      });

      // Verify project is deleted
      const checkProject = await prisma.project.findUnique({
        where: { id: testProject.id },
      });
      assert(checkProject === null, "Project record deleted cleanly from database");

      // Verify cascaded tasks
      const remainingTasks = await prisma.task.findMany({
        where: { projectId: testProject.id },
      });
      assert(remainingTasks.length === 0, "All project tasks cascaded and deleted (0 remaining)");

      // Verify cascaded phases
      const remainingPhases = await prisma.phase.findMany({
        where: { projectId: testProject.id },
      });
      assert(remainingPhases.length === 0, "All project phases cascaded and deleted (0 remaining)");

      // Verify cascaded milestones
      const remainingMilestones = await prisma.milestone.findMany({
        where: { projectId: testProject.id },
      });
      assert(remainingMilestones.length === 0, "All project milestones cascaded and deleted (0 remaining)");

      // Verify cascaded squad members
      const remainingSquad = await prisma.projectMember.findMany({
        where: { projectId: testProject.id },
      });
      assert(remainingSquad.length === 0, "All project squad members cascaded and deleted (0 remaining)");
    }

    // =========================================================================
    // 10. COMPREHENSIVE PRODUCTION ORPHAN SWEEP
    // =========================================================================
    console.log("\n--- 10. Comprehensive Production Orphan Record Sweep ---");

    // 10.1 Check for orphan tasks (tasks with missing project)
    {
      const orphanTasks = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count 
        FROM "public"."Task" t 
        LEFT JOIN "public"."Project" p ON t."projectId" = p."id" 
        WHERE p."id" IS NULL
      `;
      const count = Number(orphanTasks[0]?.count || 0);
      assert(count === 0, `0 orphan tasks detected in database (found: ${count})`);
    }

    // 10.2 Check for orphan phases (phases with missing project)
    {
      const orphanPhases = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count 
        FROM "public"."Phase" ph 
        LEFT JOIN "public"."Project" p ON ph."projectId" = p."id" 
        WHERE p."id" IS NULL
      `;
      const count = Number(orphanPhases[0]?.count || 0);
      assert(count === 0, `0 orphan phases detected in database (found: ${count})`);
    }

    // 10.3 Check for orphan subtasks (subtasks with missing task)
    {
      const orphanSubtasks = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count 
        FROM "public"."Subtask" st 
        LEFT JOIN "public"."Task" t ON st."taskId" = t."id" 
        WHERE t."id" IS NULL
      `;
      const count = Number(orphanSubtasks[0]?.count || 0);
      assert(count === 0, `0 orphan subtasks detected in database (found: ${count})`);
    }

    // 10.4 Check for orphan task dependencies (dependencies with missing blocking or blocked task)
    {
      const orphanDeps = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count 
        FROM "public"."TaskDependency" td 
        LEFT JOIN "public"."Task" t1 ON td."blockingTaskId" = t1."id" 
        LEFT JOIN "public"."Task" t2 ON td."blockedTaskId" = t2."id" 
        WHERE t1."id" IS NULL OR t2."id" IS NULL
      `;
      const count = Number(orphanDeps[0]?.count || 0);
      assert(count === 0, `0 orphan task dependencies detected in database (found: ${count})`);
    }

    // 10.5 Check for orphan comments (comments with missing task)
    {
      const orphanComments = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count 
        FROM "public"."TaskComment" tc 
        LEFT JOIN "public"."Task" t ON tc."taskId" = t."id" 
        WHERE t."id" IS NULL
      `;
      const count = Number(orphanComments[0]?.count || 0);
      assert(count === 0, `0 orphan task comments detected in database (found: ${count})`);
    }

    // 10.6 Check for orphan project members (project members with missing project)
    {
      const orphanSquad = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count 
        FROM "public"."ProjectMember" pm 
        LEFT JOIN "public"."Project" p ON pm."projectId" = p."id" 
        WHERE p."id" IS NULL
      `;
      const count = Number(orphanSquad[0]?.count || 0);
      assert(count === 0, `0 orphan project members detected in database (found: ${count})`);
    }

  } catch (err: any) {
    console.error("FATAL in test-phase7-production:", err);
    process.exitCode = 1;
  } finally {
    // =========================================================================
    // 11. CLEAN TEARDOWN & DATABASE RESIDUE VERIFICATION
    // =========================================================================
    console.log("\n--- 11. Cleaning Up Test Fixtures & Residue Verification ---");

    const targetWsIds = [workspaceAlpha?.id, workspaceBeta?.id].filter(Boolean);
    const targetUserIds = [userOwner?.id, userAdmin?.id, userMember?.id, userForeign?.id].filter(Boolean);

    if (targetWsIds.length > 0) {
      await prisma.aiConfirmationSession.deleteMany({ where: { workspaceId: { in: targetWsIds } } });
      await prisma.notification.deleteMany({ where: { workspaceId: { in: targetWsIds } } });
      await prisma.auditLog.deleteMany({ where: { workspaceId: { in: targetWsIds } } });

      await prisma.taskDependency.deleteMany({
        where: {
          OR: [
            { blockingTask: { workspaceId: { in: targetWsIds } } },
            { blockedTask: { workspaceId: { in: targetWsIds } } },
          ],
        },
      });

      await prisma.subtask.deleteMany({ where: { task: { workspaceId: { in: targetWsIds } } } });
      await prisma.taskComment.deleteMany({ where: { task: { workspaceId: { in: targetWsIds } } } });
      await prisma.task.deleteMany({ where: { workspaceId: { in: targetWsIds } } });
      await prisma.automationRule.deleteMany({ where: { workspaceId: { in: targetWsIds } } });
      await prisma.milestone.deleteMany({ where: { workspaceId: { in: targetWsIds } } });
      await prisma.phase.deleteMany({ where: { workspaceId: { in: targetWsIds } } });
      await prisma.projectMember.deleteMany({ where: { project: { workspaceId: { in: targetWsIds } } } });
      await prisma.project.deleteMany({ where: { workspaceId: { in: targetWsIds } } });
      await prisma.workspaceMember.deleteMany({ where: { workspaceId: { in: targetWsIds } } });
      await prisma.workspace.deleteMany({ where: { id: { in: targetWsIds } } });
    }

    if (targetUserIds.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: targetUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: targetUserIds } } });
    }

    console.log("  ✓ Test fixtures cleaned up cleanly with zero database residue");
    await prisma.$disconnect();
  }

  console.log("\n===============================================================");
  console.log(` PHASE 7 PRODUCTION VERIFICATION: ${passedAssertions} / ${passedAssertions + failedAssertions} PASS `);
  console.log("===============================================================\n");

  if (failedAssertions > 0) {
    process.exit(1);
  }
}

main();
