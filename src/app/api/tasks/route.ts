import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { createNotification } from "@/lib/notificationService";
import { TaskStatus, TaskPriority, Role } from "@prisma/client";

// GET /api/tasks - Retrieve tasks list for authorized workspace
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const projectId = searchParams.get("projectId");
    const phaseId = searchParams.get("phaseId");
    const statusParam = searchParams.get("status")?.toUpperCase();
    const priorityParam = searchParams.get("priority")?.toUpperCase();
    const assigneeId = searchParams.get("assigneeId");

    // Verify workspace membership & authorization (tasks.view)
    const { auth, errorResponse } = await requireAuthGuard(req, "tasks.view", workspaceId || undefined);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const whereClause: any = { workspaceId: auth.workspaceId };

    if (projectId) {
      // Validate that the requested project belongs to this workspace
      const proj = await prisma.project.findFirst({
        where: { id: projectId, workspaceId: auth.workspaceId },
        select: { id: true },
      });
      if (proj) {
        whereClause.projectId = projectId;
      }
    }

    if (phaseId) {
      whereClause.phaseId = phaseId;
    }

    if (assigneeId) whereClause.assigneeId = assigneeId;
    if (statusParam && Object.values(TaskStatus).includes(statusParam as TaskStatus)) {
      whereClause.status = statusParam as TaskStatus;
    }
    if (priorityParam && Object.values(TaskPriority).includes(priorityParam as TaskPriority)) {
      whereClause.priority = priorityParam as TaskPriority;
    }

    const tasks = await prisma.task.findMany({
      where: whereClause,
      include: {
        assignee: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        subtasks: {
          orderBy: { createdAt: "asc" },
        },
        phase: {
          select: { id: true, name: true, order: true },
        },
        project: {
          select: { id: true, name: true, color: true },
        },
      },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({
      success: true,
      data: tasks,
    });
  } catch (error: any) {
    console.error("GET /api/tasks error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve tasks", message: error?.message },
      { status: 500 }
    );
  }
}

// POST /api/tasks - Create new task in authorized workspace
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      workspaceId,
      projectId,
      phaseId,
      title,
      description,
      status,
      priority,
      assigneeId,
      dueDate,
      tags,
      subtasks,
    } = body;

    // Strict Permission Guard: tasks.create
    const { auth, errorResponse } = await requireAuthGuard(req, "tasks.create", workspaceId || undefined);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json(
        { success: false, error: "Task title is required" },
        { status: 400 }
      );
    }

    const targetWorkspaceId = auth.workspaceId;

    // Resolve & verify project belongs to user's workspace
    let targetProjectId = projectId;
    let existingProj = targetProjectId
      ? await prisma.project.findFirst({
          where: { id: targetProjectId, workspaceId: targetWorkspaceId },
          select: { id: true },
        })
      : null;

    if (!existingProj) {
      // Pick first project in this authorized workspace
      const firstProj = await prisma.project.findFirst({
        where: { workspaceId: targetWorkspaceId },
        select: { id: true },
      });
      if (!firstProj) {
        return NextResponse.json(
          { success: false, error: "No projects found in this workspace to attach task" },
          { status: 400 }
        );
      }
      targetProjectId = firstProj.id;
    }

    // Validate phaseId belongs to targetProjectId
    let validPhaseId: string | null = null;
    if (phaseId) {
      const phase = await prisma.phase.findFirst({
        where: { id: phaseId, projectId: targetProjectId },
        select: { id: true },
      });
      if (phase) validPhaseId = phase.id;
    }

    // If no phaseId specified, pick first phase of project if exists
    if (!validPhaseId) {
      const defaultPhase = await prisma.phase.findFirst({
        where: { projectId: targetProjectId },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      if (defaultPhase) validPhaseId = defaultPhase.id;
    }

    // Validate assigneeId belongs to this workspace
    let validAssigneeId: string | null = null;
    if (assigneeId) {
      const isMember = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: targetWorkspaceId,
            userId: assigneeId,
          },
        },
        select: { userId: true },
      });
      if (isMember) validAssigneeId = isMember.userId;
    }

    const task = await prisma.task.create({
      data: {
        workspaceId: targetWorkspaceId,
        projectId: targetProjectId,
        phaseId: validPhaseId,
        title: title.trim(),
        description: description ? description.trim() : null,
        status: (status?.toUpperCase() as TaskStatus) || TaskStatus.TODO,
        priority: (priority?.toUpperCase() as TaskPriority) || TaskPriority.MEDIUM,
        assigneeId: validAssigneeId,
        dueDate: dueDate ? new Date(dueDate) : null,
        tags: Array.isArray(tags) ? tags : [],
        subtasks: {
          create: Array.isArray(subtasks)
            ? subtasks.map((st: { title: string; completed?: boolean }) => ({
                title: st.title.trim(),
                completed: !!st.completed,
              }))
            : [],
        },
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        phase: { select: { id: true, name: true, order: true } },
        subtasks: { orderBy: { createdAt: "asc" } },
        project: { select: { id: true, name: true, color: true } },
      },
    });

    // Send direct notification to assignee if assigned to another user
    if (validAssigneeId && validAssigneeId !== auth.userId) {
      createNotification({
        workspaceId: targetWorkspaceId,
        userId: validAssigneeId,
        type: "TASK_ASSIGNED",
        title: "Task Assigned",
        description: `You were assigned to "${task.title}"`,
        entityType: "TASK",
        entityId: task.id,
        link: `/tasks?taskId=${task.id}`,
      }).catch(() => {});
    }

    return NextResponse.json(
      {
        success: true,
        data: task,
        message: `Task "${task.title}" created successfully`,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/tasks error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create task",
        message: error?.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
