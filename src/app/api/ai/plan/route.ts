import { NextRequest, NextResponse } from "next/server";
import { requireAuthGuard } from "@/lib/authGuard";
import { getAiExecutionContext } from "@/lib/ai/context";
import { generateAiPlan } from "@/lib/ai/planner";
import { registerPendingConfirmation, clearUserPendingConfirmations } from "@/lib/ai/confirmationStore";
import { applyRateLimit, aiRateLimiter } from "@/lib/rateLimit";
import { validateRequestBody } from "@/lib/validation/apiValidator";
import { AiPlanRequestSchema } from "@/lib/validation/schemas";
import { createApiErrorResponse } from "@/lib/apiErrors";

export async function POST(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, aiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { auth, errorResponse } = await requireAuthGuard(req, "workspace.view");
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const validation = await validateRequestBody(req, AiPlanRequestSchema);
    if (validation.errorResponse) return validation.errorResponse;

    const {
      prompt,
      mode,
      conversationId,
      currentProjectId,
      currentPhaseId,
      currentTaskId,
      currentMemberId,
      currentView,
      activePath,
      conversationHistory,
      pendingClarification,
    } = validation.data;

    const cleanPrompt = prompt.trim().toLowerCase();
    const isCancelPrompt =
      cleanPrompt === "batal" ||
      cleanPrompt === "cancel" ||
      cleanPrompt === "batal deh" ||
      cleanPrompt === "cancel deh" ||
      cleanPrompt === "jangan jadi" ||
      cleanPrompt === "tidak jadi" ||
      cleanPrompt === "tidak jadi ya" ||
      cleanPrompt === "stop" ||
      cleanPrompt.startsWith("batalkan");

    if (isCancelPrompt) {
      clearUserPendingConfirmations(auth.userId, auth.workspaceId);
    }

    // 1. Gather server-side context for active workspace
    const context = await getAiExecutionContext({
      workspaceId: auth.workspaceId,
      userId: auth.userId,
      userRole: auth.role,
      conversationId: conversationId || undefined,
      currentProjectId,
      currentPhaseId,
      currentTaskId,
      currentMemberId,
      currentView,
      conversationHistory,
      activePath,
    });

    // 2. Generate structured AI Plan with conversational memory, clarification state, and Strict/Smart mode
    const plan = await generateAiPlan(prompt, context, conversationHistory, pendingClarification, mode || "STRICT");

    // 3. Register Server-Authoritative Confirmation Token if plan requires confirmation
    if (plan.requiresConfirmation && plan.actions.length > 0 && plan.status === "NEEDS_CONFIRMATION") {
      const pendingRecord = registerPendingConfirmation(plan, context);
      plan.confirmationToken = pendingRecord.token;
      plan.planFingerprint = pendingRecord.planFingerprint;
      plan.confirmationExpiresAt = pendingRecord.expiresAt;
      plan.confirmationStatus = "NEEDS_CONFIRMATION";
    }

    return NextResponse.json(
      {
        success: true,
        data: plan,
      },
      { headers: rateLimit.rateLimitHeaders }
    );
  } catch (error: any) {
    return createApiErrorResponse(error, "Failed to generate AI plan");
  }
}
