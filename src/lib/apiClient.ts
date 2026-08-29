import { realtimeClient } from "@/lib/realtime";

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  evaluator?: any;
  meta?: any;
}

interface CacheEntry<T> {
  data: ApiResponse<T>;
  expiresAt: number;
}

// In-memory scoped cache and in-flight request tracker
const inFlightMap = new Map<string, Promise<ApiResponse<any>>>();
const memoryCache = new Map<string, CacheEntry<any>>();

const BASE_URL = "";

// Helper to invalidate cached endpoints by prefix or pattern
export function invalidateApiCache(prefix?: string) {
  if (!prefix) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.includes(prefix)) {
      memoryCache.delete(key);
    }
  }
}

async function request<T>(
  endpoint: string,
  options?: RequestInit,
  cacheConfig?: { ttlMs?: number; bypassCache?: boolean }
): Promise<ApiResponse<T>> {
  const method = (options?.method || "GET").toUpperCase();
  const isGet = method === "GET";

  try {
    const customHeaders: Record<string, string> = {};
    let activeWsId = "";

    if (typeof window !== "undefined") {
      const storedWs = localStorage.getItem("synplan_active_ws");
      if (storedWs) {
        try {
          const parsed = JSON.parse(storedWs);
          if (parsed?.id && typeof parsed.id === "string") {
            activeWsId = parsed.id;
            customHeaders["x-synplan-workspace-id"] = parsed.id;
          }
        } catch (e) {
          // ignore
        }
      }
    }

    const cacheKey = `${activeWsId}:${endpoint}`;

    // 1. Check TTL Memory Cache for GET requests
    if (isGet && !cacheConfig?.bypassCache && cacheConfig?.ttlMs && cacheConfig.ttlMs > 0) {
      const cached = memoryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
    }

    // 2. In-Flight Request Deduplication for concurrent GETs
    if (isGet && inFlightMap.has(cacheKey)) {
      return inFlightMap.get(cacheKey)!;
    }

    const fetchPromise = (async () => {
      const res = await fetch(`${BASE_URL}${endpoint}`, {
        headers: {
          "Content-Type": "application/json",
          ...customHeaders,
          ...options?.headers,
        },
        ...options,
      });

      const json = await res.json();

      // Store in memory cache if successful and TTL configured
      if (isGet && json.success && cacheConfig?.ttlMs && cacheConfig.ttlMs > 0) {
        memoryCache.set(cacheKey, {
          data: json,
          expiresAt: Date.now() + cacheConfig.ttlMs,
        });
      }

      return json;
    })().finally(() => {
      inFlightMap.delete(cacheKey);
    });

    if (isGet) {
      inFlightMap.set(cacheKey, fetchPromise);
    }

    return await fetchPromise;
  } catch (error: any) {
    console.error(`API Error on ${endpoint}:`, error);
    return {
      success: false,
      error: error?.message || "Network request failed",
    };
  }
}

