import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { validateSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { Permission, hasPermission, ROLE_PERMISSIONS } from "@/lib/permissions";
import { getClientIp } from "@/lib/rateLimit";

export interface AuthContext {
  userId: string;
  workspaceId: string;
  role: Role;
  permissions: readonly Permission[];
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
  };
  ipAddress: string;
}

const roleHierarchy: Record<Role, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};

const KNOWN_ROLES = new Set<string>([Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER]);

/**
 * Strictly verifies user identity, active workspace membership, and RBAC privilege.
 * Prevents cross-tenant data leakage, privilege escalation, IDOR, and identity spoofing attacks.
 */
export async function requireAuthGuard(
  req: NextRequest,
  requiredPermissionOrRole: Permission | Role = "workspace.view",
  overrideWorkspaceId?: string
): Promise<{ auth?: AuthContext; errorResponse?: NextResponse }> {
  try {
    const ipAddress = getClientIp(req);
    let userId: string | null = null;
    let workspaceId = overrideWorkspaceId || req.headers.get("x-synplan-workspace-id");

    // 1. Extract session token from Cookie or Bearer Authorization header
    let sessionToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionToken) {
      const authHeader = req.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        sessionToken = authHeader.substring(7).trim();
      }
    }
    if (!sessionToken) {
      sessionToken = req.headers.get("x-synplan-session-token") || undefined;
    }

    if (sessionToken) {
      const sessionResult = await validateSessionToken(sessionToken);
      if (!sessionResult) {
        return {
          errorResponse: NextResponse.json(
            { success: false, error: "Unauthorized", message: "Session is invalid or expired" },
            { status: 401 }
          ),
        };
      }
      userId = sessionResult.user.id;
    } else {
      // 2. Gated Test Mode Header Authentication (STRICTLY DISABLED in Production & Non-Test Environments)
      const isTestEnv = process.env.NODE_ENV === "test" && process.env.ALLOW_TEST_HEADER_AUTH === "true";
      const headerUserId = req.headers.get("x-synplan-user-id");

      if (isTestEnv && headerUserId) {
        const userExists = await prisma.user.findUnique({
          where: { id: headerUserId },
          select: { id: true, name: true, email: true, avatarUrl: true },
        });
        if (!userExists) {
          return {
            errorResponse: NextResponse.json(
              { success: false, error: "Unauthorized", message: "Invalid test credentials" },
              { status: 401 }
            ),
          };
        }
        userId = userExists.id;
      } else {
        // Strict Security Enforcement: No valid credentials provided
        return {
          errorResponse: NextResponse.json(
            { success: false, error: "Unauthorized", message: "Active authenticated session required" },
            { status: 401 }
          ),
        };
      }
    }

    // 3. Resolve Target Workspace
    if (!workspaceId || workspaceId === "ws-default") {
      const userMembership = await prisma.workspaceMember.findFirst({
        where: { userId },
        orderBy: { joinedAt: "asc" },
      });

      if (!userMembership) {
        return {
          errorResponse: NextResponse.json(
            { success: false, error: "Forbidden", message: "You are not assigned to any workspace" },
            { status: 403 }
          ),
        };
      }
      workspaceId = userMembership.workspaceId;
    }

    // 4. Strict Workspace Membership & Tenant Isolation Guard
    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });

    if (!member) {
      return {
        errorResponse: NextResponse.json(
          { success: false, error: "Forbidden", message: "You are not a member of this workspace" },
          { status: 403 }
        ),
      };
    }

    // 5. Permission / Role Check
    const isRoleCheck = KNOWN_ROLES.has(requiredPermissionOrRole);

    if (isRoleCheck) {
      const requiredRole = requiredPermissionOrRole as Role;
      const memberLevel = roleHierarchy[member.role] || 0;
      const requiredLevel = roleHierarchy[requiredRole] || 0;

      if (memberLevel < requiredLevel) {
        return {
          errorResponse: NextResponse.json(
            {
              success: false,
              error: "Forbidden",
              message: `Insufficient privileges. Required role: ${requiredRole}, current role: ${member.role}`,
            },
            { status: 403 }
          ),
        };
      }
    } else {
      const requiredPermission = requiredPermissionOrRole as Permission;
      if (!hasPermission(member.role, requiredPermission)) {
        return {
          errorResponse: NextResponse.json(
            {
              success: false,
              error: "Forbidden",
              message: `Insufficient privileges. Required permission: ${requiredPermission}, current role: ${member.role}`,
            },
            { status: 403 }
          ),
        };
      }
    }

    return {
      auth: {
        userId: member.userId,
        workspaceId: member.workspaceId,
        role: member.role,
        permissions: ROLE_PERMISSIONS[member.role] || [],
        user: member.user,
        ipAddress,
      },
    };
  } catch (error: any) {
    console.error("[AuthGuard Exception]:", error);
    return {
      errorResponse: NextResponse.json(
        { success: false, error: "Internal Server Error", message: "Internal Auth Guard Error" },
        { status: 500 }
      ),
    };
  }
}
