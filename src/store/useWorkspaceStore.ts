import { create } from "zustand";
import { Workspace, Project, WorkspaceMember } from "@/types";

interface WorkspaceState {
  activeWorkspace: Workspace | null;
  workspaces: Workspace[];
  isWorkspaceValidated: boolean;
  activeProject: Project | null;
  projects: Project[];
  members: WorkspaceMember[];
  isLoading: boolean;
  error: string | null;

  // Actions
  setActiveWorkspace: (workspace: Workspace) => void;
  setWorkspaceValidated: (validated: boolean) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;
  setActiveProject: (project: Project | null) => void;
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  setMembers: (members: WorkspaceMember[]) => void;
  addMember: (member: WorkspaceMember) => void;
  updateMember: (id: string, updates: Partial<WorkspaceMember>) => void;
  removeMember: (id: string) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

const getInitialWorkspace = (): Workspace | null => {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("synplan_active_ws");
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      // ignore
    }
  }
  return null;
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeWorkspace: getInitialWorkspace(),
  isWorkspaceValidated: false,
  workspaces: [],
  activeProject: null,
  projects: [],
  members: [],
  isLoading: false,
  error: null,

  setActiveWorkspace: (workspace) => {
    if (typeof window !== "undefined") {
      try {
        if (workspace && workspace.id) {
          localStorage.setItem("synplan_active_ws", JSON.stringify(workspace));
        } else {
          localStorage.removeItem("synplan_active_ws");
        }
      } catch (e) {
        // ignore
      }
    }
    set({ activeWorkspace: workspace, activeProject: null });
  },
  setWorkspaceValidated: (validated) => set({ isWorkspaceValidated: validated }),
  setWorkspaces: (workspaces) => set({ workspaces }),
  setActiveProject: (project) => set({ activeProject: project }),
  setProjects: (projects) => set({ projects }),
  addProject: (project) =>
    set((state) => {
      const exists = state.projects.some((p) => p.id === project.id);
      if (exists) {
        return {
          projects: state.projects.map((p) => (p.id === project.id ? { ...p, ...project } : p)),
        };
      }
      return { projects: [project, ...state.projects] };
    }),
  updateProject: (id, updates) =>
    set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id !== id) return p;
        if (updates.updatedAt && p.updatedAt) {
          const incomingTime = new Date(updates.updatedAt).getTime();
          const existingTime = new Date(p.updatedAt).getTime();
          if (!isNaN(incomingTime) && !isNaN(existingTime) && incomingTime < existingTime) {
            return p;
          }
        }
        return { ...p, ...updates };
      }),
      activeProject:
        state.activeProject?.id === id
          ? { ...state.activeProject, ...updates }
          : state.activeProject,
    })),
  deleteProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      activeProject: state.activeProject?.id === id ? null : state.activeProject,
    })),
  setMembers: (members) => set({ members }),
  addMember: (member) =>
    set((state) => ({ members: [member, ...state.members.filter((m) => m.id !== member.id)] })),
  updateMember: (id, updates) =>
    set((state) => ({
      members: state.members.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),
  removeMember: (id) =>
    set((state) => ({
      members: state.members.filter((m) => m.id !== id),
    })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
