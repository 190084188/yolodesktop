# YoloDesktop UX Improvements Design

**Date**: 2026-05-19
**Status**: Approved

## Overview

10 UX improvements across 5 modules: i18n foundation, YOLO environment management, dataset hub, training experience, and polish.

## New Dependencies

| Layer | Package | Version | Purpose |
|---|---|---|---|
| npm | `react-i18next` | ^17.0.8 | React i18n framework (hooks-based) |
| npm | `i18next` | ^26.2.0 | Core i18n engine |
| npm | `i18next-browser-languagedetector` | latest | Auto-detect browser language |
| npm | `react-markdown` | ^10.1.0 | Render markdown (dataset format docs) |
| npm | `lodash.debounce` | latest | Debounce YAML editor input |
| Cargo | `reqwest` | 0.13 | Rust async HTTP client (connectivity checks) |
| pip | `nvidia-ml-py` | >=12.0.0 | NVIDIA driver/CUDA version detection |
| pip | `kagglehub` | latest | Kaggle dataset search + download |
| pip | `huggingface-hub` | latest | HuggingFace dataset search |
| pip | `roboflow` | latest | Roboflow CV dataset search + YOLO export |

---

## Module 1: i18n Foundation (Point 8)

### Architecture
- `react-i18next` + `i18next` + `i18next-browser-languagedetector`
- Namespace-split JSON translation files per page
- Ant Design `ConfigProvider` locale synced with i18n language
- User can switch language in Settings page

### File Structure
```
src/i18n/
  index.ts                  # i18next init, language detection
  zh_CN/
    common.json             # shared: buttons, hints, status labels
    env.json                # environment manager
    dataset.json            # datasets
    training.json           # training setup + monitor
    export.json             # model export
    plugins.json            # annotation plugins
    settings.json           # settings page
  en_US/                    # mirror structure
    common.json
    ...
```

### Key Behaviors
- Default language: `zh_CN`, fallback: `en_US`
- Each page uses `useTranslation("namespace")` hook
- All hardcoded strings extracted to JSON, replaced with `t("key")`

---

## Module 2: YOLO Environment (Points 1-3)

### GPU Diagnostics (Point 3)
- **Single entry point**: `python/check_gpu.py` is the ONLY GPU detection logic. Rust calls this script and parses its JSON output. No duplicate logic in `venv.rs`.
- Detection pipeline:
  1. `nvidia-smi` → driver version, GPU name, VRAM
  2. `torch.cuda.is_available()` → PyTorch CUDA availability, `torch.version.cuda`
  3. `nvidia-ml-py` (`pynvml`) → detailed driver version, compute capability
  4. **Conda detection**: check `$CONDA_PREFIX` env var, `subprocess.run(["conda", "list", "cudatoolkit"])`, `conda list cudnn`; also scan `$CONDA_PREFIX/lib/libcudart.so` (Linux) or `$CONDA_PREFIX/Library/bin/cudart*.dll` (Windows)
  5. `torch.backends.cudnn.version()` → cuDNN version
- Output: JSON with all fields (`{driver_version, cuda_available, cuda_version, cudnn_version, gpu_name, vram_mb, conda_cuda_found, conda_cuda_version, issues: [...], recommendations: [...]}`)
- Pass → recommend GPU install with matched PyTorch CUDA index URL (cu118/cu121/cu124)
- Fail → diagnostic report listing missing items + install guide links per issue
- CPU path: install CPU-only PyTorch from `https://download.pytorch.org/whl/cpu`

### Install Progress (Point 1)
- pip flag: `--progress-bar on`
- Rust parses stderr progress lines (regex: `Downloading.*?(\d+)%`), emits `env:progress` event with `{percent, message}`
- Frontend: Ant Design `Progress` (percent bar) + live log stream (existing `LogStreamer`)
- Error state: show error details + retry suggestion
- Progress events persist through `env:log` for log lines

