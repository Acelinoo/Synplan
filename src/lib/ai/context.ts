import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { AiExecutionContext, RecentEntities } from "./types";
import { validateAndSanitizeContext, extractRecentEntitiesFromHistory } from "./contextResolver";
import { getConversationState } from "./conversationStore";

interface GetContextOptions {
  workspaceId: string;
  userId: string;
  userRole?: Role | string;
  conversationId?: string;
  currentProjectId?: string;
  currentPhaseId?: string;
  currentTaskId?: string;
  currentMemberId?: string;
  currentView?: string;
  recentEntities?: RecentEntities;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  activePath?: string;
}

/**
 * Builds rich server-side AI execution context for the requested workspace.
 * Resolves currently opened project details, phases, tasks, squad members,
 * conversation history, and current server timestamp for relative date reasoning.
 */
export async function getAiExecutionContext(options: GetContextOptions): Promise<AiExecutionContext> {
  const {
    workspaceId,
    userId,
    userRole: providedRole,
    conversationId,
    currentProjectId,
    currentPhaseId,
    currentTaskId,
    currentMemberId,
    currentView,
    recentEntities: providedRecent,
    conversationHistory,
    activePath,
  } = options;

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
        phaseId: true,
        title: true,
        description: true,
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

  // Resolve active project name if currentProjectId is set
  let currentProjectName: string | undefined = undefined;
  if (currentProjectId) {
    const matched = projects.find((p) => p.id === currentProjectId);
    if (matched) {
      currentProjectName = matched.name;
    }
  }

  // Resolve active phase name if currentPhaseId is set
  let currentPhaseName: string | undefined = undefined;
  if (currentPhaseId) {
    const matched = phases.find((ph) => ph.id === currentPhaseId);
    if (matched) {
      currentPhaseName = matched.name;
    }
  }

  // Resolve active task title if currentTaskId is set
  let currentTaskTitle: string | undefined = undefined;
  if (currentTaskId) {
    const matched = tasks.find((t) => t.id === currentTaskId);
    if (matched) {
      currentTaskTitle = matched.title;
    }
  }

  // Resolve active member name if currentMemberId is set
  let currentMemberName: string | undefined = undefined;
  if (currentMemberId) {
    const matched = memberList.find((m) => m.user.id === currentMemberId || m.id === currentMemberId);
    if (matched) {
      currentMemberName = matched.user.name;
    }
  }

  const now = new Date();
  const serverTime = `${now.toISOString()} (${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })})`;

  const memberRecord = memberList.find((m) => m.user.id === userId);
  const resolvedRole = providedRole || memberRecord?.role || currentUser?.role || "MEMBER";

  const rawContext: AiExecutionContext = {
    workspaceId,
    workspaceName: workspace?.name || "Workspace",
    userId,
    userName: currentUser?.name || "User",
    userRole: resolvedRole,
    currentProjectId,
    currentProjectName,
    currentPhaseId,
    currentPhaseName,
    currentTaskId,
    currentTaskTitle,
    currentMemberId,
    currentMemberName,
    currentView,
    conversationId: conversationId || undefined,
    conversationState: conversationId ? getConversationState(workspaceId, userId, conversationId) || undefined : undefined,
    recentEntities: providedRecent,
    conversationHistory,
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
      phaseId: t.phaseId,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      assigneeId: t.assigneeId,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    })),
  };

  // Extract recent entities from conversation history if not explicitly provided
  if (!rawContext.recentEntities && conversationHistory && conversationHistory.length > 0) {
    rawContext.recentEntities = extractRecentEntitiesFromHistory(conversationHistory, rawContext);
  }

  return validateAndSanitizeContext(rawContext);
}
