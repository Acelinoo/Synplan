"use client";

import * as React from "react";
import { Download, ShieldCheck, Database, RefreshCw, AlertCircle } from "lucide-react";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore, useUiStore } from "@/store";
import { usePermissions } from "@/hooks/usePermissions";

export function DisasterRecoveryPanel() {
  const { activeWorkspace } = useWorkspaceStore();
  const { addToast } = useUiStore();
  const { isOwner, isAdmin } = usePermissions();

  const [isExporting, setIsExporting] = React.useState(false);
  const [healthStatus, setHealthStatus] = React.useState<{
    status: string;
    database: string;
    metrics?: {
      projectsCount: number;
      tasksCount: number;
      membersCount: number;
    };
  } | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = React.useState(false);

  const canExport = isOwner || isAdmin;

  const checkHealth = React.useCallback(async () => {
    setIsCheckingHealth(true);
    try {
      const res = await fetch("/api/health/disaster-recovery");
      const data = await res.json();
      if (data && data.status) {
        setHealthStatus(data);
      }
    } catch (err) {
      console.warn("Health check error:", err);
    } finally {
      setIsCheckingHealth(false);
    }
  }, []);

  React.useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  const handleExportBackup = async () => {
    if (!activeWorkspace?.id) {
      addToast({
        title: "Export Failed",
        description: "No active workspace selected.",
        variant: "danger",
      });
      return;
    }

    setIsExporting(true);
    try {
      const res = await fetch(`/api/admin/backup/export?workspaceId=${activeWorkspace.id}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `synplan-backup-${activeWorkspace.slug || activeWorkspace.id}-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      addToast({
        title: "Backup Exported",
        description: "Workspace archive downloaded securely.",
        variant: "success",
      });
    } catch (err: any) {
      addToast({
        title: "Export Failed",
        description: err.message || "Failed to download backup.",
        variant: "danger",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <SpotlightCard className="space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2.5">
          <Database className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-bold text-foreground">Disaster Recovery & Backup</h3>
            <p className="text-xs text-muted-foreground">
              Production snapshot exports, RPO/RTO metrics, and database resilience
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {healthStatus?.status === "READY" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-mono font-bold text-emerald-500 border border-emerald-500/20">
              <ShieldCheck className="h-3 w-3" />
              SYSTEM RESILIENT
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-mono font-bold text-amber-500 border border-amber-500/20">
              <AlertCircle className="h-3 w-3" />
              CHECKING
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="rounded-lg border border-border/80 bg-surface/50 p-3 space-y-1">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">RPO Target</span>
          <p className="font-mono font-bold text-foreground">≤ 2 min (PITR)</p>
          <p className="text-[10px] text-muted-foreground">Continuous WAL archiving</p>
        </div>
        <div className="rounded-lg border border-border/80 bg-surface/50 p-3 space-y-1">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">RTO Target</span>
          <p className="font-mono font-bold text-foreground">≤ 4 Hours</p>
          <p className="text-[10px] text-muted-foreground">Automated playbook restore</p>
        </div>
        <div className="rounded-lg border border-border/80 bg-surface/50 p-3 space-y-1">
          <span className="text-[10px] font-mono text-muted-foreground uppercase">Database Link</span>
          <p className="font-mono font-bold text-emerald-500 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {healthStatus?.database || "Connected"}
          </p>
          <p className="text-[10px] text-muted-foreground">PostgreSQL Multi-tenant</p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border/60">
        <p className="text-[11px] text-muted-foreground">
          {canExport
            ? "Export complete workspace data (projects, tasks, phases, members, audit trails) in JSON format."
            : "Backup export requires Owner or Admin workspace permissions."}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={checkHealth}
            disabled={isCheckingHealth}
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCw className={`h-3 w-3 ${isCheckingHealth ? "animate-spin" : ""}`} />
            <span>Verify</span>
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleExportBackup}
            disabled={!canExport || isExporting}
            className="h-8 text-xs font-semibold gap-1.5 shadow-xs"
          >
            <Download className="h-3 w-3" />
            <span>{isExporting ? "Exporting..." : "Export Backup Archive"}</span>
          </Button>
        </div>
      </div>
    </SpotlightCard>
  );
}
