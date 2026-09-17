import { prisma } from "@/lib/prisma";
import { RealtimeChannels } from "./realtime.channels";
import { Role } from "@prisma/client";

export interface ChannelAuthResult {
  isAuthorized: boolean;
  error?: string;
  workspaceId?: string;
  projectId?: string;
}

export class RealtimeAuthorization {
  /**
   * Authorizes a user to join/subscribe to a specific scoped Realtime channel.
   * Enforces the two-tier RBAC rules without trusting client-side claims.
   */
  static async authorizeChannel(userId: string, channelName: string): Promise<ChannelAuthResult> {
    if (!userId) {
      return { isAuthorized: false, error: "Authentication required" };
    }

    const parsed = RealtimeChannels.parseChannel(channelName);
    if (!parsed) {
      return { isAuthorized: false, error: `Invalid channel topic: '${channelName}'` };
    }

    // 1. Workspace Channel: workspace:{workspaceId}
    if (parsed.type === "workspace") {
      const workspaceId = parsed.id;
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId,
          },
        },
      });

      if (!membership) {
        return {
          isAuthorized: false,
          error: "Forbidden: You are not a member of this workspace",
        };
      }

      return { isAuthorized: true, workspaceId };
    }

    // 2. Project Channel: project:{projectId}
    if (parsed.type === "project") {
      const projectId = parsed.id;
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, workspaceId: true },
      });

      if (!project) {
        return { isAuthorized: false, error: "Project not found" };
      }

      // Check workspace membership
      const wsMembership = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: project.workspaceId,
            userId,
          },
        },
      });

      if (!wsMembership) {
        return { isAuthorized: false, error: "Forbidden: You do not belong to the project's workspace" };
      }

      // Workspace OWNER or ADMIN enjoys elevated project subscription access
      if (wsMembership.role === Role.OWNER || wsMembership.role === Role.ADMIN) {
        return { isAuthorized: true, workspaceId: project.workspaceId, projectId };
      }

      // Normal member must be assigned in ProjectMember
      const projMembership = await prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId,
          },
        },
      });

      if (!projMembership) {
        return {
          isAuthorized: false,
          error: "Forbidden: You are not assigned to this project squad",
        };
      }

      return { isAuthorized: true, workspaceId: project.workspaceId, projectId };
    }

    return { isAuthorized: false, error: "Unsupported channel type" };
  }
}
