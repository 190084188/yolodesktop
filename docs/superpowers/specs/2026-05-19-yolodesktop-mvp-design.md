# YoloDesktop — MVP Design Spec

**Date**: 2026-05-19
**Status**: Approved
**Phase**: MVP (Phase 1)

## Overview

Cross-platform Yolo training & deployment desktop app using Tauri 2.0 + React + TypeScript + Rust, with Rust calling Python subprocesses for the Yolo engine.

## Architecture: Three Balanced Layers

```
React 18 + TypeScript + Ant Design
    ↑ invoke() / Tauri events ↓
Rust Backend (Python process mgmt, file sandbox, SQLite persistence)
    ↑ stdout/stderr pipes ↓
Python Engine (Yolo v8/v11, dataset conversion, ONNX export)
```

- **Frontend**: All UI rendering, state management, React Flow, ECharts
- **Rust**: Python process lifecycle, file I/O sandbox, SQLite, model YAML→JSON parser
- **Python**: Training, dataset format conversion, ONNX export

### IPC Design

- Commands: CLI args to Python subprocess
- Real-time logs: Python writes lines to stdout, Rust parses, emits Tauri events to frontend
- No sockets needed for MVP

## Core Pipelines

### 1. Environment Setup
User clicks "Install Yolo v11" → Rust checks prereqs (Python 3.9+, CUDA, disk) → creates venv → pip install → streams pip output → records to SQLite

### 2. Dataset Import
User drags folder → Rust detects format (COCO/YOLO/VOC) → Python converter normalizes to YOLO format → copies to workspace → returns stats to frontend

### 3. Training
User configures params → Rust generates YAML → spawns `python train.py` → per-epoch metrics via stdout → Tauri events → ECharts live update → checkpoints saved

### 4. Model Export
User selects checkpoint + ONNX → Rust spawns Python export → progress streamed → result recorded in SQLite

## Component Tree

```
<App>
  <ThemeProvider> → <QueryClientProvider> → <Router> → <AppShell>
    <Sidebar>
      <WorkspaceSelector />
      <NavMenu />          ← 8 nav items
    </Sidebar>
    <MainContent>
      / → <Dashboard />
      /env → <EnvManager />
      /datasets → <DatasetList />
      /datasets/:id → <DatasetDetail />
      /train → <TrainingSetup />
      /train/:runId → <TrainingMonitor />
      /models → <ModelGraphViewer />    ← read-only React Flow
      /export → <ExportManager />
      /plugins → <PluginManager />
      /settings → <Settings />
    </MainContent>
  </AppShell>
</App>
```

Shared components: `<LogStreamer />`, `<ProgressOverlay />`, `<ErrorBanner />`, `<YamlEditor />`

## State Management

- **Zustand**: `useWorkspaceStore` (projects), `useTrainingStore` (live metrics, logs, status)
- **TanStack Query**: All SQLite data via typed `invoke()` commands
- **Tauri events**: Training metrics streamed from Rust → frontend listener pushes to Zustand

## Database Schema (SQLite, 7 tables)

- `projects` — id, name, path, timestamps
- `yolo_envs` — id, version, venv_path, python_path, status, cuda_available
- `datasets` — id, project_id, name, format, image_count, class_count, classes_json, path
- `training_runs` — id, project_id, dataset_id, env_id, config_yaml, status, timestamps, best_map50, best_epoch
- `checkpoints` — id, run_id, epoch, file_path, loss, map50, map50_95, file_size
- `exported_models` — id, run_id, checkpoint_id, format, file_path, file_size
- `annotation_plugins` — id, name, version, formats_json, launcher_path, is_installed

## Error Handling

- **Python errors**: Traceback parsed by Rust → structured error (type, message, suggestion, raw_traceback) → `<ErrorBanner />` renders friendly message + copy button + suggested fix
- **System errors**: Rust returns enum error codes → frontend maps to translated messages + actions
- **Frontend errors**: React ErrorBoundary per route, Zustand actions wrapped in try/catch + toast

## Annotation Plugin System

Modular design: each annotation tool ships as a directory with `manifest.json`:
```json
{
  "name": "labelme",
  "version": "1.0.0",
  "supported_formats": ["labelme_json", "voc"],
  "launcher": "labelme_launcher.py",
  "description": "LabelMe annotation tool"
}
```
Rust reads manifests at startup, frontend renders available plugins. Users install/remove plugins via the PluginManager page.

## Testing Strategy

- **Rust**: Unit tests for process mgmt, YAML parsing, file sandbox, SQLite queries
- **Frontend**: Component tests with mock `invoke()`, mock Tauri events for TrainingMonitor
- **Python**: Script-level tests for format conversion, export validation
- **E2E**: Playwright for happy path (env install → import → train → export)

## MVP Scope Boundary

| IN | OUT (Phase 2+) |
|----|----------------|
| Yolo v8 + v11 | v5/v9/v10 |
| System Python + venv | Embedded Python, conda |
| COCO/YOLO/VOC import + preview | Built-in annotation canvas |
| Pluggable annotation manifests + install | Full annotation editing (Fabric.js) |
| Training: start/stop, live metrics | Pause/resume, distributed training |
| Single GPU | Multi-GPU config |
| ONNX export only | TensorRT, OpenVINO, CoreML |
| Read-only model graph viewer | Low-code editor + codegen |
| SQLite local | Cloud sync |
| Windows primary | macOS, Linux verified |

## Tech Stack Decisions

- **UI Library**: Ant Design (enterprise components, dark theme built-in)
- **State**: Zustand + TanStack Query
- **Charts**: ECharts
- **Graph**: React Flow + add-ons (MiniMap, Controls)
- **YAML Editor**: CodeMirror 6
