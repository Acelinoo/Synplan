"use client";

import * as React from "react";
import {
  Calendar,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Edit2,
  Trash2,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Task, TaskStatus, TaskPriority, Subtask } from "@/types";
import { useTaskStore, useUiStore } from "@/store";
import { apiClient } from "@/lib/apiClient";
import { getDueDateState } from "@/lib/projectWorkflow";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface KanbanCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onSelect: (task: Task) => void;
}

const statusOrder: TaskStatus[] = ["todo", "in_progress", "in_review", "done"];

const priorityStyles: Record<TaskPriority, { label: string; bg: string; dot: string }> = {
  urgent: { label: "Urgent", bg: "bg-priority-urgent/10 text-priority-urgent border-priority-urgent/30", dot: "bg-priority-urgent" },
  high: { label: "High", bg: "bg-priority-high/10 text-priority-high border-priority-high/30", dot: "bg-priority-high" },
  medium: { label: "Medium", bg: "bg-priority-medium/10 text-priority-medium border-priority-medium/30", dot: "bg-priority-medium" },
  low: { label: "Low", bg: "bg-priority-low/10 text-priority-low border-priority-low/30", dot: "bg-priority-low" },
};

export function KanbanCard({ task, onEdit, onSelect }: KanbanCardProps) {
  const { moveTaskStatus, updateTask, deleteTask, recentCompletedTaskId } = useTaskStore();
  const { addToast } = useUiStore();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [showSubtasks, setShowSubtasks] = React.useState(false);

  const isRecentDone = recentCompletedTaskId === task.id;
  const priorityInfo = priorityStyles[task.priority] || priorityStyles.medium;

  const currentIdx = statusOrder.indexOf(task.status);
  const canMoveLeft = currentIdx > 0;
  const canMoveRight = currentIdx >= 0 && currentIdx < statusOrder.length - 1;

  const handleMove = async (direction: "left" | "right", e: React.MouseEvent) => {
    e.stopPropagation();
    const newIdx = direction === "left" ? currentIdx - 1 : currentIdx + 1;
    if (newIdx >= 0 && newIdx < statusOrder.length) {
      const prevStatus = task.status;
      const prevCompletedAt = task.completedAt;
      const nextStatus = statusOrder[newIdx];

      // 1. Optimistic local update
      moveTaskStatus(task.id, nextStatus);

      try {
        const res = await apiClient.updateTaskStatus(task.id, nextStatus);
        if (res.success) {
          if (nextStatus === "done" && res.evaluator) {
            addToast({
              title: "🎉 Task Completed!",
              description: `"${task.title}" is marked as done. (${res.evaluator.timingSummary})`,
              variant: "success",
            });

            if (res.evaluator.milestoneTriggered || res.evaluator.projectProgress === 100) {
              setTimeout(() => {
                addToast({
                  title: "🚀 Project 100% Milestone Completed!",
                  description: `All initiative deliverables are finalized & ready for release.`,
                  variant: "success",
                });
              }, 600);
            }
          }
        } else {
          // Rollback to previous status on non-success response
          moveTaskStatus(task.id, prevStatus, prevCompletedAt);
          addToast({
            title: "Gagal Mengubah Status",
            description: res.message || res.error || "Gagal memperbarui status task di server.",
            variant: "danger",
          });
        }
      } catch (err: any) {
        // Rollback on network/fetch exception
        moveTaskStatus(task.id, prevStatus, prevCompletedAt);
        addToast({
          title: "Koneksi Bermasalah",
          description: err?.message || "Gagal terhubung ke server untuk memperbarui status.",
          variant: "danger",
        });
      }
    }
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await apiClient.deleteTask(task.id, {
        workspaceId: task.workspaceId,
        projectId: task.projectId,
      });
      if (res.success) {
        deleteTask(task.id);
        addToast({
          title: "Task Deleted",
          description: `Task "${task.title}" has been permanently removed.`,
          variant: "danger",
        });
      } else {
        addToast({
          title: "Delete Failed",
          description: res.error || "Could not delete task.",
          variant: "danger",
        });
      }
    } catch (err: any) {
      deleteTask(task.id);
      addToast({
        title: "Task Deleted",
        description: `Task "${task.title}" removed.`,
        variant: "danger",
      });
    } finally {
      setIsDeleting(false);
      setIsDeleteConfirmOpen(false);
      setIsMenuOpen(false);
    }
  };

  const handleToggleSubtask = async (subtaskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentSubtasks = task.subtasks || [];
    const updatedSubtasks: Subtask[] = currentSubtasks.map((s) =>
      s.id === subtaskId ? { ...s, completed: !s.completed } : s
    );

    // Optimistic store update
    updateTask(task.id, { subtasks: updatedSubtasks });

    try {
      await apiClient.updateTask(task.id, {
        subtasks: updatedSubtasks,
      });
    } catch (err) {
      console.warn("Subtask toggle backend sync:", err);
    }
  };

  const completedSubtasks = task.subtasks?.filter((s) => s.completed).length || 0;
  const totalSubtasks = task.subtasks?.length || 0;

  return (
    <>
      <div
        onClick={() => onSelect(task)}
        className={cn(
          "group relative cursor-pointer rounded-lg border border-border/80 bg-card p-3.5 shadow-sm transition-all duration-200 hover:border-primary/50 hover:shadow-md select-none",
          isRecentDone && "ring-2 ring-status-done shadow-status-done/20 bg-status-done/5 animate-pulse"
        )}
      >
        {/* Top Header: Priority Badge + Action Menu */}
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[9px] font-mono uppercase font-bold",
              priorityInfo.bg
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", priorityInfo.dot)} />
            {priorityInfo.label}
          </span>

          <div className="flex items-center gap-1">
            {/* Quick status stepper buttons */}
            {canMoveLeft && (
              <button
                onClick={(e) => handleMove("left", e)}
                className="opacity-0 group-hover:opacity-100 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-opacity"
                title="Move left"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            )}
            {canMoveRight && (
              <button
                onClick={(e) => handleMove("right", e)}
                className="opacity-0 group-hover:opacity-100 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-opacity"
                title="Move right"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}

            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(!isMenuOpen);
                }}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Options"
              >
                <MoreVertical className="h-3.5 w-3.5" />
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
                  <div className="absolute right-0 top-6 z-50 w-32 rounded-md border border-border bg-card p-1 shadow-lg animate-in fade-in zoom-in-95">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        onEdit(task);
                      }}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground hover:bg-muted text-left"
                    >
                      <Edit2 className="h-3 w-3 text-muted-foreground" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        setIsDeleteConfirmOpen(true);
                      }}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 text-left"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Delete</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Task Title & Description */}
        <h4 className="mt-2 text-xs font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-relaxed">
          {task.title}
        </h4>

        {task.description && (
          <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
            {task.description}
          </p>
        )}

        {/* Inline Subtasks List (Directly Interactive) */}
        {totalSubtasks > 0 && showSubtasks && (
          <div className="mt-2.5 pt-2 border-t border-border/50 space-y-1.5">
            {task.subtasks?.map((subtask) => (
              <div
                key={subtask.id}
                onClick={(e) => handleToggleSubtask(subtask.id, e)}
                className="flex items-center gap-2 rounded p-1 text-[11px] hover:bg-surface transition-colors cursor-pointer"
              >
                <div
                  className={cn(
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors",
                    subtask.completed
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-muted-foreground/40 bg-card hover:border-primary"
                  )}
                >
                  {subtask.completed && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                </div>
                <span
                  className={cn(
                    "truncate text-xs",
                    subtask.completed ? "line-through text-muted-foreground" : "text-foreground"
                  )}
                >
                  {subtask.title}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Footer Details: Subtasks, Due Date, Assignee */}
        <div className="mt-3.5 flex items-center justify-between border-t border-border/50 pt-2.5 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-2.5">
            {totalSubtasks > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSubtasks(!showSubtasks);
                }}
                className={cn(
                  "flex items-center gap-1 font-mono hover:text-foreground transition-colors",
                  completedSubtasks === totalSubtasks
                    ? "text-status-done font-semibold"
                    : "text-muted-foreground"
                )}
                title="Toggle subtask list"
              >
                <CheckSquare className="h-3 w-3" />
                <span>
                  {completedSubtasks}/{totalSubtasks}
                </span>
                {showSubtasks ? (
                  <ChevronUp className="h-2.5 w-2.5 opacity-60" />
                ) : (
                  <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                )}
              </button>
            )}

            {task.dueDate && (() => {
              const dueInfo = getDueDateState(task.dueDate, task.status);
              return (
                <span
                  className={cn(
                    "flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono border",
                    dueInfo.badgeClass
                  )}
                  title={task.dueDate}
                >
                  <Calendar className="h-2.5 w-2.5" />
                  <span>{dueInfo.label}</span>
                </span>
              );
            })()}
          </div>

          {/* Assignee Avatar */}
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[9px] font-bold text-primary font-mono ring-1 ring-border">
            {task.assigneeId ? task.assigneeId.charAt(task.assigneeId.length - 1).toUpperCase() : "A"}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div
            className="fixed inset-0"
            onClick={() => !isDeleting && setIsDeleteConfirmOpen(false)}
          />
          <div className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-sm font-bold text-foreground">Delete Task</h3>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-foreground">&quot;{task.title}&quot;</span>? This action cannot be undone.
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
                {isDeleting ? "Deleting..." : "Delete Task"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
