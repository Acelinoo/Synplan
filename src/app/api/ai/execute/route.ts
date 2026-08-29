import { NextRequest, NextResponse } from "next/server";
import { requireAuthGuard } from "@/lib/authGuard";
import { getAiExecutionContext } from "@/lib/ai/context";
import { executeAiPlan } from "@/lib/ai/executor";
import { validateAiPlan } from "@/lib/ai/validator";
import { AiPlan } from "@/lib/ai/types";
import { Role } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const { auth, errorResponse } = await requireAuthGuard(req, "workspace.view");
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { plan, confirmed, idempotencyKey } = body as { plan: AiPlan; confirmed?: boolean; idempotencyKey?: string };

    if (!plan || !Array.isArray(plan.actions) || plan.actions.length === 0) {
      return NextResponse.json(
        { success: false, error: "Valid plan with actions is required" },
        { status: 400 }
      );
    }

    // 1. Check if confirmation was required but not provided
    if ((plan.requiresConfirmation || plan.isDestructive) && confirmed !== true) {
      return NextResponse.json(
        {
          success: false,
          error: "Explicit user confirmation is required before executing this plan",
          requiresConfirmation: true,
          isDestructive: plan.isDestructive,
        },
        { status: 400 }
      );
    }

    // 2. Fetch fresh server context
    const context = await getAiExecutionContext({
      workspaceId: auth.workspaceId,
      userId: auth.userId,
      userRole: auth.role,
    });

    // 3. Re-validate actions on the server before mutation
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

    // 4. Execute all actions securely via server executor
    const executionResult = await executeAiPlan(validatedPlan, context, idempotencyKey);

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
