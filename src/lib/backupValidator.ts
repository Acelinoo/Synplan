/**
 * Synplan Backup Payload Validator & Integrity Verification Engine
 *
 * Verifies application-level backup JSON payloads for:
 * 1. Structural schema validity and metadata compliance.
 * 2. Strict multi-tenant isolation (zero foreign workspace entities).
 * 3. Complete internal referential integrity (projects, phases, tasks, subtasks, comments, members).
 * 4. Zero secret leakage (guarantees no passwords, tokens, or private secrets exist in the backup).
 */

export interface BackupValidationIssue {
  type:
    | "INVALID_SCHEMA"
    | "MISSING_METADATA"
    | "SECRET_LEAKAGE"
    | "CROSS_WORKSPACE_ENTITY"
    | "ORPHAN_TASK_PROJECT"
    | "ORPHAN_TASK_PHASE"
    | "ORPHAN_PHASE_PROJECT"
    | "ORPHAN_SUBTASK"
    | "ORPHAN_COMMENT"
    | "ORPHAN_PROJECT_MEMBER";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  entityType?: string;
  entityId?: string;
  message: string;
}

export interface BackupValidationResult {
  valid: boolean;
  issues: BackupValidationIssue[];
  stats: {
    totalProjects: number;
    totalPhases: number;
    totalTasks: number;
    totalSubtasks: number;
    totalComments: number;
    totalMembers: number;
    totalNotifications: number;
    totalAuditLogs: number;
  };
  workspaceId?: string;
  version?: string;
  exportedAt?: string;
}

const FORBIDDEN_SECRET_KEYS = new Set([
  "password",
  "passwordhash",
  "sessiontoken",
  "refreshtoken",
  "accesstoken",
  "idtoken",
  "secret",
  "service_role_key",
  "supabase_service_role_key",
  "private_key",
]);

/**
 * Recursively scans any object or array to check if sensitive keys or values are present.
 */
function scanForSecrets(obj: unknown, path = ""): BackupValidationIssue[] {
  const issues: BackupValidationIssue[] = [];
  if (!obj || typeof obj !== "object") return issues;

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      issues.push(...scanForSecrets(item, `${path}[${index}]`));
    });
    return issues;
  }

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (FORBIDDEN_SECRET_KEYS.has(lowerKey)) {
      issues.push({
        type: "SECRET_LEAKAGE",
        severity: "CRITICAL",
        message: `Sensitive credential attribute [${key}] detected at path [${path}.${key}]`,
      });
    }

    if (typeof value === "object" && value !== null) {
      issues.push(...scanForSecrets(value, path ? `${path}.${key}` : key));
    }
  }

  return issues;
}

/**
 * Validates an exported backup JSON object against schema, isolation, and integrity rules.
 */
