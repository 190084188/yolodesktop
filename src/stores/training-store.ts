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

export interface GpuStats {
  gpu_name: string;
  utilization_pct: number;
  memory_used_mb: number;
  memory_total_mb: number;
}

export type TrainingStatus = "idle" | "running" | "completed" | "stopped" | "error";

interface TrainingState {
  activeRunId: string | null;
  status: TrainingStatus;
  metrics: TrainingMetrics[];
  logLines: string[];
  gpuStats: GpuStats | null;
  bestMap50: number;
  bestEpoch: number | null;
  totalEpochs: number;
  trainingStartTime: number | null;
  setActiveRun: (runId: string | null) => void;
  setStatus: (status: TrainingStatus) => void;
  appendMetrics: (m: TrainingMetrics) => void;
  appendLog: (line: string) => void;
  setGpuStats: (stats: GpuStats) => void;
  setBestMap50: (val: number) => void;
  setBestEpoch: (epoch: number | null) => void;
  setTotalEpochs: (epochs: number) => void;
  setTrainingStartTime: (ts: number | null) => void;
  clearRun: () => void;
}

export const useTrainingStore = create<TrainingState>((set) => ({
  activeRunId: null,
  status: "idle",
  metrics: [],
  logLines: [],
  gpuStats: null,
  bestMap50: 0,
  bestEpoch: null,
  totalEpochs: 100,
  trainingStartTime: null,
  setActiveRun: (runId) =>
    set({
      activeRunId: runId,
      metrics: [],
      logLines: [],
      status: "idle",
      gpuStats: null,
      bestMap50: 0,
      bestEpoch: null,
      trainingStartTime: null,
    }),
  setStatus: (status) => {
    if (status === "running") {
      set({ status, trainingStartTime: Date.now() });
    } else {
      set({ status });
    }
  },
  appendMetrics: (m) =>
    set((state) => ({ metrics: [...state.metrics, m] })),
  appendLog: (line) =>
    set((state) => ({ logLines: [...state.logLines, line] })),
  setGpuStats: (stats) => set({ gpuStats: stats }),
  setBestMap50: (val) => set({ bestMap50: val }),
  setBestEpoch: (epoch) => set({ bestEpoch: epoch }),
  setTotalEpochs: (epochs) => set({ totalEpochs: epochs }),
  setTrainingStartTime: (ts) => set({ trainingStartTime: ts }),
  clearRun: () =>
    set({
      activeRunId: null,
      status: "idle",
      metrics: [],
      logLines: [],
      gpuStats: null,
      bestMap50: 0,
      bestEpoch: null,
      trainingStartTime: null,
    }),
}));
