"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Plus,
  Settings,
  Users2,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Clock,
  ShieldCheck,
  MoreHorizontal,
  Archive,
  Trash2,
  ChevronDown,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectHealthSignals } from "@/types";
import { cn } from "@/lib/utils";

interface ProjectHeaderProps {
  project: {
    id: string;
    name: string;
    description?: string | null;
    status: string;
    color?: string | null;
    startDate?: string | Date | null;
    deadline?: string | Date | null;
    members?: any[];
  };
  health?: ProjectHealthSignals | null;
  onAddTask: () => void;
  onOpenSettings: () => void;
  onOpenMembers?: () => void;
  onStatusChange?: (newStatus: string) => void;
  onDeleteProject?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  PLANNING: {
    label: "Planning",
    bg: "bg-primary/10",
    text: "text-primary",
    border: "border-primary/30",
  },
  ACTIVE: {
    label: "Active",
    bg: "bg-status-progress/10",
    text: "text-status-progress",
    border: "border-status-progress/30",
  },
  ON_HOLD: {
    label: "On Hold",
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/30",
  },
  COMPLETED: {
    label: "Completed",
    bg: "bg-status-done/10",
    text: "text-status-done",
    border: "border-status-done/30",
  },
  ARCHIVED: {
    label: "Archived",
    bg: "bg-muted",
    text: "text-muted-foreground",
    border: "border-border",
  },
};

