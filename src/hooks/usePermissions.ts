"use client";

import { useWorkspaceStore } from "@/store";
import { Permission, hasPermission } from "@/lib/permissions";
import { MemberRole } from "@/types";
import { Role } from "@prisma/client";

/**
 * Reactive Client Hook for Permission-Aware UI / UX.
 * Note: Frontend restrictions provide UX guidance only;
 * all mutations and security rules are strictly enforced server-side.
 */
export function usePermissions() {
  const { activeWorkspace } = useWorkspaceStore();

  const rawRole = (activeWorkspace as any)?.role || "OWNER";
  const upperRole = String(rawRole).toUpperCase();
  const normalizedRole = (
    Object.values(Role).includes(upperRole as Role)
      ? (upperRole as Role)
      : Role.OWNER
  );

  const can = (permission: Permission): boolean => {
    return hasPermission(normalizedRole, permission);
  };

  return {
    role: rawRole.toLowerCase() as MemberRole,
    normalizedRole,
    isOwner: normalizedRole === Role.OWNER,
    isAdmin: normalizedRole === Role.ADMIN,
    isMember: normalizedRole === Role.MEMBER,
    isViewer: normalizedRole === Role.VIEWER,
    can,
    canManageMembers: can("members.invite") || can("members.update_role") || can("members.remove"),
  };
}
