import { create } from "zustand";

export interface Project {
  id: string;
  name: string;
  path: string;
  created_at: string;
  updated_at: string;
}

interface WorkspaceState {
  activeProject: Project | null;
  projects: Project[];
  setProjects: (projects: Project[]) => void;
  setActiveProject: (project: Project | null) => void;
  addProject: (project: Project) => void;
  removeProject: (id: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeProject: null,
  projects: [],
  setProjects: (projects) => set({ projects }),
  setActiveProject: (project) => set({ activeProject: project }),
  addProject: (project) =>
    set((state) => ({ projects: [...state.projects, project] })),
  removeProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      activeProject: state.activeProject?.id === id ? null : state.activeProject,
    })),
}));
