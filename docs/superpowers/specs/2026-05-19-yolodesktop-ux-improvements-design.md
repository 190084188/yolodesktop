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

## Module 2: YOLO Environment (Points 1–3)

### GPU Diagnostics (Point 3)
1. Before install, show configuration dialog with CPU/GPU radio
2. GPU path: run diagnostics via `nvidia-smi` + Python script using `torch.cuda.is_available()` + `nvidia-ml-py`
3. Diagnostic results: driver version, CUDA version, cuDNN version, VRAM info
4. Pass → recommend GPU install with matched CUDA index URL
5. Fail → diagnostic report listing missing items + install guide links
6. CPU path: install CPU-only PyTorch

### Install Progress (Point 1)
- pip flag: `--progress-bar on`
- Rust parses stderr progress lines, emits `env:progress` event with percent
- Frontend: Ant Design `Progress` (percent bar) + live log stream
- Error state: show error details + retry suggestion

### Open YOLO Folder (Point 2)
- Use existing `tauri-plugin-opener` (already in Cargo.toml) to open folder: `opener::open(path)`
- Each env row has "Open Folder" button
- Install completion notice includes "Open Folder" link
- Cross-platform: Windows Explorer, macOS Finder, Linux xdg-open handled by opener plugin

### New/Modified Files
- `src-tauri/src/commands/env.rs` — add GPU diagnostic command, device param
- `src-tauri/src/python/venv.rs` — `get_cuda_diagnostics()`
- `src/routes/env-manager.tsx` — rewrite UI: install dialog, progress bar, open button
- `python/check_gpu.py` — standalone GPU diagnostic script

---

## Module 3: Dataset Hub (Points 5–7)

### Multi-Source Dataset Search (Point 5)
- New Rust commands: `search_datasets`, `check_connectivity`
- **API Key Requirements**:
  - Kaggle: requires API key (username + key), configurable in Settings; stored in SQLite settings table
  - HuggingFace: public search works without token; rate-limited; optional token for higher limits
  - Roboflow: public datasets accessible without key; private/workspace datasets need API key
- Search flow:
  1. `kagglehub.dataset_search(keyword)` → Kaggle results (requires kaggle auth set up)
  2. `HfApi().list_datasets(search=keyword)` → HuggingFace results
  3. `roboflow.workspace().search(keyword)` → Roboflow results
- UI: keyword input + source multi-select + optional filters (task type, format)
- Results: card list with name, description, sample count, source badge, copy-link button
- Connectivity: Rust `reqwest` HEAD requests → green/yellow/red status indicators

### Global Dataset Folder (Point 6)
- Settings page: "Dataset Root Directory" config field, stored in SQLite settings table
- New Rust command: `scan_dataset_folders(root_path)`
  - Scan first-level subdirectories
  - Auto-detect format: YOLO (`data.yaml` + `images/` + `labels/`), COCO (`annotations/instances_*.json`), VOC (`Annotations/` + `JPEGImages/`)
- Dataset list page: "Refresh" button triggers re-scan
- Scanned datasets can be imported to current project

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
- `src-tauri/src/commands/dataset.rs` — `search_datasets`, `check_connectivity`, `scan_dataset_folders`, settings CRUD
- `src-tauri/Cargo.toml` — add `reqwest`
- `src/routes/dataset-list.tsx` — rewrite: search, scan results, refresh, format docs
- `src/routes/settings.tsx` — dataset root dir config, API key entries (Kaggle, HuggingFace, Roboflow)
- `python/search_datasets.py` — multi-source search
- `python/scan_folders.py` — format detection
- `python/download_test_dataset.py` — test dataset download
- `docs/dataset-formats.md` — format specification
- `src-tauri/src/db/queries.rs` — add settings table queries (get_setting, set_setting)

---

## Module 4: Training Experience (Points 4, 9, 10)

### BaseModel Scanning (Point 4)
- New Rust command: `scan_models(env_id)` — scans `~/.cache/ultralytics/` and venv site-packages for `.pt` files
- Returns: filename, size, last modified
- Dropdown shows scan results; empty state: "未检测到已安装的 YOLO 模型"
- Also supports manual model name input (ultralytics auto-downloads)

### Parameter Editor (Point 9)
- Extract ~80 params from `ultralytics/cfg/default.yaml`, split into 3 groups:
  - **Basic** (always visible): `epochs`, `batch`, `imgsz`, `device`, `workers`
  - **Advanced** (collapsible panel, ~20 params): optimizer, lr/lrf, momentum, weight_decay, warmup, augmentation series
  - **Full** (modal, all ~80 params): categorized list view
- Each param has `QuestionCircleOutlined` tooltip icon with Chinese description
- YAML editor preserved with **two-way binding**:
  - Form changes → update YAML content in real-time
  - YAML edits → parse and backfill form fields (invalid YAML: red highlight, no block)
- "Restore Default YAML" button → reset to `default.yaml` defaults

### Real-Time Dashboard (Point 10)
- Existing ECharts chart enhanced:
  - Add `mAP50-95`, `Precision`, `Recall` curves
  - `dataZoom` for zoom/drag, legend toggle
- New stat card row: Current Epoch, Best mAP50, GPU utilization/VRAM (via `nvidia-ml-py`), estimated remaining time
- Auto-annotate Best Epoch marker on chart at training completion
- `python/train.py` enhanced: per-epoch `METRICS:{...}` JSON with precision, recall, mAP, GPU info

### New/Modified Files
- `src-tauri/src/commands/training.rs` — add `scan_models`, pass `device` param
- `src/routes/training-setup.tsx` — rewrite parameter editor, collapsible panels, tooltips, YAML binding
- `src/routes/training-monitor.tsx` — enhanced dashboard, stat cards
- `python/train.py` — enhanced metrics output, GPU monitoring
- `python/scan_models.py` — model cache scanner
- `src/components/model-selector.tsx` — model dropdown with scan + manual input

---

## Module 5: Polish

- Complete i18n coverage audit (all pages, all components)
- Edge case testing: no Python, no network, no GPU, empty datasets, invalid YAML
- Integration smoke test: full flow (install YOLO → import dataset → train → export)

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

- **New files**: ~12 (i18n JSONs, Python scripts, docs, components)
- **Modified files**: ~15 (routes, commands, Cargo.toml, package.json, requirements.txt)
- **Total**: ~25-30 files
