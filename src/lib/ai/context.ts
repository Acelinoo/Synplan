import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { AiExecutionContext } from "./types";

interface GetContextOptions {
  workspaceId: string;
  userId: string;
  userRole?: Role | string;
  currentProjectId?: string;
  currentTaskId?: string;
  activePath?: string;
}

/**
 * Builds rich server-side AI execution context for the requested workspace.
 * Resolves currently opened project details, all squad members, existing projects, phases, tasks,
 * and current server timestamp for relative date reasoning.
 */
export async function getAiExecutionContext(options: GetContextOptions): Promise<AiExecutionContext> {
  const { workspaceId, userId, userRole: providedRole, currentProjectId, currentTaskId, activePath } = options;

  // 1. Fetch workspace, current user, members, projects, and active tasks concurrently
  const [workspace, currentUser, memberList, projects, tasks] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.project.findMany({
      where: { workspaceId },
      include: {
        phases: { orderBy: { order: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.task.findMany({
      where: { workspaceId },
      select: {
        id: true,
        projectId: true,
        title: true,
        status: true,
        priority: true,
        assigneeId: true,
        dueDate: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  // Flatten phases from projects
  const phases = projects.flatMap((p) =>
    p.phases.map((ph) => ({
      id: ph.id,
      projectId: p.id,
      name: ph.name,
      order: ph.order,
    }))
  );

  // Resolve active project name if currentProjectId is set or inferred
  let currentProjectName: string | undefined = undefined;
  if (currentProjectId) {
    const matched = projects.find((p) => p.id === currentProjectId);
    if (matched) {
      currentProjectName = matched.name;
    }
  }

  const now = new Date();
  const serverTime = `${now.toISOString()} (${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })})`;

  const memberRecord = memberList.find((m) => m.user.id === userId);
  const resolvedRole = providedRole || memberRecord?.role || currentUser?.role || "MEMBER";

  return {
    workspaceId,
    workspaceName: workspace?.name || "Workspace",
    userId,
    userName: currentUser?.name || "User",
    userRole: resolvedRole,
    currentProjectId,
    currentProjectName,
    currentTaskId,
    activePath,
    serverTime,
    members: memberList.map((m) => ({
      id: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
    })),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      totalTasks: p.totalTasks,
      deadline: p.deadline ? p.deadline.toISOString() : null,
    })),
    phases,
    tasks: tasks.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      title: t.title,
      status: t.status,
      priority: t.priority,
      assigneeId: t.assigneeId,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    })),
  };
}