export function ProjectHeader({
  project,
  health,
  onAddTask,
  onOpenSettings,
  onOpenMembers,
  onStatusChange,
  onDeleteProject,
  canEdit = true,
  canDelete = false,
}: ProjectHeaderProps) {
  const members = Array.isArray(project.members) ? project.members : [];
  const currentStatus = (project.status || "PLANNING").toUpperCase();
  const statusConfig = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.PLANNING;

  // Health signals formatting
  const healthStatus = health?.healthStatus || "ON_TRACK";
  const healthReasons = health?.reasons || [];

  // Identify Project Lead
  const leadMember = members.find((m: any) => m.role === "LEAD");

  // Actions menu state
  const [isActionsOpen, setIsActionsOpen] = React.useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = React.useState(false);
  const actionsRef = React.useRef<HTMLDivElement>(null);
  const statusRef = React.useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) {
        setIsActionsOpen(false);
      }
      if (statusRef.current && !statusRef.current.contains(event.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleStatusSelect = (statusKey: string) => {
    setIsStatusDropdownOpen(false);
    if (statusKey !== currentStatus && onStatusChange) {
      onStatusChange(statusKey);
    }
  };

  return (
    <header className="border-b border-border pb-5 space-y-4">
      {/* Top Breadcrumb & Metadata Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Projects</span>
          </Link>
          <span className="text-muted-foreground/60">/</span>
          <span className="font-semibold text-foreground truncate max-w-xs">{project.name}</span>
        </nav>

        {/* Action Controls Cluster */}
        <div className="flex items-center gap-2">
          {canEdit && onOpenMembers && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenMembers}
              className="h-8 gap-1.5 text-xs cursor-pointer"
              title="Manage Project Members"
            >
              <Users2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="hidden sm:inline">Members</span>
            </Button>
          )}

          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenSettings}
              className="h-8 gap-1.5 text-xs cursor-pointer"
              title="Project Settings"
            >
              <Settings className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="hidden sm:inline">Settings</span>
            </Button>
          )}

          {canEdit && (
            <Button
              size="sm"
              onClick={onAddTask}
              className="h-8 gap-1.5 text-xs font-semibold shadow-xs cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Task</span>
            </Button>
          )}

          {/* Actions Dropdown Menu */}
          <div className="relative" ref={actionsRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsActionsOpen(!isActionsOpen)}
              className="h-8 w-8 p-0 cursor-pointer"
              title="More project actions"
              aria-label="More project actions"
              aria-expanded={isActionsOpen}
            >
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </Button>

            {isActionsOpen && (
              <div className="absolute right-0 mt-1.5 w-48 rounded-lg border border-border bg-card p-1 shadow-lg z-30 text-xs animate-in fade-in duration-100">
                {canEdit && (
                  <>
                    <button
                      onClick={() => {
                        setIsActionsOpen(false);
                        onAddTask();
                      }}
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-foreground hover:bg-surface-muted cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5 text-primary" />
                      <span>New Task</span>
                    </button>
                    {onOpenMembers && (
                      <button
                        onClick={() => {
                          setIsActionsOpen(false);
                          onOpenMembers();
                        }}
                        className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-foreground hover:bg-surface-muted cursor-pointer"
                      >
                        <Users2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Squad Members</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setIsActionsOpen(false);
                        onOpenSettings();
                      }}
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-foreground hover:bg-surface-muted cursor-pointer"
                    >
                      <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Configure Project</span>
                    </button>
                    {onStatusChange && (
                      <button
                        onClick={() => {
                          setIsActionsOpen(false);
                          onStatusChange(currentStatus === "ARCHIVED" ? "ACTIVE" : "ARCHIVED");
                        }}
                        className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-foreground hover:bg-surface-muted cursor-pointer"
                      >
                        <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{currentStatus === "ARCHIVED" ? "Unarchive Project" : "Archive Project"}</span>
                      </button>
                    )}
                  </>
                )}

                {canDelete && onDeleteProject && (
                  <>
                    <div className="my-1 border-t border-border/60" />
                    <button
                      onClick={() => {
                        setIsActionsOpen(false);
                        onDeleteProject();
                      }}
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-destructive hover:bg-destructive/10 cursor-pointer font-medium"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete Project</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Title, Status, and Telemetry Cluster */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <div
              className="h-4 w-4 rounded-md shrink-0 shadow-xs ring-1 ring-border"
              style={{ backgroundColor: project.color || "#0284C7" }}
              aria-hidden="true"
            />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{project.name}</h1>

            {/* Interactive Status Changer / Badge */}
            <div className="relative" ref={statusRef}>
              <button
                type="button"
                disabled={!canEdit || !onStatusChange}
                onClick={() => canEdit && onStatusChange && setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-mono font-medium transition-all",
                  statusConfig.bg,
                  statusConfig.text,
                  statusConfig.border,
                  canEdit && onStatusChange ? "cursor-pointer hover:ring-1 hover:ring-primary/40" : "cursor-default"
                )}
                aria-haspopup="listbox"
                aria-expanded={isStatusDropdownOpen}
                title={canEdit && onStatusChange ? "Click to change status" : `Status: ${statusConfig.label}`}
              >
                <span>{statusConfig.label}</span>
                {canEdit && onStatusChange && <ChevronDown className="h-3 w-3 opacity-60" />}
              </button>

              {isStatusDropdownOpen && canEdit && (
                <div className="absolute left-0 mt-1 w-36 rounded-lg border border-border bg-card p-1 shadow-lg z-30 text-xs animate-in fade-in duration-100">
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => handleStatusSelect(key)}
                      className={cn(
                        "flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs transition-colors cursor-pointer",
                        currentStatus === key
                          ? "bg-primary/10 font-bold text-primary"
                          : "text-foreground hover:bg-surface-muted"
                      )}
                    >
                      <span>{cfg.label}</span>
                      {currentStatus === key && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Authoritative Health Signal Badge */}
            {health && (
              <div
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-mono font-medium",
                  healthStatus === "ON_TRACK"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    : healthStatus === "AT_RISK"
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                    : "bg-destructive/10 text-destructive border-destructive/30"
                )}
                title={healthReasons.join(" • ") || "Project is on schedule"}
              >
                {healthStatus === "ON_TRACK" ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : healthStatus === "AT_RISK" ? (
                  <AlertTriangle className="h-3 w-3" />
                ) : (
                  <AlertOctagon className="h-3 w-3" />
                )}
                <span>{healthStatus.replace("_", " ")}</span>
              </div>
            )}
          </div>

          {project.description && (
            <p className="text-xs text-muted-foreground max-w-3xl line-clamp-2 leading-relaxed">
              {project.description}
            </p>
          )}
        </div>

        {/* Right Info Cluster: Deadlines, Project Lead & Members */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1 lg:pt-0">
          {leadMember && (
            <div className="flex items-center gap-1.5 font-medium text-foreground" title="Project Lead">
              <UserCheck className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px]">Lead: {leadMember.user?.name || "Squad Lead"}</span>
            </div>
          )}

          {project.deadline && (
            <div className="flex items-center gap-1.5 font-mono">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              <span>Target: {new Date(project.deadline).toLocaleDateString()}</span>
            </div>
          )}

          {members.length > 0 && (
            <div
              className={cn("flex items-center gap-2", onOpenMembers && "cursor-pointer hover:text-foreground")}
              onClick={onOpenMembers}
              title="Click to view all squad members"
            >
              <div className="flex -space-x-1.5 overflow-hidden">
                {members.slice(0, 4).map((m: any) => {
                  const initial = (m.user?.name || "M").charAt(0).toUpperCase();
                  return (
                    <div
                      key={m.id}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-muted border border-border text-[10px] font-bold text-foreground font-mono"
                      title={`${m.user?.name || "Member"} (${m.role})`}
                    >
                      {initial}
                    </div>
                  );
                })}
              </div>
              <span className="text-[11px] font-medium">
                {members.length} {members.length === 1 ? "member" : "members"}
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
