"use client";

import * as React from "react";
import { X, CheckSquare, Plus, Trash2, Calendar, Flag, User, Layers } from "lucide-react";
import { useTaskStore, useWorkspaceStore, useUiStore } from "@/store";
import { Task, TaskStatus, TaskPriority, Subtask } from "@/types";
import { Button } from "@/components/ui/button";
import { MagnetButton } from "@/components/ui/magnet-button";
import { apiClient } from "@/lib/apiClient";
import { cn } from "@/lib/utils";

interface TaskModalProps {
  editingTask?: Task | null;
  defaultStatus?: TaskStatus;
  onClose?: () => void;
}

export function TaskModal({ editingTask, defaultStatus = "todo", onClose }: TaskModalProps) {
  const { isCreateTaskModalOpen, setCreateTaskModalOpen, addToast } = useUiStore();
  const { addTask, updateTask } = useTaskStore();
  const { projects, setProjects, activeWorkspace, members, setMembers } = useWorkspaceStore();

  const isOpen = editingTask ? true : isCreateTaskModalOpen;

  const [title, setTitle] = React.useState(editingTask?.title || "");
  const [description, setDescription] = React.useState(editingTask?.description || "");
  const [status, setStatus] = React.useState<TaskStatus>(editingTask?.status || defaultStatus);
  const [priority, setPriority] = React.useState<TaskPriority>(editingTask?.priority || "medium");
  const [projectId, setProjectId] = React.useState<string>(
    editingTask?.projectId || (projects[0]?.id || "")
  );
  const [assigneeId, setAssigneeId] = React.useState<string>(editingTask?.assigneeId || "");
  const [dueDate, setDueDate] = React.useState(editingTask?.dueDate || "2026-09-15");
  const [subtasks, setSubtasks] = React.useState<Subtask[]>(editingTask?.subtasks || []);
  const [newSubtaskTitle, setNewSubtaskTitle] = React.useState("");

  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const [phaseId, setPhaseId] = React.useState<string>(editingTask?.phaseId || "");
  const [projectPhases, setProjectPhases] = React.useState<any[]>([]);

  // Fetch project details with phases when projectId changes
  React.useEffect(() => {
    async function loadPhases() {
      if (!projectId) {
        setProjectPhases([]);
        return;
      }
      try {
        const res = await apiClient.getProject(projectId);
        if (res.success && res.data && Array.isArray(res.data.phases)) {
          setProjectPhases(res.data.phases);
          if (!editingTask && res.data.phases.length > 0) {
            setPhaseId(res.data.phases[0].id);
          }
        } else {
          setProjectPhases([]);
        }
      } catch (e) {
        setProjectPhases([]);
      }
    }
    loadPhases();
  }, [projectId, editingTask]);

  // Fetch projects if empty
  React.useEffect(() => {
    async function fetchProjectsIfEmpty() {
      if (isOpen && projects.length === 0 && activeWorkspace?.id) {
        try {
          const res = await apiClient.getProjects({ workspaceId: activeWorkspace.id });
          if (res.success && Array.isArray(res.data) && res.data.length > 0) {
            setProjects(res.data);
            if (!projectId) {
              setProjectId(res.data[0].id);
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }
    fetchProjectsIfEmpty();
  }, [isOpen, projects.length, activeWorkspace?.id, projectId, setProjects]);

  // Fetch team members if empty
  React.useEffect(() => {
    async function loadSquadMembers() {
      if (isOpen && (!members || members.length === 0)) {
        try {
          const res = await apiClient.getTeamMembers();
          if (res.success && Array.isArray(res.data) && res.data.length > 0) {
            const mapped = res.data.map((m: any) => ({
              id: m.id,
              workspaceId: m.workspaceId,
              user: {
                id: m.userId,
                name: m.name,
                email: m.email,
                role: m.role?.toLowerCase() || "member",
              },
              role: m.role?.toLowerCase() || "member",
              joinedAt: m.joinedAt,
              assignedTasksCount: m.activeTaskCount || 0,
              workloadScore: m.workloadScore || 0,
            }));
            setMembers(mapped);
          }
        } catch (e) {
          // ignore
        }
      }
    }
    loadSquadMembers();
  }, [isOpen, members, setMembers]);

  const squadList = React.useMemo(() => {
    if (members && members.length > 0) {
      return members.map((m) => ({
        id: m.user?.id || m.id,
        name: m.user?.name || m.user?.email || "Member",
        initial: (m.user?.name || "M").charAt(0).toUpperCase(),
      }));
    }
    return [];
  }, [members]);

  React.useEffect(() => {
    if (!isOpen) return;

    if (editingTask) {
      setTitle(editingTask.title || "");
      setDescription(editingTask.description || "");
      setStatus(editingTask.status === "done" ? "done" : editingTask.status === "in_review" ? "in_review" : editingTask.status === "in_progress" ? "in_progress" : "todo");
      setPriority(editingTask.priority);
      setProjectId(editingTask.projectId);
      setPhaseId(editingTask.phaseId || "");
      setAssigneeId(editingTask.assigneeId || squadList[0]?.id || "");
      setDueDate(editingTask.dueDate ? editingTask.dueDate.split("T")[0] : "2026-09-15");
      setSubtasks(Array.isArray(editingTask.subtasks) ? editingTask.subtasks : []);
    } else {
      setTitle("");
      setDescription("");
      setStatus(defaultStatus === "done" ? "done" : defaultStatus === "in_review" ? "in_review" : defaultStatus === "in_progress" ? "in_progress" : "todo");
      setPriority("medium");
      if (projects.length > 0 && (!projectId || projectId === "prj-1")) {
        setProjectId(projects[0].id);
      }
      setAssigneeId(squadList[0]?.id || "");
      setDueDate("2026-09-15");
      setSubtasks([]);
      setNewSubtaskTitle("");
    }
  }, [isOpen, editingTask, defaultStatus, projects, squadList, projectId]);

  if (!isOpen) return null;

  const handleClose = () => {
    setCreateTaskModalOpen(false);
    if (onClose) {
      onClose();
    }
  };

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    const newSub: Subtask = {
      id: `sub-${Date.now()}`,
      taskId: editingTask?.id || "temp",
      title: newSubtaskTitle.trim(),
      completed: false,
    };
    setSubtasks([...subtasks, newSub]);
    setNewSubtaskTitle("");
  };

  const toggleSubtask = (id: string) => {
    setSubtasks(subtasks.map((s) => (s.id === id ? { ...s, completed: !s.completed } : s)));
  };

  const removeSubtask = (id: string) => {
    setSubtasks(subtasks.filter((s) => s.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) {
        if (!title.trim()) {
            addToast({
              title: "Validation Error",
              description: "Task title cannot be empty.",
              variant: "danger",
            });
        }
        return;
    }

    setIsSubmitting(true);
    try {
      if (editingTask) {
        const res = await apiClient.updateTask(editingTask.id, {
          title: title.trim(),
          description: description.trim(),
          status: status.toUpperCase(),
          priority: priority.toUpperCase(),
          projectId,
          phaseId: phaseId || null,
          assigneeId,
          dueDate: new Date(dueDate).toISOString(),
          subtasks,
        });

        if (res.success) {
          updateTask(editingTask.id, {
            title: title.trim(),
            description: description.trim(),
            status,
            priority,
            projectId,
            phaseId: phaseId || null,
            assigneeId,
            dueDate,
            subtasks,
            updatedAt: new Date().toISOString(),
          });

          addToast({
            title: "Task Updated",
            description: `Task "${title}" saved successfully.`,
            variant: "success",
          });
          handleClose();
        } else {
          addToast({
            title: "Update Failed",
            description: res.error || "Failed to update task.",
            variant: "danger",
          });
        }
      } else {
        const res = await apiClient.createTask({
          title: title.trim(),
          description: description.trim(),
          status: status.toUpperCase(),
          priority: priority.toUpperCase(),
          projectId,
          phaseId: phaseId || undefined,
          assigneeId,
          dueDate: new Date(dueDate).toISOString(),
          workspaceId: activeWorkspace?.id,
          subtasks,
        });

        if (res.success && res.data) {
          const created = res.data;
          const newTask: Task = {
            id: created.id,
            workspaceId: created.workspaceId || activeWorkspace?.id || "",
            projectId: created.projectId || projectId,
            phaseId: created.phaseId || phaseId || null,
            phase: created.phase || null,
            title: created.title || title,
            description: created.description || description,
            status: (created.status?.toLowerCase() || status) as TaskStatus,
            priority: (created.priority?.toLowerCase() || priority) as TaskPriority,
            assigneeId: created.assigneeId || assigneeId,
            dueDate: created.dueDate ? created.dueDate.split("T")[0] : dueDate,
            order: 0,
            subtasks: Array.isArray(created.subtasks) ? created.subtasks : subtasks,
            tags: created.tags || [],
            createdAt: created.createdAt || new Date().toISOString(),
            updatedAt: created.updatedAt || new Date().toISOString(),
          };
          addTask(newTask);

          addToast({
            title: "Task Created",
            description: `Task "${title}" added to ${status.toUpperCase()} lane.`,
            variant: "success",
          });
          handleClose();
        } else {
          addToast({
            title: "Creation Failed",
            description: res.error || "Failed to create task.",
            variant: "danger",
          });
        }
      }
    } catch (err: any) {
      addToast({
        title: "Operation Failed",
        description: err?.message || "An unexpected error occurred.",
        variant: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="fixed inset-0" onClick={handleClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden z-10">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CheckSquare className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                {editingTask ? "Edit Delivery Task" : "Create New Task"}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Synchronized with PostgreSQL Supabase backend
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Task Title <span className="text-destructive">*</span></label>
            <input
              type="text"
              required
              placeholder="e.g. Implement Webhook Dispatcher"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>

          {/* Project & Phase */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Project</label>
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setPhaseId("");
                }}
                className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                {projects.length === 0 && (
                  <option value="">No projects available</option>
                )}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Phase</label>
              <select
                value={phaseId}
                onChange={(e) => setPhaseId(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
              >
                <option value="">No Phase</option>
                {projectPhases.map((ph) => (
                  <option key={ph.id} value={ph.id}>
                    Phase 0{ph.order}: {ph.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Assignee & Due Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Assignee</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
              >
                <option value="">Unassigned</option>
                {squadList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
              />
            </div>
          </div>

          {/* Status & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Status Column</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="in_review">In Review</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-xs text-foreground focus:border-primary focus:outline-hidden"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Description</label>
            <textarea
              rows={2}
              placeholder="Task acceptance criteria and context..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>

          {/* Subtasks Checklist */}
          <div className="space-y-2 pt-2 border-t border-border/70">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">Subtask Checklist</label>
              <span className="text-[10px] font-mono text-muted-foreground">
                {subtasks.filter((s) => s.completed).length}/{subtasks.length} Done
              </span>
            </div>

            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {subtasks.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card/60 p-2 text-xs"
                >
                  <label className="flex items-center gap-2 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sub.completed}
                      onChange={() => toggleSubtask(sub.id)}
                      className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                    />
                    <span className={cn(sub.completed && "line-through text-muted-foreground")}>
                      {sub.title}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeSubtask(sub.id)}
                    className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add Subtask Input */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                placeholder="Add new subtask item..."
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddSubtask(e);
                  }
                }}
                className="flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary transition-colors"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddSubtask}
                className="h-8 gap-1 text-xs"
              >
                <Plus className="h-3 w-3" />
                <span>Add</span>
              </Button>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={handleClose}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="text-xs font-semibold min-w-[100px]"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Saving...
                </span>
              ) : editingTask ? (
                "Save Changes"
              ) : (
                "Create Task"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
