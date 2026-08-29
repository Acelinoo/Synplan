import { NextRequest, NextResponse } from "next/server";
import { requireAuthGuard } from "@/lib/authGuard";
import { getAiExecutionContext } from "@/lib/ai/context";
import { generateAiPlan } from "@/lib/ai/planner";
import { Role } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const { auth, errorResponse } = await requireAuthGuard(req, "workspace.view");
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      prompt,
      mode,
      currentProjectId,
      currentPhaseId,
      currentTaskId,
      currentMemberId,
      currentView,
      recentEntities,
      activePath,
      conversationHistory,
      pendingClarification,
    } = body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        { success: false, error: "Prompt is required" },
        { status: 400 }
      );
    }

    // 1. Gather server-side context for active workspace
    const context = await getAiExecutionContext({
      workspaceId: auth.workspaceId,
      userId: auth.userId,
      userRole: auth.role,
      currentProjectId,
      currentPhaseId,
      currentTaskId,
      currentMemberId,
      currentView,
      recentEntities,
      conversationHistory,
      activePath,
    });

    // 2. Generate structured AI Plan with conversational memory, clarification state, and Strict/Smart mode
    const plan = await generateAiPlan(prompt, context, conversationHistory, pendingClarification, mode || "STRICT");

    return NextResponse.json({
      success: true,
      data: plan,
    });
  } catch (error: any) {
    console.error("POST /api/ai/plan error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate AI plan",
        message: error?.message || "Internal server error",
      },
      { status: 500 }
    );
  }
}
