"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  FolderKanban,
  Plus,
  Search,
  LayoutGrid,
  List,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  Calendar,
  CheckSquare,
  ArrowRight,
  ExternalLink,
  Edit2,
  X,
  Layers,
} from "lucide-react";
import { useWorkspaceStore, useUiStore } from "@/store";
import { Project, ProjectStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectStatusBadge } from "@/components/ui";
import ProjectsLoading from "./loading";
import { apiClient } from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { useRealtime } from "@/components/realtime/RealtimeProvider";
import { hasPermission } from "@/lib/permissions";

const ProjectModal = dynamic(
  () => import("@/components/projects/ProjectModal").then((mod) => mod.ProjectModal),
  { ssr: false }
);

const STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "planning", label: "Planning" },
  { id: "active", label: "Active" },
  { id: "on_hold", label: "On Hold" },
  { id: "completed", label: "Completed" },
  { id: "archived", label: "Archived" },
];

const SORT_OPTIONS = [
  { id: "updated", label: "Recently Updated" },
  { id: "created", label: "Recently Created" },
  { id: "name", label: "Name (A-Z)" },
  { id: "deadline", label: "Target Deadline" },
];

function ProjectsDirectoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlSearch = searchParams.get("search") || "";
  const urlStatus = searchParams.get("status") || "all";
  const urlSort = searchParams.get("sort") || "updated";
  const urlView = (searchParams.get("view") as "grid" | "list") || "grid";
  const urlCreate = searchParams.get("create");

  const {
    projects,
    setProjects,
    addProject,
    updateProject,
    deleteProject,
    applyBatchMutation,
    activeWorkspace,
  } = useWorkspaceStore();
  const { setCreateProjectModalOpen } = useUiStore();
  const { onEvent, onReconnect } = useRealtime();

  // Directory State
  const [isLoading, setIsLoading] = React.useState(projects.length === 0);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [searchQuery, setSearchQuery] = React.useState(urlSearch);
  const [statusFilter, setStatusFilter] = React.useState<string>(urlStatus);
  const [sortOption, setSortOption] = React.useState<string>(urlSort);
  const [viewMode, setViewMode] = React.useState<"grid" | "list">(urlView);
  const [editingProject, setEditingProject] = React.useState<Project | null>(null);

  // Permission Check for Project Creation
  const canCreateProject = hasPermission(activeWorkspace?.role, "projects.create");

  // Load Authoritative Workspace Projects
  const loadProjects = React.useCallback(
    async (bypassCache = false) => {
      const activeWsId = activeWorkspace?.id;
      if (!activeWsId) return;

      try {
        setError(null);
        const res = await apiClient.getProjects(
          {
            workspaceId: activeWsId,
            sort: sortOption,
          },
          { bypassCache }
        );

        if (useWorkspaceStore.getState().activeWorkspace?.id !== activeWsId) {
          return;
        }

        if (res.success && Array.isArray(res.data)) {
          setProjects(res.data);
        } else {
          setError(res.error || "Failed to load projects");
        }
      } catch (err: any) {
        console.warn("Failed to load projects from API:", err);
        setError(err?.message || "Failed to retrieve projects");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [activeWorkspace?.id, sortOption, setProjects]
  );

  React.useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Realtime Subscriptions
  React.useEffect(() => {
    const unsubCreate = onEvent("PROJECT_CREATED", (event) => {
      const raw = event.payload;
      if (raw && raw.id) {
        addProject(raw);
        apiClient.invalidate("/api/projects");
      }
    });

    const unsubUpdate = onEvent("PROJECT_UPDATED", (event) => {
      const raw = event.payload;
      if (raw && raw.id) {
        updateProject(raw.id, raw);
        apiClient.invalidate("/api/projects");
      }
    });

    const unsubDelete = onEvent("PROJECT_DELETED", (event) => {
      const raw = event.payload;
      if (raw && raw.id) {
        deleteProject(raw.id);
        apiClient.invalidate("/api/projects");
      }
    });

    const unsubBatch = onEvent("BATCH_MUTATION", (event) => {
      const raw = event.payload;
      if (raw && raw.projectsUpdated) {
        applyBatchMutation({ projectsUpdated: raw.projectsUpdated });
        apiClient.invalidate("/api/projects");
      }
    });

    return () => {
      unsubCreate();
      unsubUpdate();
      unsubDelete();
      unsubBatch();
    };
  }, [onEvent, addProject, updateProject, deleteProject, applyBatchMutation]);

  // Realtime reconnect catch-up resync
  React.useEffect(() => {
    const unsub = onReconnect(() => {
      apiClient.invalidate("/api/projects");
      loadProjects(true);
    });
    return unsub;
  }, [onReconnect, loadProjects]);

  // Deep-link trigger for Create Project
  React.useEffect(() => {
    if (urlCreate === "true" && canCreateProject) {
      setEditingProject(null);
      setCreateProjectModalOpen(true);
    }
  }, [urlCreate, canCreateProject, setCreateProjectModalOpen]);

  // Refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadProjects(true);
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setSortOption("updated");
  };

  // Filtered & Sorted Projects
  const filteredProjects = React.useMemo(() => {
    return projects
      .filter((p) => {
        // Search Filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = (p.name || "").toLowerCase().includes(q);
          const matchDesc = (p.description || "").toLowerCase().includes(q);
          if (!matchName && !matchDesc) return false;
        }

        // Status Filter
        if (statusFilter !== "all") {
          const pStatus = (p.status || "").toLowerCase();
          if (pStatus !== statusFilter.toLowerCase()) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortOption === "name") {
          return (a.name || "").localeCompare(b.name || "");
        } else if (sortOption === "deadline") {
          const dA = a.deadline ? new Date(a.deadline).getTime() : Infinity;
          const dB = b.deadline ? new Date(b.deadline).getTime() : Infinity;
          return dA - dB;
        } else if (sortOption === "created") {
          const cA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const cB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return cB - cA;
        } else {
          // Default: "updated"
          const uA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const uB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return uB - uA;
        }
      });
  }, [projects, searchQuery, statusFilter, sortOption]);

  // Status Counts for Tab Badges
  const statusCounts = React.useMemo(() => {
    const counts: Record<string, number> = { all: projects.length };
    for (const p of projects) {
      const st = (p.status || "active").toLowerCase();
      counts[st] = (counts[st] || 0) + 1;
    }
    return counts;
  }, [projects]);

  const isFiltered = Boolean(searchQuery.trim()) || statusFilter !== "all" || sortOption !== "updated";

  if (isLoading && projects.length === 0) {
    return <ProjectsLoading />;
  }

  return (
    <div className="relative flex flex-col gap-6">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-mono">
              Projects
            </h1>
            <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-mono font-bold text-primary">
              Workspace
            </span>
            <span className="rounded-full bg-card border border-border px-2 py-0.5 text-[10px] font-mono font-bold text-muted-foreground">
              {isFiltered ? `${filteredProjects.length} of ${projects.length}` : `${projects.length} Total`}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Workspace-level project discovery, milestone timelines, squad allocations, and delivery velocity.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-8 gap-1.5 text-xs border-border hover:bg-card cursor-pointer"
            title="Synchronize project directory"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin text-primary")} />
            <span>Sync</span>
          </Button>

          {canCreateProject && (
            <Button
              size="sm"
              onClick={() => {
                setEditingProject(null);
                setCreateProjectModalOpen(true);
              }}
              className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Project</span>
            </Button>
          )}
        </div>
      </div>

      {/* 2. Error Banner */}
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadProjects(true)} className="h-7 text-xs">
            Retry
          </Button>
        </div>
      )}

      {/* 3. Directory Toolbar */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-2xs">
        {/* Top Toolbar Row: Search, Sort & View Mode Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search projects by name or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-full rounded-md border border-border bg-surface-muted pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {/* Sort Selector */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="text-[11px] font-mono hidden md:inline">Sort:</span>
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
                className="h-8 rounded-md border border-border bg-surface-muted px-2 text-xs text-foreground focus:border-primary focus:outline-none cursor-pointer"
                aria-label="Sort projects"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* View Mode Switcher (Grid | List) */}
            <div className="flex items-center rounded-lg border border-border bg-surface-muted p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                  viewMode === "grid"
                    ? "bg-card text-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Switch to Grid View"
                aria-label="Grid View"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                  viewMode === "list"
                    ? "bg-card text-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title="Switch to List View"
                aria-label="List View"
              >
                <List className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">List</span>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Toolbar Row: Status Filter Tabs & Reset Action */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/50">
          <div className="flex items-center gap-1 overflow-x-auto max-w-full py-0.5">
            {STATUS_TABS.map((tab) => {
              const count = statusCounts[tab.id] ?? 0;
              const isActive = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer shrink-0",
                    isActive
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                  )}
                >
                  <span>{tab.label}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.1 text-[10px] font-mono",
                      isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-surface-muted text-muted-foreground"
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {isFiltered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset</span>
            </Button>
          )}
        </div>
      </div>

      {/* 4. Projects Directory Presentation */}
      {projects.length === 0 ? (
        /* Empty Workspace State */
        <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center space-y-3">
          <FolderKanban className="h-10 w-10 mx-auto text-muted-foreground/60" />
          <h3 className="text-sm font-bold text-foreground">No Projects in Workspace</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            Get started by creating your first project initiative to coordinate squads, delivery roadmaps, and tasks.
          </p>
          {canCreateProject && (
            <Button
              size="sm"
              onClick={() => {
                setEditingProject(null);
                setCreateProjectModalOpen(true);
              }}
              className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              <span>Create First Project</span>
            </Button>
          )}
        </div>
      ) : filteredProjects.length === 0 ? (
        /* Filtered Empty State */
        <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center space-y-3">
          <FolderKanban className="h-9 w-9 mx-auto text-muted-foreground/60" />
          <h3 className="text-sm font-bold text-foreground">No matching projects</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            No projects match the currently applied search query or status filter criteria.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetFilters}
            className="h-8 text-xs cursor-pointer"
          >
            Reset Filters
          </Button>
        </div>
      ) : viewMode === "grid" ? (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onEdit={(p) => setEditingProject(p)}
            />
          ))}
        </div>
      ) : (
        /* Dense List View */
        <div className="rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-muted/60 text-muted-foreground font-semibold">
                  <th className="py-2.5 px-3">Project</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Velocity</th>
                  <th className="py-2.5 px-3">Tasks</th>
                  <th className="py-2.5 px-3">Squad</th>
                  <th className="py-2.5 px-3">Deadline</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-normal">
                {filteredProjects.map((project) => {
                  const membersList = Array.isArray((project as any).members) ? (project as any).members : [];
                  const progressPct = project.progress ?? 0;
                  const completedTasks = project.completedTasks ?? 0;
                  const totalTasks = project.totalTasks ?? 0;

                  let formattedDeadline = "—";
                  if (project.deadline) {
                    try {
                      formattedDeadline = new Date(project.deadline).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      });
                    } catch {
                      formattedDeadline = String(project.deadline);
                    }
                  }

                  return (
                    <tr
                      key={project.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`Open project: ${project.name}`}
                      onClick={() => router.push(`/projects/${project.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/projects/${project.id}`);
                        }
                      }}
                      className="hover:bg-surface-muted/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary group"
                    >
                      {/* Project Name & Description */}
                      <td className="py-3 px-3 min-w-[200px] max-w-xs">
                        <div className="flex items-center gap-2.5 truncate">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: project.color || "#0284C7" }}
                            aria-hidden="true"
                          />
                          <div className="min-w-0 truncate">
                            <span className="font-bold text-foreground group-hover:text-primary transition-colors truncate block">
                              {project.name}
                            </span>
                            <span className="text-[11px] text-muted-foreground truncate block">
                              {project.description || "Workspace initiative"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <ProjectStatusBadge status={project.status} size="sm" />
                      </td>

                      {/* Velocity / Progress Bar */}
                      <td className="py-3 px-3 whitespace-nowrap font-mono min-w-[120px]">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-300"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-foreground">{progressPct}%</span>
                        </div>
                      </td>

                      {/* Tasks Ratio */}
                      <td className="py-3 px-3 whitespace-nowrap font-mono text-muted-foreground">
                        <span className="inline-flex items-center gap-1 text-[11px]">
                          <CheckSquare className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>
                            {completedTasks}/{totalTasks}
                          </span>
                        </span>
                      </td>

                      {/* Squad Members Avatars */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {membersList.length > 0 ? (
                          <div className="flex items-center -space-x-1.5 overflow-hidden">
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
                          <span className="text-[10px] text-muted-foreground/60 italic">—</span>
                        )}
                      </td>

                      {/* Deadline */}
                      <td className="py-3 px-3 whitespace-nowrap font-mono text-muted-foreground">
                        <span className="inline-flex items-center gap-1 text-[11px]">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{formattedDeadline}</span>
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingProject(project);
                              setCreateProjectModalOpen(true);
                            }}
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                            title="Edit Project Scope"
                          >
                            <Edit2 className="h-3 w-3" />
                            <span className="sr-only sm:not-sr-only sm:ml-1">Edit</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/projects/${project.id}`)}
                            className="h-7 px-2 text-xs text-primary hover:text-primary cursor-pointer"
                            title="Open Workspace"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span className="sr-only sm:not-sr-only sm:ml-1">Open</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Project Creation / Edit Modal */}
      <ProjectModal
        editingProject={editingProject}
        onClose={() => setEditingProject(null)}
      />
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <React.Suspense fallback={<ProjectsLoading />}>
      <ProjectsDirectoryContent />
    </React.Suspense>
  );
}
