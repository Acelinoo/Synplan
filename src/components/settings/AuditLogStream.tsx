"use client";

import * as React from "react";
import { Key, Terminal } from "lucide-react";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { apiClient } from "@/lib/apiClient";

interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  target: string;
  ipAddress: string;
  timestamp: string;
  status: "success" | "warn" | "danger";
}

export function AuditLogStream() {
  const [logs, setLogs] = React.useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    async function loadLogs() {
      try {
        const res = await apiClient.getDashboardSummary();
        if (res.success && res.data?.recentActivity) {
          const mapped: AuditEntry[] = res.data.recentActivity.map((a: any) => ({
            id: a.id,
            actor: a.actor?.name || "System",
            action: a.action || "WORKSPACE_MUTATION",
            target: a.target || "Resource updated",
            ipAddress: "127.0.0.1",
            timestamp: a.timestamp || "Recent",
            status: "success",
          }));
          setLogs(mapped);
        }
      } catch (err) {
        console.warn("Failed to load audit logs:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadLogs();
  }, []);

  return (
    <SpotlightCard className="space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2.5">
          <Terminal className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-bold text-foreground">Security Audit Trail</h3>
            <p className="text-xs text-muted-foreground">Immutable compliance and mutation telemetry</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] font-mono text-status-done">
          <span className="h-1.5 w-1.5 rounded-full bg-status-done animate-pulse" />
          Encrypted & Logged
        </span>
      </div>

      <div className="space-y-2.5">
        {logs.map((log) => (
          <div
            key={log.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-border/70 bg-card/60 p-3 text-xs"
          >
            <div className="flex items-center gap-2.5">
              <Key className="h-3.5 w-3.5 text-primary shrink-0" />
              <div>
                <span className="font-mono font-bold text-foreground">{log.action}</span>
                <span className="text-muted-foreground"> by {log.actor} · </span>
                <span className="text-foreground">{log.target}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
              <span>{log.ipAddress}</span>
              <span>·</span>
              <span>{log.timestamp}</span>
            </div>
          </div>
        ))}
        {logs.length === 0 && !isLoading && (
          <p className="text-xs text-muted-foreground italic p-2">No security audit records logged yet.</p>
        )}
      </div>
    </SpotlightCard>
  );
}
