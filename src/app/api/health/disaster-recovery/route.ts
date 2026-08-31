import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthGuard } from "@/lib/authGuard";
import { createApiErrorResponse } from "@/lib/apiErrors";
import { Role } from "@prisma/client";

/**
 * GET /api/health/disaster-recovery
 *
 * Evaluates disaster resilience, database operational status, and backup readiness.
 * Restricted strictly to workspace OWNER and ADMIN.
 */
export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await requireAuthGuard(req, "backup.view");
  if (errorResponse || !auth) {
    return errorResponse || NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (auth.role !== Role.OWNER && auth.role !== Role.ADMIN) {
    return NextResponse.json(
      { success: false, error: "Forbidden", message: "Only workspace OWNER or ADMIN can view disaster recovery health" },
      { status: 403 }
    );
  }

  const workspaceId = auth.workspaceId;
  const requestId = req.headers.get("x-request-id") || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  try {
    // 1. Live Database Ping
    const dbPingStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - dbPingStart;

    // 2. Aggregate Workspace Entity Health Stats
    const [projectsCount, tasksCount, phasesCount, membersCount, auditLogsCount] = await Promise.all([
      prisma.project.count({ where: { workspaceId } }),
      prisma.task.count({ where: { workspaceId } }),
      prisma.phase.count({ where: { project: { workspaceId } } }),
      prisma.workspaceMember.count({ where: { workspaceId } }),
      prisma.auditLog.count({ where: { workspaceId } }),
    ]);

    const isHealthy = dbLatencyMs < 2000;

    return NextResponse.json(
      {
        success: true,
        status: isHealthy ? "HEALTHY" : "DEGRADED",
        timestamp: new Date().toISOString(),
        disasterRecovery: {
          rpoTarget: "24h (Baseline Daily Snapshots) / 2m (PITR WAL Continuous)",
          rtoTarget: "4h (Full Database Restoration & Health Verification)",
          backupStrategy: "HYBRID_PHYSICAL_AND_APPLICATION_EXPORT",
          exportEndpoint: "/api/admin/backup/export",
          documentation: "docs/DISASTER-RECOVERY.md",
        },
        workspaceHealth: {
          workspaceId,
          databaseConnected: true,
          databaseLatencyMs: dbLatencyMs,
          stats: {
            projects: projectsCount,
            tasks: tasksCount,
            phases: phasesCount,
            members: membersCount,
            auditLogs: auditLogsCount,
          },
        },
      },
      {
        status: isHealthy ? 200 : 503,
        headers: {
          "x-disaster-readiness": isHealthy ? "READY" : "DEGRADED",
          "x-request-id": requestId,
        },
      }
    );
  } catch (error) {
    return createApiErrorResponse(error, "Failed to retrieve disaster recovery health status", { status: 500, requestId });
  }
}
