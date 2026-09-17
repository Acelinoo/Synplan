import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Role, ProjectRole, User, WorkspaceMember, ProjectMember } from "@prisma/client";
import { validateSessionToken } from "@/lib/auth/session";

export interface AuthContext {
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
    role: Role;
  };
  workspaceId: string;
  workspaceMember: WorkspaceMember;
  projectMember?: ProjectMember | null;
  isProjectElevated?: boolean;
}

export interface GuardResult {
  auth?: AuthContext;
  errorResponse?: NextResponse;
}

/**
 * Validates session token from Cookie or Header.
 */
export async function authenticateRequest(req: NextRequest): Promise<{ user: any; errorResponse?: NextResponse } | null> {
  let sessionToken = req.cookies.get("synplan_session_token")?.value;
  if (!sessionToken) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      sessionToken = authHeader.substring(7).trim();
    }
  }
  if (!sessionToken) {
    sessionToken = req.headers.get("x-synplan-session-token") || undefined;
  }

  if (!sessionToken) {
    // Check test header if in test mode
    const isTestEnv = process.env.NODE_ENV === "test" && process.env.ALLOW_TEST_HEADER_AUTH === "true";
    const headerUserId = req.headers.get("x-synplan-user-id");
    if (isTestEnv && headerUserId) {
      const user = await prisma.user.findUnique({ where: { id: headerUserId } });
      if (user) return { user };
    }

    return {
      user: null,
      errorResponse: NextResponse.json(
        { success: false, error: "Unauthorized", message: "Active authenticated session required" },
        { status: 401 }
      ),
    };
  }

  const sessionResult = await validateSessionToken(sessionToken);
  if (!sessionResult) {
    return {
      user: null,
      errorResponse: NextResponse.json(
        { success: false, error: "Unauthorized", message: "Session is invalid or expired" },
        { status: 401 }
      ),
    };
  }

  return { user: sessionResult.user };
}

/**
 * Enforces Workspace Membership and Role.
 */
export async function requireWorkspaceGuard(
  req: NextRequest,
  workspaceIdParam?: string,
  allowedRoles?: Role[]
): Promise<GuardResult> {
  const auth = await authenticateRequest(req);
  if (auth?.errorResponse || !auth?.user) {
    return { errorResponse: auth?.errorResponse };
  }

  const userId = auth.user.id;
  let workspaceId = workspaceIdParam || req.headers.get("x-synplan-workspace-id") || undefined;

  if (!workspaceId) {
    const defaultMembership = await prisma.workspaceMember.findFirst({
      where: { userId },
      orderBy: { joinedAt: "asc" },
    });
    if (!defaultMembership) {
      return {
        errorResponse: NextResponse.json(
          { success: false, error: "Forbidden", message: "User is not a member of any workspace" },
          { status: 403 }
        ),
      };
    }
    workspaceId = defaultMembership.workspaceId;
  }

  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
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

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(member.role)) {
    return {
      errorResponse: NextResponse.json(
        {
          success: false,
          error: "Forbidden",
          message: `Insufficient workspace privileges. Requires one of: ${allowedRoles.join(", ")}`,
        },
        { status: 403 }
      ),
    };
  }

  return {
    auth: {
      userId,
      user: auth.user,
      workspaceId,
      workspaceMember: member,
    },
  };
}

/**
 * Enforces Two-Tier Authorization: Workspace Membership + Project Squad Access.
 * Note: Workspace OWNER and ADMIN automatically enjoy elevated project access.
 */
export async function requireProjectGuard(
  req: NextRequest,
  projectId: string,
  workspaceIdParam?: string,
  allowedProjectRoles?: ProjectRole[]
): Promise<GuardResult> {
  const wsResult = await requireWorkspaceGuard(req, workspaceIdParam);
  if (wsResult.errorResponse || !wsResult.auth) {
    return wsResult;
  }

  const { userId, workspaceMember } = wsResult.auth;

  // 1. Verify project exists within this workspace
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId: wsResult.auth.workspaceId },
    select: { id: true, workspaceId: true },
  });

  if (!project) {
    return {
      errorResponse: NextResponse.json(
        { success: false, error: "Not Found", message: "Project not found in this workspace" },
        { status: 404 }
      ),
    };
  }

  // 2. Elevated check: Workspace OWNER and ADMIN bypass squad restriction
  const isElevated = workspaceMember.role === Role.OWNER || workspaceMember.role === Role.ADMIN;
  if (isElevated) {
    return {
      auth: {
        ...wsResult.auth,
        isProjectElevated: true,
      },
    };
  }

  // 3. Project Squad Check for normal workspace members
  const projectMember = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId,
      },
    },
  });

  if (!projectMember) {
    return {
      errorResponse: NextResponse.json(
        { success: false, error: "Forbidden", message: "You are not assigned to this project squad" },
        { status: 403 }
      ),
    };
  }

  if (allowedProjectRoles && allowedProjectRoles.length > 0 && !allowedProjectRoles.includes(projectMember.role)) {
    return {
      errorResponse: NextResponse.json(
        {
          success: false,
          error: "Forbidden",
          message: `Insufficient project privileges. Requires squad role: ${allowedProjectRoles.join(", ")}`,
        },
        { status: 403 }
      ),
    };
  }

  return {
    auth: {
      ...wsResult.auth,
      projectMember,
      isProjectElevated: false,
    },
  };
}

/**
 * Programmatic domain check for project access (non-HTTP callers e.g. domain services, background jobs, AI).
 */
export async function verifyUserProjectAccess(params: {
  userId: string;
  projectId: string;
  workspaceId: string;
  allowedRoles?: ProjectRole[];
}): Promise<{ isAuthorized: boolean; isElevated: boolean; role?: ProjectRole }> {
  // System / Automation programmatic execution is elevated within its workspace
  if (params.userId === "SYSTEM" || params.userId.startsWith("system_") || params.userId.startsWith("automation_")) {
    return { isAuthorized: true, isElevated: true };
  }

  const wsMember = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: params.workspaceId,
        userId: params.userId,
      },
    },
  });

  if (!wsMember) {
    return { isAuthorized: false, isElevated: false };
  }

  // Elevated: Workspace OWNER or ADMIN
  if (wsMember.role === Role.OWNER || wsMember.role === Role.ADMIN) {
    return { isAuthorized: true, isElevated: true };
  }

  const projMember = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId: params.projectId,
        userId: params.userId,
      },
    },
  });

  if (!projMember) {
    return { isAuthorized: false, isElevated: false };
  }

  if (params.allowedRoles && params.allowedRoles.length > 0 && !params.allowedRoles.includes(projMember.role)) {
    return { isAuthorized: false, isElevated: false, role: projMember.role };
  }

  return { isAuthorized: true, isElevated: false, role: projMember.role };
}
