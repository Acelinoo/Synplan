import { Role } from "@prisma/client";
import { AiActionType, ActionRiskLevel } from "./types";
import { Permission, hasPermission } from "@/lib/permissions";

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiredRole: Role;
  requiredPermission: Permission;
  actualRole: Role;
  riskLevel: ActionRiskLevel;
}

export const ACTION_PERMISSION_MAPPINGS: Record<
  AiActionType,
  { permission: Permission; role: Role; risk: ActionRiskLevel }
> = {
  CREATE_PROJECT: { permission: "projects.create", role: Role.MEMBER, risk: "MEDIUM" },
  UPDATE_PROJECT: { permission: "projects.update", role: Role.MEMBER, risk: "MEDIUM" },
  DELETE_PROJECT: { permission: "projects.delete", role: Role.ADMIN, risk: "CRITICAL" },
  CREATE_PHASE: { permission: "phases.create", role: Role.MEMBER, risk: "MEDIUM" },
  UPDATE_PHASE: { permission: "phases.update", role: Role.MEMBER, risk: "MEDIUM" },
  DELETE_PHASE: { permission: "phases.delete", role: Role.ADMIN, risk: "HIGH" },
  CREATE_TASK: { permission: "tasks.create", role: Role.MEMBER, risk: "MEDIUM" },
  UPDATE_TASK: { permission: "tasks.update", role: Role.MEMBER, risk: "MEDIUM" },
  DELETE_TASK: { permission: "tasks.delete", role: Role.MEMBER, risk: "HIGH" },
  ASSIGN_TASK: { permission: "tasks.assign", role: Role.MEMBER, risk: "MEDIUM" },
  ADD_MEMBER: { permission: "projects.update", role: Role.MEMBER, risk: "MEDIUM" },
  ADD_PROJECT_MEMBER: { permission: "projects.update", role: Role.MEMBER, risk: "MEDIUM" },
  REMOVE_MEMBER: { permission: "members.remove", role: Role.ADMIN, risk: "HIGH" },
  REMOVE_PROJECT_MEMBER: { permission: "members.remove", role: Role.ADMIN, risk: "HIGH" },
};

/**
 * Server-side deterministic authorization validator for AI Actions.
 * Evaluates actions against Synplan's Phase 1 granular RBAC matrix.
 */
export function validateActionPermission(
  actionType: AiActionType,
  userRole: Role | string | undefined
): PermissionCheckResult {
  const normalizedUserRole: Role =
    userRole && Object.values(Role).includes(userRole.toUpperCase() as Role)
      ? (userRole.toUpperCase() as Role)
      : Role.VIEWER;

  const spec = ACTION_PERMISSION_MAPPINGS[actionType] || {
    permission: "workspace.view" as Permission,
    role: Role.ADMIN,
    risk: "HIGH" as ActionRiskLevel,
  };

  const allowed = hasPermission(normalizedUserRole, spec.permission);

  if (allowed) {
    return {
      allowed: true,
      requiredRole: spec.role,
      requiredPermission: spec.permission,
      actualRole: normalizedUserRole,
      riskLevel: spec.risk,
    };
  }

  return {
    allowed: false,
    reason: `Izin ditolak: Aksi ${actionType} membutuhkan hak akses '${spec.permission}' (${spec.role}), sedangkan peran Anda adalah ${normalizedUserRole}.`,
    requiredRole: spec.role,
    requiredPermission: spec.permission,
    actualRole: normalizedUserRole,
    riskLevel: spec.risk,
  };
}

