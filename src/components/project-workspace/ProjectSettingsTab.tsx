"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  Trash2,
  Users2,
  Layers,
  AlertTriangle,
  UserPlus,
  Shield,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhaseManager } from "@/components/projects/PhaseManager";
import { apiClient } from "@/lib/apiClient";
import { useUiStore } from "@/store";
import { cn } from "@/lib/utils";

interface ProjectSettingsTabProps {
  project: any;
  onProjectUpdated: () => void;
  canManageSettings?: boolean;
}

const PROJECT_STATUSES = [
  { value: "PLANNING", label: "Planning" },
  { value: "ACTIVE", label: "Active" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
];

const COLOR_OPTIONS = [
  "#0284C7", // Sky/Cobalt
  "#0F3D64", // Deep Navy
  "#059669", // Emerald
  "#D97706", // Amber
  "#DC2626", // Red
  "#7C3AED", // Violet
  "#475569", // Slate
];

export function ProjectSettingsTab({
  project,
  onProjectUpdated,
  canManageSettings = true,
}: ProjectSettingsTabProps) {
  const router = useRouter();
  const { addToast } = useUiStore();

  // Form State
  const [name, setName] = React.useState(project.name || "");
  const [description, setDescription] = React.useState(project.description || "");
  const [color, setColor] = React.useState(project.color || "#0284C7");
  const [status, setStatus] = React.useState(project.status || "PLANNING");
  const [deadline, setDeadline] = React.useState(
    project.deadline ? new Date(project.deadline).toISOString().split("T")[0] : ""
  );
  const [isSaving, setIsSaving] = React.useState(false);

  // Danger Zone Confirmation Modal
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);
  const [deleteInput, setDeleteInput] = React.useState("");
  const [isDeleting, setIsDeleting] = React.useState(false);

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      const res = await apiClient.updateProject(project.id, {
        name: name.trim(),
        description: description.trim() || null,
        color,
        status,
        deadline: deadline || null,
      });

      if (res.success) {
        addToast({
          title: "Settings Saved",
          description: "Project configuration has been successfully updated.",
          variant: "success",
        });
        onProjectUpdated();
      } else {
        addToast({
          title: "Update Failed",
          description: res.error || "Could not update project settings.",
          variant: "danger",
        });
      }
    } catch (err: any) {
      addToast({
        title: "Error",
        description: err?.message || "Failed to update project.",
        variant: "danger",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    if (deleteInput !== project.name) return;

    setIsDeleting(true);
    try {
      const res = await apiClient.deleteProject(project.id, {
        workspaceId: project.workspaceId,
      });

      if (res.success) {
        addToast({
          title: "Project Deleted",
          description: `Project "${project.name}" has been permanently removed.`,
          variant: "warning",
        });
        router.push("/projects");
      } else {
        addToast({
          title: "Delete Failed",
          description: res.error || "Could not delete project.",
          variant: "danger",
        });
      }
    } catch (err: any) {
      addToast({
        title: "Error",
        description: err?.message || "Network error while deleting project.",
        variant: "danger",
      });
    } finally {
      setIsDeleting(false);
      setIsDeleteConfirmOpen(false);
    }
  };

  const members: any[] = Array.isArray(project.members) ? project.members : [];
  const phases: any[] = Array.isArray(project.phases) ? project.phases : [];
  const tasks: any[] = Array.isArray(project.tasks) ? project.tasks : [];

  return (
    <div className="space-y-8 max-w-4xl">
      {/* 1. General Project Details */}
      <form
        onSubmit={handleSaveGeneral}
        className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs"
      >
        <div className="border-b border-border/60 pb-3">
          <h3 className="text-sm font-bold text-foreground">Project Configuration</h3>
          <p className="text-xs text-muted-foreground">
            Basic attributes, status lifecycle, and delivery schedule.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-semibold text-foreground">Project Name</label>
            <input
              type="text"
              value={name}
              disabled={!canManageSettings}
              onChange={(e) => setName(e.target.value)}
              className="h-8.5 w-full rounded-md border border-border bg-card px-3 text-xs text-foreground focus:border-primary focus:outline-none"
              required
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-semibold text-foreground">Description</label>
            <textarea
              rows={3}
              value={description}
              disabled={!canManageSettings}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-border bg-card p-3 text-xs text-foreground focus:border-primary focus:outline-none"
              placeholder="Outline project scope, objectives, or key deliverables..."
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Project Status</label>
            <select
              value={status}
              disabled={!canManageSettings}
              onChange={(e) => setStatus(e.target.value)}
              className="h-8.5 w-full rounded-md border border-border bg-card px-2.5 text-xs text-foreground focus:border-primary focus:outline-none cursor-pointer"
            >
              {PROJECT_STATUSES.map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Target Deadline</label>
            <input
              type="date"
              value={deadline}
              disabled={!canManageSettings}
              onChange={(e) => setDeadline(e.target.value)}
              className="h-8.5 w-full rounded-md border border-border bg-card px-3 text-xs text-foreground focus:border-primary focus:outline-none"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-semibold text-foreground">Project Theme Color</label>
            <div className="flex items-center gap-3 pt-1">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={!canManageSettings}
                  onClick={() => setColor(c)}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full transition-all cursor-pointer",
                    color === c ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "hover:scale-105"
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Select color ${c}`}
                >
                  {color === c && <Check className="h-3.5 w-3.5 text-white" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {canManageSettings && (
          <div className="flex justify-end pt-3 border-t border-border/50">
            <Button
              type="submit"
              size="sm"
              disabled={isSaving}
              className="h-8 gap-1.5 text-xs font-semibold cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{isSaving ? "Saving..." : "Save Configuration"}</span>
            </Button>
          </div>
        )}
      </form>

      {/* 2. Phase Management */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs">
        <div className="border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Delivery Phases & Roadmap</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Manage stage gates, phase sequencing, and milestone containers for this project.
          </p>
        </div>

        <PhaseManager
          projectId={project.id}
          phases={phases}
          tasks={tasks}
          projectColor={project.color}
          onPhasesChanged={onProjectUpdated}
        />
      </div>

      {/* 3. Team Membership Roster */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-xs">
        <div className="border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <Users2 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Project Team Collaborators</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Members mapped to this initiative with assigned delivery roles.
          </p>
        </div>

        {members.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground italic">
            All workspace members currently have default access. Assign specific roles to define ownership.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {members.map((m: any) => {
              const userName = m.user?.name || "Squad Member";
              const userEmail = m.user?.email || "";
              const userRole = m.role || "MEMBER";
              const initial = userName.charAt(0).toUpperCase();

              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted/30 p-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-xs font-bold text-primary font-mono shrink-0">
                      {initial}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{userName}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{userEmail}</p>
                    </div>
                  </div>
                  <span className="rounded px-2 py-0.5 text-[10px] font-mono font-semibold bg-card border border-border text-muted-foreground uppercase">
                    {userRole}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Danger Zone */}
      {canManageSettings && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 space-y-4">
          <div className="border-b border-destructive/20 pb-3">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <h3 className="text-sm font-bold">Danger Zone</h3>
            </div>
            <p className="text-xs text-destructive/80 mt-0.5">
              Irreversible actions that affect the entire project and its deliverables.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-foreground">Delete this project</p>
              <p className="text-[11px] text-muted-foreground">
                Permanently removes all phases, milestones, tasks, dependencies, and discussion comments.
              </p>
            </div>

            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsDeleteConfirmOpen(true)}
              className="h-8 gap-1.5 text-xs font-semibold shrink-0 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Project</span>
            </Button>
          </div>

          {/* Delete Confirmation Dialog */}
          {isDeleteConfirmOpen && (
            <div className="rounded-lg border border-destructive/40 bg-card p-4 space-y-3 mt-3 animate-in fade-in duration-200">
              <p className="text-xs text-foreground font-medium">
                To confirm deletion, type the project name <strong className="text-destructive font-mono">{project.name}</strong> below:
              </p>
              <input
                type="text"
                placeholder={project.name}
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                className="h-8.5 w-full rounded-md border border-destructive/50 bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-destructive"
              />
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsDeleteConfirmOpen(false);
                    setDeleteInput("");
                  }}
                  className="h-8 text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleteInput !== project.name || isDeleting}
                  onClick={handleDeleteProject}
                  className="h-8 text-xs font-semibold cursor-pointer"
                >
                  {isDeleting ? "Deleting..." : "Permanently Delete Project"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
