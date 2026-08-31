"use client";

import * as React from "react";
import {
  Plus,
  Edit2,
  Trash2,
  ChevronUp,
  ChevronDown,
  Layers,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/apiClient";
import { useUiStore } from "@/store";
import { calculateProgress } from "@/lib/projectWorkflow";
import { cn } from "@/lib/utils";

interface PhaseItem {
  id: string;
  name: string;
  description?: string | null;
  order: number;
}

interface PhaseManagerProps {
  projectId: string;
  phases: PhaseItem[];
  tasks: any[];
  projectColor?: string;
  onPhasesChanged: () => void;
}

export function PhaseManager({
  projectId,
  phases,
  tasks,
  projectColor = "#0284C7",
  onPhasesChanged,
}: PhaseManagerProps) {
  const { addToast } = useUiStore();
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [editingPhase, setEditingPhase] = React.useState<PhaseItem | null>(null);
  const [phaseName, setPhaseName] = React.useState("");
  const [phaseDesc, setPhaseDesc] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const sortedPhases = [...phases].sort((a, b) => (a.order || 0) - (b.order || 0));

  const handleOpenAdd = () => {
    setEditingPhase(null);
    setPhaseName("");
    setPhaseDesc("");
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (phase: PhaseItem) => {
    setEditingPhase(phase);
    setPhaseName(phase.name);
    setPhaseDesc(phase.description || "");
    setIsAddModalOpen(true);
  };

  const handleSavePhase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phaseName.trim()) return;

    setIsSubmitting(true);
    try {
      if (editingPhase) {
        const res = await apiClient.updatePhase(editingPhase.id, {
          name: phaseName.trim(),
          description: phaseDesc.trim() || undefined,
        });
        if (res.success) {
          addToast({
            title: "Phase Updated",
            description: `Phase "${phaseName.trim()}" has been updated.`,
            variant: "success",
          });
          setIsAddModalOpen(false);
          onPhasesChanged();
        } else {
          addToast({
            title: "Update Failed",
            description: res.error || "Could not update phase.",
            variant: "danger",
          });
        }
      } else {
        const nextOrder = sortedPhases.length > 0 ? Math.max(...sortedPhases.map((p) => p.order || 0)) + 1 : 1;
        const res = await apiClient.createPhase({
          projectId,
          name: phaseName.trim(),
          description: phaseDesc.trim() || undefined,
          order: nextOrder,
        });
        if (res.success) {
          addToast({
            title: "Phase Created",
            description: `Phase "${phaseName.trim()}" added to project.`,
            variant: "success",
          });
          setIsAddModalOpen(false);
          onPhasesChanged();
        } else {
          addToast({
            title: "Creation Failed",
            description: res.error || "Could not create phase.",
            variant: "danger",
          });
        }
      }
    } catch (err: any) {
      addToast({
        title: "Operation Failed",
        description: err?.message || "Network error",
        variant: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePhase = async (phase: PhaseItem) => {
    const assignedTasks = tasks.filter((t) => t.phaseId === phase.id);
    if (assignedTasks.length > 0) {
      addToast({
        title: "Cannot Delete Phase",
        description: `This phase has ${assignedTasks.length} assigned task(s). Reassign or delete them first.`,
        variant: "danger",
      });
      return;
    }

    try {
      const res = await apiClient.deletePhase(phase.id, { projectId });
      if (res.success) {
        addToast({
          title: "Phase Deleted",
          description: `Phase "${phase.name}" removed from pipeline.`,
          variant: "success",
        });
        onPhasesChanged();
      } else {
        addToast({
          title: "Delete Failed",
          description: res.error || "Could not delete phase.",
          variant: "danger",
        });
      }
    } catch (err: any) {
      addToast({
        title: "Delete Error",
        description: err?.message || "Failed to communicate with database.",
        variant: "danger",
      });
    }
  };

  const handleMove = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sortedPhases.length) return;

    const newPhases = [...sortedPhases];
    const [moved] = newPhases.splice(index, 1);
    newPhases.splice(targetIndex, 0, moved);

    const reorderedPayload = newPhases.map((p, idx) => ({ id: p.id, order: idx + 1 }));

    try {
      const res = await apiClient.reorderPhases({
        projectId,
        phaseOrders: reorderedPayload,
      });
      if (res.success) {
        onPhasesChanged();
      }
    } catch (err) {
      console.warn("Reorder error:", err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">Project Phases Pipeline</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sequential delivery milestones, task grouping, and completion velocity
          </p>
        </div>
        <Button size="sm" onClick={handleOpenAdd} className="h-8 gap-1.5 text-xs font-semibold shrink-0">
          <Plus className="h-3.5 w-3.5" />
          <span>Add Phase</span>
        </Button>
      </div>

      {sortedPhases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 p-8 text-center space-y-3">
          <Layers className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <h4 className="text-xs font-semibold text-foreground">No phases configured</h4>
          <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
            Organize work into structured delivery milestones (e.g. Planning, UI/UX, Development).
          </p>
          <Button size="sm" variant="outline" onClick={handleOpenAdd} className="h-7 text-xs">
            Create First Phase
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {sortedPhases.map((phase, idx) => {
            const phaseTasks = tasks.filter((t) => t.phaseId === phase.id);
            const phaseDone = phaseTasks.filter((t) => t.status === "DONE" || t.status === "done");
            const progress = calculateProgress(phaseDone.length, phaseTasks.length);

            return (
              <div
                key={phase.id}
                className="group rounded-xl border border-border/70 bg-card p-4 space-y-3.5 transition-all hover:border-primary/40 hover:shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-mono font-bold text-primary">
                      Phase 0{idx + 1}
                    </span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleMove(idx, "up")}
                        disabled={idx === 0}
                        title="Move Up"
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleMove(idx, "down")}
                        disabled={idx === sortedPhases.length - 1}
                        title="Move Down"
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(phase)}
                      title="Edit Phase"
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleDeletePhase(phase)}
                      title="Delete Phase"
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-foreground">{phase.name}</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                    {phase.description || "Pipeline delivery milestone"}
                  </p>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                    <span>
                      {phaseDone.length}/{phaseTasks.length} Tasks
                    </span>
                    <span className="font-bold text-foreground">{progress}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${progress}%`, backgroundColor: projectColor }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Add / Edit Phase */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="fixed inset-0" onClick={() => setIsAddModalOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl z-10 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-foreground">
                {editingPhase ? "Edit Project Phase" : "Create New Phase"}
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSavePhase} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Phase Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Architecture Blueprint"
                  value={phaseName}
                  onChange={(e) => setPhaseName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Description (Optional)</label>
                <textarea
                  rows={3}
                  placeholder="Scope deliverables and objectives for this phase..."
                  value={phaseDesc}
                  onChange={(e) => setPhaseDesc(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddModalOpen(false)}
                  className="h-8 text-xs"
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting} className="h-8 text-xs font-semibold">
                  {isSubmitting ? "Saving..." : editingPhase ? "Update Phase" : "Create Phase"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
