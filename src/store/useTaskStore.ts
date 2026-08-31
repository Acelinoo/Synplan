import { create } from "zustand";
import { Task, TaskStatus, TaskPriority } from "@/types";

interface TaskFilterState {
  searchQuery: string;
  statusFilter: TaskStatus | "all";
  priorityFilter: TaskPriority | "all";
  assigneeFilter: string | "all";
}

interface TaskState {
  tasks: Task[];
  selectedTaskId: string | null;
  filters: TaskFilterState;
  recentCompletedTaskId: string | null; // For micro-feedback animation trigger
  isLoading: boolean;
  error: string | null;

  // Actions
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  moveTaskStatus: (taskId: string, newStatus: TaskStatus, completedAt?: string) => void;
  setSelectedTaskId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (status: TaskStatus | "all") => void;
  setPriorityFilter: (priority: TaskPriority | "all") => void;
  setAssigneeFilter: (assigneeId: string | "all") => void;
  resetFilters: () => void;
  clearRecentCompleted: () => void;
  applyBatchMutation: (batch: {
    tasksCreated?: Task[];
    tasksUpdated?: Array<Partial<Task> & { id: string }>;
    tasksDeleted?: string[];
  }) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

const defaultFilters: TaskFilterState = {
  searchQuery: "",
  statusFilter: "all",
  priorityFilter: "all",
  assigneeFilter: "all",
};

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  selectedTaskId: null,
  filters: defaultFilters,
  recentCompletedTaskId: null,
  isLoading: false,
  error: null,

  setTasks: (tasks) => set({ tasks }),
  addTask: (task) =>
    set((state) => {
      const exists = state.tasks.some((t) => t.id === task.id);
      if (exists) {
        return {
          tasks: state.tasks.map((t) => (t.id === task.id ? { ...t, ...task } : t)),
        };
      }
      return { tasks: [task, ...state.tasks] };
    }),
  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => {
        if (t.id !== id) return t;
        if (updates.updatedAt && t.updatedAt) {
          const incomingTime = new Date(updates.updatedAt).getTime();
          const existingTime = new Date(t.updatedAt).getTime();
          if (!isNaN(incomingTime) && !isNaN(existingTime) && incomingTime < existingTime) {
            return t;
          }
        }
        return { ...t, ...updates };
      }),
    })),
  deleteTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
    })),
  moveTaskStatus: (taskId: string, newStatus: TaskStatus, completedAt?: string) =>
    set((state) => {
      const isNowDone = newStatus === "done";
      return {
        tasks: state.tasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: newStatus,
                completedAt: completedAt || (isNowDone ? new Date().toISOString() : undefined),
                updatedAt: new Date().toISOString(),
              }
            : t
        ),
        recentCompletedTaskId: isNowDone ? taskId : state.recentCompletedTaskId,
      };
    }),
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),
  setSearchQuery: (query) =>
    set((state) => ({ filters: { ...state.filters, searchQuery: query } })),
  setStatusFilter: (status) =>
    set((state) => ({ filters: { ...state.filters, statusFilter: status } })),
  setPriorityFilter: (priority) =>
    set((state) => ({ filters: { ...state.filters, priorityFilter: priority } })),
  setAssigneeFilter: (assigneeId) =>
    set((state) => ({ filters: { ...state.filters, assigneeFilter: assigneeId } })),
  resetFilters: () => set({ filters: defaultFilters }),
  clearRecentCompleted: () => set({ recentCompletedTaskId: null }),
  applyBatchMutation: (batch) =>
    set((state) => {
      let nextTasks = [...state.tasks];

      // 1. Process deletions
      if (batch.tasksDeleted && batch.tasksDeleted.length > 0) {
        const delSet = new Set(batch.tasksDeleted);
        nextTasks = nextTasks.filter((t) => !delSet.has(t.id));
      }

      // 2. Process creations
      if (batch.tasksCreated && batch.tasksCreated.length > 0) {
        const existingIds = new Set(nextTasks.map((t) => t.id));
        const newTasks = batch.tasksCreated.filter((t) => !existingIds.has(t.id));
        nextTasks = [...newTasks, ...nextTasks];
      }

      // 3. Process updates
      if (batch.tasksUpdated && batch.tasksUpdated.length > 0) {
        const updateMap = new Map(batch.tasksUpdated.map((u) => [u.id, u]));
        nextTasks = nextTasks.map((t) => {
          const up = updateMap.get(t.id);
          if (!up) return t;
          if (up.updatedAt && t.updatedAt) {
            const incomingTime = new Date(up.updatedAt).getTime();
            const existingTime = new Date(t.updatedAt).getTime();
            if (!isNaN(incomingTime) && !isNaN(existingTime) && incomingTime < existingTime) {
              return t;
            }
          }
          return { ...t, ...up };
        });
      }

      return { tasks: nextTasks };
    }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
