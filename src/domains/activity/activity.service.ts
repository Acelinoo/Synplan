import { prisma } from "@/lib/prisma";

export interface ActivityQueryOptions {
  workspaceId: string;
  projectId?: string;
  actorId?: string;
  entityType?: string;
  action?: string;
  search?: string;
  page?: number;
  limit?: number;
  cursor?: string;
}

export interface ActivityActor {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

export interface ActivityItem {
  id: string;
  workspaceId: string;
  projectId?: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  target: string;
  actor: ActivityActor | null;
  actorType: string;
  timestamp: string;
  summary: string;
  metadata?: Record<string, any> | null;
}

export interface PaginatedActivityResponse {
  items: ActivityItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasMore: boolean;
    nextCursor?: string | null;
  };
}

export class ActivityService {
  /**
   * Generates a clean, user-friendly human-readable summary for an audit log entry.
   */
  private static formatSummary(action: string, actorName: string, payload: any): string {
    const p = payload || {};
    const title = p.taskTitle || p.title || p.name || "item";

    switch (action) {
      case "TASK_CREATED":
      case "CREATE_TASK":
        return `${actorName} created task "${title}"`;
      case "TASK_UPDATED":
      case "UPDATE_TASK":
        return `${actorName} updated task "${title}"`;
      case "TASK_STATUS_CHANGED": {
        const toStatus = p.toStatus || p.newStatus || "updated status";
        return `${actorName} moved "${title}" to ${toStatus}`;
      }
      case "TASK_ASSIGNED": {
        const assignee = p.assigneeName || (p.assigneeId ? "a team member" : "unassigned");
        return `${actorName} assigned "${title}" to ${assignee}`;
      }
      case "TASK_COMPLETED":
        return `${actorName} completed task "${title}"`;
      case "TASK_DELETED":
      case "DELETE_TASK":
        return `${actorName} deleted task "${title}"`;
      case "TASK_DEPENDENCY_CREATED":
        return `${actorName} linked dependency for task "${p.dependentTaskId || title}"`;
      case "TASK_DEPENDENCY_REMOVED":
        return `${actorName} unlinked dependency for task "${p.dependentTaskId || title}"`;
      case "COMMENT_CREATED":
      case "ADD_COMMENT":
        return `${actorName} commented on task "${title}"`;
      case "DELETE_COMMENT":
        return `${actorName} removed a comment on task "${title}"`;
      case "PROJECT_UPDATED":
      case "UPDATE_PROJECT":
        return `${actorName} updated project "${title}"`;
      case "PROJECT_CREATED":
      case "CREATE_PROJECT":
        return `${actorName} created project "${title}"`;
      case "DELETE_PROJECT":
        return `${actorName} deleted project "${title}"`;
      case "CREATE_PHASE":
        return `${actorName} created phase "${title}"`;
      case "UPDATE_PHASE":
        return `${actorName} updated phase "${title}"`;
      case "DELETE_PHASE":
        return `${actorName} deleted phase "${title}"`;
      case "REORDER_PHASES":
        return `${actorName} reordered project phases`;
      case "INVITE_MEMBER":
        return `${actorName} invited member to workspace`;
      case "UPDATE_MEMBER_ROLE":
        return `${actorName} updated member role`;
      case "REMOVE_MEMBER":
        return `${actorName} removed a member from workspace`;
      case "AI_EXECUTION_COMPLETED":
        return `${actorName} executed AI plan`;
      default:
        return `${actorName} performed ${action.toLowerCase().replace(/_/g, " ")}`;
    }
  }

  /**
   * Queries authoritative PostgreSQL AuditLog entries scoped by workspace and optional project/actor/search.
   */
  static async getActivityFeed(options: ActivityQueryOptions): Promise<PaginatedActivityResponse> {
    const { workspaceId, projectId, actorId, entityType, action, search, cursor } = options;
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const page = Math.max(1, options.page || 1);
    const skip = cursor ? 1 : (page - 1) * limit;

    const where: any = {
      workspaceId,
      action: {
        not: "NOTIFICATION_CREATED", // Notifications have their own UI and channels
      },
    };

    if (actorId) {
      where.actorId = actorId;
    }

    if (entityType) {
      where.entityType = entityType;
    }

    if (action) {
      where.action = action;
    }

    const andClauses: any[] = [];

    if (projectId) {
      andClauses.push({
        OR: [
          { entityId: projectId },
          { metadata: { path: ["projectId"], equals: projectId } },
          { after: { path: ["payload", "projectId"], equals: projectId } },
        ],
      });
    }

    if (search && search.trim()) {
      const q = search.trim();
      andClauses.push({
        OR: [
          { target: { contains: q, mode: "insensitive" } },
          { action: { contains: q, mode: "insensitive" } },
          { actor: { name: { contains: q, mode: "insensitive" } } },
        ],
      });
    }

    if (andClauses.length > 0) {
      where.AND = andClauses;
    }

    const [total, records] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: limit,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : { skip }),
        include: {
          actor: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      }),
    ]);

    const items: ActivityItem[] = records.map((record) => {
      const actorName = record.actor?.name || (record.actorType === "AI" ? "AI Assistant" : "System");
      const after = (record.after as any) || {};
      const payload = after.payload || {};
      const meta = (record.metadata as any) || {};
      const resolvedProjectId = meta.projectId || payload.projectId || (record.entityType === "PROJECT" ? record.entityId : null);

      return {
        id: record.id,
        workspaceId: record.workspaceId,
        projectId: resolvedProjectId,
        action: record.action,
        entityType: record.entityType,
        entityId: record.entityId,
        target: record.target,
        actor: record.actor
          ? {
              id: record.actor.id,
              name: record.actor.name,
              email: record.actor.email,
              avatarUrl: record.actor.avatarUrl,
            }
          : null,
        actorType: record.actorType,
        timestamp: record.timestamp.toISOString(),
        summary: this.formatSummary(record.action, actorName, payload),
        metadata: {
          ...meta,
          ...payload,
        },
      };
    });

    const totalPages = Math.ceil(total / limit);
    const nextCursor = records.length > 0 && page < totalPages ? records[records.length - 1].id : null;

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages,
        nextCursor,
      },
    };
  }
}