### Open YOLO Folder (Point 2)
- Use existing `tauri-plugin-opener` (already in Cargo.toml) to open folder: `opener::open(path)`
- Each env row has "Open Folder" button
- Install completion notice includes "Open Folder" link
- Cross-platform: Windows Explorer, macOS Finder, Linux xdg-open handled by opener plugin

### New/Modified Files
- `python/check_gpu.py` — **single source of truth** for GPU diagnostics (JSON output)
- `src-tauri/src/commands/env.rs` — call check_gpu.py, parse JSON result; add `device` param to install_yolo
- `src/routes/env-manager.tsx` — rewrite UI: install dialog (CPU/GPU radio), progress bar, open folder button
- `src-tauri/src/python/venv.rs` — NO GPU logic, only venv management

---

## Module 3: Dataset Hub (Points 5-7)

### Multi-Source Dataset Search (Point 5)

**API Key Requirements & Authentication:**
- **Kaggle** (file-based auth `~/.kaggle/kaggle.json`):
  - Auto-detect: check if `~/.kaggle/kaggle.json` exists (run `kagglehub.login()` to verify)
  - Manual config: user inputs username + key in Settings → program writes `~/.kaggle/kaggle.json`
  - "Test Connection" button to verify credentials
- **HuggingFace**: public search works without token; optional token in Settings for higher rate limits
- **Roboflow**: public Universe search works without key; private/workspace datasets need API key in Settings

**Search Implementation:**
- **Parallel execution**: all 3 sources queried simultaneously via `tokio::task::spawn_blocking` for each Python subprocess
- **Timeout**: 10-second timeout per source; on timeout/error, return partial results + error indicator
- **Correct Roboflow API**:
  ```python
  from roboflow import Roboflow
  rf = Roboflow(api_key="...")  # optional for public search
  results = rf.universe.search(query=keyword)
  ```
  NOT `roboflow.workspace().search()` — that method doesn't exist.
- **Kaggle search**: via `kagglehub.dataset_search(keyword)` after auth is configured
- **HuggingFace search**: `HfApi().list_datasets(search=keyword, limit=20)`

**Search UI:**
- Keyword input + source multi-select (Kaggle/HuggingFace/Roboflow) + optional filters
- Results: card list with name, description, sample count, source badge, **copy-link button**, **download button**
- Connectivity status: Rust `reqwest` HEAD requests → green/yellow/red indicators per source
- Error state: if a source fails, show "X 源不可用（超时/错误）" on that source's tab, other results unaffected

### Dataset Download (Point 5 extension)
Each dataset card has a "Download" button:
- Triggers async download task via Python script
- Progress: `dataset:download-progress` events with `{dataset_id, percent, speed_mbps, eta_seconds}`
- Frontend: progress bar per download, cancel button
- Cancel: kill subprocess, clean up partial files
- On completion: auto-trigger `scan_dataset_folders` to refresh list

### Download Queue Manager (Supplementary)
- Global download state tracked in Rust via `DownloadState { queue: Mutex<Vec<DownloadTask>> }`
- Queue displayed in a slide-out drawer (accessible from any page via store)
- Features: pause/resume/cancel per task, parallel limit configurable (default 2), download history

### Search Cache (Supplementary)
- SQLite table `search_cache`: `keyword, source, results_json, cached_at`
- Cache TTL: 1 hour
- Before API call, check cache; on API success, upsert cache

### Global Dataset Folder (Point 6)
- Settings page: "Dataset Root Directory" config field, stored in SQLite settings table
- New Rust command: `scan_dataset_folders(root_path)`
  - Scan first-level subdirectories
  - Auto-detect format: YOLO (`data.yaml` + `images/` + `labels/`), COCO (`annotations/instances_*.json`), VOC (`Annotations/` + `JPEGImages/`)
- Dataset list page: "Refresh" button triggers re-scan
- Scanned datasets can be imported to current project (one-click import)

