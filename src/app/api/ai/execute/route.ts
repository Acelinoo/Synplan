import { NextRequest, NextResponse } from "next/server";
import { requireAuthGuard } from "@/lib/authGuard";
import { getAiExecutionContext } from "@/lib/ai/context";
import { executeAiPlan } from "@/lib/ai/executor";
import { validateAiPlan } from "@/lib/ai/validator";
import { validatePendingConfirmation, markConfirmationExecuted } from "@/lib/ai/confirmationStore";
import { AiPlan } from "@/lib/ai/types";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { auth, errorResponse } = await requireAuthGuard(req, "workspace.view");
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      plan,
      confirmed,
      confirmationToken,
      planFingerprint,
      idempotencyKey,
    } = body as {
      plan: AiPlan;
      confirmed?: boolean;
      confirmationToken?: string;
      planFingerprint?: string;
      idempotencyKey?: string;
    };

    if (!plan || !Array.isArray(plan.actions) || plan.actions.length === 0) {
      return NextResponse.json(
        { success: false, error: "Valid plan with actions is required" },
        { status: 400 }
      );
    }

    // 1. Server-Authoritative Confirmation Check
    if (plan.requiresConfirmation || plan.isDestructive) {
      if (confirmed !== true) {
        return NextResponse.json(
          {
            success: false,
            error: "Konfirmasi eksplisit pengguna diperlukan sebelum mengeksekusi rencana ini.",
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
              error: confValidation.error || "Validasi konfirmasi server gagal.",
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
          error: "Plan validation failed",
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
                  error: `Tindakan tidak lagi valid karena task target ("${p.taskTitle || targetTaskId}") telah dihapus oleh pengguna lain. Silakan buat rencana baru.`,
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
                  error: `Tindakan tidak lagi valid karena project target ("${p.projectName || targetProjId}") telah dihapus oleh pengguna lain. Silakan buat rencana baru.`,
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

    return NextResponse.json({
      success: executionResult.success,
      data: executionResult,
      message: executionResult.summary,
    });
  } catch (error: any) {
    console.error("POST /api/ai/execute error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to execute AI plan",
        message: error?.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