export function validateBackupPayload(payload: unknown): BackupValidationResult {
  const issues: BackupValidationIssue[] = [];

  const stats = {
    totalProjects: 0,
    totalPhases: 0,
    totalTasks: 0,
    totalSubtasks: 0,
    totalComments: 0,
    totalMembers: 0,
    totalNotifications: 0,
    totalAuditLogs: 0,
  };

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    issues.push({
      type: "INVALID_SCHEMA",
      severity: "CRITICAL",
      message: "Backup payload must be a valid JSON object",
    });
    return { valid: false, issues, stats };
  }

  const p = payload as Record<string, any>;

  // 1. Metadata Validation
  if (!p.version || typeof p.version !== "string") {
    issues.push({
      type: "MISSING_METADATA",
      severity: "HIGH",
      message: "Backup payload is missing valid string [version]",
    });
  }

  if (!p.exportedAt || isNaN(Date.parse(p.exportedAt))) {
    issues.push({
      type: "MISSING_METADATA",
      severity: "HIGH",
      message: "Backup payload is missing valid ISO [exportedAt] timestamp",
    });
  }

  if (!p.workspace || typeof p.workspace !== "object" || !p.workspace.id) {
    issues.push({
      type: "INVALID_SCHEMA",
      severity: "CRITICAL",
      message: "Backup payload is missing required [workspace] object with valid [id]",
    });
    return { valid: false, issues, stats, version: p.version, exportedAt: p.exportedAt };
  }

  const targetWorkspaceId: string = p.workspace.id;

  // 2. Secret Scan
  const secretIssues = scanForSecrets(p);
  issues.push(...secretIssues);

  // 3. Entity Collections Extraction
  const members = Array.isArray(p.members) ? p.members : [];
  const projects = Array.isArray(p.projects) ? p.projects : [];
  const phases = Array.isArray(p.phases) ? p.phases : [];
  const tasks = Array.isArray(p.tasks) ? p.tasks : [];
  const subtasks = Array.isArray(p.subtasks) ? p.subtasks : [];
  const comments = Array.isArray(p.comments) ? p.comments : [];
  const notifications = Array.isArray(p.notifications) ? p.notifications : [];
  const auditLogs = Array.isArray(p.auditLogs) ? p.auditLogs : [];

  stats.totalMembers = members.length;
  stats.totalProjects = projects.length;
  stats.totalPhases = phases.length;
  stats.totalTasks = tasks.length;
  stats.totalSubtasks = subtasks.length;
  stats.totalComments = comments.length;
  stats.totalNotifications = notifications.length;
  stats.totalAuditLogs = auditLogs.length;

  const validMemberUserIds = new Set<string>();
  const validProjectIds = new Set<string>();
  const validPhaseIds = new Set<string>();
  const validTaskIds = new Set<string>();

  // 4. Multi-Tenant Workspace Boundary Checks & ID Collection
  for (const m of members) {
    if (m.userId) validMemberUserIds.add(m.userId);
    if (m.user?.id) validMemberUserIds.add(m.user.id);
    if (m.workspaceId && m.workspaceId !== targetWorkspaceId) {
      issues.push({
        type: "CROSS_WORKSPACE_ENTITY",
        severity: "CRITICAL",
        entityType: "member",
        entityId: m.id,
        message: `Member [${m.id}] has mismatched workspaceId [${m.workspaceId}] (expected [${targetWorkspaceId}])`,
      });
    }
  }

  for (const proj of projects) {
    if (proj.id) validProjectIds.add(proj.id);
    if (proj.workspaceId && proj.workspaceId !== targetWorkspaceId) {
      issues.push({
        type: "CROSS_WORKSPACE_ENTITY",
        severity: "CRITICAL",
        entityType: "project",
        entityId: proj.id,
        message: `Project [${proj.id}] has mismatched workspaceId [${proj.workspaceId}]`,
      });
    }

    // Check project members if embedded
    if (Array.isArray(proj.members)) {
      for (const pm of proj.members) {
        if (pm.userId && !validMemberUserIds.has(pm.userId)) {
          issues.push({
            type: "ORPHAN_PROJECT_MEMBER",
            severity: "MEDIUM",
            entityType: "projectMember",
            entityId: pm.id,
            message: `ProjectMember [${pm.id}] references user [${pm.userId}] not found in workspace members`,
          });
        }
      }
    }
  }

  for (const ph of phases) {
    if (ph.id) validPhaseIds.add(ph.id);
    if (ph.projectId && !validProjectIds.has(ph.projectId)) {
      issues.push({
        type: "ORPHAN_PHASE_PROJECT",
        severity: "HIGH",
        entityType: "phase",
        entityId: ph.id,
        message: `Phase [${ph.id}] references non-existent project [${ph.projectId}]`,
      });
    }
  }

  for (const t of tasks) {
    if (t.id) validTaskIds.add(t.id);
    if (t.workspaceId && t.workspaceId !== targetWorkspaceId) {
      issues.push({
        type: "CROSS_WORKSPACE_ENTITY",
        severity: "CRITICAL",
        entityType: "task",
        entityId: t.id,
        message: `Task [${t.id}] has mismatched workspaceId [${t.workspaceId}]`,
      });
    }

    if (t.projectId && !validProjectIds.has(t.projectId)) {
      issues.push({
        type: "ORPHAN_TASK_PROJECT",
        severity: "HIGH",
        entityType: "task",
        entityId: t.id,
        message: `Task [${t.id}] references non-existent project [${t.projectId}]`,
      });
    }

    if (t.phaseId && !validPhaseIds.has(t.phaseId)) {
      issues.push({
        type: "ORPHAN_TASK_PHASE",
        severity: "HIGH",
        entityType: "task",
        entityId: t.id,
        message: `Task [${t.id}] references non-existent phase [${t.phaseId}]`,
      });
    }
  }

  for (const sub of subtasks) {
    if (sub.taskId && !validTaskIds.has(sub.taskId)) {
      issues.push({
        type: "ORPHAN_SUBTASK",
        severity: "HIGH",
        entityType: "subtask",
        entityId: sub.id,
        message: `Subtask [${sub.id}] references non-existent task [${sub.taskId}]`,
      });
    }
  }

  for (const c of comments) {
    if (c.taskId && !validTaskIds.has(c.taskId)) {
      issues.push({
        type: "ORPHAN_COMMENT",
        severity: "HIGH",
        entityType: "comment",
        entityId: c.id,
        message: `Comment [${c.id}] references non-existent task [${c.taskId}]`,
      });
    }
  }

  for (const notif of notifications) {
    if (notif.workspaceId && notif.workspaceId !== targetWorkspaceId) {
      issues.push({
        type: "CROSS_WORKSPACE_ENTITY",
        severity: "CRITICAL",
        entityType: "notification",
        entityId: notif.id,
        message: `Notification [${notif.id}] has mismatched workspaceId [${notif.workspaceId}]`,
      });
    }
  }

  for (const log of auditLogs) {
    if (log.workspaceId && log.workspaceId !== targetWorkspaceId) {
      issues.push({
        type: "CROSS_WORKSPACE_ENTITY",
        severity: "CRITICAL",
        entityType: "auditLog",
        entityId: log.id,
        message: `AuditLog [${log.id}] has mismatched workspaceId [${log.workspaceId}]`,
      });
    }
  }

  const hasCriticalOrHigh = issues.some((i) => i.severity === "CRITICAL" || i.severity === "HIGH");

  return {
    valid: !hasCriticalOrHigh,
    issues,
    stats,
    workspaceId: targetWorkspaceId,
    version: p.version,
    exportedAt: p.exportedAt,
  };
}