### Dataset Format Specification (Point 6 extra)
- "Format Spec" tab/drawer in dataset page
- Uses `react-markdown` to render `docs/dataset-formats.md`
- Content: YOLO/COCO/VOC directory structures, annotation format examples, config docs

### Test Dataset (Point 7)
- `python/download_test_dataset.py` — uses `kagglehub.dataset_download("ultralytics/coco8")`
- coco8: 4 images, 8 classes, <1MB
- "Download Test Dataset" button in dashboard or dataset page
- Auto-import to current project after download

### New/Modified Files
- `src-tauri/src/commands/dataset.rs` — `search_datasets`, `check_connectivity`, `scan_dataset_folders`, `download_dataset`, `cancel_download`, settings CRUD
- `src-tauri/Cargo.toml` — add `reqwest`
- `src/routes/dataset-list.tsx` — rewrite: search, scan results, refresh, format docs, download buttons
- `src/routes/settings.tsx` — dataset root dir config, API key entries with test buttons
- `src/components/download-queue.tsx` — global download queue drawer
- `src/stores/download-store.ts` — Zustand store for download state
- `python/search_datasets.py` — multi-source parallel search with timeout
- `python/scan_folders.py` — format detection
- `python/download_dataset.py` — single dataset download with progress
- `python/download_test_dataset.py` — test dataset download
- `docs/dataset-formats.md` — format specification
- `src-tauri/src/db/queries.rs` — add settings table + search_cache table queries

---

## Module 4: Training Experience (Points 4, 9, 10)

### BaseModel Scanning (Point 4)
- New Rust command: `scan_models(env_id, project_id?)` — scans all relevant paths for `.pt` files:
  - `~/.cache/ultralytics/` (ultralytics default cache)
  - `~/.cache/torch/hub/checkpoints/` (PyTorch hub cache)
  - `{project_root}/models/` (project-local models)
  - `{project_root}/weights/` (project-local weights)
  - User-configured extra paths from Settings
  - venv site-packages (bundled models)
- Returns: `{filename, path, size_bytes, modified_at}`
- Dropdown shows scan results; empty state: "未检测到已安装的 YOLO 模型，请先在环境管理中安装"
- Also supports manual model name input (ultralytics auto-downloads from internet)

### Parameter Editor (Point 9)
- Extract ~80 params from `ultralytics/cfg/default.yaml`, split into 3 groups:
  - **Basic** (always visible): `epochs`, `batch`, `imgsz`, `device`, `workers`
  - **Advanced** (collapsible panel, ~20 params): optimizer, lr/lrf, momentum, weight_decay, warmup, augmentation series (hsv, degrees, translate, scale, mosaic, mixup, etc.)
  - **Full** (modal, all ~80 params): categorized list view (Model, Data, Optimizer, Augmentation, Output, Hardware)
- Each param has `QuestionCircleOutlined` tooltip icon with Chinese description (sourced from default.yaml comments + ultralytics docs)
- YAML editor with **two-way binding**:
  - Form changes → update YAML content **immediately** (safe: form values are always valid)
  - YAML edits → parse and backfill form fields with **500ms debounce** (via `lodash.debounce`); invalid YAML: red highlight on editor, error message, form NOT updated until valid
  - `onBlur` also triggers immediate parse (in addition to debounce)
- "Restore Default YAML" button → reset to `ultralytics/cfg/default.yaml` defaults (with confirmation dialog)

### Real-Time Dashboard (Point 10)
- Existing ECharts chart enhanced:
  - Add `mAP50-95`, `Precision`, `Recall` curves
  - `dataZoom` for zoom/drag, legend toggle
  - Auto-annotate Best Epoch marker point at training completion
