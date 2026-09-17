import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceGuard } from "@/domains/identity/guards";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { AutomationService } from "@/domains/automation/automation.service";

export async function GET(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { searchParams } = new URL(req.url);
    const workspaceIdParam = searchParams.get("workspaceId");
    const projectIdParam = searchParams.get("projectId") || undefined;

    const guard = await requireWorkspaceGuard(req, workspaceIdParam || undefined);
    if (guard.errorResponse || !guard.auth) {
      return guard.errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const rules = await AutomationService.getRules(guard.auth.workspaceId, projectIdParam);
    return NextResponse.json({ success: true, data: rules });
  } catch (error: any) {
    console.error("[API:Automations:GET] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error", message: error?.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const body = await req.json();
    const guard = await requireWorkspaceGuard(req, body.workspaceId);
    if (guard.errorResponse || !guard.auth) {
      return guard.errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const rule = await AutomationService.createRule({
      ...body,
      workspaceId: guard.auth.workspaceId,
    });

    return NextResponse.json({ success: true, data: rule }, { status: 201 });
  } catch (error: any) {
    console.error("[API:Automations:POST] Error:", error);
    return NextResponse.json(
      { success: false, error: "Bad Request", message: error?.message },
      { status: 400 }
    );
  }
}
