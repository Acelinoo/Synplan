import { prisma } from "./prisma";
import { TaskStatus } from "@prisma/client";

export interface ConsistencyIssue {
  type: string;
  entityType: "workspace" | "project" | "task" | "phase" | "member" | "user";
  entityId: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  message: string;
}

export interface ConsistencyCheckResult {
  healthy: boolean;
  checkedAt: string;
  workspaceId: string;
  checks: {
    workspaceIsolation: "PASS" | "FAIL";
    referentialIntegrity: "PASS" | "FAIL";
    businessInvariants: "PASS" | "FAIL";
  };
  issues: ConsistencyIssue[];
  stats: {
    totalTasksChecked: number;
    totalProjectsChecked: number;
    totalPhasesChecked: number;
    totalMembersChecked: number;
  };
}

/**
 * Validates data consistency, multi-tenant isolation, referential integrity,
 * and business domain invariants for a specific workspace.
 *
 * Guaranteed READ-ONLY: never mutates or deletes data.
 */
export async function checkWorkspaceDataConsistency(workspaceId: string): Promise<ConsistencyCheckResult> {
  const issues: ConsistencyIssue[] = [];

  // 1. Fetch all relevant entities in parallel with boundary limits
  const [
    workspace,
    members,
    projects,
    tasks,
    phases,
  ] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, ownerId: true },
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, email: true } } },
    }),
    prisma.project.findMany({
      where: { workspaceId },
      include: {
        members: { select: { id: true, userId: true, projectId: true } },
      },
    }),
    prisma.task.findMany({
      where: { workspaceId },
      select: {
        id: true,
        workspaceId: true,
        projectId: true,
        phaseId: true,
        assigneeId: true,
        status: true,
      },
    }),
    prisma.phase.findMany({
      where: { project: { workspaceId } },
      select: {
        id: true,
        projectId: true,
        name: true,
        order: true,
      },
    }),
  ]);

  if (!workspace) {
    return {
      healthy: false,
      checkedAt: new Date().toISOString(),
      workspaceId,
      checks: {
        workspaceIsolation: "FAIL",
        referentialIntegrity: "FAIL",
        businessInvariants: "FAIL",
      },
      issues: [
        {
          type: "WORKSPACE_NOT_FOUND",
          entityType: "workspace",
          entityId: workspaceId,
          severity: "CRITICAL",
          message: `Target workspace [${workspaceId}] does not exist in database`,
        },
      ],
      stats: {
        totalTasksChecked: 0,
        totalProjectsChecked: 0,
        totalPhasesChecked: 0,
        totalMembersChecked: 0,
      },
    };
  }

  const validUserIds = new Set(members.map((m) => m.userId));
  const validProjectMap = new Map(projects.map((p) => [p.id, p]));
  const validPhaseMap = new Map(phases.map((p) => [p.id, p]));

  let hasIsolationFailure = false;
  let hasRefIntegrityFailure = false;
  let hasBusinessInvariantFailure = false;

  // --------------------------------------------------------------------------
  // CHECK 1: WORKSPACE ISOLATION & REFERENTIAL INTEGRITY ON MEMBERS
  // --------------------------------------------------------------------------
  for (const member of members) {
    if (member.workspaceId !== workspaceId) {
      hasIsolationFailure = true;
      issues.push({
        type: "CROSS_TENANT_MEMBER",
        entityType: "member",
        entityId: member.id,
        severity: "CRITICAL",
        message: `WorkspaceMember [${member.id}] has mismatched workspaceId [${member.workspaceId}]`,
      });
    }
    if (!member.user) {
      hasRefIntegrityFailure = true;
      issues.push({
        type: "ORPHAN_MEMBER_USER",
        entityType: "member",
        entityId: member.id,
        severity: "HIGH",
        message: `WorkspaceMember [${member.id}] references non-existent user [${member.userId}]`,
      });
    }
  }

  // --------------------------------------------------------------------------
  // CHECK 2: PROJECT MEMBER INTEGRITY
  // --------------------------------------------------------------------------
  for (const project of projects) {
    if (project.workspaceId !== workspaceId) {
      hasIsolationFailure = true;
      issues.push({
        type: "CROSS_TENANT_PROJECT",
        entityType: "project",
        entityId: project.id,
        severity: "CRITICAL",
        message: `Project [${project.id}] has mismatched workspaceId [${project.workspaceId}]`,
      });
    }

    // Business Invariant: progress in 0..100
    if (project.progress < 0 || project.progress > 100) {
      hasBusinessInvariantFailure = true;
      issues.push({
        type: "INVALID_PROJECT_PROGRESS",
        entityType: "project",
        entityId: project.id,
        severity: "HIGH",
        message: `Project [${project.id}] has invalid progress [${project.progress}%] (must be 0-100)`,
      });
    }

    // Check project members are members of the workspace
    for (const pm of project.members) {
      if (!validUserIds.has(pm.userId)) {
        hasRefIntegrityFailure = true;
        issues.push({
          type: "ORPHAN_PROJECT_MEMBER",
          entityType: "member",
          entityId: pm.id,
          severity: "HIGH",
          message: `ProjectMember [${pm.id}] references user [${pm.userId}] who is not a member of workspace [${workspaceId}]`,
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // CHECK 3: TASK INTEGRITY & ISOLATION
  // --------------------------------------------------------------------------
  const validStatuses = new Set<string>(Object.values(TaskStatus));

  // Pre-fetch any project references not belonging to this workspace
  const unmappedProjectIds = Array.from(
    new Set(
      tasks
        .map((t) => t.projectId)
        .filter((pid): pid is string => Boolean(pid && !validProjectMap.has(pid)))
    )
  );

  const crossWorkspaceProjects = unmappedProjectIds.length > 0
    ? await prisma.project.findMany({
        where: { id: { in: unmappedProjectIds } },
        select: { id: true, workspaceId: true },
      })
    : [];

  const crossWorkspaceProjectMap = new Map(crossWorkspaceProjects.map((p) => [p.id, p]));

  for (const task of tasks) {
    if (task.workspaceId !== workspaceId) {
      hasIsolationFailure = true;
      issues.push({
        type: "CROSS_TENANT_TASK",
        entityType: "task",
        entityId: task.id,
        severity: "CRITICAL",
        message: `Task [${task.id}] has mismatched workspaceId [${task.workspaceId}]`,
      });
    }

    if (task.projectId) {
      const parentProject = validProjectMap.get(task.projectId);
      if (parentProject) {
        if (parentProject.workspaceId !== workspaceId) {
          hasIsolationFailure = true;
          issues.push({
            type: "CROSS_WORKSPACE_TASK_PROJECT",
            entityType: "task",
            entityId: task.id,
            severity: "CRITICAL",
            message: `Task [${task.id}] belongs to project [${task.projectId}] which belongs to a different workspace`,
          });
        }
      } else {
        const crossProject = crossWorkspaceProjectMap.get(task.projectId);
        if (crossProject) {
          hasIsolationFailure = true;
          issues.push({
            type: "CROSS_WORKSPACE_TASK_PROJECT",
            entityType: "task",
            entityId: task.id,
            severity: "CRITICAL",
            message: `Task [${task.id}] belongs to project [${task.projectId}] in foreign workspace [${crossProject.workspaceId}]`,
          });
        } else {
          hasRefIntegrityFailure = true;
          issues.push({
            type: "ORPHAN_TASK_PROJECT",
            entityType: "task",
            entityId: task.id,
            severity: "HIGH",
            message: `Task [${task.id}] references non-existent project [${task.projectId}]`,
          });
        }
      }
    }

    if (task.phaseId) {
      const parentPhase = validPhaseMap.get(task.phaseId);
      if (!parentPhase) {
        hasRefIntegrityFailure = true;
        issues.push({
          type: "ORPHAN_TASK_PHASE",
          entityType: "task",
          entityId: task.id,
          severity: "MEDIUM",
          message: `Task [${task.id}] references non-existent phase [${task.phaseId}]`,
        });
      }
    }

    if (task.assigneeId && !validUserIds.has(task.assigneeId)) {
      hasRefIntegrityFailure = true;
      issues.push({
        type: "INVALID_TASK_ASSIGNEE",
        entityType: "task",
        entityId: task.id,
        severity: "HIGH",
        message: `Task [${task.id}] assigned to user [${task.assigneeId}] who is not a member of workspace [${workspaceId}]`,
      });
    }

    if (!validStatuses.has(task.status)) {
      hasBusinessInvariantFailure = true;
      issues.push({
        type: "INVALID_TASK_STATUS",
        entityType: "task",
        entityId: task.id,
        severity: "MEDIUM",
        message: `Task [${task.id}] has invalid status [${task.status}]`,
      });
    }
  }

  // --------------------------------------------------------------------------
  // CHECK 4: PHASE ORDER UNIQUENESS & PROJECT MAPPING
  // --------------------------------------------------------------------------
  const projectPhasesMap = new Map<string, typeof phases>();
  for (const ph of phases) {
    const list = projectPhasesMap.get(ph.projectId) || [];
    list.push(ph);
    projectPhasesMap.set(ph.projectId, list);
  }

  for (const [projId, projPhases] of projectPhasesMap.entries()) {
    const orders = new Set<number>();
    for (const ph of projPhases) {
      if (orders.has(ph.order)) {
        hasBusinessInvariantFailure = true;
        issues.push({
          type: "DUPLICATE_PHASE_ORDER",
          entityType: "phase",
          entityId: ph.id,
          severity: "MEDIUM",
          message: `Phase [${ph.id}] has duplicate order [${ph.order}] in project [${projId}]`,
        });
      }
      orders.add(ph.order);
    }
  }

  const healthy = issues.length === 0;

  return {
    healthy,
    checkedAt: new Date().toISOString(),
    workspaceId,
    checks: {
      workspaceIsolation: hasIsolationFailure ? "FAIL" : "PASS",
      referentialIntegrity: hasRefIntegrityFailure ? "FAIL" : "PASS",
      businessInvariants: hasBusinessInvariantFailure ? "FAIL" : "PASS",
    },
    issues,
    stats: {
      totalTasksChecked: tasks.length,
      totalProjectsChecked: projects.length,
      totalPhasesChecked: phases.length,
      totalMembersChecked: members.length,
    },
  };
}
