import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceGuard } from "@/domains/identity/guards";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { AutomationService } from "@/domains/automation/automation.service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { id } = await params;
    let workspaceId: string | null = null;

    try {
      const body = await req.json();
      workspaceId = body.workspaceId;
    } catch {
      workspaceId = new URL(req.url).searchParams.get("workspaceId");
    }

    const guard = await requireWorkspaceGuard(req, workspaceId || undefined);
    if (guard.errorResponse || !guard.auth) {
      return guard.errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const rule = await AutomationService.toggleRule(id, guard.auth.workspaceId, false);
    return NextResponse.json({ success: true, data: rule });
  } catch (error: any) {
    console.error("[API:Automations:Disable] Error:", error);
    return NextResponse.json(
      { success: false, error: "Bad Request", message: error?.message },
      { status: 400 }
    );
  }
}