- New stat card row: Current Epoch, Best mAP50, GPU utilization % / VRAM usage, estimated remaining time
- **GPU monitoring interval**: configurable, default every 5 seconds (NOT per-epoch, to avoid overhead on fast epochs). Driven by `training:gpu-stats` event at the configured interval.
- `python/train.py` enhanced:
  - Per-epoch `METRICS:{...}` JSON with precision, recall, mAP50, mAP50-95, loss, lr
  - Separate thread for GPU stat polling at configurable interval, emits `GPU_STATS:{...}` lines

### New/Modified Files
- `src-tauri/src/commands/training.rs` — add `scan_models`, pass `device` param to training
- `src/routes/training-setup.tsx` — rewrite parameter editor, collapsible panels, tooltips, YAML debounced binding
- `src/routes/training-monitor.tsx` — enhanced dashboard, stat cards, GPU stats display
- `python/train.py` — enhanced metrics output, GPU monitoring thread
- `python/scan_models.py` — multi-path model cache scanner
- `src/components/model-selector.tsx` — model dropdown with scan + manual input
- `src/components/param-tooltip.tsx` — reusable param label with tooltip

---

## Module 5: Polish & Migration

### Database Migration (Issue 10)
- Add `db/migrate.rs` versioning: check `PRAGMA user_version`, apply migrations sequentially
- v0 → v1: create `settings` table if not exists
- v1 → v2: create `search_cache` table if not exists
- v2 → v3: create `download_history` table if not exists
- Existing users upgrading: startup auto-detects missing tables/columns and applies only needed migrations

### Diagnostic Report Generator (Supplementary)
- Rust command: `generate_diagnostic_report()` → collects:
  - OS info (platform, version, arch)
  - Python version, pip list (ultralytics, torch versions)
  - GPU info (driver, CUDA, cuDNN, VRAM from check_gpu.py)
  - YoloDesktop version, DB status, project/env/dataset counts
  - Recent error logs
- Output: single text file, saved to desktop
- "Generate Diagnostic Report" button in Settings → Help section

### i18n Coverage Audit
- Every visible string in every component must use `t()` — no hardcoded text
- Audit checklist per page: Dashboard, EnvManager, DatasetList, DatasetDetail, TrainingSetup, TrainingMonitor, ModelViewer, ExportManager, PluginManager, Settings, AppShell

### Edge Case Testing
- No Python installed → show install guide
- No network → graceful degradation, cached search results
- No GPU → CPU-only install path, GPU stats hidden in dashboard
- Empty datasets/projects → appropriate empty states
- Invalid YAML → validation error, no block
- Training crash → capture stderr, show error with traceback

---

## i18n Key Migration Map

| Current Hardcoded Text | namespace:key |
|---|---|
| "仪表盘" | `common:dashboard` |
| "环境管理" | `common:envManager` |
| "数据集" | `common:datasets` |
| "训练管理" | `common:training` |
| "模型图" | `common:modelGraph` |
| "模型导出" | `common:export` |
| "插件管理" | `common:plugins` |
| "设置" | `common:settings` |
| "创建新项目" | `common:createProject` |
| "选择项目" | `common:selectProject` |
| "暂无项目" | `common:noProjects` |
| "未选择项目" | `common:noProjectSelected` |
| "当前项目" | `common:currentProject` |
| "Version" | `env:version` |
| "Status" | `env:status` |
| "CUDA" | `env:cuda` |
| "Installed" | `env:installed` |
| "Actions" | `common:actions` |
| "Dashboard" | `common:dashboard` |
| "Datasets" | `dataset:title` |
| "Import Dataset" | `dataset:import` |
| "Training Setup" | `training:setup` |
| "Training Monitor" | `training:monitor` |
| "Settings" | `common:settings` |

---

## Estimated Change Scope

- **New files**: ~18 (i18n JSONs × 14, Python scripts × 4, docs × 1, components × 3, stores × 1)
- **Modified files**: ~18 (routes × 6, commands × 3, Cargo.toml, package.json, requirements.txt, db/queries.rs, db/migrate.rs, App.tsx, main.tsx, venv.rs)
- **Total**: ~35-40 files
