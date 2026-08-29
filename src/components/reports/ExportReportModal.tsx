"use client";

import * as React from "react";
import { X, Download, FileSpreadsheet, FileText, Code2, Check } from "lucide-react";
import { useUiStore, useTaskStore, useWorkspaceStore } from "@/store";
import { Button } from "@/components/ui/button";
import { MagnetButton } from "@/components/ui/magnet-button";
import { cn } from "@/lib/utils";

interface ExportReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  dateRange?: string;
}

export function ExportReportModal({ isOpen, onClose, dateRange = "30d" }: ExportReportModalProps) {
  const { addToast } = useUiStore();
  const { tasks } = useTaskStore();
  const { activeWorkspace, projects, members } = useWorkspaceStore();

  const [format, setFormat] = React.useState<"csv" | "pdf" | "json">("csv");
  const [includeCompleted, setIncludeCompleted] = React.useState(true);
  const [includeWorkload, setIncludeWorkload] = React.useState(true);

  if (!isOpen) return null;

  const handleExport = (e: React.FormEvent) => {
    e.preventDefault();

    const timestamp = new Date().toISOString().split("T")[0];
    const exportTasks = tasks.filter((t) => (includeCompleted ? true : t.status !== "done"));

    if (format === "csv") {
      const headers = ["Task ID", "Title", "Project ID", "Status", "Priority", "Due Date", "Assignee ID"];
      const rows = exportTasks.map((t) => [
        `"${t.id}"`,
        `"${t.title.replace(/"/g, '""')}"`,
        `"${t.projectId}"`,
        `"${t.status}"`,
        `"${t.priority}"`,
        `"${t.dueDate || ""}"`,
        `"${t.assigneeId || ""}"`,
      ]);

      let csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

      if (includeWorkload && members.length > 0) {
        csvContent += "\n\n--- SQUAD WORKLOAD CAPACITY ---\n";
        csvContent += "Member Name,Email,Role,Workload Score (%),Active Tasks\n";
        members.forEach((m) => {
          csvContent += `"${m.user.name}","${m.user.email}","${m.role}",${m.workloadScore},${m.assignedTasksCount}\n`;
        });
      }

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `synplan-report-${dateRange}-${timestamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (format === "json") {
      const dataPayload = {
        workspace: activeWorkspace?.name || "Synplan Workspace",
        exportedAt: new Date().toISOString(),
        dateRange,
        totalTasks: exportTasks.length,
        projects: projects.map((p) => ({ id: p.id, name: p.name, progress: p.progress })),
        members: includeWorkload
          ? members.map((m) => ({ name: m.user.name, email: m.user.email, role: m.role, workload: m.workloadScore }))
          : undefined,
        tasks: exportTasks,
      };

      const blob = new Blob([JSON.stringify(dataPayload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `synplan-analytics-${dateRange}-${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      // PDF / Printable HTML report
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Synplan Analytics Report - ${timestamp}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #09090b; }
            h1 { font-size: 24px; margin-bottom: 4px; }
            p.subtitle { color: #71717a; font-size: 13px; margin-top: 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th, td { border: 1px solid #e4e4e7; padding: 8px 12px; text-align: left; }
            th { background-color: #f4f4f5; font-weight: 600; }
            .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; text-transform: uppercase; background: #e0e7ff; color: #3730a3; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>Synplan Analytics & Milestone Report</h1>
          <p class="subtitle">Workspace: ${activeWorkspace?.name || "Synplan Core"} | Range: ${dateRange.toUpperCase()} | Generated: ${timestamp}</p>
          <h2>Task Inventory (${exportTasks.length} items)</h2>
          <table>
            <thead>
              <tr><th>Title</th><th>Status</th><th>Priority</th><th>Due Date</th></tr>
            </thead>
            <tbody>
              ${exportTasks
                .map(
                  (t) =>
                    `<tr><td>${t.title}</td><td><span class="badge">${t.status}</span></td><td>${t.priority}</td><td>${t.dueDate || "-"}</td></tr>`
                )
                .join("")}
            </tbody>
          </table>
        </body>
        </html>
      `;

      const blob = new Blob([htmlContent], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `synplan-analytics-report-${dateRange}-${timestamp}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    addToast({
      title: "📊 Report Downloaded",
      description: `Your workspace report has been exported as .${format.toUpperCase()} successfully.`,
      variant: "success",
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Download className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Export Analytics Report</h2>
              <p className="text-[11px] text-muted-foreground">
                Download sprint summary, milestone stats, and velocity data
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleExport} className="space-y-4 p-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground">Export Format</label>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { id: "csv", label: "CSV Table", icon: FileSpreadsheet },
                { id: "pdf", label: "PDF / HTML", icon: FileText },
                { id: "json", label: "JSON Data", icon: Code2 },
              ].map((f) => {
                const Icon = f.icon;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFormat(f.id as any)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors",
                      format === f.id
                        ? "border-primary bg-primary/10 text-primary font-bold"
                        : "border-border bg-surface text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-xs">{f.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <label className="text-xs font-semibold text-foreground">Data Inclusions</label>
            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeCompleted}
                  onChange={(e) => setIncludeCompleted(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                />
                <span>Include archived & completed task history</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeWorkload}
                  onChange={(e) => setIncludeWorkload(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                />
                <span>Include team workload capacity metrics</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs"
            >
              Cancel
            </Button>
            <MagnetButton type="submit" size="sm" className="text-xs font-semibold">
              Download Export
            </MagnetButton>
          </div>
        </form>
      </div>
    </div>
  );
}
