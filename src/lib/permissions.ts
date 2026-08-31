import { Role } from "@prisma/client";

/**
 * Explicit granular permissions vocabulary across Synplan.
 * Enforced strictly on server-side authorization layer.
 */
export type Permission =
  // Workspace
  | "workspace.view"
  | "workspace.update"
  | "workspace.delete"
  // Team Members
  | "members.view"
  | "members.invite"
  | "members.update_role"
  | "members.remove"
  // Projects
  | "projects.view"
  | "projects.create"
  | "projects.update"
  | "projects.delete"
  // Tasks
  | "tasks.view"
  | "tasks.create"
  | "tasks.update"
  | "tasks.delete"
  | "tasks.assign"
  | "tasks.change_status"
  | "tasks.change_priority"
  // Phases
  | "phases.view"
  | "phases.create"
  | "phases.update"
  | "phases.delete"
  // Analytics, Audit & Search
  | "analytics.view"
  | "audit.view"
  | "search.view"
  // Backup & Recovery
  | "backup.export"
  | "backup.view";

/**
 * Canonical Role-to-Permission Mapping.
 * Matches existing Synplan behavior and product specifications.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: [
    "workspace.view",
    "workspace.update",
    "workspace.delete",
    "members.view",
    "members.invite",
    "members.update_role",
    "members.remove",
    "projects.view",
    "projects.create",
    "projects.update",
    "projects.delete",
    "tasks.view",
    "tasks.create",
    "tasks.update",
    "tasks.delete",
    "tasks.assign",
    "tasks.change_status",
    "tasks.change_priority",
    "phases.view",
    "phases.create",
    "phases.update",
    "phases.delete",
    "analytics.view",
    "audit.view",
    "search.view",
    "backup.export",
    "backup.view",
  ],
  ADMIN: [
    "workspace.view",
    "workspace.update",
    "members.view",
    "members.invite",
    "members.update_role",
    "members.remove",
    "projects.view",
    "projects.create",
    "projects.update",
    "projects.delete",
    "tasks.view",
    "tasks.create",
    "tasks.update",
    "tasks.delete",
    "tasks.assign",
    "tasks.change_status",
    "tasks.change_priority",
    "phases.view",
    "phases.create",
    "phases.update",
    "phases.delete",
    "analytics.view",
    "audit.view",
    "search.view",
    "backup.export",
    "backup.view",
  ],
  MEMBER: [
    "workspace.view",
    "members.view",
    "projects.view",
    "projects.create",
    "projects.update",
    "tasks.view",
    "tasks.create",
    "tasks.update",
    "tasks.delete",
    "tasks.assign",
    "tasks.change_status",
    "tasks.change_priority",
    "phases.view",
    "phases.create",
    "phases.update",
    "analytics.view",
    "search.view",
  ],
  VIEWER: [
    "workspace.view",
    "members.view",
    "projects.view",
    "tasks.view",
    "phases.view",
    "analytics.view",
    "search.view",
  ],
};

/**
 * Deterministically checks if a role has the given permission.
 */
export function hasPermission(
  role: Role | string | undefined | null,
  permission: Permission
): boolean {
  if (!role) return false;
  const normalizedRole = role.toUpperCase() as Role;
  const permissions = ROLE_PERMISSIONS[normalizedRole];
  if (!permissions) return false;
  return permissions.includes(permission);
}

/**
 * Validates member role modification rules:
 * - OWNER can change ADMIN, MEMBER, VIEWER. (Cannot demote self directly)
 * - ADMIN can only modify MEMBER <-> VIEWER. (Cannot touch OWNER or promote/demote ADMIN)
 * - MEMBER / VIEWER cannot change any role.
 */
export function canModifyRole(
  actorRole: Role | string,
  targetCurrentRole: Role | string,
  targetNewRole: Role | string
): { allowed: boolean; reason?: string } {
  const actor = (actorRole || "").toUpperCase() as Role;
  const targetCurrent = (targetCurrentRole || "").toUpperCase() as Role;
  const targetNew = (targetNewRole || "").toUpperCase() as Role;

  if (actor !== Role.OWNER && actor !== Role.ADMIN) {
    return {
      allowed: false,
      reason: "Forbidden: Only workspace Owner and Admin can modify member roles.",
    };
  }

  // Target is currently OWNER
  if (targetCurrent === Role.OWNER) {
    return {
      allowed: false,
      reason: "Forbidden: Cannot change workspace Owner role.",
    };
  }

  // Attempting to grant OWNER role
  if (targetNew === Role.OWNER) {
    return {
      allowed: false,
      reason: "Forbidden: Cannot grant Owner role via role update. Ownership transfer must be performed explicitly.",
    };
  }

  // ADMIN limitations
  if (actor === Role.ADMIN) {
    if (targetCurrent === Role.ADMIN) {
      return {
        allowed: false,
        reason: "Forbidden: Admins cannot modify other Admin roles.",
      };
    }
    if (targetNew === Role.ADMIN) {
      return {
        allowed: false,
        reason: "Forbidden: Only workspace Owner can promote members to Admin.",
      };
    }
  }

  return { allowed: true };
}

/**
 * Validates member removal rules:
 * - OWNER cannot be removed.
 * - OWNER can remove ADMIN, MEMBER, VIEWER.
 * - ADMIN can remove MEMBER, VIEWER (cannot remove OWNER or another ADMIN).
 * - MEMBER / VIEWER cannot remove members.
 */
export function canRemoveMember(
  actorRole: Role | string,
  targetRole: Role | string
): { allowed: boolean; reason?: string } {
  const actor = (actorRole || "").toUpperCase() as Role;
  const target = (targetRole || "").toUpperCase() as Role;

  if (target === Role.OWNER) {
    return {
      allowed: false,
      reason: "Forbidden: Cannot remove workspace Owner.",
    };
  }

  if (actor === Role.OWNER) {
    return { allowed: true };
  }

  if (actor === Role.ADMIN) {
    if (target === Role.ADMIN) {
      return {
        allowed: false,
        reason: "Forbidden: Admins cannot remove other Admins.",
      };
    }
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "Forbidden: Only workspace Owner and Admin can remove members.",
  };
}