export const apiClient = {
  // Cache Management
  clearCache: () => invalidateApiCache(),
  invalidate: (prefix: string) => invalidateApiCache(prefix),

  // Workspaces
  async getWorkspaces(options?: { bypassCache?: boolean }) {
    return request<any[]>("/api/workspaces", undefined, { ttlMs: 10000, bypassCache: options?.bypassCache });
  },
  async createWorkspace(data: { name: string; slug?: string; ownerId?: string }) {
    const res = await request<any>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify(data),
    });
    invalidateApiCache("/api/workspaces");
    return res;
  },
  async updateWorkspaceSettings(data: { workspaceId?: string; name?: string; slug?: string; logoUrl?: string }) {
    const res = await request<any>("/api/workspaces/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    });
    invalidateApiCache("/api/workspaces");
    return res;
  },

  // Dashboard
  async getDashboardSummary(workspaceId?: string, options?: { bypassCache?: boolean }) {
    const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
    return request<any>(`/api/dashboard/summary${query}`, undefined, { ttlMs: 5000, bypassCache: options?.bypassCache });
  },

  // Projects
  async getProjects(params?: { workspaceId?: string; status?: string }, options?: { bypassCache?: boolean }) {
    const search = new URLSearchParams();
    if (params?.workspaceId) search.set("workspaceId", params.workspaceId);
    if (params?.status) search.set("status", params.status);
    const qs = search.toString() ? `?${search.toString()}` : "";
    return request<any[]>(`/api/projects${qs}`, undefined, { ttlMs: 4000, bypassCache: options?.bypassCache });
  },
  async getProject(id: string) {
    return request<any>(`/api/projects/${id}`);
  },
  async createProject(data: any) {
    const res = await request<any>("/api/projects", {
      method: "POST",
      body: JSON.stringify(data),
    });
    invalidateApiCache("/api/projects");
    invalidateApiCache("/api/dashboard/summary");

    if (res.success && res.data) {
      const wsId = res.data.workspaceId;
      if (wsId) {
        realtimeClient.broadcast(`workspace:${wsId}`, "PROJECT_CREATED", res.data, {
          workspaceId: wsId,
          projectId: res.data.id,
        });
        realtimeClient.broadcast(`workspace:${wsId}`, "ACTIVITY_CREATED", {
          id: `act_${Date.now()}_${res.data.id}`,
          actor: { name: "Squad Member", initial: "S" },
          action: "created project",
          target: res.data.name,
          timestamp: "Just now",
          entityType: "PROJECT",
          entityId: res.data.id,
          link: `/projects/${res.data.id}`,
        }, {
          workspaceId: wsId,
          projectId: res.data.id,
        });
      }
    }
    return res;
  },
  async updateProject(id: string, data: any) {
    const res = await request<any>(`/api/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    invalidateApiCache("/api/projects");
    invalidateApiCache("/api/dashboard/summary");

    if (res.success && res.data) {
      const wsId = res.data.workspaceId;
      if (wsId) {
        realtimeClient.broadcast(`workspace:${wsId}`, "PROJECT_UPDATED", res.data, {
          workspaceId: wsId,
          projectId: res.data.id,
        });
      }
    }
    return res;
  },
  async deleteProject(id: string, metadata?: { workspaceId?: string }) {
    const res = await request<any>(`/api/projects/${id}`, {
      method: "DELETE",
    });
    invalidateApiCache("/api/projects");
    invalidateApiCache("/api/dashboard/summary");

    if (res.success && metadata?.workspaceId) {
      realtimeClient.broadcast(
        `workspace:${metadata.workspaceId}`,
        "PROJECT_DELETED",
        { id },
        {
          workspaceId: metadata.workspaceId,
          projectId: id,
        }
      );
    }
    return res;
  },

  // Tasks
  async getTasks(params?: { workspaceId?: string; projectId?: string; status?: string; priority?: string }, options?: { bypassCache?: boolean }) {
    const search = new URLSearchParams();
    if (params?.workspaceId) search.set("workspaceId", params.workspaceId);
    if (params?.projectId) search.set("projectId", params.projectId);
    if (params?.status) search.set("status", params.status);
    if (params?.priority) search.set("priority", params.priority);
    const qs = search.toString() ? `?${search.toString()}` : "";
    return request<any[]>(`/api/tasks${qs}`, undefined, { ttlMs: 3000, bypassCache: options?.bypassCache });
  },
  async getTask(id: string) {
    return request<any>(`/api/tasks/${id}`);
  },
  async createTask(data: any) {
    const res = await request<any>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(data),
    });
    invalidateApiCache("/api/tasks");
    invalidateApiCache("/api/dashboard/summary");
    invalidateApiCache("/api/projects");

    if (res.success && res.data) {
      const wsId = res.data.workspaceId;
      if (wsId) {
        realtimeClient.broadcast(`workspace:${wsId}`, "TASK_CREATED", res.data, {
          workspaceId: wsId,
          projectId: res.data.projectId,
          taskId: res.data.id,
        });
        realtimeClient.broadcast(`workspace:${wsId}`, "ACTIVITY_CREATED", {
          id: `act_${Date.now()}_${res.data.id}`,
          actor: { name: "Squad Member", initial: "S" },
          action: "created task",
          target: res.data.title,
          timestamp: "Just now",
          entityType: "TASK",
          entityId: res.data.id,
          link: `/tasks?taskId=${res.data.id}`,
        }, {
          workspaceId: wsId,
          projectId: res.data.projectId,
          taskId: res.data.id,
        });
      }
    }
    return res;
  },
  async updateTaskStatus(taskId: string, status: string, actorId?: string) {
    const res = await request<any>("/api/tasks/status", {
      method: "PATCH",
      body: JSON.stringify({ taskId, status, actorId }),
    });
    invalidateApiCache("/api/tasks");
    invalidateApiCache("/api/dashboard/summary");
    invalidateApiCache("/api/projects");

    if (res.success && res.data) {
      const wsId = res.data.workspaceId;
      if (wsId) {
        realtimeClient.broadcast(
          `workspace:${wsId}`,
          "TASK_STATUS_CHANGED",
          {
            taskId: res.data.id,
            previousStatus: res.evaluator?.previousStatus || "",
            newStatus: res.data.status,
            projectId: res.data.projectId,
            completedAt: res.data.completedAt,
            evaluator: res.evaluator,
          },
          {
            workspaceId: wsId,
            projectId: res.data.projectId,
            taskId: res.data.id,
          }
        );
        realtimeClient.broadcast(`workspace:${wsId}`, "ACTIVITY_CREATED", {
          id: `act_${Date.now()}_${res.data.id}`,
          actor: { name: "Squad Member", initial: "S" },
          action: `moved status to ${res.data.status?.toLowerCase().replace(/_/g, " ")}`,
          target: res.data.title || "Task milestone",
          timestamp: "Just now",
          entityType: "TASK",
          entityId: res.data.id,
          link: `/tasks?taskId=${res.data.id}`,
        }, {
          workspaceId: wsId,
          projectId: res.data.projectId,
          taskId: res.data.id,
        });
      }
    }
    return res;
  },
  async updateTask(id: string, data: any) {
    const res = await request<any>(`/api/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    invalidateApiCache("/api/tasks");
    invalidateApiCache("/api/dashboard/summary");
    invalidateApiCache("/api/projects");

    if (res.success && res.data) {
      const wsId = res.data.workspaceId;
      if (wsId) {
        realtimeClient.broadcast(`workspace:${wsId}`, "TASK_UPDATED", res.data, {
          workspaceId: wsId,
          projectId: res.data.projectId,
          taskId: res.data.id,
        });
      }
    }
    return res;
  },
  async deleteTask(id: string, metadata?: { workspaceId?: string; projectId?: string }) {
    const res = await request<any>(`/api/tasks/${id}`, {
      method: "DELETE",
    });
    invalidateApiCache("/api/tasks");
    invalidateApiCache("/api/dashboard/summary");
    invalidateApiCache("/api/projects");

    const wsId = metadata?.workspaceId || res.data?.workspaceId;
    if (res.success) {
      if (wsId) {
        realtimeClient.broadcast(
          `workspace:${wsId}`,
          "TASK_DELETED",
          { id, projectId: metadata?.projectId || res.data?.projectId },
          {
            workspaceId: wsId,
            projectId: metadata?.projectId || res.data?.projectId,
            taskId: id,
          }
        );
      } else {
        realtimeClient.broadcast(
          "*",
          "TASK_DELETED",
          { id, projectId: metadata?.projectId },
          {
            projectId: metadata?.projectId,
            taskId: id,
          }
        );
      }
    }
    return res;
  },

  // Calendar
  async getCalendarEvents(params?: { workspaceId?: string; projectId?: string; startDate?: string; endDate?: string }, options?: { bypassCache?: boolean }) {
    const search = new URLSearchParams();
    if (params?.workspaceId) search.set("workspaceId", params.workspaceId);
    if (params?.projectId) search.set("projectId", params.projectId);
    if (params?.startDate) search.set("startDate", params.startDate);
    if (params?.endDate) search.set("endDate", params.endDate);
    const qs = search.toString() ? `?${search.toString()}` : "";
    return request<any[]>(`/api/calendar/events${qs}`, undefined, { ttlMs: 5000, bypassCache: options?.bypassCache });
  },

  // Team
  async getTeamMembers(workspaceId?: string, options?: { bypassCache?: boolean }) {
    const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
    return request<any[]>(`/api/team/members${query}`, undefined, { ttlMs: 5000, bypassCache: options?.bypassCache });
  },
  async inviteTeamMember(data: { workspaceId?: string; name: string; email: string; role?: string }) {
    const res = await request<any>("/api/team/members", {
      method: "POST",
      body: JSON.stringify(data),
    });
    invalidateApiCache("/api/team/members");
    invalidateApiCache("/api/dashboard/summary");
    return res;
  },
  async updateMemberRole(memberId: string, role: string) {
    const res = await request<any>("/api/team/members", {
      method: "PUT",
      body: JSON.stringify({ memberId, role }),
    });
    invalidateApiCache("/api/team/members");
    return res;
  },
  async removeMember(memberId: string) {
    const res = await request<any>(`/api/team/members?memberId=${encodeURIComponent(memberId)}`, {
      method: "DELETE",
    });
    invalidateApiCache("/api/team/members");
    invalidateApiCache("/api/dashboard/summary");
    return res;
  },

  // Notifications
  async getNotifications(params?: { filter?: "all" | "unread" | "read"; limit?: number }) {
    const q = new URLSearchParams();
    if (params?.filter) q.append("filter", params.filter);
    if (params?.limit) q.append("limit", params.limit.toString());
    const query = q.toString() ? `?${q.toString()}` : "";
    return request<any>(`/api/notifications${query}`);
  },
  async markNotificationsAsRead(params: { id?: string; markAll?: boolean }) {
    const res = await request<any>("/api/notifications", {
      method: "PATCH",
      body: JSON.stringify(params),
    });
    invalidateApiCache("/api/notifications");
    return res;
  },

  // Phases
  async getPhases(projectId: string, workspaceId?: string) {
    const wsQuery = workspaceId ? `&workspaceId=${encodeURIComponent(workspaceId)}` : "";
    return request<any[]>(`/api/phases?projectId=${encodeURIComponent(projectId)}${wsQuery}`);
  },
  async createPhase(data: { projectId: string; name: string; description?: string; order?: number; workspaceId?: string }) {
    const res = await request<any>("/api/phases", {
      method: "POST",
      body: JSON.stringify(data),
    });
    invalidateApiCache(`/api/projects/${data.projectId}`);

    if (res.success && res.data) {
      realtimeClient.broadcast(`project:${data.projectId}`, "PHASE_CREATED", res.data, {
        projectId: data.projectId,
        workspaceId: data.workspaceId,
      });
      if (data.workspaceId) {
        realtimeClient.broadcast(`workspace:${data.workspaceId}`, "PHASE_CREATED", res.data, {
          projectId: data.projectId,
          workspaceId: data.workspaceId,
        });
      }
    }
    return res;
  },
  async updatePhase(id: string, data: { name?: string; description?: string; order?: number; workspaceId?: string; projectId?: string }) {
    const res = await request<any>(`/api/phases/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    invalidateApiCache("/api/projects");

    if (res.success && res.data) {
      const projId = data.projectId || res.data.projectId;
      if (projId) {
        realtimeClient.broadcast(`project:${projId}`, "PHASE_UPDATED", res.data, {
          projectId: projId,
          workspaceId: data.workspaceId,
        });
      }
      if (data.workspaceId) {
        realtimeClient.broadcast(`workspace:${data.workspaceId}`, "PHASE_UPDATED", res.data, {
          projectId: projId,
          workspaceId: data.workspaceId,
        });
      }
    }
    return res;
  },
  async deletePhase(id: string, metadata?: { projectId?: string; workspaceId?: string }) {
    const res = await request<any>(`/api/phases/${id}`, {
      method: "DELETE",
    });
    invalidateApiCache("/api/projects");

    if (res.success) {
      if (metadata?.projectId) {
        realtimeClient.broadcast(
          `project:${metadata.projectId}`,
          "PHASE_DELETED",
          { id, projectId: metadata.projectId },
          {
            projectId: metadata.projectId,
            workspaceId: metadata.workspaceId,
          }
        );
      }
      if (metadata?.workspaceId) {
        realtimeClient.broadcast(
          `workspace:${metadata.workspaceId}`,
          "PHASE_DELETED",
          { id, projectId: metadata?.projectId || "" },
          {
            projectId: metadata?.projectId,
            workspaceId: metadata.workspaceId,
          }
        );
      }
    }
    return res;
  },
  async reorderPhases(data: { projectId: string; phaseOrders: { id: string; order: number }[]; workspaceId?: string }) {
    const res = await request<any>("/api/phases/reorder", {
      method: "POST",
      body: JSON.stringify(data),
    });
    invalidateApiCache(`/api/projects/${data.projectId}`);

    if (res.success) {
      const payload = { projectId: data.projectId, phases: data.phaseOrders };
      realtimeClient.broadcast(`project:${data.projectId}`, "PHASES_REORDERED", payload, {
        projectId: data.projectId,
        workspaceId: data.workspaceId,
      });
      if (data.workspaceId) {
        realtimeClient.broadcast(`workspace:${data.workspaceId}`, "PHASES_REORDERED", payload, {
          projectId: data.projectId,
          workspaceId: data.workspaceId,
        });
      }
    }
    return res;
  },

  // Task Comments
  async getTaskComments(taskId: string) {
    return request<any[]>(`/api/tasks/${encodeURIComponent(taskId)}/comments`);
  },
  async addTaskComment(taskId: string, content: string) {
    const res = await request<any>(`/api/tasks/${encodeURIComponent(taskId)}/comments`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    invalidateApiCache("/api/dashboard/summary");
    return res;
  },
  async deleteTaskComment(commentId: string) {
    return request<any>(`/api/tasks/comments/${encodeURIComponent(commentId)}`, {
      method: "DELETE",
    });
  },

  // Global Search
  async globalSearch(query: string, workspaceId?: string) {
    const wsQuery = workspaceId ? `&workspaceId=${encodeURIComponent(workspaceId)}` : "";
    return request<{ projects: any[]; tasks: any[]; members: any[] }>(
      `/api/search?q=${encodeURIComponent(query)}${wsQuery}`
    );
  },

  // Analytics & Reports
  async getAnalyticsReports(workspaceId?: string, options?: { bypassCache?: boolean }) {
    const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
    return request<any>(`/api/analytics/reports${query}`, undefined, { ttlMs: 5000, bypassCache: options?.bypassCache });
  },
  async getAnalyticsPulse(workspaceId?: string, options?: { bypassCache?: boolean }) {
    const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
    return request<any>(`/api/analytics/pulse${query}`, undefined, { ttlMs: 5000, bypassCache: options?.bypassCache });
  },

  // AI Assistant (Phase 14 & AI Reliability Architecture)
  async generateAiPlan(params: {
    prompt: string;
    mode?: "STRICT" | "SMART";
    currentProjectId?: string;
    currentTaskId?: string;
    activePath?: string;
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
    pendingClarification?: any;
  }) {
    return request<any>("/api/ai/plan", {
      method: "POST",
      body: JSON.stringify(params),
    });
  },
  async executeAiPlan(params: { plan: any; confirmed?: boolean; idempotencyKey?: string }) {
    const res = await request<any>("/api/ai/execute", {
      method: "POST",
      body: JSON.stringify(params),
    });
    // Invalidate dashboard and entities cache
    invalidateApiCache("/api/dashboard/summary");
    invalidateApiCache("/api/projects");
    invalidateApiCache("/api/tasks");
    return res;
  },
  async getAiExecutionHistory() {
    return request<any[]>("/api/ai/history", undefined, { bypassCache: true });
  },
  async getSession() {
    return request<{
      authenticated: boolean;
      user: { id: string; name: string; email: string; avatarUrl: string | null; role: string };
      workspaces: Array<{ id: string; name: string; slug: string; logoUrl: string | null; role: string }>;
    }>("/api/auth/session", undefined, { bypassCache: true });
  },
  async logout() {
    const res = await request<{ success: boolean; message: string }>("/api/auth/logout", {
      method: "POST",
    });
    memoryCache.clear();
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("synplan_active_ws");
      } catch (e) {}
    }
    return res;
  },
};
