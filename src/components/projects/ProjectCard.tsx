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
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Project } from "@/types";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { useWorkspaceStore, useUiStore } from "@/store";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProjectCardProps {
  project: Project;
  onEdit: (project: Project) => void;
}

const statusMap: Record<Project["status"], { label: string; className: string }> = {
  planning: { label: "Planning", className: "bg-primary/10 text-primary border-primary/30" },
  active: { label: "In Progress", className: "bg-status-progress/10 text-status-progress border-status-progress/30" },
  completed: { label: "Completed", className: "bg-status-done/10 text-status-done border-status-done/30" },
  on_hold: { label: "On Hold", className: "bg-status-review/10 text-status-review border-status-review/30" },
  archived: { label: "Archived", className: "bg-muted text-muted-foreground border-border" },
};

export function ProjectCard({ project, onEdit }: ProjectCardProps) {
  const router = useRouter();
  const { deleteProject } = useWorkspaceStore();
  const { addToast } = useUiStore();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const statusInfo = statusMap[project.status] || statusMap.active;

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

  return (
    <>
      <SpotlightCard className="flex flex-col justify-between h-full group hover:border-primary/40 transition-all">
        {/* Card Header */}
        <div>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-md"
                style={{ backgroundColor: project.color }}
              />
              <span
                className={cn(
                  "rounded border px-2 py-0.5 text-[10px] font-mono uppercase font-semibold",
                  statusInfo.className
                )}
              >
                {statusInfo.label}
              </span>
            </div>

            {/* Action Menu */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(!isMenuOpen);
                }}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Project Options"
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {isMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMenuOpen(false);
                    }}
                  />
                  <div className="absolute right-0 top-6 z-50 w-36 rounded-md border border-border bg-card p-1 shadow-lg animate-in fade-in zoom-in-95">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        onEdit(project);
                      }}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground hover:bg-muted text-left"
                    >
                      <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Edit Scope</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        handleCardClick();
                      }}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground hover:bg-muted text-left"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>View Kanban</span>
                    </button>
                    <div className="my-1 h-px bg-border" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsDeleteConfirmOpen(true);
                        setIsMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 text-left"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Title & Description */}
          <div onClick={handleCardClick} className="cursor-pointer">
            <h3 className="mt-3 text-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
              {project.name}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2 min-h-[32px]">
              {project.description || "No description provided for this project scope."}
            </p>
          </div>
        </div>

        {/* Card Progress & Stats */}
        <div className="mt-4 pt-4 border-t border-border/60 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">Milestone Progress</span>
            <span className="font-mono font-bold text-foreground">{project.progress}%</span>
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${project.progress}%`,
                backgroundColor: project.color,
              }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
            <div className="flex items-center gap-2.5">
              <span className="flex items-center gap-1 font-mono">
                <CheckSquare className="h-3 w-3" />
                {project.completedTasks}/{project.totalTasks}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {project.deadline || "No deadline"}
              </span>
            </div>

            <button
              onClick={handleCardClick}
              className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
            >
              <span>Board</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </SpotlightCard>

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div
            className="fixed inset-0"
            onClick={() => !isDeleting && setIsDeleteConfirmOpen(false)}
          />
          <div className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-sm font-bold text-foreground">Delete Project</h3>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-foreground">&quot;{project.name}&quot;</span>? All associated tasks will be permanently removed.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isDeleting}
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="h-8 text-xs font-semibold"
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
