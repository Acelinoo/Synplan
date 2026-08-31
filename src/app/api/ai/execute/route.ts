import { NextRequest, NextResponse } from "next/server";
import { requireAuthGuard } from "@/lib/authGuard";
import { getAiExecutionContext } from "@/lib/ai/context";
import { executeAiPlan } from "@/lib/ai/executor";
import { validateAiPlan } from "@/lib/ai/validator";
import { validatePendingConfirmation, markConfirmationExecuted } from "@/lib/ai/confirmationStore";
import { updateConversationState, pushRecentEntity } from "@/lib/ai/conversationStore";
import { AiPlan } from "@/lib/ai/types";
import { prisma } from "@/lib/prisma";
import { applyRateLimit, aiRateLimiter } from "@/lib/rateLimit";
import { validateRequestBody } from "@/lib/validation/apiValidator";
import { AiExecuteRequestSchema } from "@/lib/validation/schemas";
import { createApiErrorResponse } from "@/lib/apiErrors";
import { publishWorkspaceEvent } from "@/lib/realtimeServer";

export async function POST(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, aiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { auth, errorResponse } = await requireAuthGuard(req, "workspace.view");
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const validation = await validateRequestBody(req, AiExecuteRequestSchema);
    if (validation.errorResponse) return validation.errorResponse;

    const {
      plan,
      confirmed,
      confirmationToken,
      planFingerprint,
      idempotencyKey,
      conversationId,
    } = validation.data as unknown as {
      plan: AiPlan;
      confirmed?: boolean;
      confirmationToken?: string;
      planFingerprint?: string;
      idempotencyKey?: string;
      conversationId?: string;
    };

    if (!plan || !Array.isArray(plan.actions) || plan.actions.length === 0) {
      return NextResponse.json(
        { success: false, error: "Bad Request", message: "Valid plan with actions is required" },
        { status: 400 }
      );
    }

    // 1. Server-Authoritative Confirmation Check
    if (plan.requiresConfirmation || plan.isDestructive) {
      if (confirmed !== true) {
        return NextResponse.json(
          {
            success: false,
            error: "Forbidden",
            message: "Konfirmasi eksplisit pengguna diperlukan sebelum mengeksekusi rencana ini.",
            requiresConfirmation: true,
            isDestructive: plan.isDestructive,
          },
          { status: 400 }
        );
      }

      // If a confirmation token is provided, validate it against the server confirmation store
      const tokenToValidate = confirmationToken || plan.confirmationToken;
      if (tokenToValidate) {
        const confValidation = validatePendingConfirmation({
          token: tokenToValidate,
          fingerprint: planFingerprint || plan.planFingerprint,
          userId: auth.userId,
          workspaceId: auth.workspaceId,
        });

        if (!confValidation.isValid) {
          return NextResponse.json(
            {
              success: false,
              error: "Unprocessable Entity",
              message: confValidation.error || "Validasi konfirmasi server gagal.",
              isInvalidConfirmation: true,
            },
            { status: 422 }
          );
        }
      }
    }

    // 2. Fetch fresh server execution context
    const context = await getAiExecutionContext({
      workspaceId: auth.workspaceId,
      userId: auth.userId,
      userRole: auth.role,
    });

    // 3. Re-validate actions on the server before any mutation occurs
    const { validatedPlan, isValid, errors } = validateAiPlan(plan, context);
    if (!isValid) {
      return NextResponse.json(
        {
          success: false,
          error: "Unprocessable Entity",
          message: "Plan validation failed",
          errors,
        },
        { status: 422 }
      );
    }

    // 4. Stale State & Database Entity Revalidation Guard
    if (prisma && typeof prisma.task?.findFirst === "function") {
      for (const act of validatedPlan.actions) {
        const p = act.payload || {};

        // 4.1 Check Task existence for task mutations (UPDATE, DELETE, ASSIGN)
        if (
          act.type === "UPDATE_TASK" ||
          act.type === "DELETE_TASK" ||
          act.type === "ASSIGN_TASK"
        ) {
          const targetTaskId = p.taskId || p.id;
          if (targetTaskId && !targetTaskId.startsWith("temp_")) {
            const dbTask = await prisma.task.findFirst({
              where: {
                id: targetTaskId,
                workspaceId: auth.workspaceId,
              },
              select: { id: true, status: true, updatedAt: true },
            });

            if (!dbTask) {
              return NextResponse.json(
                {
                  success: false,
                  error: "Conflict",
                  message: `Tindakan tidak lagi valid karena task target ("${p.taskTitle || targetTaskId}") telah dihapus oleh pengguna lain. Silakan buat rencana baru.`,
                  isStale: true,
                },
                { status: 409 }
              );
            }
          }
        }

        // 4.2 Check Project existence for project mutations (UPDATE, DELETE)
        if (act.type === "UPDATE_PROJECT" || act.type === "DELETE_PROJECT") {
          const targetProjId = p.projectId || p.id;
          if (targetProjId && !targetProjId.startsWith("temp_")) {
            const dbProj = await prisma.project.findFirst({
              where: {
                id: targetProjId,
                workspaceId: auth.workspaceId,
              },
              select: { id: true, status: true, updatedAt: true },
            });

            if (!dbProj) {
              return NextResponse.json(
                {
                  success: false,
                  error: "Conflict",
                  message: `Tindakan tidak lagi valid karena project target ("${p.projectName || targetProjId}") telah dihapus oleh pengguna lain. Silakan buat rencana baru.`,
                  isStale: true,
                },
                { status: 409 }
              );
            }
          }
        }
      }
    }

    // 5. Execute all actions securely via server executor
    const executionResult = await executeAiPlan(validatedPlan, context, idempotencyKey);

    // 6. Mark confirmation token as executed to prevent replay
    const effectiveToken = confirmationToken || plan.confirmationToken;
    if (effectiveToken) {
      markConfirmationExecuted(effectiveToken);
    }

    // 7. Update active and created/modified entities in conversation store
    if (executionResult.success) {
      const convId = conversationId || "conv_default";
      const now = new Date().toISOString();
      for (const res of executionResult.results) {
        if (!res.success) continue;
        const matchingAction = validatedPlan.actions.find((a) => a.id === res.actionId);
        const p = matchingAction?.payload || {};

        if (res.type === "CREATE_PROJECT" || res.type === "UPDATE_PROJECT") {
          const projId = res.data?.id || p.id || p.projectId;
          const projName = res.data?.name || p.name || p.projectName;
          if (projId && projName) {
            updateConversationState(auth.workspaceId, auth.userId, convId, {
              activeEntity: { id: projId, type: "PROJECT", name: projName, lastReferencedAt: now },
              lastCreatedEntity: res.type === "CREATE_PROJECT" ? { id: projId, type: "PROJECT", name: projName, lastReferencedAt: now } : undefined,
              lastModifiedEntity: res.type === "UPDATE_PROJECT" ? { id: projId, type: "PROJECT", name: projName, lastReferencedAt: now } : undefined,
            });
            pushRecentEntity(auth.workspaceId, auth.userId, convId, { id: projId, type: "PROJECT", name: projName, lastReferencedAt: now });
          }
        } else if (res.type === "CREATE_TASK" || res.type === "UPDATE_TASK" || res.type === "ASSIGN_TASK") {
          const taskId = res.data?.id || p.taskId || p.id;
          const taskTitle = res.data?.title || p.taskTitle || p.title || p.name;
          if (taskId && taskTitle) {
            updateConversationState(auth.workspaceId, auth.userId, convId, {
              activeEntity: { id: taskId, type: "TASK", name: taskTitle, projectId: p.projectId, lastReferencedAt: now },
              lastCreatedEntity: res.type === "CREATE_TASK" ? { id: taskId, type: "TASK", name: taskTitle, projectId: p.projectId, lastReferencedAt: now } : undefined,
              lastModifiedEntity: res.type !== "CREATE_TASK" ? { id: taskId, type: "TASK", name: taskTitle, projectId: p.projectId, lastReferencedAt: now } : undefined,
            });
            pushRecentEntity(auth.workspaceId, auth.userId, convId, { id: taskId, type: "TASK", name: taskTitle, projectId: p.projectId, lastReferencedAt: now });
          }
        }
      }

      // Publish consolidated BATCH_MUTATION event for multi-action plans
      if (validatedPlan.actions.length > 1) {
        const createdTasks: any[] = [];
        const updatedTasks: any[] = [];
        const deletedTasks: string[] = [];
        const updatedProjects: any[] = [];

        for (const res of executionResult.results) {
          if (!res.success) continue;
          if (res.type === "CREATE_TASK" && res.data) createdTasks.push(res.data);
          else if (res.type === "UPDATE_TASK" && res.data) updatedTasks.push(res.data);
          else if (res.type === "DELETE_TASK" && res.data?.deletedId) deletedTasks.push(res.data.deletedId);
          else if (res.type === "CREATE_PROJECT" || res.type === "UPDATE_PROJECT") {
            if (res.data) updatedProjects.push(res.data);
          }
        }

        publishWorkspaceEvent(auth, "BATCH_MUTATION", {
          tasksCreated: createdTasks,
          tasksUpdated: updatedTasks,
          tasksDeleted: deletedTasks,
          projectsUpdated: updatedProjects,
          summary: executionResult.summary,
        }).catch(() => {});
      }
    }

    return NextResponse.json({
      success: executionResult.success,
      data: executionResult,
      message: executionResult.summary,
    }, { headers: rateLimit.rateLimitHeaders });
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to execute AI plan");
  }
}
