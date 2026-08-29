import { NextRequest, NextResponse } from "next/server";
import { requireAuthGuard } from "@/lib/authGuard";
import { getExecutionHistory } from "@/lib/ai/receiptStore";
import { Role } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const { auth, errorResponse } = await requireAuthGuard(req, Role.VIEWER);
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const history = getExecutionHistory(auth.workspaceId, auth.userId);

    // Return sanitized execution history without sensitive database internals
    const sanitized = history.map((receipt) => ({
      executionId: receipt.executionId,
      planId: receipt.planId,
      timestamp: receipt.timestamp,
      status: receipt.status,
      summary: receipt.summary,
      reversible: receipt.reversible,
      actionCount: receipt.actions.length,
      successfulCount: receipt.successfulCount,
      failedCount: receipt.failedCount,
      blockedCount: receipt.blockedCount,
      actions: receipt.actions.map((a) => ({
        actionId: a.actionId,
        type: a.type,
        status: a.status,
        entityName: a.entityName,
        entityType: a.entityType,
        summary: a.summary,
        error: a.error,
      })),
    }));

    return NextResponse.json({
      success: true,
      data: sanitized,
    });
  } catch (error: any) {
    console.error("[API Error /api/ai/history]:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
