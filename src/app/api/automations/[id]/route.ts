import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceGuard } from "@/domains/identity/guards";
import { applyRateLimit, apiRateLimiter } from "@/lib/rateLimit";
import { AutomationService } from "@/domains/automation/automation.service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const workspaceIdParam = searchParams.get("workspaceId");

    const guard = await requireWorkspaceGuard(req, workspaceIdParam || undefined);
    if (guard.errorResponse || !guard.auth) {
      return guard.errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const rule = await AutomationService.getRuleById(id, guard.auth.workspaceId);
    if (!rule) {
      return NextResponse.json({ success: false, error: "Automation rule not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: rule });
  } catch (error: any) {
    console.error("[API:Automations:GET:id] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error", message: error?.message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { id } = await params;
    const body = await req.json();

    const guard = await requireWorkspaceGuard(req, body.workspaceId);
    if (guard.errorResponse || !guard.auth) {
      return guard.errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const updated = await AutomationService.updateRule(id, guard.auth.workspaceId, body);
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("[API:Automations:PATCH:id] Error:", error);
    return NextResponse.json(
      { success: false, error: "Bad Request", message: error?.message },
      { status: 400 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimit = applyRateLimit(req, apiRateLimiter);
    if (rateLimit.errorResponse) return rateLimit.errorResponse;

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const workspaceIdParam = searchParams.get("workspaceId");

    const guard = await requireWorkspaceGuard(req, workspaceIdParam || undefined);
    if (guard.errorResponse || !guard.auth) {
      return guard.errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    await AutomationService.deleteRule(id, guard.auth.workspaceId);
    return NextResponse.json({ success: true, message: "Automation rule deleted" });
  } catch (error: any) {
    console.error("[API:Automations:DELETE:id] Error:", error);
    return NextResponse.json(
      { success: false, error: "Bad Request", message: error?.message },
      { status: 400 }
    );
  }
}
