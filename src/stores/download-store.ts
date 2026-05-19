import { create } from "zustand";

export interface DownloadTask {
  id: string;
  name: string;
  source: string;
  url: string;
  progress: number;
  speedMbps: number;
  etaSeconds: number;
  status: "pending" | "downloading" | "completed" | "failed" | "cancelled";
  error?: string;
}

interface DownloadState {
  tasks: DownloadTask[];
  drawerOpen: boolean;
  addTask: (task: DownloadTask) => void;
  updateTask: (id: string, update: Partial<DownloadTask>) => void;
  removeTask: (id: string) => void;
  setDrawerOpen: (open: boolean) => void;
}

export const useDownloadStore = create<DownloadState>((set) => ({
  tasks: [],
  drawerOpen: false,
  addTask: (task) => set((s) => ({ tasks: [...s.tasks, task] })),
  updateTask: (id, update) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...update } : t)),
    })),
  removeTask: (id) =>
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
  setDrawerOpen: (open) => set({ drawerOpen: open }),
}));
