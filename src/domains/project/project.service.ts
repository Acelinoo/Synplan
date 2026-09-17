import { prisma } from "@/lib/prisma";
import { ProjectStatus, ProjectRole } from "@prisma/client";

export interface ProjectWithProgress {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  startDate: Date | null;
  targetDate: Date | null;
  deadline: Date | null;
  completedAt: Date | null;
  color: string;
  createdAt: Date;
  updatedAt: Date;
  totalTasks: number;
  completedTasks: number;
  progress: number;
  members?: any[];
  phases?: any[];
  tasks?: any[];
}

/**
 * Deterministic calculation of progress percentage (0 - 100).
 */
export function calculateProgress(completedTasks: number, totalTasks: number): number {
  if (!totalTasks || totalTasks <= 0) return 0;
  if (completedTasks <= 0) return 0;
  const percentage = Math.round((completedTasks / totalTasks) * 100);
  return Math.min(100, Math.max(0, percentage));
}

/**
 * Transforms raw Prisma Project and dynamically attaches calculated task progress.
 */
export function formatProjectWithProgress(
  project: any,
  counts?: { total: number; completed: number }
): ProjectWithProgress {
  let totalTasks = 0;
  let completedTasks = 0;

  if (counts) {
    totalTasks = counts.total;
    completedTasks = counts.completed;
  } else if (Array.isArray(project.tasks)) {
    totalTasks = project.tasks.length;
    completedTasks = project.tasks.filter((t: any) => t.status === "DONE").length;
  } else if (project._count?.tasks !== undefined) {
    totalTasks = project._count.tasks;
    completedTasks = 0; // fallback if only total count included
  }

  const progress = calculateProgress(completedTasks, totalTasks);

  return {
    id: project.id,
    workspaceId: project.workspaceId,
    name: project.name,
    slug: project.slug,
    description: project.description ?? null,
    status: project.status,
    startDate: project.startDate ?? null,
    targetDate: project.targetDate ?? null,
    deadline: project.deadline ?? project.targetDate ?? null,
    completedAt: project.completedAt ?? null,
    color: project.color,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    totalTasks,
    completedTasks,
    progress,
    members: project.members,
    phases: project.phases,
    tasks: project.tasks,
  };
}

export class ProjectService {
  /**
   * Retrieves a single project with dynamically calculated progress.
   */
  static async getProjectById(
    projectId: string,
    workspaceId?: string
  ): Promise<ProjectWithProgress | null> {
    const whereClause: any = { id: projectId };
    if (workspaceId) whereClause.workspaceId = workspaceId;

    const project = await prisma.project.findFirst({
      where: whereClause,
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true },
            },
          },
        },
        phases: {
          orderBy: { order: "asc" },
        },
        tasks: {
          select: { id: true, status: true },
        },
      },
    });

    if (!project) return null;
    return formatProjectWithProgress(project);
  }

  /**
   * Retrieves all projects for a workspace with dynamically calculated progress in a single query.
   */
  static async getWorkspaceProjects(workspaceId: string): Promise<ProjectWithProgress[]> {
    const projects = await prisma.project.findMany({
      where: { workspaceId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true },
            },
          },
        },
        phases: {
          orderBy: { order: "asc" },
        },
        tasks: {
          select: { id: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return projects.map((p) => formatProjectWithProgress(p));
  }

  /**
   * Creates a project atomically with slug generation and project leader assignment.
   */
  static async createProject(data: {
    workspaceId: string;
    name: string;
    description?: string | null;
    status?: ProjectStatus;
    color?: string;
    deadline?: Date | null;
    startDate?: Date | null;
    targetDate?: Date | null;
    creatorUserId: string;
  }): Promise<ProjectWithProgress> {
    const slugBase = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project";
    const uniqueSlug = `${slugBase}-${Math.random().toString(36).substring(2, 7)}`;

    const project = await prisma.project.create({
      data: {
        workspaceId: data.workspaceId,
        name: data.name,
        slug: uniqueSlug,
        description: data.description ?? null,
        status: data.status ?? ProjectStatus.ACTIVE,
        color: data.color ?? "#6366F1",
        deadline: data.deadline ?? data.targetDate ?? null,
        startDate: data.startDate ?? null,
        targetDate: data.targetDate ?? data.deadline ?? null,
        members: {
          create: {
            userId: data.creatorUserId,
            role: ProjectRole.LEAD,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true },
            },
          },
        },
        phases: true,
      },
    });

    return formatProjectWithProgress(project, { total: 0, completed: 0 });
  }

  /**
   * Calculates progress directly from task aggregation in the database.
   */
  static async calculateProjectProgress(projectId: string): Promise<{
    totalTasks: number;
    completedTasks: number;
    progressPercentage: number;
  }> {
    const [totalTasks, completedTasks] = await Promise.all([
      prisma.task.count({ where: { projectId } }),
      prisma.task.count({ where: { projectId, status: "DONE" } }),
    ]);

    const progressPercentage = calculateProgress(completedTasks, totalTasks);
    return { totalTasks, completedTasks, progressPercentage };
  }
}

export const ProjectDomainService = ProjectService;

