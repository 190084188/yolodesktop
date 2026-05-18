import { create } from "zustand";

export interface TrainingMetrics {
  epoch: number;
  loss: number;
  cls_loss?: number;
  dfl_loss?: number;
  map50?: number;
  map50_95?: number;
  precision?: number;
  recall?: number;
}

export type TrainingStatus = "idle" | "running" | "completed" | "stopped" | "error";

interface TrainingState {
  activeRunId: string | null;
  status: TrainingStatus;
  metrics: TrainingMetrics[];
  logLines: string[];
  setActiveRun: (runId: string | null) => void;
  setStatus: (status: TrainingStatus) => void;
  appendMetrics: (m: TrainingMetrics) => void;
  appendLog: (line: string) => void;
  clearRun: () => void;
}

export const useTrainingStore = create<TrainingState>((set) => ({
  activeRunId: null,
  status: "idle",
  metrics: [],
  logLines: [],
  setActiveRun: (runId) =>
    set({ activeRunId: runId, metrics: [], logLines: [], status: "idle" }),
  setStatus: (status) => set({ status }),
  appendMetrics: (m) =>
    set((state) => ({ metrics: [...state.metrics, m] })),
  appendLog: (line) =>
    set((state) => ({ logLines: [...state.logLines, line] })),
  clearRun: () =>
    set({ activeRunId: null, status: "idle", metrics: [], logLines: [] }),
}));
