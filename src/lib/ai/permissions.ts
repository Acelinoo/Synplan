import { Role } from "@prisma/client";
import { AiActionType, ActionRiskLevel } from "./types";

const ROLE_LEVEL: Record<Role, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiredRole: Role;
  actualRole: Role;
  riskLevel: ActionRiskLevel;
}

export const ACTION_ROLE_REQUIREMENTS: Record<AiActionType, { role: Role; risk: ActionRiskLevel }> = {
  CREATE_PROJECT: { role: Role.MEMBER, risk: "MEDIUM" },
  UPDATE_PROJECT: { role: Role.MEMBER, risk: "MEDIUM" },
  DELETE_PROJECT: { role: Role.ADMIN, risk: "HIGH" },
  CREATE_PHASE: { role: Role.MEMBER, risk: "MEDIUM" },
  UPDATE_PHASE: { role: Role.MEMBER, risk: "MEDIUM" },
  DELETE_PHASE: { role: Role.ADMIN, risk: "HIGH" },
  CREATE_TASK: { role: Role.MEMBER, risk: "MEDIUM" },
  UPDATE_TASK: { role: Role.MEMBER, risk: "MEDIUM" },
  DELETE_TASK: { role: Role.MEMBER, risk: "HIGH" },
  ASSIGN_TASK: { role: Role.MEMBER, risk: "MEDIUM" },
  ADD_MEMBER: { role: Role.MEMBER, risk: "MEDIUM" },
  ADD_PROJECT_MEMBER: { role: Role.MEMBER, risk: "MEDIUM" },
  REMOVE_MEMBER: { role: Role.ADMIN, risk: "HIGH" },
  REMOVE_PROJECT_MEMBER: { role: Role.ADMIN, risk: "HIGH" },
};

/**
 * Server-side deterministic authorization validator.
 * Ensures AI actions strictly adhere to workspace RBAC boundaries.
 */
export function validateActionPermission(
  actionType: AiActionType,
  userRole: Role | string | undefined
): PermissionCheckResult {
  const normalizedUserRole: Role =
    userRole && Object.values(Role).includes(userRole.toUpperCase() as Role)
      ? (userRole.toUpperCase() as Role)
      : Role.VIEWER;

  const spec = ACTION_ROLE_REQUIREMENTS[actionType] || { role: Role.ADMIN, risk: "HIGH" };
  const userLevel = ROLE_LEVEL[normalizedUserRole] || 1;
  const requiredLevel = ROLE_LEVEL[spec.role] || 3;

  if (userLevel >= requiredLevel) {
    return {
      allowed: true,
      requiredRole: spec.role,
      actualRole: normalizedUserRole,
      riskLevel: spec.risk,
    };
  }

  return {
    allowed: false,
    reason: `Izin ditolak: Aksi ${actionType} membutuhkan hak akses minimal ${spec.role}, sedangkan peran Anda adalah ${normalizedUserRole}.`,
    requiredRole: spec.role,
    actualRole: normalizedUserRole,
    riskLevel: spec.risk,
  };
}
