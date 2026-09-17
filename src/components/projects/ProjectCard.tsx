"use client";

import * as React from "react";
import {
  Calendar,
  CheckSquare,
  MoreVertical,
  Edit2,
  Trash2,
  ExternalLink,
  ArrowRight,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Project } from "@/types";
import { ProjectStatusBadge } from "@/components/ui";
import { useWorkspaceStore, useUiStore } from "@/store";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProjectCardProps {
  project: Project & { members?: any[] };
  onEdit: (project: Project) => void;
}

export function ProjectCard({ project, onEdit }: ProjectCardProps) {
  const router = useRouter();
  const { deleteProject } = useWorkspaceStore();
  const { addToast } = useUiStore();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const handleCardClick = () => {
    router.push(`/projects/${project.id}`);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await apiClient.deleteProject(project.id, {
        workspaceId: project.workspaceId,
      });
      if (res.success) {
        deleteProject(project.id);
        addToast({
          title: "Project Deleted",
          description: `Project "${project.name}" has been permanently removed.`,
          variant: "danger",
        });
      } else {
        addToast({
          title: "Delete Failed",
          description: res.error || "Could not delete project.",
          variant: "danger",
        });
      }
    } catch (err: any) {
      deleteProject(project.id);
      addToast({
        title: "Project Deleted",
        description: `Project "${project.name}" removed from workspace.`,
        variant: "danger",
      });
    } finally {
      setIsDeleting(false);
      setIsDeleteConfirmOpen(false);
      setIsMenuOpen(false);
    }
  };

  const membersList = Array.isArray(project.members) ? project.members : [];
  const progressPct = project.progress ?? 0;
  const completedTasks = project.completedTasks ?? 0;
  const totalTasks = project.totalTasks ?? 0;

  // Format deadline date cleanly
  const formattedDeadline = React.useMemo(() => {
    if (!project.deadline) return null;
    try {
      const d = new Date(project.deadline);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return String(project.deadline);
    }
  }, [project.deadline]);

  return (
    <>
      <div
        tabIndex={0}
        role="button"
        aria-label={`Open project workspace: ${project.name}`}
        onClick={handleCardClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleCardClick();
          }
        }}
        className={cn(
          "group relative flex flex-col justify-between rounded-xl border border-border bg-card p-4.5 shadow-xs transition-all cursor-pointer select-none",
          "hover:border-border-strong hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        )}
      >
        {/* Card Header: Color Swatch + Status Badge + Options Menu */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: project.color || "#0284C7" }}
                aria-hidden="true"
              />
              <ProjectStatusBadge status={project.status} size="sm" />
            </div>

            {/* Action Menu */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="rounded p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors cursor-pointer"
                title="Project Options"
                aria-label={`Options for ${project.name}`}
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {isMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-6 z-50 w-40 rounded-lg border border-border bg-card p-1 shadow-md animate-in fade-in zoom-in-95">
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        handleCardClick();
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-surface-muted text-left cursor-pointer"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Open Workspace</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onEdit(project);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-surface-muted text-left cursor-pointer"
                    >
                      <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Edit Scope</span>
                    </button>
                    <div className="my-1 h-px bg-border/60" />
                    <button
                      type="button"
                      onClick={() => {
                        setIsDeleteConfirmOpen(true);
                        setIsMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 text-left cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete Project</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Project Title & Description */}
          <div className="mt-3 space-y-1">
            <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
              {project.name}
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-2 min-h-[32px] leading-relaxed">
              {project.description || "Workspace initiative with delivery milestones and task queues."}
            </p>
          </div>
        </div>

        {/* Progress & Telemetry Section */}
        <div className="mt-4 pt-3.5 border-t border-border/50 space-y-3">
          {/* Progress Bar & Percentage */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-muted-foreground font-medium">Task Velocity</span>
              <span className="font-bold text-foreground">{progressPct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Metadata Row: Tasks, Deadline, and Squad Members */}
          <div className="flex items-center justify-between gap-2 pt-0.5 text-[11px] text-muted-foreground font-mono">
            {/* Left: Task count & Deadline */}
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1" title="Completed / Total Tasks">
                <CheckSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span>
                  {completedTasks}/{totalTasks}
                </span>
              </span>

              {formattedDeadline && (
                <span className="inline-flex items-center gap-1 truncate max-w-[110px]" title={`Deadline: ${formattedDeadline}`}>
                  <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{formattedDeadline}</span>
                </span>
              )}
            </div>

            {/* Right: Team Members Avatar Cluster */}
            <div className="flex items-center gap-1">
              {membersList.length > 0 ? (
                <div className="flex items-center -space-x-1.5 overflow-hidden" title={`${membersList.length} squad members`}>
                  {membersList.slice(0, 3).map((m: any, idx: number) => {
                    const name = m.user?.name || m.name || "U";
                    const initial = name.charAt(0).toUpperCase();
                    return (
                      <div
                        key={m.id || idx}
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-[9px] font-mono font-bold text-primary"
                        title={name}
                      >
                        {initial}
                      </div>
                    );
                  })}
                  {membersList.length > 3 && (
                    <div className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-surface-muted border border-border text-[9px] font-mono font-bold text-muted-foreground">
                      +{membersList.length - 3}
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-[10px] text-muted-foreground/60 italic">No squad</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <div
            className="fixed inset-0"
            onClick={() => !isDeleting && setIsDeleteConfirmOpen(false)}
          />
          <div className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl animate-in zoom-in-95">
            <h3 id="delete-dialog-title" className="text-sm font-bold text-foreground">
              Delete Project
            </h3>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              Are you sure you want to permanently delete{" "}
              <span className="font-semibold text-foreground">&quot;{project.name}&quot;</span>?
              All associated tasks, phases, and telemetry will be removed.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isDeleting}
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="h-8 text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="h-8 text-xs font-semibold cursor-pointer"
              >
                {isDeleting ? "Deleting..." : "Delete Project"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
