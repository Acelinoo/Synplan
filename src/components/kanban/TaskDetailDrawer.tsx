"use client";

import * as React from "react";
import {
  X,
  Calendar,
  Flag,
  User,
  CheckSquare,
  Edit2,
  Trash2,
  Layers,
  Clock,
  MessageSquare,
  Send,
  Link2,
  Ban,
} from "lucide-react";
import { Task, TaskStatus, TaskPriority } from "@/types";
import { useTaskStore, useWorkspaceStore, useUiStore } from "@/store";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/apiClient";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useRealtime } from "@/components/realtime/RealtimeProvider";

interface TaskDetailDrawerProps {
  task: Task | null;
  onClose: () => void;
  onEdit: (task: Task) => void;
}

export function TaskDetailDrawer({ task, onClose, onEdit }: TaskDetailDrawerProps) {
  const { moveTaskStatus, deleteTask, updateTask } = useTaskStore();
  const { projects } = useWorkspaceStore();
  const { addToast } = useUiStore();
  const { onEvent } = useRealtime();

  const [comments, setComments] = React.useState<any[]>([]);
  const [isCommentsLoading, setIsCommentsLoading] = React.useState(false);
  const [newCommentText, setNewCommentText] = React.useState("");
  const [isPostingComment, setIsPostingComment] = React.useState(false);

  const [dependencies, setDependencies] = React.useState<{ blockedBy: any[]; blocking: any[]; isBlocked?: boolean }>({
    blockedBy: [],
    blocking: [],
  });
  const [isDepsLoading, setIsDepsLoading] = React.useState(false);

  const taskId = task?.id;

  // Handle ESC key to close drawer
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && task) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [task, onClose]);

  // Realtime: Auto-close drawer if task is deleted remotely
  React.useEffect(() => {
    if (!taskId) return;
    const unsub = onEvent("TASK_DELETED", (event) => {
      if (event.payload?.id === taskId) {
        onClose();
        addToast({
          title: "Task Removed",
          description: "This task was deleted by another team member.",
          variant: "warning",
        });
      }
    });
    return unsub;
  }, [taskId, onEvent, onClose, addToast]);

  React.useEffect(() => {
    if (!taskId) return;
    async function loadComments() {
      setIsCommentsLoading(true);
      try {
        const res = await apiClient.getTaskComments(taskId!);
        if (res.success && Array.isArray(res.data)) {
          setComments(res.data);
        }
      } catch (err) {
        console.warn("Failed to load task comments:", err);
      } finally {
        setIsCommentsLoading(false);
      }
    }
    loadComments();
  }, [taskId]);

  // Load task dependencies
  React.useEffect(() => {
    if (!taskId) return;
    async function loadDeps() {
      setIsDepsLoading(true);
      try {
        const res = await apiClient.getTaskDependencies(taskId!, task?.workspaceId);
        if (res && res.success && res.data) {
          setDependencies(res.data);
        } else {
          setDependencies({ blockedBy: [], blocking: [] });
        }
      } catch (err) {
        console.warn("Failed to load task dependencies:", err);
      } finally {
        setIsDepsLoading(false);
      }
    }
    loadDeps();
  }, [taskId, task?.workspaceId]);

  if (!task) return null;

  const project = projects.find((p) => p.id === task.projectId);

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || isPostingComment) return;

    setIsPostingComment(true);
    try {
      const res = await apiClient.addTaskComment(task.id, newCommentText.trim());
      if (res.success && res.data) {
        setComments((prev) => [...prev, res.data]);
        setNewCommentText("");
        addToast({
          title: "Comment Added",
          description: "Your comment has been posted.",
          variant: "success",
        });
      } else {
        addToast({
          title: "Comment Failed",
          description: res.error || "Could not post comment.",
          variant: "danger",
        });
      }
    } catch (err: any) {
      addToast({
        title: "Comment Error",
        description: err?.message || "Failed to communicate with server.",
        variant: "danger",
      });
    } finally {
      setIsPostingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      const res = await apiClient.deleteTaskComment(commentId);
      if (res.success) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        addToast({
          title: "Comment Deleted",
          description: "Comment removed.",
          variant: "success",
        });
      }
    } catch (err) {
      console.warn("Failed to delete comment:", err);
    }
  };

  const handleRemoveDependency = async (depId: string) => {
    if (!taskId) return;
    try {
      const res = await apiClient.removeTaskDependency(taskId, depId, task.workspaceId);
      if (res && res.success) {
        setDependencies((prev) => ({
          ...prev,
          blockedBy: prev.blockedBy.filter((d: any) => d.id !== depId),
          blocking: prev.blocking.filter((d: any) => d.id !== depId),
        }));
        addToast({
          title: "Dependency Removed",
          description: "Task dependency link was removed.",
          variant: "success",
        });
      }
    } catch (err: any) {
      addToast({
        title: "Error",
        description: err?.message || "Failed to remove dependency.",
        variant: "danger",
      });
    }
  };

  const toggleSubtask = async (subId: string) => {
    const prevSubtasks = task.subtasks || [];
    const updatedSubtasks = prevSubtasks.map((s) =>
      s.id === subId ? { ...s, completed: !s.completed } : s
    );
    updateTask(task.id, { subtasks: updatedSubtasks });
    try {
      const res = await apiClient.updateTask(task.id, { subtasks: updatedSubtasks });
      if (!res.success) {
        updateTask(task.id, { subtasks: prevSubtasks });
        addToast({
          title: "Gagal Menyimpan Subtask",
          description: res.message || "Gagal memperbarui checklist subtask di server.",
          variant: "danger",
        });
      }
    } catch (e: any) {
      updateTask(task.id, { subtasks: prevSubtasks });
      addToast({
        title: "Koneksi Bermasalah",
        description: e?.message || "Gagal menyimpan perubahan subtask.",
        variant: "danger",
      });
    }
  };

  const handleStatusChange = async (newStatus: TaskStatus) => {
    const prevStatus = task.status;
    const prevCompletedAt = task.completedAt;
    moveTaskStatus(task.id, newStatus);
    try {
      const res = await apiClient.updateTaskStatus(task.id, newStatus);
      if (res.success) {
        if (newStatus === "done") {
          addToast({
            title: "🎉 Task Completed!",
            description: `Great job! "${task.title}" is marked as done.`,
            variant: "success",
          });
        }
      } else {
        moveTaskStatus(task.id, prevStatus, prevCompletedAt);
        addToast({
          title: "Gagal Mengubah Status",
          description: res.message || res.error || "Gagal memperbarui status task di server.",
          variant: "danger",
        });
      }
    } catch (e: any) {
      moveTaskStatus(task.id, prevStatus, prevCompletedAt);
      addToast({
        title: "Koneksi Bermasalah",
        description: e?.message || "Gagal terhubung ke server untuk memperbarui status.",
        variant: "danger",
      });
    }
  };

  const handleDeleteTask = async () => {
    const previousTasks = useTaskStore.getState().tasks;
    deleteTask(task.id);
    onClose();
    try {
      const res = await apiClient.deleteTask(task.id, {
        workspaceId: task.workspaceId,
        projectId: task.projectId,
      });
      if (res.success) {
        addToast({
          title: "Task Deleted",
          description: `Task "${task.title}" was deleted.`,
          variant: "danger",
        });
      } else {
        useTaskStore.getState().setTasks(previousTasks);
        addToast({
          title: "Delete Failed",
          description: res.error || "Could not delete task.",
          variant: "danger",
        });
      }
    } catch (e: any) {
      useTaskStore.getState().setTasks(previousTasks);
      addToast({
        title: "Delete Failed",
        description: e?.message || "Network error",
        variant: "danger",
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-mono font-bold text-primary">
            {project?.name || "Synplan Task"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onClose();
                onEdit(task);
              }}
              className="h-8 gap-1.5 text-xs"
            >
              <Edit2 className="h-3.5 w-3.5" />
              <span>Edit</span>
            </Button>
            <button
              onClick={onClose}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-foreground leading-snug">
              {task.title}
            </h2>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {task.description || "No description provided for this task."}
            </p>
          </div>

          {/* Metadata Grid */}
          <div className="rounded-lg border border-border bg-surface-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-2">
                <Layers className="h-3.5 w-3.5" /> Status
              </span>
              <select
                value={task.status.toLowerCase()}
                onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
                className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground focus:outline-hidden"
              >
                <option value="backlog">Backlog</option>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="in_review">In Review</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-2">
                <Flag className="h-3.5 w-3.5" /> Priority
              </span>
              <span className="font-mono font-bold uppercase text-xs text-foreground">
                {task.priority}
              </span>
            </div>

            {task.phase && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5" /> Phase
                </span>
                <span className="font-medium text-xs text-foreground">
                  {task.phase.name}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" /> Due Date
              </span>
              <span className="font-mono text-xs text-foreground">
                {task.dueDate || "No deadline"}
              </span>
            </div>
          </div>

          {/* Subtasks */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                Subtasks Checklist
              </h3>
              <span className="text-xs font-mono text-muted-foreground">
                {task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length}
              </span>
            </div>

            <div className="space-y-2">
              {task.subtasks.map((sub) => (
                <label
                  key={sub.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card/60 p-3 text-xs cursor-pointer hover:bg-card transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={sub.completed}
                    onChange={() => toggleSubtask(sub.id)}
                    className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                  />
                  <span className={cn(sub.completed && "line-through text-muted-foreground")}>
                    {sub.title}
                  </span>
                </label>
              ))}
              {task.subtasks.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No subtasks defined.</p>
              )}
            </div>
          </div>

          {/* Dependencies (Phase 6D) */}
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-primary" />
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Dependencies
                </h3>
              </div>
              <span className="text-xs font-mono text-muted-foreground">
                {(dependencies.blockedBy?.length || 0) + (dependencies.blocking?.length || 0)}
              </span>
            </div>

            {isDepsLoading ? (
              <div className="space-y-1.5">
                <Skeleton className="h-7 w-full rounded" />
              </div>
            ) : (dependencies.blockedBy?.length === 0 && dependencies.blocking?.length === 0) ? (
              <p className="text-xs text-muted-foreground italic">No dependencies linked.</p>
            ) : (
              <div className="space-y-2">
                {dependencies.blockedBy?.map((dep: any) => (
                  <div
                    key={dep.id}
                    className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 p-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Ban className="h-3.5 w-3.5 text-destructive shrink-0" />
                      <div className="truncate">
                        <span className="text-[10px] text-destructive font-semibold uppercase block">Blocked by:</span>
                        <span className="font-medium text-foreground truncate block">{dep.blockingTask?.title || "Preceding Task"}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveDependency(dep.id)}
                      className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors text-[10px]"
                      title="Unlink dependency"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {dependencies.blocking?.map((dep: any) => (
                  <div
                    key={dep.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-card/60 p-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Link2 className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div className="truncate">
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase block">Blocks:</span>
                        <span className="font-medium text-foreground truncate block">{dep.blockedTask?.title || "Subsequent Task"}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveDependency(dep.id)}
                      className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors text-[10px]"
                      title="Unlink dependency"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comments & Discussion */}
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-primary" />
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Task Discussion
                </h3>
              </div>
              <span className="text-xs font-mono text-muted-foreground">
                {comments.length}
              </span>
            </div>

            {/* Comment List */}
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {isCommentsLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="rounded-lg border border-border/40 p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-3 w-20 rounded" />
                        <Skeleton className="h-2.5 w-14 rounded" />
                      </div>
                      <Skeleton className="h-3 w-full rounded" />
                    </div>
                  ))}
                </div>
              ) : comments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
                  No comments yet. Start the discussion for this task.
                </div>
              ) : (
                comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="group rounded-lg border border-border/70 bg-card p-2.5 space-y-1 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                          {comment.author?.name ? comment.author.name.charAt(0).toUpperCase() : "U"}
                        </div>
                        <span className="text-[11px] font-semibold text-foreground">
                          {comment.author?.name || "Team Member"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {comment.createdAt ? new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now"}
                        </span>
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          title="Delete comment"
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-0.5 rounded cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-foreground/90 pl-6.5 whitespace-pre-wrap">
                      {comment.content}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Add Comment Input */}
            <form onSubmit={handlePostComment} className="flex items-center gap-2 pt-1">
              <input
                type="text"
                placeholder="Write a comment or update..."
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!newCommentText.trim() || isPostingComment}
                className="h-8 gap-1 text-xs font-semibold shrink-0"
              >
                <Send className="h-3 w-3" />
                <span>Post</span>
              </Button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4 flex items-center justify-between bg-muted/10">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteTask}
            className="gap-1.5 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete Task</span>
          </Button>

          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
