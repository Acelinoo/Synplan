"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  FolderKanban,
  Plus,
  Search,
  LayoutGrid,
  List,
  SlidersHorizontal,
  FolderPlus,
} from "lucide-react";
import { useWorkspaceStore, useUiStore } from "@/store";
import dynamic from "next/dynamic";
import { Project } from "@/types";
import { Button } from "@/components/ui/button";
import { MagnetButton } from "@/components/ui/magnet-button";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { AnimatedGrid } from "@/components/ui/animated-grid";
import { Skeleton, SkeletonCard, SkeletonAvatar } from "@/components/ui/skeleton";
import ProjectsLoading from "./loading";
import { apiClient } from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { useRealtime } from "@/components/realtime/RealtimeProvider";

const ProjectModal = dynamic(
  () => import("@/components/projects/ProjectModal").then((mod) => mod.ProjectModal),
  { ssr: false }
);

function ProjectsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createParam = searchParams.get("create");
  const { projects, setProjects, addProject, updateProject, deleteProject, applyBatchMutation } = useWorkspaceStore();
  const { setCreateProjectModalOpen } = useUiStore();
  const { onEvent } = useRealtime();

  const [isLoading, setIsLoading] = React.useState(projects.length === 0);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("grid");
  const [editingProject, setEditingProject] = React.useState<Project | null>(null);

  // --- Realtime Projects Live Synchronization ---
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

  React.useEffect(() => {
    if (createParam === "true") {
      setEditingProject(null);
      setCreateProjectModalOpen(true);
    }
  }, [createParam, setCreateProjectModalOpen]);

  React.useEffect(() => {
    async function loadProjects() {
      setIsLoading(true);
      try {
        const res = await apiClient.getProjects();
        if (res.success && Array.isArray(res.data)) {
          setProjects(res.data);
        }
      } catch (err) {
        console.warn("Failed to load projects from API:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadProjects();
  }, [setProjects]);

  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      (p.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="relative flex flex-col gap-6">
      <AnimatedGrid />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Projects</h1>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-mono font-bold text-primary">
              {filteredProjects.length} Total
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Manage active initiatives, milestone timelines, squad allocations, and delivery velocity.
          </p>
        </div>

        <MagnetButton
          size="sm"
          onClick={() => {
            setEditingProject(null);
            setCreateProjectModalOpen(true);
          }}
          className="gap-2 text-xs font-semibold"
        >
          <Plus className="h-4 w-4" />
          <span>New Project</span>
        </MagnetButton>
      </div>

      {/* Filters & View Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search projects by title or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-4 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <div className="flex items-center rounded-lg border border-border bg-card p-0.5 overflow-x-auto max-w-full">
            {[
              { id: "all", label: "All" },
              { id: "planning", label: "Planning" },
              { id: "active", label: "Active" },
              { id: "completed", label: "Completed" },
              { id: "on_hold", label: "On Hold" },
              { id: "archived", label: "Archived" },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setStatusFilter(st.id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-all shrink-0",
                  statusFilter === st.id
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                viewMode === "grid"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Grid View"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "rounded-md p-1.5 transition-colors",
                viewMode === "list"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="List View"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Projects Canvas */}
      {isLoading ? (
        viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <SkeletonCard key={i} className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 flex-1">
                    <Skeleton className="h-3 w-3 rounded-full shrink-0" />
                    <Skeleton className="h-4 w-40 rounded" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full shrink-0" />
                </div>
                <Skeleton className="h-3 w-3/4 rounded" />
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-2.5 w-16 rounded" />
                    <Skeleton className="h-2.5 w-8 rounded" />
                  </div>
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <Skeleton className="h-3 w-20 rounded" />
                  <div className="flex -space-x-1.5">
                    <SkeletonAvatar size="xs" />
                    <SkeletonAvatar size="xs" />
                  </div>
                </div>
              </SkeletonCard>
            ))}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card/60 overflow-hidden" aria-busy="true">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Skeleton className="h-3 w-3 rounded-md shrink-0" />
                  <div className="space-y-1 flex-1">
                    <Skeleton className="h-4 w-48 rounded" />
                    <Skeleton className="h-3 w-72 rounded" />
                  </div>
                </div>
                <div className="flex items-center gap-6 shrink-0">
                  <div className="w-28 space-y-1">
                    <div className="flex justify-between">
                      <Skeleton className="h-2.5 w-12 rounded" />
                      <Skeleton className="h-2.5 w-6 rounded" />
                    </div>
                    <Skeleton className="h-1.5 w-full rounded-full" />
                  </div>
                  <Skeleton className="h-7 w-12 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        )
      ) : filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <FolderKanban className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <h3 className="text-sm font-semibold text-foreground">No projects found</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Try adjusting your search query or filter settings, or initialize a new project
            initiative.
          </p>
          <Button
            size="sm"
            onClick={() => {
              setEditingProject(null);
              setCreateProjectModalOpen(true);
            }}
            className="mt-4 gap-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create First Project</span>
          </Button>
        </div>
      ) : viewMode === "grid" ? (
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
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card/60 overflow-hidden">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              onClick={() => router.push(`/projects/${project.id}`)}
              className="flex items-center justify-between p-4 hover:bg-muted/40 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="h-3 w-3 shrink-0 rounded-md"
                  style={{ backgroundColor: project.color || "#0284C7" }}
                />
                <div className="min-w-0">
                  <h4 className="truncate text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                    {project.name}
                  </h4>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {project.description || "Workspace initiative"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6 shrink-0">
                <div className="w-28">
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground mb-1">
                    <span>Progress</span>
                    <span>{project.progress}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${project.progress}%`,
                        backgroundColor: project.color || "#0284C7",
                      }}
                    />
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingProject(project);
                  }}
                  className="h-7 text-xs"
                >
                  Edit
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Project Modal (Create / Edit) */}
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
      <ProjectsContent />
    </React.Suspense>
  );
}
