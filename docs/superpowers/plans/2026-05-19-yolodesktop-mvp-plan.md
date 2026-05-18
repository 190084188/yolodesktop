# YoloDesktop MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an end-to-end Yolo training desktop app: environment setup → dataset import → training with live monitoring → read-only model graph viewer → ONNX export, with pluggable annotation tools.

**Architecture:** Tauri 2.0 app with React/TypeScript frontend (Ant Design), Rust backend (Python process management, file sandbox, SQLite via rusqlite), and Python engine (Yolo v8/v11, dataset conversion, ONNX export). Rust ↔ Python via stdout pipes, Rust ↔ Frontend via Tauri commands + events.

**Tech Stack:** Tauri 2.0, React 18, TypeScript, Ant Design 5, React Router 6, Zustand, TanStack Query, ECharts, React Flow, CodeMirror 6, rusqlite, serde, tokio

---

## File Structure

```
D:\YoloDesktop\
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── capabilities/
│   │   └── default.json
│   ├── icons/
│   │   └── icon.png
│   └── src/
│       ├── main.rs              # Tauri entry, state setup, command registration
│       ├── lib.rs               # Re-exports
│       ├── commands/
│       │   ├── mod.rs
│       │   ├── env.rs           # install_yolo, list_envs, check_prereqs
│       │   ├── dataset.rs       # import_dataset, list_datasets, get_dataset
│       │   ├── training.rs      # start_training, stop_training, get_checkpoints
│       │   ├── export.rs        # export_onnx, get_exported_models
│       │   ├── plugins.rs       # list_plugins, install_plugin, remove_plugin
│       │   └── workspace.rs     # create_project, list_projects, delete_project
│       ├── python/
│       │   ├── mod.rs
│       │   ├── manager.rs       # PythonProcess: spawn, read_stdout, kill
│       │   └── venv.rs          # create_venv, detect_python, pip_install
│       ├── db/
│       │   ├── mod.rs
│       │   ├── migrate.rs       # Schema creation, migrations
│       │   └── queries.rs       # Typed query functions per table
│       ├── parser/
│       │   ├── mod.rs
│       │   └── model_config.rs  # YOLO .yaml model config → JSON graph
│       └── errors.rs            # AppError enum, serde-compatible
├── python/
│   ├── requirements.txt
│   ├── train.py                 # Training entry: parse args, run, emit metrics
│   ├── convert_dataset.py       # COCO/YOLO/VOC → normalized YOLO format
│   ├── export_onnx.py           # YOLO checkpoint → ONNX
│   └── plugins/
│       └── annotation/
│           ├── labelme/
│           │   ├── manifest.json
│           │   └── launcher.py
│           └── labelimg/
│               ├── manifest.json
│               └── launcher.py
├── src/
│   ├── main.tsx                 # React entry, providers
│   ├── App.tsx                  # Router + AppShell
│   ├── vite-env.d.ts
│   ├── routes/
│   │   ├── dashboard.tsx
│   │   ├── env-manager.tsx
│   │   ├── dataset-list.tsx
│   │   ├── dataset-detail.tsx
│   │   ├── training-setup.tsx
│   │   ├── training-monitor.tsx
│   │   ├── model-viewer.tsx
│   │   ├── export-manager.tsx
│   │   ├── plugin-manager.tsx
│   │   └── settings.tsx
│   ├── components/
│   │   ├── app-shell.tsx        # Ant Layout: Sider + Header + Content
│   │   ├── log-streamer.tsx     # Scrollable terminal log with ANSI colors
│   │   ├── progress-overlay.tsx # Modal with progress bar + cancel button
│   │   ├── error-banner.tsx     # Alert with friendly message + copy traceback
│   │   ├── yaml-editor.tsx      # CodeMirror 6 wrapper, YAML syntax
│   │   └── model-graph/
│   │       ├── index.tsx        # React Flow wrapper
│   │       ├── custom-node.tsx  # Colored node by layer type
│   │       └── detail-panel.tsx # Click node → parameter drawer
│   ├── stores/
│   │   ├── workspace-store.ts   # Zustand: active project, project list
│   │   └── training-store.ts    # Zustand: metrics[], logLines[], status
│   ├── hooks/
│   │   └── use-invoke.ts        # Typed wrapper around @tauri-apps/api invoke
│   └── lib/
│       ├── query-client.ts      # TanStack QueryClient config
│       ├── antd-theme.ts        # Dark/light theme tokens
│       └── format-converters.ts # COCO↔YOLO↔VOC format detection (frontend helpers)
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── index.html
└── .gitignore
```

---

### Task 1: Initialize Tauri 2.0 + React + TypeScript Project

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `.gitignore`
- Create: `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/build.rs`, `src-tauri/capabilities/default.json`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`

- [ ] **Step 1: Scaffold frontend with Vite**

```bash
cd /d/YoloDesktop
npm create vite@latest . -- --template react-ts --yes 2>/dev/null || true
```

- [ ] **Step 2: Install frontend dependencies**

```bash
cd /d/YoloDesktop
npm install
npm install antd @ant-design/icons react-router-dom zustand @tanstack/react-query echarts echarts-for-react @xyflow/react @codemirror/view @codemirror/state @codemirror/lang-yaml @codemirror/theme-one-dark @tauri-apps/api @tauri-apps/plugin-opener
npm install -D @types/react @types/react-dom
```

- [ ] **Step 3: Configure vite.config.ts**

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
```

- [ ] **Step 4: Configure package.json scripts**

```json
{
  "name": "yolodesktop",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  }
}
```

- [ ] **Step 5: Configure TypeScript**

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2021",
    "useDefineForClassFields": true,
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

```json
// tsconfig.node.json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 6: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="/icon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>YoloDesktop</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create .gitignore**

```gitignore
node_modules/
dist/
src-tauri/target/
.vite/
*.log
.env
.env.local
*.pyc
__pycache__/
.DS_Store
```

- [ ] **Step 8: Initialize Tauri Rust backend**

Create `src-tauri/Cargo.toml`:

```toml
[package]
name = "yolodesktop"
version = "0.1.0"
description = "Yolo Training Desktop App"
authors = ["190084188"]
edition = "2021"

[lib]
name = "yolodesktop_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled"] }
tokio = { version = "1", features = ["full"] }
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4"] }
glob = "0.3"
which = "6"
regex = "1"
```

Create `src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build()
}
```

Create `src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/nicehu/tauri/dev/crates/tauri-cli/schema.json",
  "productName": "YoloDesktop",
  "version": "0.1.0",
  "identifier": "com.yolodesktop.app",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "title": "YoloDesktop",
    "windows": [
      {
        "title": "YoloDesktop",
        "width": 1400,
        "height": 900,
        "minWidth": 1024,
        "minHeight": 680,
        "resizable": true,
        "decorations": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "plugins": {
    "opener": {
      "open": true
    }
  }
}
```

Create `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "core:window:allow-close",
    "core:window:allow-set-title",
    "core:window:allow-minimize",
    "core:window:allow-maximize",
    "core:window:allow-unmaximize"
  ]
}
```

- [ ] **Step 9: Create minimal Rust entry files**

`src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    yolodesktop_lib::run()
}
```

`src-tauri/src/lib.rs`:

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 10: Create minimal React entry**

`src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`src/App.tsx`:

```tsx
import { ConfigProvider, theme, App as AntApp } from "antd";
import { useState } from "react";

function App() {
  const [isDark, setIsDark] = useState(true);

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { colorPrimary: "#1677ff" },
      }}
    >
      <AntApp>
        <div style={{ padding: 24 }}>
          <h1>YoloDesktop</h1>
          <p>Loading...</p>
        </div>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
```

- [ ] **Step 11: Verify the scaffold builds**

```bash
cd /d/YoloDesktop
npm install
cd src-tauri && cargo check
```

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: scaffold Tauri 2.0 + React + TypeScript project"
```

---

### Task 2: Rust Error Types, DB Schema, and State

**Files:**
- Create: `src-tauri/src/errors.rs`
- Create: `src-tauri/src/db/mod.rs`, `src-tauri/src/db/migrate.rs`, `src-tauri/src/db/queries.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create error types**

`src-tauri/src/errors.rs`:

```rust
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Python not found: {0}")]
    PythonNotFound(String),
    #[error("CUDA not detected")]
    CudaNotFound,
    #[error("Command failed: {0}")]
    CommandFailed(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Already exists: {0}")]
    AlreadyExists(String),
    #[error("{0}")]
    Generic(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
```

- [ ] **Step 2: Create DB module with schema**

`src-tauri/src/db/mod.rs`:

```rust
pub mod migrate;
pub mod queries;

use rusqlite::Connection;
use std::sync::Mutex;

pub struct DbState {
    pub conn: Mutex<Connection>,
}

impl DbState {
    pub fn new(db_path: &str) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}
```

- [ ] **Step 3: Create migration**

`src-tauri/src/db/migrate.rs`:

```rust
use rusqlite::Connection;

pub fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            path TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS yolo_envs (
            id TEXT PRIMARY KEY,
            version TEXT NOT NULL,
            venv_path TEXT NOT NULL UNIQUE,
            python_path TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'not_installed',
            cuda_available INTEGER NOT NULL DEFAULT 0,
            installed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS datasets (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL,
            format TEXT NOT NULL,
            image_count INTEGER NOT NULL DEFAULT 0,
            class_count INTEGER NOT NULL DEFAULT 0,
            classes_json TEXT NOT NULL DEFAULT '[]',
            path TEXT NOT NULL,
            imported_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS training_runs (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            dataset_id TEXT NOT NULL,
            env_id TEXT NOT NULL,
            config_yaml TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'idle',
            started_at TEXT,
            ended_at TEXT,
            best_map50 REAL,
            best_epoch INTEGER,
            checkpoint_dir TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS checkpoints (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            epoch INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            loss REAL,
            map50 REAL,
            map50_95 REAL,
            file_size INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (run_id) REFERENCES training_runs(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS exported_models (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            checkpoint_id TEXT,
            format TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER,
            exported_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (run_id) REFERENCES training_runs(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS annotation_plugins (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            version TEXT NOT NULL,
            formats_json TEXT NOT NULL DEFAULT '[]',
            launcher_path TEXT NOT NULL,
            is_installed INTEGER NOT NULL DEFAULT 1,
            installed_at TEXT NOT NULL DEFAULT (datetime('now'))
        );"
    )
}
```

- [ ] **Step 4: Create query functions skeleton**

`src-tauri/src/db/queries.rs`:

```rust
use crate::db::DbState;
use crate::errors::{AppError, AppResult};
use rusqlite::params;

// ---- Projects ----

pub fn create_project(state: &DbState, id: &str, name: &str, path: &str) -> AppResult<()> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO projects (id, name, path) VALUES (?1, ?2, ?3)",
        params![id, name, path],
    )?;
    Ok(())
}

pub fn list_projects(state: &DbState) -> AppResult<Vec<ProjectRow>> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, name, path, created_at, updated_at FROM projects ORDER BY updated_at DESC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(ProjectRow {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn delete_project(state: &DbState, id: &str) -> AppResult<()> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
    Ok(())
}

// Row types
#[derive(Debug, Clone, serde::Serialize)]
pub struct ProjectRow {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: String,
    pub updated_at: String,
}

// ---- Yolo Envs ----

#[derive(Debug, Clone, serde::Serialize)]
pub struct YoloEnvRow {
    pub id: String,
    pub version: String,
    pub venv_path: String,
    pub python_path: String,
    pub status: String,
    pub cuda_available: bool,
    pub installed_at: Option<String>,
}

pub fn create_env(state: &DbState, id: &str, version: &str, venv_path: &str, python_path: &str) -> AppResult<()> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO yolo_envs (id, version, venv_path, python_path, status) VALUES (?1, ?2, ?3, ?4, 'installing')",
        params![id, version, venv_path, python_path],
    )?;
    Ok(())
}

pub fn update_env_status(state: &DbState, id: &str, status: &str, cuda: bool) -> AppResult<()> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE yolo_envs SET status = ?1, cuda_available = ?2, installed_at = datetime('now') WHERE id = ?3",
        params![status, cuda as i32, id],
    )?;
    Ok(())
}

pub fn list_envs(state: &DbState) -> AppResult<Vec<YoloEnvRow>> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, version, venv_path, python_path, status, cuda_available, installed_at FROM yolo_envs ORDER BY version"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(YoloEnvRow {
            id: row.get(0)?,
            version: row.get(1)?,
            venv_path: row.get(2)?,
            python_path: row.get(3)?,
            status: row.get(4)?,
            cuda_available: row.get::<_, i32>(5)? != 0,
            installed_at: row.get(6)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn get_env(state: &DbState, id: &str) -> AppResult<YoloEnvRow> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, version, venv_path, python_path, status, cuda_available, installed_at FROM yolo_envs WHERE id = ?1"
    )?;
    let row = stmt.query_row(params![id], |row| {
        Ok(YoloEnvRow {
            id: row.get(0)?,
            version: row.get(1)?,
            venv_path: row.get(2)?,
            python_path: row.get(3)?,
            status: row.get(4)?,
            cuda_available: row.get::<_, i32>(5)? != 0,
            installed_at: row.get(6)?,
        })
    })?;
    Ok(row)
}

pub fn delete_env(state: &DbState, id: &str) -> AppResult<()> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM yolo_envs WHERE id = ?1", params![id])?;
    Ok(())
}

// ---- Datasets ----

#[derive(Debug, Clone, serde::Serialize)]
pub struct DatasetRow {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub format: String,
    pub image_count: i32,
    pub class_count: i32,
    pub classes_json: String,
    pub path: String,
    pub imported_at: String,
}

pub fn create_dataset(state: &DbState, row: &DatasetRow) -> AppResult<()> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO datasets (id, project_id, name, format, image_count, class_count, classes_json, path)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![row.id, row.project_id, row.name, row.format, row.image_count, row.class_count, row.classes_json, row.path],
    )?;
    Ok(())
}

pub fn list_datasets(state: &DbState, project_id: &str) -> AppResult<Vec<DatasetRow>> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, format, image_count, class_count, classes_json, path, imported_at FROM datasets WHERE project_id = ?1 ORDER BY imported_at DESC"
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(DatasetRow {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            format: row.get(3)?,
            image_count: row.get(4)?,
            class_count: row.get(5)?,
            classes_json: row.get(6)?,
            path: row.get(7)?,
            imported_at: row.get(8)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn get_dataset(state: &DbState, id: &str) -> AppResult<DatasetRow> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, format, image_count, class_count, classes_json, path, imported_at FROM datasets WHERE id = ?1"
    )?;
    let row = stmt.query_row(params![id], |row| {
        Ok(DatasetRow {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            format: row.get(3)?,
            image_count: row.get(4)?,
            class_count: row.get(5)?,
            classes_json: row.get(6)?,
            path: row.get(7)?,
            imported_at: row.get(8)?,
        })
    })?;
    Ok(row)
}

pub fn delete_dataset(state: &DbState, id: &str) -> AppResult<()> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM datasets WHERE id = ?1", params![id])?;
    Ok(())
}

// ---- Training Runs ----

#[derive(Debug, Clone, serde::Serialize)]
pub struct TrainingRunRow {
    pub id: String,
    pub project_id: String,
    pub dataset_id: String,
    pub env_id: String,
    pub config_yaml: String,
    pub status: String,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub best_map50: Option<f64>,
    pub best_epoch: Option<i32>,
    pub checkpoint_dir: Option<String>,
}

pub fn create_training_run(state: &DbState, row: &TrainingRunRow) -> AppResult<()> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO training_runs (id, project_id, dataset_id, env_id, config_yaml, status, started_at, checkpoint_dir)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'), ?7)",
        params![row.id, row.project_id, row.dataset_id, row.env_id, row.config_yaml, "running", row.checkpoint_dir],
    )?;
    Ok(())
}

pub fn update_training_status(state: &DbState, id: &str, status: &str) -> AppResult<()> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE training_runs SET status = ?1, ended_at = CASE WHEN ?1 IN ('completed', 'stopped', 'error') THEN datetime('now') ELSE ended_at END WHERE id = ?2",
        params![status, id],
    )?;
    Ok(())
}

pub fn update_best_metrics(state: &DbState, id: &str, map50: f64, epoch: i32) -> AppResult<()> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "UPDATE training_runs SET best_map50 = MAX(COALESCE(best_map50, 0), ?1), best_epoch = ?2 WHERE id = ?3",
        params![map50, epoch, id],
    )?;
    Ok(())
}

pub fn list_training_runs(state: &DbState, project_id: &str) -> AppResult<Vec<TrainingRunRow>> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, project_id, dataset_id, env_id, config_yaml, status, started_at, ended_at, best_map50, best_epoch, checkpoint_dir
         FROM training_runs WHERE project_id = ?1 ORDER BY started_at DESC"
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(TrainingRunRow {
            id: row.get(0)?,
            project_id: row.get(1)?,
            dataset_id: row.get(2)?,
            env_id: row.get(3)?,
            config_yaml: row.get(4)?,
            status: row.get(5)?,
            started_at: row.get(6)?,
            ended_at: row.get(7)?,
            best_map50: row.get(8)?,
            best_epoch: row.get(9)?,
            checkpoint_dir: row.get(10)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn get_training_run(state: &DbState, id: &str) -> AppResult<TrainingRunRow> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, project_id, dataset_id, env_id, config_yaml, status, started_at, ended_at, best_map50, best_epoch, checkpoint_dir
         FROM training_runs WHERE id = ?1"
    )?;
    let row = stmt.query_row(params![id], |row| {
        Ok(TrainingRunRow {
            id: row.get(0)?,
            project_id: row.get(1)?,
            dataset_id: row.get(2)?,
            env_id: row.get(3)?,
            config_yaml: row.get(4)?,
            status: row.get(5)?,
            started_at: row.get(6)?,
            ended_at: row.get(7)?,
            best_map50: row.get(8)?,
            best_epoch: row.get(9)?,
            checkpoint_dir: row.get(10)?,
        })
    })?;
    Ok(row)
}

// ---- Checkpoints ----

#[derive(Debug, Clone, serde::Serialize)]
pub struct CheckpointRow {
    pub id: String,
    pub run_id: String,
    pub epoch: i32,
    pub file_path: String,
    pub loss: Option<f64>,
    pub map50: Option<f64>,
    pub map50_95: Option<f64>,
    pub file_size: Option<i64>,
    pub created_at: String,
}

pub fn create_checkpoint(state: &DbState, row: &CheckpointRow) -> AppResult<()> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO checkpoints (id, run_id, epoch, file_path, loss, map50, map50_95, file_size)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![row.id, row.run_id, row.epoch, row.file_path, row.loss, row.map50, row.map50_95, row.file_size],
    )?;
    Ok(())
}

pub fn list_checkpoints(state: &DbState, run_id: &str) -> AppResult<Vec<CheckpointRow>> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, run_id, epoch, file_path, loss, map50, map50_95, file_size, created_at
         FROM checkpoints WHERE run_id = ?1 ORDER BY epoch"
    )?;
    let rows = stmt.query_map(params![run_id], |row| {
        Ok(CheckpointRow {
            id: row.get(0)?,
            run_id: row.get(1)?,
            epoch: row.get(2)?,
            file_path: row.get(3)?,
            loss: row.get(4)?,
            map50: row.get(5)?,
            map50_95: row.get(6)?,
            file_size: row.get(7)?,
            created_at: row.get(8)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

// ---- Exported Models ----

#[derive(Debug, Clone, serde::Serialize)]
pub struct ExportedModelRow {
    pub id: String,
    pub run_id: String,
    pub checkpoint_id: Option<String>,
    pub format: String,
    pub file_path: String,
    pub file_size: Option<i64>,
    pub exported_at: String,
}

pub fn create_exported_model(state: &DbState, row: &ExportedModelRow) -> AppResult<()> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO exported_models (id, run_id, checkpoint_id, format, file_path, file_size)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![row.id, row.run_id, row.checkpoint_id, row.format, row.file_path, row.file_size],
    )?;
    Ok(())
}

pub fn list_exported_models(state: &DbState, run_id: &str) -> AppResult<Vec<ExportedModelRow>> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, run_id, checkpoint_id, format, file_path, file_size, exported_at
         FROM exported_models WHERE run_id = ?1 ORDER BY exported_at DESC"
    )?;
    let rows = stmt.query_map(params![run_id], |row| {
        Ok(ExportedModelRow {
            id: row.get(0)?,
            run_id: row.get(1)?,
            checkpoint_id: row.get(2)?,
            format: row.get(3)?,
            file_path: row.get(4)?,
            file_size: row.get(5)?,
            exported_at: row.get(6)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

// ---- Annotation Plugins ----

#[derive(Debug, Clone, serde::Serialize)]
pub struct PluginRow {
    pub id: String,
    pub name: String,
    pub version: String,
    pub formats_json: String,
    pub launcher_path: String,
    pub is_installed: bool,
    pub installed_at: String,
}

pub fn create_plugin(state: &DbState, row: &PluginRow) -> AppResult<()> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO annotation_plugins (id, name, version, formats_json, launcher_path, is_installed)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![row.id, row.name, row.version, row.formats_json, row.launcher_path, row.is_installed as i32],
    )?;
    Ok(())
}

pub fn list_plugins(state: &DbState) -> AppResult<Vec<PluginRow>> {
    let conn = state.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, name, version, formats_json, launcher_path, is_installed, installed_at
         FROM annotation_plugins ORDER BY name"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(PluginRow {
            id: row.get(0)?,
            name: row.get(1)?,
            version: row.get(2)?,
            formats_json: row.get(3)?,
            launcher_path: row.get(4)?,
            is_installed: row.get::<_, i32>(5)? != 0,
            installed_at: row.get(6)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn delete_plugin(state: &DbState, id: &str) -> AppResult<()> {
    let conn = state.conn.lock().unwrap();
    conn.execute("DELETE FROM annotation_plugins WHERE id = ?1", params![id])?;
    Ok(())
}
```

- [ ] **Step 5: Update lib.rs to initialize DB**

```rust
// src-tauri/src/lib.rs
mod commands;
mod db;
mod errors;
mod parser;
mod python;

use db::{migrate, DbState};

pub fn run() {
    let app_dir = dirs_next().unwrap_or_else(|| std::path::PathBuf::from("."));
    std::fs::create_dir_all(&app_dir).ok();
    let db_path = app_dir.join("yolodesktop.db");

    let db_state = DbState::new(db_path.to_str().unwrap())
        .expect("Failed to open database");
    {
        let conn = db_state.conn.lock().unwrap();
        migrate::run_migrations(&conn).expect("Failed to run migrations");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(db_state)
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Add `dirs-next = "2"` to Cargo.toml dependencies.

- [ ] **Step 6: Build and verify**

```bash
cd /d/YoloDesktop/src-tauri && cargo check
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add error types, DB schema, and query functions"
```

---

### Task 3: Python Process Manager and Venv Manager

**Files:**
- Create: `src-tauri/src/python/mod.rs`, `src-tauri/src/python/manager.rs`, `src-tauri/src/python/venv.rs`
- Create: `python/requirements.txt`
- Create: `python/train.py`, `python/convert_dataset.py`, `python/export_onnx.py`

- [ ] **Step 1: Create Python module definition**

`src-tauri/src/python/mod.rs`:

```rust
pub mod manager;
pub mod venv;
```

- [ ] **Step 2: Create process manager**

`src-tauri/src/python/manager.rs`:

```rust
use crate::errors::{AppError, AppResult};
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::sync::mpsc::{self, Sender};
use tokio::sync::broadcast;

pub struct PythonProcess {
    child: Mutex<Option<Child>>,
    cancel_tx: Mutex<Option<Sender<()>>>,
}

impl PythonProcess {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            cancel_tx: Mutex::new(None),
        }
    }

    pub fn spawn<F>(
        &self,
        python_path: &str,
        script_path: &str,
        args: &[&str],
        on_line: F,
    ) -> AppResult<()>
    where
        F: Fn(&str) + Send + 'static,
    {
        let mut child = Command::new(python_path)
            .arg(script_path)
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| AppError::CommandFailed(format!("Failed to spawn Python: {}", e)))?;

        let stdout = child.stdout.take()
            .ok_or_else(|| AppError::CommandFailed("No stdout".into()))?;

        let (cancel_tx, cancel_rx) = mpsc::channel::<()>();

        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                // Check for cancel signal
                if cancel_rx.try_recv().is_ok() {
                    break;
                }
                if let Ok(line) = line {
                    on_line(&line);
                }
            }
        });

        *self.child.lock().unwrap() = Some(child);
        *self.cancel_tx.lock().unwrap() = Some(cancel_tx);
        Ok(())
    }

    pub fn kill(&self) -> AppResult<()> {
        if let Some(ref mut child) = *self.child.lock().unwrap() {
            child.kill()
                .map_err(|e| AppError::CommandFailed(format!("Failed to kill process: {}", e)))?;
            child.wait().ok();
        }
        Ok(())
    }

    pub fn is_running(&self) -> bool {
        self.child.lock().unwrap()
            .as_mut()
            .map(|c| c.try_wait().ok().flatten().is_none())
            .unwrap_or(false)
    }
}
```

- [ ] **Step 3: Create venv manager**

`src-tauri/src/python/venv.rs`:

```rust
use crate::errors::{AppError, AppResult};
use std::path::PathBuf;
use std::process::Command;

pub struct VenvManager {
    base_dir: PathBuf,
}

impl VenvManager {
    pub fn new(base_dir: PathBuf) -> Self {
        Self { base_dir }
    }

    pub fn detect_system_python() -> AppResult<String> {
        // Try python3 first, then python
        for name in &["python3", "python"] {
            if let Ok(output) = Command::new(name).arg("--version").output() {
                if output.status.success() {
                    let version = String::from_utf8_lossy(&output.stdout);
                    if version.contains("3.") {
                        return Ok(name.to_string());
                    }
                }
            }
        }
        Err(AppError::PythonNotFound(
            "Python 3.9+ not found. Install Python and add it to PATH.".into(),
        ))
    }

    pub fn get_python_version(python: &str) -> AppResult<String> {
        let output = Command::new(python)
            .arg("--version")
            .output()
            .map_err(|_| AppError::PythonNotFound(format!("{} not found", python)))?;
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    pub fn detect_cuda() -> bool {
        // Check nvidia-smi
        if let Ok(output) = Command::new("nvidia-smi").output() {
            return output.status.success();
        }
        // Check for CUDA_PATH env var
        std::env::var("CUDA_PATH").is_ok()
            || std::env::var("CUDA_HOME").is_ok()
    }

    pub fn venv_path(&self, version: &str) -> PathBuf {
        self.base_dir.join(format!("yolo-{}", version))
    }

    pub fn create_venv(&self, version: &str) -> AppResult<String> {
        let python = Self::detect_system_python()?;
        let venv_dir = self.venv_path(version);

        if venv_dir.exists() {
            return Err(AppError::AlreadyExists(format!(
                "Environment for {} already exists at {:?}",
                version, venv_dir
            )));
        }

        let output = Command::new(&python)
            .args(["-m", "venv", venv_dir.to_str().unwrap()])
            .output()
            .map_err(|e| AppError::CommandFailed(format!("venv creation failed: {}", e)))?;

        if !output.status.success() {
            return Err(AppError::CommandFailed(
                String::from_utf8_lossy(&output.stderr).to_string(),
            ));
        }

        Ok(self.get_python_in_venv(&venv_dir))
    }

    pub fn get_python_in_venv(&self, venv_dir: &PathBuf) -> String {
        #[cfg(target_os = "windows")]
        let python_path = venv_dir.join("Scripts").join("python.exe");
        #[cfg(not(target_os = "windows"))]
        let python_path = venv_dir.join("bin").join("python");

        python_path.to_str().unwrap().to_string()
    }

    pub fn pip_install(
        python_path: &str,
        packages: &[&str],
        on_line: impl Fn(&str) + Send + 'static,
    ) -> AppResult<()> {
        use crate::python::manager::PythonProcess;

        let proc = PythonProcess::new();
        // pip install --quiet uses stdout for progress, stderr for errors
        let result = proc.spawn(
            python_path,
            "-m",
            &{
                let mut args = vec!["pip", "install", "--quiet"];
                args.extend(packages);
                args
            },
            on_line,
        );

        // We need to wait for pip to finish - for now just check if spawn worked
        result
    }

    pub fn remove_venv(&self, version: &str) -> AppResult<()> {
        let venv_dir = self.venv_path(version);
        if venv_dir.exists() {
            std::fs::remove_dir_all(&venv_dir)?;
        }
        Ok(())
    }
}
```

- [ ] **Step 4: Create Python scripts**

`python/requirements.txt`:

```
ultralytics>=8.0.0
torch>=2.0.0
torchvision>=0.15.0
onnx>=1.14.0
opencv-python>=4.8.0
pyyaml>=6.0
numpy>=1.24.0
pillow>=9.5.0
```

`python/train.py`:

```python
"""Yolo training script called by Rust backend. Emits metrics per epoch on stdout."""
import sys
import json
import argparse
from pathlib import Path
from ultralytics import YOLO


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, help="Path to training YAML config")
    parser.add_argument("--model", default="yolov8n.pt", help="Starting model/weights")
    parser.add_argument("--project", required=True, help="Output directory for checkpoints")
    parser.add_argument("--name", default="train", help="Experiment name")
    args = parser.parse_args()

    config_path = Path(args.config)
    if not config_path.exists():
        print(f"ERROR: config not found: {args.config}", file=sys.stderr)
        sys.exit(1)

    model = YOLO(args.model)

    # Override callback to emit metrics
    def on_train_epoch_end(trainer):
        metrics = trainer.metrics
        epoch = trainer.epoch + 1
        output = {
            "type": "metrics",
            "epoch": epoch,
            "loss": round(float(metrics.get("box_loss", 0)), 6),
            "cls_loss": round(float(metrics.get("cls_loss", 0)), 6),
            "dfl_loss": round(float(metrics.get("dfl_loss", 0)), 6),
        }
        # Validation metrics if available
        if hasattr(trainer, "validator") and trainer.validator is not None:
            val_metrics = trainer.validator.metrics
            output["map50"] = round(float(val_metrics.get("metrics/mAP50(B)", 0)), 6)
            output["map50_95"] = round(float(val_metrics.get("metrics/mAP50-95(B)", 0)), 6)
            output["precision"] = round(float(val_metrics.get("metrics/precision(B)", 0)), 6)
            output["recall"] = round(float(val_metrics.get("metrics/recall(B)", 0)), 6)
        print(f"METRICS:{json.dumps(output)}", flush=True)

    def on_fit_epoch_end(trainer):
        on_train_epoch_end(trainer)

    model.add_callback("on_fit_epoch_end", on_fit_epoch_end)

    results = model.train(
        data=args.config,
        project=args.project,
        name=args.name,
        exist_ok=True,
    )

    # Final metrics
    final = {
        "type": "complete",
        "best_map50": round(float(results.results_dict.get("metrics/mAP50(B)", 0)), 6),
        "best_map50_95": round(float(results.results_dict.get("metrics/mAP50-95(B)", 0)), 6),
    }
    print(f"METRICS:{json.dumps(final)}", flush=True)


if __name__ == "__main__":
    main()
```

`python/convert_dataset.py`:

```python
"""Convert COCO/VOC/YOLO datasets to normalized YOLO format."""
import sys
import json
import argparse
from pathlib import Path
from collections import defaultdict


def detect_format(input_dir: Path) -> str:
    """Detect dataset format by examining directory structure."""
    # YOLO format: images/ + labels/ with .txt files
    if (input_dir / "labels").exists() and list((input_dir / "labels").glob("*.txt")):
        return "yolo"
    # COCO: single JSON with "images" and "annotations" keys
    for f in input_dir.glob("*.json"):
        try:
            data = json.loads(f.read_text())
            if "images" in data and "annotations" in data:
                return "coco"
        except (json.JSONDecodeError, KeyError):
            continue
    # VOC: .xml annotation files
    ann_dir = input_dir / "Annotations"
    if ann_dir.exists() and list(ann_dir.glob("*.xml")):
        return "voc"
    return "unknown"


def get_stats(input_dir: Path, fmt: str) -> dict:
    """Collect dataset statistics."""
    stats = {
        "format": fmt,
        "image_count": 0,
        "class_names": [],
        "class_counts": {},
    }

    if fmt == "yolo":
        images_dir = input_dir / "images"
        labels_dir = input_dir / "labels"
        if images_dir.exists():
            stats["image_count"] = len([f for f in images_dir.glob("*") if f.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp"}])
        # Read classes from data.yaml if exists
        yaml_path = input_dir / "data.yaml"
        if yaml_path.exists():
            import yaml
            with open(yaml_path) as f:
                data = yaml.safe_load(f)
                stats["class_names"] = data.get("names", [])
        # Count labels per class
        if labels_dir.exists():
            counts = defaultdict(int)
            for label_file in labels_dir.glob("*.txt"):
                for line in label_file.read_text().strip().split("\n"):
                    if line.strip():
                        class_id = int(line.split()[0])
                        counts[class_id] += 1
            stats["class_counts"] = dict(counts)

    elif fmt == "coco":
        for f in input_dir.glob("*.json"):
            try:
                data = json.loads(f.read_text())
                if "images" in data:
                    stats["image_count"] = len(data["images"])
                    cats = {c["id"]: c["name"] for c in data.get("categories", [])}
                    stats["class_names"] = list(cats.values())
                    counts = defaultdict(int)
                    for ann in data.get("annotations", []):
                        counts[cats.get(ann["category_id"], str(ann["category_id"]))] += 1
                    stats["class_counts"] = dict(counts)
                    break
            except (json.JSONDecodeError, KeyError):
                continue

    elif fmt == "voc":
        ann_dir = input_dir / "Annotations"
        if ann_dir.exists():
            import xml.etree.ElementTree as ET
            stats["image_count"] = len(list(ann_dir.glob("*.xml")))
            name_counts = defaultdict(int)
            for xml_file in ann_dir.glob("*.xml"):
                tree = ET.parse(xml_file)
                for obj in tree.findall(".//object"):
                    name = obj.find("name")
                    if name is not None and name.text:
                        name_counts[name.text] += 1
            stats["class_names"] = list(name_counts.keys())
            stats["class_counts"] = dict(name_counts)

    return stats


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Input dataset directory")
    parser.add_argument("--output", required=True, help="Output directory for normalized dataset")
    parser.add_argument("--command", default="detect", choices=["detect", "stats"],
                        help="detect format or stats")
    args = parser.parse_args()

    input_dir = Path(args.input)

    if not input_dir.exists():
        print(f"ERROR: directory not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    fmt = detect_format(input_dir)

    if args.command == "detect":
        print(f"FORMAT:{fmt}", flush=True)
    elif args.command == "stats":
        stats = get_stats(input_dir, fmt)
        print(f"STATS:{json.dumps(stats)}", flush=True)


if __name__ == "__main__":
    main()
```

`python/export_onnx.py`:

```python
"""Export YOLO checkpoint to ONNX format."""
import sys
import argparse
from pathlib import Path
from ultralytics import YOLO


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", required=True, help="Path to .pt checkpoint")
    parser.add_argument("--output", required=True, help="Output directory")
    parser.add_argument("--imgsz", type=int, default=640, help="Image size")
    parser.add_argument("--simplify", action="store_true", default=True, help="Simplify ONNX model")
    parser.add_argument("--opset", type=int, default=12, help="ONNX opset version")
    args = parser.parse_args()

    weights_path = Path(args.weights)
    if not weights_path.exists():
        print(f"ERROR: weights not found: {args.weights}", file=sys.stderr)
        sys.exit(1)

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    model = YOLO(str(weights_path))
    export_path = model.export(
        format="onnx",
        imgsz=args.imgsz,
        simplify=args.simplify,
        opset=args.opset,
    )

    print(f"EXPORTED:{export_path}", flush=True)


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Python process manager, venv manager, and Python scripts"
```

---

### Task 4: Frontend Core — App Shell, Routing, State Stores

**Files:**
- Create: `src/main.tsx`, `src/App.tsx`
- Create: `src/lib/query-client.ts`, `src/lib/antd-theme.ts`
- Create: `src/stores/workspace-store.ts`, `src/stores/training-store.ts`
- Create: `src/hooks/use-invoke.ts`
- Create: `src/components/app-shell.tsx`
- Create: `src/routes/dashboard.tsx`, `src/routes/settings.tsx`

- [ ] **Step 1: Create QueryClient config**

`src/lib/query-client.ts`:

```typescript
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
```

- [ ] **Step 2: Create theme config**

`src/lib/antd-theme.ts`:

```typescript
import type { ThemeConfig } from "antd";

export const darkTheme: ThemeConfig = {
  algorithm: undefined, // set dynamically via ConfigProvider
  token: {
    colorPrimary: "#1677ff",
    borderRadius: 6,
    colorBgContainer: "#141414",
    colorBgElevated: "#1f1f1f",
  },
};

export const lightTheme: ThemeConfig = {
  token: {
    colorPrimary: "#1677ff",
    borderRadius: 6,
  },
};
```

- [ ] **Step 3: Create stores**

`src/stores/workspace-store.ts`:

```typescript
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
      activeProject:
        state.activeProject?.id === id ? null : state.activeProject,
    })),
}));
```

`src/stores/training-store.ts`:

```typescript
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
  setActiveRun: (runId) => set({ activeRunId: runId, metrics: [], logLines: [], status: "idle" }),
  setStatus: (status) => set({ status }),
  appendMetrics: (m) =>
    set((state) => ({ metrics: [...state.metrics, m] })),
  appendLog: (line) =>
    set((state) => ({ logLines: [...state.logLines, line] })),
  clearRun: () =>
    set({ activeRunId: null, status: "idle", metrics: [], logLines: [] }),
}));
```

- [ ] **Step 4: Create typed invoke wrapper**

`src/hooks/use-invoke.ts`:

```typescript
import { invoke } from "@tauri-apps/api/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";

export function useInvokeQuery<T>(
  key: string[],
  command: string,
  args?: Record<string, unknown>
) {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => invoke<T>(command, args),
  });
}

export function useInvokeMutation<T, V = void>(
  command: string,
  options?: {
    invalidateKeys?: string[][];
    onSuccess?: (data: T) => void;
  }
) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  return useMutation<T, string, Record<string, unknown>>({
    mutationFn: (args) => invoke<T>(command, args),
    onSuccess: (data) => {
      if (options?.invalidateKeys) {
        for (const key of options.invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }
      options?.onSuccess?.(data);
    },
    onError: (err) => {
      message.error(err);
    },
  });
}
```

- [ ] **Step 5: Create AppShell**

`src/components/app-shell.tsx`:

```tsx
import { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Layout, Menu, Select, Button, Typography, theme as antTheme } from "antd";
import {
  DashboardOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  ApartmentOutlined,
  ExportOutlined,
  AppstoreOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SunOutlined,
  MoonOutlined,
} from "@ant-design/icons";
import { useWorkspaceStore } from "../stores/workspace-store";

const { Sider, Header, Content } = Layout;

interface AppShellProps {
  isDark: boolean;
  onToggleTheme: () => void;
}

export default function AppShell({ isDark, onToggleTheme }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { activeProject, projects, setActiveProject } = useWorkspaceStore();
  const { token } = antTheme.useToken();

  const menuItems = [
    { key: "/", icon: <DashboardOutlined />, label: "Dashboard" },
    { key: "/env", icon: <CloudServerOutlined />, label: "Environments" },
    { key: "/datasets", icon: <DatabaseOutlined />, label: "Datasets" },
    { key: "/train", icon: <ExperimentOutlined />, label: "Training" },
    { key: "/models", icon: <ApartmentOutlined />, label: "Model Graph" },
    { key: "/export", icon: <ExportOutlined />, label: "Export" },
    { key: "/plugins", icon: <AppstoreOutlined />, label: "Plugins" },
    { key: "/settings", icon: <SettingOutlined />, label: "Settings" },
  ];

  const selectedKey = "/" + location.pathname.split("/")[1];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={240}
        style={{
          borderRight: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorBgElevated,
        }}
      >
        <div style={{
          padding: collapsed ? "16px 8px" : "16px",
          textAlign: "center",
        }}>
          <Typography.Title level={4} style={{ margin: 0, color: token.colorPrimary }}>
            {collapsed ? "YD" : "YoloDesktop"}
          </Typography.Title>
        </div>

        {!collapsed && (
          <div style={{ padding: "0 16px 12px" }}>
            <Select
              style={{ width: "100%" }}
              placeholder="Select project"
              value={activeProject?.id}
              onChange={(id) => {
                const project = projects.find((p) => p.id === id);
                setActiveProject(project ?? null);
              }}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
          </div>
        )}

        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ background: "transparent", borderRight: 0 }}
        />
      </Sider>

      <Layout>
        <Header style={{
          padding: "0 16px",
          background: token.colorBgContainer,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <Button
            type="text"
            icon={isDark ? <SunOutlined /> : <MoonOutlined />}
            onClick={onToggleTheme}
          />
        </Header>

        <Content style={{
          margin: 16,
          padding: 24,
          background: token.colorBgContainer,
          borderRadius: token.borderRadius,
          overflow: "auto",
          minHeight: 280,
        }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
```

- [ ] **Step 6: Create main entry and App**

`src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { App as AntApp } from "antd";
import { queryClient } from "./lib/query-client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AntApp>
          <App />
        </AntApp>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
```

`src/App.tsx`:

```tsx
import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { ConfigProvider, theme } from "antd";
import AppShell from "./components/app-shell";
import Dashboard from "./routes/dashboard";
import EnvManager from "./routes/env-manager";
import DatasetList from "./routes/dataset-list";
import DatasetDetail from "./routes/dataset-detail";
import TrainingSetup from "./routes/training-setup";
import TrainingMonitor from "./routes/training-monitor";
import ModelViewer from "./routes/model-viewer";
import ExportManager from "./routes/export-manager";
import PluginManager from "./routes/plugin-manager";
import Settings from "./routes/settings";

export default function App() {
  const [isDark, setIsDark] = useState(true);

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: { colorPrimary: "#1677ff" },
      }}
    >
      <Routes>
        <Route element={<AppShell isDark={isDark} onToggleTheme={() => setIsDark(!isDark)} />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/env" element={<EnvManager />} />
          <Route path="/datasets" element={<DatasetList />} />
          <Route path="/datasets/:id" element={<DatasetDetail />} />
          <Route path="/train" element={<TrainingSetup />} />
          <Route path="/train/:runId" element={<TrainingMonitor />} />
          <Route path="/models" element={<ModelViewer />} />
          <Route path="/export" element={<ExportManager />} />
          <Route path="/plugins" element={<PluginManager />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </ConfigProvider>
  );
}
```

- [ ] **Step 7: Create Dashboard placeholder**

`src/routes/dashboard.tsx`:

```tsx
import { Card, Col, Row, Statistic, Typography } from "antd";
import { ExperimentOutlined, DatabaseOutlined, CloudServerOutlined, ExportOutlined } from "@ant-design/icons";

export default function Dashboard() {
  return (
    <div>
      <Typography.Title level={3}>Dashboard</Typography.Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="Environments" value={0} prefix={<CloudServerOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="Datasets" value={0} prefix={<DatabaseOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="Training Runs" value={0} prefix={<ExperimentOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="Exported Models" value={0} prefix={<ExportOutlined />} /></Card>
        </Col>
      </Row>
    </div>
  );
}
```

- [ ] **Step 8: Create Settings placeholder**

`src/routes/settings.tsx`:

```tsx
import { Card, Form, Input, Button, Switch, Typography, Divider } from "antd";

export default function Settings() {
  return (
    <div>
      <Typography.Title level={3}>Settings</Typography.Title>
      <Card style={{ maxWidth: 600 }}>
        <Form layout="vertical">
          <Form.Item label="Workspace Directory" help="Base directory for projects and data">
            <Input placeholder="~/yolodesktop-workspace" />
          </Form.Item>
          <Form.Item label="Python Path" help="Override system Python detection">
            <Input placeholder="Auto-detected" />
          </Form.Item>
          <Divider />
          <Form.Item label="Auto-start TensorBoard">
            <Switch />
          </Form.Item>
          <Form.Item label="Check for updates on startup">
            <Switch defaultChecked />
          </Form.Item>
          <Button type="primary" htmlType="submit">Save Settings</Button>
        </Form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 9: Create placeholder pages for remaining routes**

Create minimal placeholder files for each route. Each exports a default component rendering the page title. Create:

- `src/routes/env-manager.tsx` — `<Typography.Title>Environments</Typography.Title>`
- `src/routes/dataset-list.tsx` — `<Typography.Title>Datasets</Typography.Title>`
- `src/routes/dataset-detail.tsx` — `<Typography.Title>Dataset Detail</Typography.Title>`
- `src/routes/training-setup.tsx` — `<Typography.Title>Training Setup</Typography.Title>`
- `src/routes/training-monitor.tsx` — `<Typography.Title>Training Monitor</Typography.Title>`
- `src/routes/model-viewer.tsx` — `<Typography.Title>Model Graph</Typography.Title>`
- `src/routes/export-manager.tsx` — `<Typography.Title>Export</Typography.Title>`
- `src/routes/plugin-manager.tsx` — `<Typography.Title>Plugins</Typography.Title>`

- [ ] **Step 10: Build and verify — frontend compiles**

```bash
cd /d/YoloDesktop && npx tsc --noEmit
```

- [ ] **Step 11: Verify Rust still compiles**

```bash
cd /d/YoloDesktop/src-tauri && cargo check
```

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: add AppShell, routing, stores, and route placeholders"
```

---

### Task 5: Environment Management — Rust Commands + Frontend

**Files:**
- Create: `src-tauri/src/commands/mod.rs`, `src-tauri/src/commands/env.rs`
- Modify: `src-tauri/src/lib.rs` (register commands)
- Create: `src/components/log-streamer.tsx`, `src/components/progress-overlay.tsx`
- Rewrite: `src/routes/env-manager.tsx`

- [ ] **Step 1: Create commands module**

`src-tauri/src/commands/mod.rs`:

```rust
pub mod env;
pub mod dataset;
pub mod training;
pub mod export;
pub mod plugins;
pub mod workspace;
```

- [ ] **Step 2: Create env commands**

`src-tauri/src/commands/env.rs`:

```rust
use crate::db::{queries, DbState};
use crate::errors::{AppError, AppResult};
use crate::python::venv::VenvManager;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct PrereqCheck {
    pub python_found: bool,
    pub python_version: String,
    pub cuda_available: bool,
}

#[tauri::command]
pub async fn check_prereqs() -> Result<PrereqCheck, AppError> {
    let python_found = VenvManager::detect_system_python().is_ok();
    let python_version = VenvManager::detect_system_python()
        .and_then(|p| VenvManager::get_python_version(&p))
        .unwrap_or_else(|_| "Not found".into());
    let cuda_available = VenvManager::detect_cuda();
    Ok(PrereqCheck {
        python_found,
        python_version,
        cuda_available,
    })
}

#[tauri::command]
pub async fn install_yolo(
    app: AppHandle,
    state: State<'_, DbState>,
    version: String,
) -> Result<String, AppError> {
    let id = Uuid::new_v4().to_string();
    let base_dir = dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("yolodesktop")
        .join("envs");
    std::fs::create_dir_all(&base_dir)?;

    let vm = VenvManager::new(base_dir);
    let venv_path = vm.venv_path(&version);

    // Create venv
    app.emit("env:log", format!("Creating virtual environment for YOLO {}...", version)).ok();
    let python_path = vm.create_venv(&version)?;

    // Save to DB
    queries::create_env(&state, &id, &version, venv_path.to_str().unwrap(), &python_path)?;

    // Install packages
    let packages = vec!["ultralytics", "torch", "torchvision", "onnx", "opencv-python", "pyyaml"];
    let app_handle = app.clone();
    let python_path_clone = python_path.clone();

    tokio::task::spawn_blocking(move || {
        let mut child = std::process::Command::new(&python_path_clone)
            .args(["-m", "pip", "install", "--quiet"])
            .args(&packages)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| AppError::CommandFailed(format!("pip failed: {}", e)))?;

        use std::io::BufRead;
        if let Some(stdout) = child.stdout.take() {
            let reader = std::io::BufReader::new(stdout);
            for line in reader.lines().flatten() {
                app_handle.emit("env:log", &line).ok();
            }
        }

        let status = child.wait()?;
        if !status.success() {
            return Err::<(), AppError>(AppError::CommandFailed("pip install failed".into()));
        }
        Ok(())
    }).await.map_err(|e| AppError::CommandFailed(format!("Join error: {:?}", e)))??;

    // Update DB
    let cuda = VenvManager::detect_cuda();
    queries::update_env_status(&state, &id, "installed", cuda)?;

    app.emit("env:log", format!("YOLO {} installed successfully!", version)).ok();
    Ok(id)
}

#[tauri::command]
pub async fn list_envs(state: State<'_, DbState>) -> Result<Vec<queries::YoloEnvRow>, AppError> {
    queries::list_envs(&state)
}

#[tauri::command]
pub async fn delete_env(
    state: State<'_, DbState>,
    id: String,
) -> Result<(), AppError> {
    let env = queries::get_env(&state, &id)?;
    let vm = VenvManager::new(std::path::PathBuf::from(&env.venv_path).parent().unwrap().to_path_buf());
    // Extract version from path or use stored version
    let version = std::path::Path::new(&env.venv_path)
        .file_name()
        .and_then(|n| n.to_str())
        .and_then(|n| n.strip_prefix("yolo-"))
        .unwrap_or(&env.version);
    vm.remove_venv(version)?;
    queries::delete_env(&state, &id)?;
    Ok(())
}
```

- [ ] **Step 3: Register commands in lib.rs**

Update `src-tauri/src/lib.rs` — add imports and register commands:

```rust
use commands::{env, dataset, training, export, plugins, workspace};

// In the Builder chain, update invoke_handler:
.invoke_handler(tauri::generate_handler![
    env::check_prereqs,
    env::install_yolo,
    env::list_envs,
    env::delete_env,
])
```

- [ ] **Step 4: Create shared UI components**

`src/components/log-streamer.tsx`:

```tsx
import { useEffect, useRef } from "react";

interface LogStreamerProps {
  lines: string[];
  maxLines?: number;
}

export default function LogStreamer({ lines, maxLines = 500 }: LogStreamerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayLines = lines.slice(-maxLines);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displayLines]);

  return (
    <div
      ref={containerRef}
      style={{
        height: 300,
        overflow: "auto",
        background: "#1a1a2e",
        color: "#e0e0e0",
        fontFamily: "'Cascadia Code', 'Fira Code', monospace",
        fontSize: 12,
        padding: 12,
        borderRadius: 4,
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
      }}
    >
      {displayLines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
}
```

`src/components/progress-overlay.tsx`:

```tsx
import { Modal, Progress, Button, Space } from "antd";

interface ProgressOverlayProps {
  open: boolean;
  title: string;
  percent?: number;
  status?: "active" | "success" | "exception";
  message?: string;
  onCancel?: () => void;
  cancelText?: string;
}

export default function ProgressOverlay({
  open,
  title,
  percent = 0,
  status = "active",
  message,
  onCancel,
  cancelText = "Cancel",
}: ProgressOverlayProps) {
  return (
    <Modal
      open={open}
      title={title}
      footer={null}
      closable={false}
      maskClosable={false}
    >
      <Progress percent={percent} status={status} />
      {message && <p style={{ marginTop: 12 }}>{message}</p>}
      {onCancel && (
        <Space style={{ marginTop: 16, justifyContent: "flex-end", width: "100%" }}>
          <Button danger onClick={onCancel}>{cancelText}</Button>
        </Space>
      )}
    </Modal>
  );
}
```

- [ ] **Step 5: Build EnvManager page**

`src/routes/env-manager.tsx`:

```tsx
import { useState } from "react";
import {
  Card, Button, Table, Tag, Space, Typography, Alert, Descriptions,
} from "antd";
import { PlusOutlined, DeleteOutlined, CheckCircleOutlined, SyncOutlined } from "@ant-design/icons";
import { useInvokeQuery, useInvokeMutation } from "../hooks/use-invoke";

interface YoloEnv {
  id: string;
  version: string;
  venv_path: string;
  python_path: string;
  status: string;
  cuda_available: boolean;
  installed_at: string | null;
}

interface PrereqCheck {
  python_found: boolean;
  python_version: string;
  cuda_available: boolean;
}

const YOLO_VERSIONS = ["8", "11"];

export default function EnvManager() {
  const [installing, setInstalling] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const { data: prereqs, isLoading: prereqLoading } = useInvokeQuery<PrereqCheck>(
    ["prereqs"], "check_prereqs"
  );

  const { data: envs = [], isLoading: envsLoading } = useInvokeQuery<YoloEnv[]>(
    ["envs"], "list_envs"
  );

  const installMutation = useInvokeMutation<string>("install_yolo", {
    invalidateKeys: [["envs"]],
    onSuccess: () => setInstalling(null),
  });

  const deleteMutation = useInvokeMutation<void>("delete_env", {
    invalidateKeys: [["envs"]],
  });

  const handleInstall = (version: string) => {
    setInstalling(version);
    setLogs([]);
    installMutation.mutate({ version });
  };

  const columns = [
    {
      title: "Version",
      dataIndex: "version",
      key: "version",
      render: (v: string) => <Tag color="blue">YOLO v{v}</Tag>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (s: string) => {
        const color = s === "installed" ? "green" : s === "installing" ? "processing" : "default";
        const icon = s === "installed" ? <CheckCircleOutlined /> : s === "installing" ? <SyncOutlined spin /> : null;
        return <Tag color={color} icon={icon}>{s}</Tag>;
      },
    },
    {
      title: "CUDA",
      dataIndex: "cuda_available",
      key: "cuda",
      render: (v: boolean) => v ? <Tag color="green">Available</Tag> : <Tag>CPU Only</Tag>,
    },
    {
      title: "Installed",
      dataIndex: "installed_at",
      key: "installed_at",
      render: (v: string | null) => v ?? "—",
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: unknown, record: YoloEnv) => (
        <Button
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => deleteMutation.mutate({ id: record.id })}
          loading={deleteMutation.isPending}
        />
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={3}>Environment Manager</Typography.Title>

      {!prereqLoading && prereqs && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={3} size="small">
            <Descriptions.Item label="Python">
              {prereqs.python_found
                ? <Tag color="green">{prereqs.python_version}</Tag>
                : <Tag color="red">Not Found</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="CUDA">
              {prereqs.cuda_available
                ? <Tag color="green">Available</Tag>
                : <Tag>Not Detected</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="Available Versions">
              {YOLO_VERSIONS.map(v => (
                <Button
                  key={v}
                  size="small"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => handleInstall(v)}
                  loading={installing === v}
                  disabled={installing !== null || envs.some(e => e.version === v && e.status === "installed")}
                  style={{ marginRight: 8 }}
                >
                  Install v{v}
                </Button>
              ))}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {installing && (
        <Card size="small" title={`Installing YOLO v${installing}...`} style={{ marginBottom: 16 }}>
          <div style={{ height: 200, overflow: "auto", background: "#1a1a2e", color: "#e0e0e0", fontFamily: "monospace", fontSize: 12, padding: 8, borderRadius: 4 }}>
            {logs.length === 0 && <div>Starting installation...</div>}
            {logs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </Card>
      )}

      <Card>
        <Table
          dataSource={envs}
          columns={columns}
          rowKey="id"
          loading={envsLoading}
          pagination={false}
        />
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Fix env commands — add missing dirs_next dependency**

Add `dirs-next = "2"` to `src-tauri/Cargo.toml` dependencies (if not already done in Task 2).

- [ ] **Step 7: Build and fix compiler errors**

```bash
cd /d/YoloDesktop/src-tauri && cargo check 2>&1
```

Fix any compilation errors from the new code.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add environment management Rust commands and frontend"
```

---

### Task 6: Dataset Management — Import, Convert, Preview

**Files:**
- Create: `src-tauri/src/commands/dataset.rs`
- Rewrite: `src/routes/dataset-list.tsx`
- Rewrite: `src/routes/dataset-detail.tsx`
- Modify: `src-tauri/src/lib.rs` (register dataset commands)
- Create: `src/lib/format-converters.ts`

- [ ] **Step 1: Create dataset Rust commands**

`src-tauri/src/commands/dataset.rs`:

```rust
use crate::db::{queries, DbState};
use crate::errors::AppError;
use crate::python::venv::VenvManager;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct DatasetStats {
    pub format: String,
    pub image_count: i32,
    pub class_names: Vec<String>,
    pub class_counts: std::collections::HashMap<String, i32>,
}

#[tauri::command]
pub async fn detect_dataset_format(path: String) -> Result<String, AppError> {
    let python = VenvManager::detect_system_python()?;
    let script = std::env::current_dir()
        .unwrap()
        .join("../python/convert_dataset.py");

    let output = std::process::Command::new(&python)
        .arg(script.to_str().unwrap())
        .args(["--input", &path, "--command", "detect"])
        .output()
        .map_err(|e| AppError::CommandFailed(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if let Some(fmt) = line.strip_prefix("FORMAT:") {
            return Ok(fmt.trim().to_string());
        }
    }
    Ok("unknown".to_string())
}

#[tauri::command]
pub async fn get_dataset_stats(path: String) -> Result<DatasetStats, AppError> {
    let python = VenvManager::detect_system_python()?;
    let script = std::env::current_dir()
        .unwrap()
        .join("../python/convert_dataset.py");

    let output = std::process::Command::new(&python)
        .arg(script.to_str().unwrap())
        .args(["--input", &path, "--command", "stats"])
        .output()
        .map_err(|e| AppError::CommandFailed(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if let Some(json_str) = line.strip_prefix("STATS:") {
            let parsed: serde_json::Value = serde_json::from_str(json_str.trim())?;
            let class_counts: std::collections::HashMap<String, i32> = parsed["class_counts"]
                .as_object()
                .map(|obj| {
                    obj.iter()
                        .map(|(k, v)| (k.clone(), v.as_i64().unwrap_or(0) as i32))
                        .collect()
                })
                .unwrap_or_default();

            return Ok(DatasetStats {
                format: parsed["format"].as_str().unwrap_or("unknown").to_string(),
                image_count: parsed["image_count"].as_i64().unwrap_or(0) as i32,
                class_names: parsed["class_names"]
                    .as_array()
                    .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                    .unwrap_or_default(),
                class_counts,
            });
        }
    }
    Err(AppError::CommandFailed("Failed to parse dataset stats".into()))
}

#[tauri::command]
pub async fn import_dataset(
    app: AppHandle,
    state: State<'_, DbState>,
    project_id: String,
    name: String,
    source_path: String,
) -> Result<String, AppError> {
    let id = Uuid::new_v4().to_string();

    app.emit("dataset:log", format!("Detecting format for {}...", name)).ok();
    let format = detect_dataset_format(source_path.clone()).await?;

    app.emit("dataset:log", format!("Detected format: {}", format)).ok();
    let stats = get_dataset_stats(source_path.clone()).await?;

    // Copy dataset to workspace
    let workspace_dir = dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("yolodesktop")
        .join("datasets")
        .join(&id);
    std::fs::create_dir_all(&workspace_dir)?;

    // Copy files
    app.emit("dataset:log", "Copying dataset files...").ok();
    copy_dir_recursive(&std::path::PathBuf::from(&source_path), &workspace_dir)?;

    let classes_json = serde_json::to_string(&stats.class_names)?;

    let row = queries::DatasetRow {
        id: id.clone(),
        project_id,
        name,
        format,
        image_count: stats.image_count,
        class_count: stats.class_names.len() as i32,
        classes_json,
        path: workspace_dir.to_str().unwrap().to_string(),
        imported_at: String::new(),
    };
    queries::create_dataset(&state, &row)?;

    app.emit("dataset:log", "Import complete!").ok();
    Ok(id)
}

#[tauri::command]
pub async fn list_datasets(
    state: State<'_, DbState>,
    project_id: String,
) -> Result<Vec<queries::DatasetRow>, AppError> {
    queries::list_datasets(&state, &project_id)
}

#[tauri::command]
pub async fn get_dataset(
    state: State<'_, DbState>,
    id: String,
) -> Result<queries::DatasetRow, AppError> {
    queries::get_dataset(&state, &id)
}

#[tauri::command]
pub async fn delete_dataset(
    state: State<'_, DbState>,
    id: String,
) -> Result<(), AppError> {
    let ds = queries::get_dataset(&state, &id)?;
    let path = std::path::PathBuf::from(&ds.path);
    if path.exists() {
        std::fs::remove_dir_all(&path)?;
    }
    queries::delete_dataset(&state, &id)?;
    Ok(())
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), AppError> {
    if !dst.exists() {
        std::fs::create_dir_all(dst)?;
    }
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dest = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &dest)?;
        } else {
            std::fs::copy(entry.path(), &dest).ok();
        }
    }
    Ok(())
}
```

- [ ] **Step 2: Register dataset commands in lib.rs**

Add to the `generate_handler!` macro:
```rust
dataset::detect_dataset_format,
dataset::get_dataset_stats,
dataset::import_dataset,
dataset::list_datasets,
dataset::get_dataset,
dataset::delete_dataset,
```

- [ ] **Step 3: Create format converters helper**

`src/lib/format-converters.ts`:

```typescript
export const FORMAT_LABELS: Record<string, string> = {
  coco: "COCO JSON",
  yolo: "YOLO (txt)",
  voc: "VOC (xml)",
  unknown: "Unknown",
};

export const FORMAT_COLORS: Record<string, string> = {
  coco: "blue",
  yolo: "green",
  voc: "orange",
  unknown: "default",
};
```

- [ ] **Step 4: Build DatasetList page**

`src/routes/dataset-list.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, Button, Table, Tag, Typography, Modal, Input, Space, Upload,
} from "antd";
import { PlusOutlined, DeleteOutlined, EyeOutlined, InboxOutlined } from "@ant-design/icons";
import { useInvokeQuery, useInvokeMutation } from "../hooks/use-invoke";
import { useWorkspaceStore } from "../stores/workspace-store";
import { FORMAT_LABELS, FORMAT_COLORS } from "../lib/format-converters";
import LogStreamer from "../components/log-streamer";

interface Dataset {
  id: string;
  project_id: string;
  name: string;
  format: string;
  image_count: number;
  class_count: number;
  classes_json: string;
  path: string;
  imported_at: string;
}

export default function DatasetList() {
  const navigate = useNavigate();
  const { activeProject } = useWorkspaceStore();
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importName, setImportName] = useState("");
  const [importPath, setImportPath] = useState("");
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  const { data: datasets = [], isLoading } = useInvokeQuery<Dataset[]>(
    ["datasets", activeProject?.id ?? ""],
    "list_datasets",
    { project_id: activeProject?.id ?? "" },
    { enabled: !!activeProject }
  );

  const importMutation = useInvokeMutation<string>("import_dataset", {
    invalidateKeys: [["datasets", activeProject?.id ?? ""]],
    onSuccess: () => {
      setImporting(false);
      setImportModalOpen(false);
      setImportName("");
      setImportPath("");
    },
  });

  const deleteMutation = useInvokeMutation<void>("delete_dataset", {
    invalidateKeys: [["datasets", activeProject?.id ?? ""]],
  });

  const handleImport = () => {
    if (!activeProject || !importPath) return;
    setImporting(true);
    setImportLogs([]);
    importMutation.mutate({
      project_id: activeProject.id,
      name: importName || importPath.split(/[/\\]/).pop() || "dataset",
      source_path: importPath,
    });
  };

  const columns = [
    { title: "Name", dataIndex: "name", key: "name" },
    {
      title: "Format",
      dataIndex: "format",
      key: "format",
      render: (f: string) => <Tag color={FORMAT_COLORS[f] || "default"}>{FORMAT_LABELS[f] || f}</Tag>,
    },
    { title: "Images", dataIndex: "image_count", key: "image_count" },
    { title: "Classes", dataIndex: "class_count", key: "class_count" },
    {
      title: "Imported",
      dataIndex: "imported_at",
      key: "imported_at",
      render: (v: string) => v ? new Date(v).toLocaleDateString() : "—",
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: unknown, record: Dataset) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/datasets/${record.id}`)}>
            View
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />}
            onClick={() => deleteMutation.mutate({ id: record.id })} />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>Datasets</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setImportModalOpen(true)}
          disabled={!activeProject}>
          Import Dataset
        </Button>
      </div>

      {!activeProject && (
        <Alert message="Create or select a project first" type="info" style={{ marginBottom: 16 }} />
      )}

      <Card>
        <Table dataSource={datasets} columns={columns} rowKey="id" loading={isLoading} pagination={false} />
      </Card>

      <Modal
        title="Import Dataset"
        open={importModalOpen}
        onOk={handleImport}
        onCancel={() => setImportModalOpen(false)}
        confirmLoading={importing}
        okText="Import"
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input
            placeholder="Dataset name (optional)"
            value={importName}
            onChange={(e) => setImportName(e.target.value)}
          />
          <Input
            placeholder="Path to dataset directory"
            value={importPath}
            onChange={(e) => setImportPath(e.target.value)}
          />
          {importing && <LogStreamer lines={importLogs} />}
        </Space>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 5: Build DatasetDetail page**

`src/routes/dataset-detail.tsx`:

```tsx
import { useParams, useNavigate } from "react-router-dom";
import { Card, Descriptions, Tag, Table, Button, Typography, Spin } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useInvokeQuery } from "../hooks/use-invoke";
import { FORMAT_LABELS, FORMAT_COLORS } from "../lib/format-converters";

interface DatasetDetailData {
  id: string;
  project_id: string;
  name: string;
  format: string;
  image_count: number;
  class_count: number;
  classes_json: string;
  path: string;
  imported_at: string;
}

export default function DatasetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: dataset, isLoading } = useInvokeQuery<DatasetDetailData>(
    ["dataset", id ?? ""],
    "get_dataset",
    { id: id ?? "" },
    { enabled: !!id }
  );

  if (isLoading) return <Spin size="large" style={{ display: "block", margin: "100px auto" }} />;
  if (!dataset) return <Typography.Text type="danger">Dataset not found</Typography.Text>;

  let classNames: string[] = [];
  try { classNames = JSON.parse(dataset.classes_json); } catch {}

  const classColumns = [
    { title: "#", dataIndex: "index", key: "index", render: (_: unknown, __: unknown, i: number) => i + 1 },
    { title: "Class Name", dataIndex: "name", key: "name" },
  ];

  return (
    <div>
      <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/datasets")} style={{ marginBottom: 16 }}>
        Back to Datasets
      </Button>
      <Typography.Title level={3}>{dataset.name}</Typography.Title>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={3}>
          <Descriptions.Item label="Format">
            <Tag color={FORMAT_COLORS[dataset.format]}>{FORMAT_LABELS[dataset.format]}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Images">{dataset.image_count}</Descriptions.Item>
          <Descriptions.Item label="Classes">{dataset.class_count}</Descriptions.Item>
          <Descriptions.Item label="Path">{dataset.path}</Descriptions.Item>
          <Descriptions.Item label="Imported">{new Date(dataset.imported_at).toLocaleString()}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Classes">
        <Table
          dataSource={classNames.map((name) => ({ name }))}
          columns={classColumns}
          rowKey="name"
          pagination={false}
          size="small"
        />
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Build and verify**

```bash
cd /d/YoloDesktop/src-tauri && cargo check 2>&1
cd /d/YoloDesktop && npx tsc --noEmit 2>&1
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add dataset management — import, list, detail, delete"
```

---

### Task 7: Training — Rust Commands + Frontend Setup & Monitor

**Files:**
- Create: `src-tauri/src/commands/training.rs`
- Rewrite: `src/routes/training-setup.tsx`
- Rewrite: `src/routes/training-monitor.tsx`
- Create: `src/components/error-banner.tsx`
- Create: `src/components/yaml-editor.tsx`
- Modify: `src-tauri/src/lib.rs` (register training commands)
- Modify: `src/stores/training-store.ts` (add Tauri event listener)

- [ ] **Step 1: Create training Rust commands**

`src-tauri/src/commands/training.rs`:

```rust
use crate::db::{queries, DbState};
use crate::errors::AppError;
use crate::python::manager::PythonProcess;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;
use std::sync::Mutex;

pub struct TrainingState {
    pub active_process: Mutex<Option<PythonProcess>>,
}

#[tauri::command]
pub async fn start_training(
    app: AppHandle,
    state: State<'_, DbState>,
    training_state: State<'_, TrainingState>,
    project_id: String,
    dataset_id: String,
    env_id: String,
    config_yaml: String,
    model: Option<String>,
) -> Result<String, AppError> {
    let run_id = Uuid::new_v4().to_string();
    let env = queries::get_env(&state, &env_id)?;

    // Generate config file
    let config_dir = dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("yolodesktop")
        .join("runs")
        .join(&run_id);
    std::fs::create_dir_all(&config_dir)?;

    let config_path = config_dir.join("config.yaml");
    std::fs::write(&config_path, &config_yaml)?;

    let checkpoint_dir = config_dir.join("checkpoints");
    std::fs::create_dir_all(&checkpoint_dir)?;

    // Save run to DB
    let row = queries::TrainingRunRow {
        id: run_id.clone(),
        project_id: project_id.clone(),
        dataset_id: dataset_id.clone(),
        env_id,
        config_yaml: config_yaml.clone(),
        status: "running".to_string(),
        started_at: Some(chrono::Utc::now().to_rfc3339()),
        ended_at: None,
        best_map50: None,
        best_epoch: None,
        checkpoint_dir: Some(checkpoint_dir.to_str().unwrap().to_string()),
    };
    queries::create_training_run(&state, &row)?;

    // Get Python script path
    let script = std::env::current_dir()
        .unwrap()
        .join("../python/train.py");

    let model_path = model.unwrap_or_else(|| "yolov8n.pt".to_string());

    // Spawn Python process
    let process = PythonProcess::new();
    let app_handle = app.clone();
    let run_id_clone = run_id.clone();
    let state_clone = state.inner().clone(); // This won't work directly; we need a different approach

    let python_path = env.python_path.clone();
    let config_path_str = config_path.to_str().unwrap().to_string();
    let project_dir = checkpoint_dir.to_str().unwrap().to_string();

    process.spawn(
        &python_path,
        script.to_str().unwrap(),
        &[
            "--config", &config_path_str,
            "--model", &model_path,
            "--project", &project_dir,
            "--name", "train",
        ],
        move |line| {
            // Parse metrics from Python output
            if let Some(json_str) = line.strip_prefix("METRICS:") {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str) {
                    let msg_type = parsed["type"].as_str().unwrap_or("");
                    if msg_type == "metrics" {
                        app_handle.emit("training:metrics", &parsed).ok();
                    } else if msg_type == "complete" {
                        app_handle.emit("training:complete", &parsed).ok();
                    }
                }
            } else if line.contains("ERROR") || line.contains("Traceback") {
                app_handle.emit("training:error", line).ok();
            }
            app_handle.emit("training:log", line).ok();
        },
    )?;

    *training_state.active_process.lock().unwrap() = Some(process);

    Ok(run_id)
}

#[tauri::command]
pub async fn stop_training(
    state: State<'_, DbState>,
    training_state: State<'_, TrainingState>,
    run_id: String,
) -> Result<(), AppError> {
    if let Some(ref proc) = *training_state.active_process.lock().unwrap() {
        proc.kill()?;
    }
    queries::update_training_status(&state, &run_id, "stopped")?;
    Ok(())
}

#[tauri::command]
pub async fn list_training_runs(
    state: State<'_, DbState>,
    project_id: String,
) -> Result<Vec<queries::TrainingRunRow>, AppError> {
    queries::list_training_runs(&state, &project_id)
}

#[tauri::command]
pub async fn get_training_run(
    state: State<'_, DbState>,
    id: String,
) -> Result<queries::TrainingRunRow, AppError> {
    queries::get_training_run(&state, &id)
}

#[tauri::command]
pub async fn list_checkpoints(
    state: State<'_, DbState>,
    run_id: String,
) -> Result<Vec<queries::CheckpointRow>, AppError> {
    queries::list_checkpoints(&state, &run_id)
}
```

- [ ] **Step 2: Register training commands and state in lib.rs**

In `src-tauri/src/lib.rs`, add `TrainingState` to managed state and register commands:

```rust
use commands::training::TrainingState;

// In the Builder chain:
.manage(TrainingState {
    active_process: Mutex::new(None),
})
.invoke_handler(tauri::generate_handler![
    // ... previous commands ...
    training::start_training,
    training::stop_training,
    training::list_training_runs,
    training::get_training_run,
    training::list_checkpoints,
])
```

Also add `chrono` to Cargo.toml if not already present (`chrono = { version = "0.4", features = ["serde"] }`).

- [ ] **Step 3: Create ErrorBanner component**

`src/components/error-banner.tsx`:

```tsx
import { Alert, Button, Space, Typography } from "antd";
import { CopyOutlined } from "@ant-design/icons";

interface ErrorBannerProps {
  message: string;
  suggestion?: string;
  traceback?: string;
  onApplyFix?: () => void;
}

export default function ErrorBanner({ message, suggestion, traceback, onApplyFix }: ErrorBannerProps) {
  const handleCopy = () => {
    if (traceback) navigator.clipboard.writeText(traceback);
  };

  return (
    <Alert
      type="error"
      message={message}
      description={
        <Space direction="vertical" style={{ width: "100%" }}>
          {suggestion && <Typography.Text>{suggestion}</Typography.Text>}
          <Space>
            {onApplyFix && <Button size="small" type="primary" onClick={onApplyFix}>Apply Fix</Button>}
            {traceback && (
              <Button size="small" icon={<CopyOutlined />} onClick={handleCopy}>Copy Details</Button>
            )}
          </Space>
        </Space>
      }
      style={{ marginBottom: 16 }}
      closable
    />
  );
}
```

- [ ] **Step 4: Create YamlEditor component**

`src/components/yaml-editor.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { oneDark } from "@codemirror/theme-one-dark";

interface YamlEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  height?: string;
}

export default function YamlEditor({ value, onChange, readOnly = false, height = "400px" }: YamlEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current || editorRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && onChange) {
        onChange(update.state.doc.toString());
      }
    });

    editorRef.current = new EditorView({
      doc: value,
      extensions: [
        basicSetup,
        yaml(),
        oneDark,
        EditorView.editable.of(!readOnly),
        updateListener,
      ],
      parent: containerRef.current,
    });

    return () => {
      editorRef.current?.destroy();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.state.doc.toString()) {
      const currentPos = editorRef.current.state.selection.main.head;
      editorRef.current.dispatch({
        changes: { from: 0, to: editorRef.current.state.doc.length, insert: value },
        selection: { anchor: Math.min(currentPos, value.length) },
      });
    }
  }, [value]);

  return <div ref={containerRef} style={{ height, overflow: "auto", border: "1px solid #434343", borderRadius: 4 }} />;
}
```

- [ ] **Step 5: Build TrainingSetup page**

`src/routes/training-setup.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, Form, Select, Button, Typography, InputNumber, Slider, Space, Divider, Input,
} from "antd";
import { PlayCircleOutlined } from "@ant-design/icons";
import { useInvokeQuery, useInvokeMutation } from "../hooks/use-invoke";
import { useWorkspaceStore } from "../stores/workspace-store";
import YamlEditor from "../components/yaml-editor";

const DEFAULT_CONFIG = `# YOLO Training Config
path: ./
train: images/train
val: images/val

names:
  0: class_name

# Training parameters
epochs: 100
batch: 16
imgsz: 640
optimizer: AdamW
lr0: 0.001
lrf: 0.01
momentum: 0.937
weight_decay: 0.0005
warmup_epochs: 3
warmup_momentum: 0.8
warmup_bias_lr: 0.1

# Augmentation
hsv_h: 0.015
hsv_s: 0.7
hsv_v: 0.4
degrees: 0.0
translate: 0.1
scale: 0.5
shear: 0.0
perspective: 0.0
flipud: 0.0
fliplr: 0.5
mosaic: 1.0
mixup: 0.0
`;

export default function TrainingSetup() {
  const navigate = useNavigate();
  const { activeProject } = useWorkspaceStore();
  const [yamlContent, setYamlContent] = useState(DEFAULT_CONFIG);
  const [selectedEnv, setSelectedEnv] = useState<string>();
  const [selectedDataset, setSelectedDataset] = useState<string>();
  const [selectedModel, setSelectedModel] = useState("yolov8n.pt");

  const { data: envs = [] } = useInvokeQuery<{ id: string; version: string }[]>(
    ["envs"], "list_envs"
  );
  const { data: datasets = [] } = useInvokeQuery<{ id: string; name: string }[]>(
    ["datasets", activeProject?.id ?? ""], "list_datasets",
    { project_id: activeProject?.id ?? "" },
    { enabled: !!activeProject }
  );

  const startMutation = useInvokeMutation<string>("start_training", {
    invalidateKeys: [["training-runs", activeProject?.id ?? ""]],
    onSuccess: (runId) => {
      navigate(`/train/${runId}`);
    },
  });

  const handleStart = () => {
    if (!activeProject || !selectedEnv || !selectedDataset) return;
    startMutation.mutate({
      project_id: activeProject.id,
      dataset_id: selectedDataset,
      env_id: selectedEnv,
      config_yaml: yamlContent,
      model: selectedModel,
    });
  };

  return (
    <div>
      <Typography.Title level={3}>Training Setup</Typography.Title>

      <Space direction="vertical" style={{ width: "100%" }} size="large">
        <Card title="Configuration Preset" size="small">
          <Form layout="inline">
            <Form.Item label="YOLO Environment">
              <Select
                style={{ width: 200 }}
                placeholder="Select env"
                value={selectedEnv}
                onChange={setSelectedEnv}
                options={envs.filter((e: any) => e.status === "installed").map((e: any) => ({
                  value: e.id, label: `YOLO v${e.version}`,
                }))}
              />
            </Form.Item>
            <Form.Item label="Dataset">
              <Select
                style={{ width: 200 }}
                placeholder="Select dataset"
                value={selectedDataset}
                onChange={setSelectedDataset}
                options={datasets.map((d: any) => ({ value: d.id, label: d.name }))}
              />
            </Form.Item>
            <Form.Item label="Base Model">
              <Select
                style={{ width: 180 }}
                value={selectedModel}
                onChange={setSelectedModel}
                options={[
                  { value: "yolov8n.pt", label: "YOLOv8 Nano" },
                  { value: "yolov8s.pt", label: "YOLOv8 Small" },
                  { value: "yolov8m.pt", label: "YOLOv8 Medium" },
                  { value: "yolov8l.pt", label: "YOLOv8 Large" },
                  { value: "yolov8x.pt", label: "YOLOv8 XLarge" },
                  { value: "yolo11n.pt", label: "YOLO11 Nano" },
                  { value: "yolo11s.pt", label: "YOLO11 Small" },
                  { value: "yolo11m.pt", label: "YOLO11 Medium" },
                  { value: "yolo11l.pt", label: "YOLO11 Large" },
                  { value: "yolo11x.pt", label: "YOLO11 XLarge" },
                ]}
              />
            </Form.Item>
          </Form>
        </Card>

        <Card title="Quick Parameters">
          <Form layout="vertical">
            <Space wrap>
              <Form.Item label="Epochs">
                <InputNumber min={1} max={1000} defaultValue={100} />
              </Form.Item>
              <Form.Item label="Batch Size">
                <InputNumber min={1} max={128} defaultValue={16} />
              </Form.Item>
              <Form.Item label="Image Size">
                <InputNumber min={320} max={1280} step={32} defaultValue={640} />
              </Form.Item>
              <Form.Item label="Learning Rate">
                <InputNumber min={0.0001} max={0.1} step={0.0001} defaultValue={0.001} />
              </Form.Item>
            </Space>
          </Form>
        </Card>

        <Card title="Advanced Config (YAML)">
          <YamlEditor value={yamlContent} onChange={setYamlContent} height="350px" />
        </Card>

        <Button
          type="primary"
          size="large"
          icon={<PlayCircleOutlined />}
          onClick={handleStart}
          loading={startMutation.isPending}
          disabled={!selectedEnv || !selectedDataset || !activeProject}
        >
          Start Training
        </Button>
      </Space>
    </div>
  );
}
```

- [ ] **Step 6: Build TrainingMonitor page**

`src/routes/training-monitor.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Button, Typography, Space, Tag, Row, Col } from "antd";
import { StopOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import * as echarts from "echarts";
import { useInvokeQuery, useInvokeMutation } from "../hooks/use-invoke";
import { useTrainingStore, TrainingMetrics } from "../stores/training-store";
import LogStreamer from "../components/log-streamer";
import ErrorBanner from "../components/error-banner";
import { listen } from "@tauri-apps/api/event";

export default function TrainingMonitor() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  const {
    status, metrics, logLines,
    setActiveRun, setStatus, appendMetrics, appendLog,
  } = useTrainingStore();

  const { data: run } = useInvokeQuery<any>(
    ["training-run", runId ?? ""],
    "get_training_run",
    { id: runId ?? "" },
    { enabled: !!runId }
  );

  const stopMutation = useInvokeMutation<void>("stop_training", {
    onSuccess: () => setStatus("stopped"),
  });

  useEffect(() => {
    if (runId) setActiveRun(runId);
    return () => { setActiveRun(null); };
  }, [runId]);

  // Listen for Tauri events
  useEffect(() => {
    const unlistenMetrics = listen("training:metrics", (event: any) => {
      const data = event.payload as TrainingMetrics & { type: string };
      if (data.type === "metrics") {
        appendMetrics(data);
        setStatus("running");
      } else if (data.type === "complete") {
        setStatus("completed");
      }
    });

    const unlistenLog = listen("training:log", (event: any) => {
      appendLog(event.payload as string);
    });

    const unlistenError = listen("training:error", (event: any) => {
      appendLog(`ERROR: ${event.payload}`);
    });

    const unlistenComplete = listen("training:complete", () => {
      setStatus("completed");
    });

    return () => {
      unlistenMetrics.then(fn => fn());
      unlistenLog.then(fn => fn());
      unlistenError.then(fn => fn());
      unlistenComplete.then(fn => fn());
    };
  }, []);

  // Initialize ECharts
  useEffect(() => {
    if (!chartRef.current) return;
    chartInstance.current = echarts.init(chartRef.current, "dark");
    return () => { chartInstance.current?.dispose(); };
  }, []);

  // Update chart when metrics change
  useEffect(() => {
    if (!chartInstance.current) return;
    const epochs = metrics.map((m) => m.epoch);
    const losses = metrics.map((m) => m.loss);
    const map50s = metrics.map((m) => m.map50 ?? 0);
    const map50_95s = metrics.map((m) => m.map50_95 ?? 0);

    chartInstance.current.setOption({
      tooltip: { trigger: "axis" },
      legend: { data: ["Loss", "mAP50", "mAP50-95"], top: 0, textStyle: { color: "#ccc" } },
      grid: { left: 50, right: 50, top: 40, bottom: 30 },
      xAxis: { type: "category", data: epochs, axisLabel: { color: "#ccc" } },
      yAxis: { type: "value", axisLabel: { color: "#ccc" }, splitLine: { lineStyle: { color: "#333" } } },
      series: [
        { name: "Loss", type: "line", data: losses, smooth: true, symbol: "none",
          lineStyle: { color: "#ff4d4f" } },
        { name: "mAP50", type: "line", data: map50s, smooth: true, symbol: "none",
          lineStyle: { color: "#52c41a" } },
        { name: "mAP50-95", type: "line", data: map50_95s, smooth: true, symbol: "none",
          lineStyle: { color: "#1677ff" } },
      ],
    }, true);
  }, [metrics]);

  const statusColor = status === "running" ? "processing"
    : status === "completed" ? "success"
    : status === "stopped" ? "warning"
    : status === "error" ? "error" : "default";

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/train")}>Back</Button>
        <Typography.Title level={3} style={{ margin: 0 }}>Training Monitor</Typography.Title>
        <Tag color={statusColor}>{status}</Tag>
        {run && <Tag>{run.config_yaml ? "Custom config" : "Default config"}</Tag>}
      </Space>

      {status === "error" && (
        <ErrorBanner
          message="Training encountered an error"
          suggestion="Check the logs below for details. Common issues: missing CUDA drivers, incompatible PyTorch version, or dataset format issues."
          traceback={logLines.filter(l => l.includes("Error") || l.includes("Traceback")).join("\n")}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Training Metrics" size="small">
            <div ref={chartRef} style={{ height: 400 }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card
            title="Latest Metrics"
            size="small"
            extra={
              status === "running" && (
                <Button danger size="small" icon={<StopOutlined />}
                  onClick={() => runId && stopMutation.mutate({ run_id: runId })}>
                  Stop
                </Button>
              )
            }
          >
            {metrics.length > 0 ? (
              <Space direction="vertical" style={{ width: "100%" }}>
                <div>Epoch: {metrics[metrics.length - 1].epoch}</div>
                <div>Loss: {metrics[metrics.length - 1].loss?.toFixed(4)}</div>
                <div>mAP50: {metrics[metrics.length - 1].map50?.toFixed(4) || "—"}</div>
                <div>mAP50-95: {metrics[metrics.length - 1].map50_95?.toFixed(4) || "—"}</div>
              </Space>
            ) : (
              <Typography.Text type="secondary">Waiting for first epoch...</Typography.Text>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Training Logs" size="small" style={{ marginTop: 16 }}>
        <LogStreamer lines={logLines} />
      </Card>
    </div>
  );
}
```

- [ ] **Step 7: Build and fix compilation errors**

```bash
cd /d/YoloDesktop/src-tauri && cargo check 2>&1
```

Fix type issues (the `DbState` clone issue in `start_training` will need attention — the function needs to not try to clone the state, just use it within the spawn).

Fix the `start_training` function: instead of cloning state, restructure to query DB before spawning the process:

```rust
// In start_training, before spawning the thread, save DB records.
// The row data is already saved above, so we don't need DB access during the process lifetime.
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add training management — Rust commands, setup form, live monitor with charts"
```

---

### Task 8: Model Graph Viewer (React Flow, Read-Only)

**Files:**
- Create: `src-tauri/src/parser/mod.rs`, `src-tauri/src/parser/model_config.rs`
- Create: `src/components/model-graph/index.tsx`
- Create: `src/components/model-graph/custom-node.tsx`
- Create: `src/components/model-graph/detail-panel.tsx`
- Rewrite: `src/routes/model-viewer.tsx`
- Modify: `src-tauri/src/lib.rs` (register parser command)

- [ ] **Step 1: Create model config parser**

`src-tauri/src/parser/mod.rs`:

```rust
pub mod model_config;
```

`src-tauri/src/parser/model_config.rs`:

```rust
use serde::Serialize;
use crate::errors::{AppError, AppResult};

#[derive(Debug, Serialize, Clone)]
pub struct GraphNode {
    pub id: String,
    pub label: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub params: serde_json::Value,
    pub position: NodePosition,
}

#[derive(Debug, Serialize, Clone)]
pub struct NodePosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Serialize, Clone)]
pub struct GraphEdge {
    pub id: String,
    pub from: String,
    pub to: String,
}

#[derive(Debug, Serialize)]
pub struct ModelGraph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

/// Parse a YOLO model YAML config and produce a graph representation.
pub fn parse_model_yaml(yaml_content: &str) -> AppResult<ModelGraph> {
    let parsed: serde_yaml::Value = serde_yaml::from_str(yaml_content)
        .map_err(|e| AppError::CommandFailed(format!("YAML parse error: {}", e)))?;

    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let mut y = 0.0;

    // YOLO model YAMLs have a "backbone" and "head" section with lists of layers
    let backbone = parsed.get("backbone");
    let head = parsed.get("head");

    // Process backbone layers
    if let Some(backbone_list) = backbone.and_then(|b| b.as_sequence()) {
        for (i, entry) in backbone_list.iter().enumerate() {
            let (layer_type, params) = parse_layer_entry(entry);
            let id = format!("backbone_{}", i);
            let label = format!("{} #{}", layer_type, i);

            nodes.push(GraphNode {
                id: id.clone(),
                label: label.clone(),
                node_type: classify_node_type(&layer_type),
                params: params.clone(),
                position: NodePosition { x: 250.0, y },
            });

            if i > 0 {
                edges.push(GraphEdge {
                    id: format!("edge_backbone_{}_{}", i - 1, i),
                    from: format!("backbone_{}", i - 1),
                    to: id,
                });
            }

            y += 100.0;
        }
    }

    // Process head layers
    if let Some(head_list) = head.and_then(|h| h.as_sequence()) {
        let backbone_count = nodes.len();
        for (i, entry) in head_list.iter().enumerate() {
            let (layer_type, params) = parse_layer_entry(entry);
            let id = format!("head_{}", i);
            let label = format!("{} #{}", layer_type, i);

            nodes.push(GraphNode {
                id: id.clone(),
                label: label.clone(),
                node_type: classify_node_type(&layer_type),
                params: params.clone(),
                position: NodePosition { x: 600.0, y: (i as f64) * 100.0 },
            });

            // Connect to previous head layer or to the last backbone layer
            if i > 0 {
                edges.push(GraphEdge {
                    id: format!("edge_head_{}_{}", i - 1, i),
                    from: format!("head_{}", i - 1),
                    to: id,
                });
            } else if backbone_count > 0 {
                edges.push(GraphEdge {
                    id: "edge_backbone_to_head".to_string(),
                    from: format!("backbone_{}", backbone_count - 1),
                    to: id,
                });
            }
        }
    }

    // If no backbone/head structure, try flat list
    if nodes.is_empty() {
        if let Some(arr) = parsed.as_sequence() {
            for (i, entry) in arr.iter().enumerate() {
                let (layer_type, params) = parse_layer_entry(entry);
                let id = format!("layer_{}", i);
                nodes.push(GraphNode {
                    id: id.clone(),
                    label: format!("{} #{}", layer_type, i),
                    node_type: classify_node_type(&layer_type),
                    params: params.clone(),
                    position: NodePosition { x: 250.0, y: (i as f64) * 100.0 },
                });
                if i > 0 {
                    edges.push(GraphEdge {
                        id: format!("edge_{}_{}", i - 1, i),
                        from: format!("layer_{}", i - 1),
                        to: id,
                    });
                }
            }
        }
    }

    Ok(ModelGraph { nodes, edges })
}

fn parse_layer_entry(entry: &serde_yaml::Value) -> (String, serde_json::Value) {
    match entry {
        serde_yaml::Value::Sequence(seq) if !seq.is_empty() => {
            let layer_type = seq[0].as_str().unwrap_or("Unknown").to_string();
            let args = if seq.len() > 1 {
                serde_json::to_value(&seq[1]).unwrap_or(serde_json::Value::Null)
            } else {
                serde_json::Value::Null
            };
            (layer_type, args)
        }
        serde_yaml::Value::String(s) => (s.clone(), serde_json::Value::Null),
        other => ("Unknown".to_string(), serde_json::to_value(other).unwrap_or(serde_json::Value::Null)),
    }
}

fn classify_node_type(name: &str) -> String {
    let name_lower = name.to_lowercase();
    if name_lower.contains("conv") || name_lower.contains("cbs") || name_lower.contains("cbl") {
        "conv".into()
    } else if name_lower.contains("bn") || name_lower.contains("batchnorm") {
        "batchnorm".into()
    } else if name_lower.contains("relu") || name_lower.contains("silu") || name_lower.contains("mish")
        || name_lower.contains("leaky") || name_lower.contains("activation") || name_lower.contains("act") {
        "activation".into()
    } else if name_lower.contains("pool") || name_lower.contains("maxpool") || name_lower.contains("avgpool") {
        "pool".into()
    } else if name_lower.contains("concat") || name_lower.contains("add") || name_lower.contains("shortcut") {
        "merge".into()
    } else if name_lower.contains("detect") || name_lower.contains("head") {
        "detect".into()
    } else if name_lower.contains("c2f") || name_lower.contains("c3") || name_lower.contains("bottleneck") {
        "bottleneck".into()
    } else if name_lower.contains("upsample") || name_lower.contains("resize") {
        "upsample".into()
    } else if name_lower.contains("sppf") || name_lower.contains("spp") {
        "spp".into()
    } else {
        "other".into()
    }
}

#[tauri::command]
pub fn parse_model_config(yaml_content: String) -> Result<ModelGraph, AppError> {
    parse_model_yaml(&yaml_content)
}
```

Add `serde_yaml = "0.9"` to Cargo.toml dependencies.

- [ ] **Step 2: Register parser command in lib.rs**

```rust
.invoke_handler(tauri::generate_handler![
    // ... previous commands ...
    parser::model_config::parse_model_config,
])
```

- [ ] **Step 3: Create CustomNode component**

`src/components/model-graph/custom-node.tsx`:

```tsx
import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";

const NODE_COLORS: Record<string, string> = {
  conv: "#1677ff",
  batchnorm: "#52c41a",
  activation: "#2eb82e",
  pool: "#faad14",
  merge: "#722ed1",
  detect: "#ff4d4f",
  bottleneck: "#13c2c2",
  upsample: "#eb2f96",
  spp: "#fa8c16",
  other: "#8c8c8c",
};

function CustomNode({ data }: NodeProps) {
  const color = NODE_COLORS[data.nodeType as string] || NODE_COLORS.other;

  return (
    <div
      style={{
        padding: "8px 16px",
        borderRadius: 6,
        border: `2px solid ${color}`,
        background: `${color}22`,
        color: "#e0e0e0",
        fontSize: 12,
        minWidth: 120,
        textAlign: "center",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: color }} />
      <div style={{ fontWeight: 600, color }}>{data.label as string}</div>
      <Handle type="source" position={Position.Right} style={{ background: color }} />
    </div>
  );
}

export default memo(CustomNode);
```

- [ ] **Step 4: Create DetailPanel component**

`src/components/model-graph/detail-panel.tsx`:

```tsx
import { Drawer, Descriptions, Tag, Typography } from "antd";

interface DetailPanelProps {
  open: boolean;
  node: {
    id: string;
    label: string;
    type: string;
    node_type: string;
    params: Record<string, unknown>;
  } | null;
  onClose: () => void;
}

export default function DetailPanel({ open, node, onClose }: DetailPanelProps) {
  if (!node) return null;

  return (
    <Drawer title={node.label} open={open} onClose={onClose} width={400}>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="ID">{node.id}</Descriptions.Item>
        <Descriptions.Item label="Type">
          <Tag color="blue">{node.node_type}</Tag>
        </Descriptions.Item>
        {node.params && Object.entries(node.params).map(([key, value]) => (
          <Descriptions.Item key={key} label={key}>
            {typeof value === "object" ? JSON.stringify(value) : String(value)}
          </Descriptions.Item>
        ))}
      </Descriptions>
    </Drawer>
  );
}
```

- [ ] **Step 5: Create ModelGraph wrapper**

`src/components/model-graph/index.tsx`:

```tsx
import { useCallback, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import CustomNode from "./custom-node";
import DetailPanel from "./detail-panel";

const nodeTypes = { custom: CustomNode };

interface ModelGraphProps {
  nodes: Node[];
  edges: Edge[];
}

export default function ModelGraph({ nodes: initialNodes, edges: initialEdges }: ModelGraphProps) {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<any>(null);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode({
      id: node.id,
      label: node.data.label,
      node_type: node.data.nodeType,
      params: node.data.params || {},
    });
  }, []);

  return (
    <div style={{ height: 600, border: "1px solid #434343", borderRadius: 6 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const colors: Record<string, string> = {
              conv: "#1677ff", batchnorm: "#52c41a", activation: "#2eb82e",
              pool: "#faad14", merge: "#722ed1", detect: "#ff4d4f",
              bottleneck: "#13c2c2", upsample: "#eb2f96", spp: "#fa8c16",
            };
            return colors[node.data?.nodeType as string] || "#8c8c8c";
          }}
        />
      </ReactFlow>
      <DetailPanel
        open={!!selectedNode}
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
      />
    </div>
  );
}
```

- [ ] **Step 6: Build ModelViewer page**

`src/routes/model-viewer.tsx`:

```tsx
import { useState } from "react";
import { Card, Input, Button, Typography, Space, Select, Alert } from "antd";
import { ApartmentOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { useInvokeMutation } from "../hooks/use-invoke";
import YamlEditor from "../components/yaml-editor";
import ModelGraph from "../components/model-graph";

const SAMPLE_YAML = `# YOLOv8 model backbone
backbone:
  - [-1, 1, Conv, [64, 3, 2]]        # 0-P1/2
  - [-1, 1, Conv, [128, 3, 2]]       # 1-P2/4
  - [-1, 3, C2f, [128, True]]        # 2
  - [-1, 1, Conv, [256, 3, 2]]       # 3-P3/8
  - [-1, 6, C2f, [256, True]]        # 4
  - [-1, 1, Conv, [512, 3, 2]]       # 5-P4/16
  - [-1, 6, C2f, [512, True]]        # 6
  - [-1, 1, Conv, [1024, 3, 2]]      # 7-P5/32
  - [-1, 3, C2f, [1024, True]]       # 8
  - [-1, 1, SPPF, [1024, 5]]         # 9

head:
  - [-1, 1, nn.Upsample, [None, 2, 'nearest']]
  - [[-1, 6], 1, Concat, [1]]
  - [-1, 3, C2f, [512]]
  - [-1, 1, nn.Upsample, [None, 2, 'nearest']]
  - [[-1, 4], 1, Concat, [1]]
  - [-1, 3, C2f, [256]]
  - [-1, 1, Conv, [256, 3, 2]]
  - [[-1, 12], 1, Concat, [1]]
  - [-1, 3, C2f, [512]]
  - [-1, 1, Conv, [512, 3, 2]]
  - [[-1, 9], 1, Concat, [1]]
  - [-1, 3, C2f, [1024]]
  - [[15, 18, 21], 1, Detect, [nc]]
`;

interface GraphData {
  nodes: Array<{
    id: string;
    type?: string;
    data: { label: string; nodeType: string; params?: Record<string, unknown> };
    position: { x: number; y: number };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
}

export default function ModelViewer() {
  const [yamlInput, setYamlInput] = useState(SAMPLE_YAML);
  const [graphData, setGraphData] = useState<GraphData | null>(null);

  const parseMutation = useInvokeMutation<{
    nodes: Array<{ id: string; label: string; node_type: string; params: Record<string, unknown>; position: { x: number; y: number } }>;
    edges: Array<{ id: string; from: string; to: string }>;
  }>("parse_model_config");

  const handleParse = () => {
    parseMutation.mutate(
      { yaml_content: yamlInput },
      {
        onSuccess: (data) => {
          setGraphData({
            nodes: data.nodes.map((n) => ({
              id: n.id,
              type: "custom",
              data: { label: n.label, nodeType: n.node_type, params: n.params },
              position: n.position,
            })),
            edges: data.edges.map((e) => ({
              id: e.id,
              source: e.from,
              target: e.to,
            })),
          });
        },
      }
    );
  };

  return (
    <div>
      <Typography.Title level={3}><ApartmentOutlined /> Model Graph Viewer</Typography.Title>
      <Alert
        message="Paste a YOLO model YAML configuration to visualize the architecture. The example below shows a YOLOv8 backbone+head structure."
        type="info"
        style={{ marginBottom: 16 }}
      />

      <Space direction="vertical" style={{ width: "100%" }} size="large">
        <Card title="Model YAML Input" size="small">
          <YamlEditor value={yamlInput} onChange={setYamlInput} height="300px" />
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleParse}
            loading={parseMutation.isPending}
            style={{ marginTop: 12 }}
          >
            Parse & Visualize
          </Button>
        </Card>

        {graphData && (
          <Card title="Model Architecture" size="small">
            <ModelGraph nodes={graphData.nodes} edges={graphData.edges} />
          </Card>
        )}
      </Space>
    </div>
  );
}
```

- [ ] **Step 7: Build and verify**

```bash
cd /d/YoloDesktop/src-tauri && cargo check 2>&1
cd /d/YoloDesktop && npx tsc --noEmit 2>&1
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add model graph viewer — YAML parser + React Flow visualization"
```

---

### Task 9: ONNX Export — Rust Commands + Frontend

**Files:**
- Create: `src-tauri/src/commands/export.rs`
- Rewrite: `src/routes/export-manager.tsx`
- Modify: `src-tauri/src/lib.rs` (register export commands)

- [ ] **Step 1: Create export Rust commands**

`src-tauri/src/commands/export.rs`:

```rust
use crate::db::{queries, DbState};
use crate::errors::AppError;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

#[tauri::command]
pub async fn export_onnx(
    app: AppHandle,
    state: State<'_, DbState>,
    run_id: String,
    checkpoint_id: Option<String>,
) -> Result<String, AppError> {
    let id = Uuid::new_v4().to_string();

    // Get checkpoint path
    let checkpoint_path = if let Some(cid) = &checkpoint_id {
        let checkpoints = queries::list_checkpoints(&state, &run_id)?;
        checkpoints.iter()
            .find(|c| &c.id == cid)
            .map(|c| c.file_path.clone())
            .ok_or_else(|| AppError::NotFound("Checkpoint not found".into()))?
    } else {
        // Use the best checkpoint or the last one
        let run = queries::get_training_run(&state, &run_id)?;
        let checkpoints = queries::list_checkpoints(&state, &run_id)?;
        checkpoints.last()
            .map(|c| c.file_path.clone())
            .or_else(|| run.checkpoint_dir.map(|d| format!("{}/weights/best.pt", d)))
            .ok_or_else(|| AppError::NotFound("No checkpoint available".into()))?
    };

    // Output directory
    let export_dir = dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("yolodesktop")
        .join("exports")
        .join(&id);
    std::fs::create_dir_all(&export_dir)?;

    // Run Python export script
    let python = crate::python::venv::VenvManager::detect_system_python()?;
    let script = std::env::current_dir()
        .unwrap()
        .join("../python/export_onnx.py");

    app.emit("export:log", "Starting ONNX export...").ok();

    let output = std::process::Command::new(&python)
        .arg(script.to_str().unwrap())
        .args(["--weights", &checkpoint_path, "--output", export_dir.to_str().unwrap()])
        .output()
        .map_err(|e| AppError::CommandFailed(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    app.emit("export:log", &format!("stdout: {}", stdout)).ok();
    if !stderr.is_empty() {
        app.emit("export:log", &format!("stderr: {}", stderr)).ok();
    }

    if !output.status.success() {
        return Err(AppError::CommandFailed(stderr.to_string()));
    }

    // Parse exported path from output
    let mut exported_path = String::new();
    for line in stdout.lines() {
        if let Some(path) = line.strip_prefix("EXPORTED:") {
            exported_path = path.trim().to_string();
        }
    }

    // Get file size
    let file_size = std::fs::metadata(&exported_path)
        .map(|m| m.len() as i64)
        .ok();

    // Save to DB
    let row = queries::ExportedModelRow {
        id: id.clone(),
        run_id,
        checkpoint_id,
        format: "onnx".to_string(),
        file_path: exported_path.clone(),
        file_size,
        exported_at: chrono::Utc::now().to_rfc3339(),
    };
    queries::create_exported_model(&state, &row)?;

    app.emit("export:log", &format!("Export complete: {}", exported_path)).ok();

    Ok(id)
}

#[tauri::command]
pub async fn list_exported_models(
    state: State<'_, DbState>,
    run_id: String,
) -> Result<Vec<queries::ExportedModelRow>, AppError> {
    queries::list_exported_models(&state, &run_id)
}
```

- [ ] **Step 2: Register export commands in lib.rs**

```rust
// Add to generate_handler!:
export::export_onnx,
export::list_exported_models,
```

- [ ] **Step 3: Build ExportManager page**

`src/routes/export-manager.tsx`:

```tsx
import { useState } from "react";
import {
  Card, Button, Table, Tag, Typography, Select, Space, message,
} from "antd";
import { ExportOutlined, DownloadOutlined } from "@ant-design/icons";
import { useInvokeQuery, useInvokeMutation } from "../hooks/use-invoke";
import { useWorkspaceStore } from "../stores/workspace-store";
import LogStreamer from "../components/log-streamer";

export default function ExportManager() {
  const { activeProject } = useWorkspaceStore();
  const [selectedRun, setSelectedRun] = useState<string>();
  const [logs, setLogs] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  const { data: runs = [] } = useInvokeQuery<any[]>(
    ["training-runs", activeProject?.id ?? ""],
    "list_training_runs",
    { project_id: activeProject?.id ?? "" },
    { enabled: !!activeProject }
  );

  const { data: checkpoints = [] } = useInvokeQuery<any[]>(
    ["checkpoints", selectedRun ?? ""],
    "list_checkpoints",
    { run_id: selectedRun ?? "" },
    { enabled: !!selectedRun }
  );

  const { data: exportedModels = [] } = useInvokeQuery<any[]>(
    ["exported-models", selectedRun ?? ""],
    "list_exported_models",
    { run_id: selectedRun ?? "" },
    { enabled: !!selectedRun }
  );

  const exportMutation = useInvokeMutation<string>("export_onnx", {
    invalidateKeys: [["exported-models", selectedRun ?? ""]],
    onSuccess: () => {
      setExporting(false);
      message.success("Export complete!");
    },
    onError: () => setExporting(false),
  });

  const handleExport = (checkpointId?: string) => {
    if (!selectedRun) return;
    setExporting(true);
    setLogs([]);
    exportMutation.mutate({ run_id: selectedRun, checkpoint_id: checkpointId });
  };

  const completedRuns = runs.filter((r: any) => r.status === "completed" || r.status === "stopped");

  const modelColumns = [
    { title: "Format", dataIndex: "format", key: "format", render: (f: string) => <Tag color="blue">{f.toUpperCase()}</Tag> },
    { title: "File Path", dataIndex: "file_path", key: "file_path", ellipsis: true },
    { title: "Size", dataIndex: "file_size", key: "file_size", render: (v: number | null) => v ? `${(v / 1e6).toFixed(1)} MB` : "—" },
    { title: "Exported", dataIndex: "exported_at", key: "exported_at", render: (v: string) => new Date(v).toLocaleString() },
    { title: "", key: "actions", render: () => <Button size="small" icon={<DownloadOutlined />} disabled>Open Folder</Button> },
  ];

  const cpColumns = [
    { title: "Epoch", dataIndex: "epoch", key: "epoch" },
    { title: "mAP50", dataIndex: "map50", key: "map50", render: (v: number | null) => v?.toFixed(4) ?? "—" },
    { title: "Loss", dataIndex: "loss", key: "loss", render: (v: number | null) => v?.toFixed(4) ?? "—" },
    {
      title: "", key: "actions",
      render: (_: unknown, record: any) => (
        <Button size="small" type="primary" icon={<ExportOutlined />}
          onClick={() => handleExport(record.id)} loading={exporting}>
          Export ONNX
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={3}>Model Export</Typography.Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space>
          <span>Training Run:</span>
          <Select
            style={{ width: 300 }}
            placeholder="Select a completed training run"
            value={selectedRun}
            onChange={setSelectedRun}
            options={completedRuns.map((r: any) => ({
              value: r.id,
              label: `Run ${r.id.slice(0, 8)}... — ${r.status} (${r.best_map50 ? `mAP50: ${r.best_map50.toFixed(4)}` : "N/A"})`,
            }))}
          />
          {selectedRun && completedRuns.find((r: any) => r.id === selectedRun)?.checkpoint_dir && (
            <Button type="primary" icon={<ExportOutlined />} onClick={() => handleExport()} loading={exporting}>
              Export Best Checkpoint
            </Button>
          )}
        </Space>
      </Card>

      {exporting && (
        <Card size="small" title="Export Progress" style={{ marginBottom: 16 }}>
          <LogStreamer lines={logs} />
        </Card>
      )}

      {selectedRun && (
        <>
          <Card title="Checkpoints" size="small" style={{ marginBottom: 16 }}>
            <Table dataSource={checkpoints} columns={cpColumns} rowKey="id" pagination={false} size="small" />
          </Card>

          <Card title="Exported Models" size="small">
            <Table dataSource={exportedModels} columns={modelColumns} rowKey="id" pagination={false} size="small" />
          </Card>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Build and verify**

```bash
cd /d/YoloDesktop/src-tauri && cargo check 2>&1
cd /d/YoloDesktop && npx tsc --noEmit 2>&1
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add ONNX export — Rust commands and frontend UI"
```

---

### Task 10: Plugin Manager + Workspace Commands

**Files:**
- Create: `src-tauri/src/commands/plugins.rs`
- Create: `src-tauri/src/commands/workspace.rs`
- Rewrite: `src/routes/plugin-manager.tsx`
- Modify: `src-tauri/src/lib.rs` (register plugin + workspace commands)
- Create: `python/plugins/annotation/labelme/manifest.json`, `python/plugins/annotation/labelme/launcher.py`
- Create: `python/plugins/annotation/labelimg/manifest.json`, `python/plugins/annotation/labelimg/launcher.py`

- [ ] **Step 1: Create workspace Rust commands**

`src-tauri/src/commands/workspace.rs`:

```rust
use crate::db::{queries, DbState};
use crate::errors::AppError;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn create_project(
    state: State<'_, DbState>,
    name: String,
    path: String,
) -> Result<String, AppError> {
    let id = Uuid::new_v4().to_string();
    std::fs::create_dir_all(&path)?;
    queries::create_project(&state, &id, &name, &path)?;
    Ok(id)
}

#[tauri::command]
pub async fn list_projects(
    state: State<'_, DbState>,
) -> Result<Vec<queries::ProjectRow>, AppError> {
    queries::list_projects(&state)
}

#[tauri::command]
pub async fn delete_project(
    state: State<'_, DbState>,
    id: String,
) -> Result<(), AppError> {
    queries::delete_project(&state, &id)?;
    Ok(())
}
```

- [ ] **Step 2: Create plugins Rust commands**

`src-tauri/src/commands/plugins.rs`:

```rust
use crate::db::{queries, DbState};
use crate::errors::AppError;
use tauri::State;
use uuid::Uuid;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub supported_formats: Vec<String>,
    pub launcher_path: String,
    pub description: String,
    pub is_installed: bool,
}

#[tauri::command]
pub async fn scan_plugins(state: State<'_, DbState>) -> Result<Vec<PluginManifest>, AppError> {
    let plugins_dir = std::env::current_dir()
        .unwrap()
        .join("../python/plugins/annotation");

    let mut manifests = Vec::new();

    if plugins_dir.exists() {
        for entry in std::fs::read_dir(&plugins_dir)? {
            let entry = entry?;
            if entry.file_type()?.is_dir() {
                let manifest_path = entry.path().join("manifest.json");
                if manifest_path.exists() {
                    let content = std::fs::read_to_string(&manifest_path)?;
                    if let Ok(mut manifest) = serde_json::from_str::<serde_json::Value>(&content) {
                        let name = manifest["name"].as_str().unwrap_or("unknown").to_string();
                        let version = manifest["version"].as_str().unwrap_or("0.0.0").to_string();
                        let description = manifest["description"].as_str().unwrap_or("").to_string();
                        let formats: Vec<String> = manifest["supported_formats"]
                            .as_array()
                            .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                            .unwrap_or_default();
                        let launcher = entry.path()
                            .join(manifest["launcher"].as_str().unwrap_or("launcher.py"));

                        let existing = queries::list_plugins(&state)?;
                        let installed = existing.iter().any(|p| p.name == name);

                        let plugin_id = existing.iter()
                            .find(|p| p.name == name)
                            .map(|p| p.id.clone())
                            .unwrap_or_else(Uuid::new_v4);

                        manifests.push(PluginManifest {
                            id: plugin_id,
                            name,
                            version,
                            supported_formats: formats,
                            launcher_path: launcher.to_str().unwrap_or("").to_string(),
                            description,
                            is_installed: installed,
                        });
                    }
                }
            }
        }
    }

    Ok(manifests)
}

#[tauri::command]
pub async fn install_plugin(
    state: State<'_, DbState>,
    name: String,
    version: String,
    launcher_path: String,
    formats_json: String,
) -> Result<(), AppError> {
    let id = Uuid::new_v4().to_string();
    let row = queries::PluginRow {
        id,
        name,
        version,
        formats_json,
        launcher_path,
        is_installed: true,
        installed_at: chrono::Utc::now().to_rfc3339(),
    };
    queries::create_plugin(&state, &row)?;
    Ok(())
}

#[tauri::command]
pub async fn remove_plugin(
    state: State<'_, DbState>,
    id: String,
) -> Result<(), AppError> {
    queries::delete_plugin(&state, &id)?;
    Ok(())
}

#[tauri::command]
pub async fn list_installed_plugins(
    state: State<'_, DbState>,
) -> Result<Vec<queries::PluginRow>, AppError> {
    queries::list_plugins(&state)
}
```

- [ ] **Step 3: Register all remaining commands in lib.rs**

```rust
.invoke_handler(tauri::generate_handler![
    // Previous commands...
    workspace::create_project,
    workspace::list_projects,
    workspace::delete_project,
    plugins::scan_plugins,
    plugins::install_plugin,
    plugins::remove_plugin,
    plugins::list_installed_plugins,
])
```

- [ ] **Step 4: Create plugin manifest files**

`python/plugins/annotation/labelme/manifest.json`:

```json
{
  "name": "labelme",
  "version": "5.4.0",
  "supported_formats": ["labelme_json", "voc", "coco"],
  "launcher": "launcher.py",
  "description": "Labelme — polygon and rectangle annotation tool"
}
```

`python/plugins/annotation/labelme/launcher.py`:

```python
"""LabelMe annotation launcher stub."""
import sys
import subprocess
import argparse

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", help="Input image directory")
    parser.add_argument("--output", help="Output annotation directory")
    args = parser.parse_args()

    print("LabelMe launcher — install LabelMe via: pip install labelme")
    print(f"Would annotate: {args.input} -> {args.output}")

    # In production: subprocess.run([sys.executable, "-m", "labelme", args.input, "--output", args.output])

if __name__ == "__main__":
    main()
```

`python/plugins/annotation/labelimg/manifest.json`:

```json
{
  "name": "labelimg",
  "version": "1.8.6",
  "supported_formats": ["voc", "yolo", "create_ml"],
  "launcher": "launcher.py",
  "description": "LabelImg — bounding box annotation tool"
}
```

`python/plugins/annotation/labelimg/launcher.py`:

```python
"""LabelImg annotation launcher stub."""
import sys
import argparse

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", help="Input image directory")
    parser.add_argument("--output", help="Output annotation directory")
    args = parser.parse_args()

    print("LabelImg launcher — install LabelImg via: pip install labelimg")
    print(f"Would annotate: {args.input} -> {args.output}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Build PluginManager page**

`src/routes/plugin-manager.tsx`:

```tsx
import { useState } from "react";
import { Card, Button, Table, Tag, Typography, Space, Modal, Descriptions, message } from "antd";
import { PlusOutlined, DeleteOutlined, ScanOutlined } from "@ant-design/icons";
import { useInvokeQuery, useInvokeMutation } from "../hooks/use-invoke";

interface Plugin {
  id: string;
  name: string;
  version: string;
  supported_formats: string[];
  launcher_path: string;
  description: string;
  is_installed: boolean;
}

export default function PluginManager() {
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);

  const { data: plugins = [], isLoading, refetch } = useInvokeQuery<Plugin[]>(
    ["plugins"], "scan_plugins"
  );

  const installMutation = useInvokeMutation<void>("install_plugin", {
    onSuccess: () => { refetch(); message.success("Plugin installed"); },
  });

  const removeMutation = useInvokeMutation<void>("remove_plugin", {
    onSuccess: () => { refetch(); message.success("Plugin removed"); },
  });

  const columns = [
    { title: "Name", dataIndex: "name", key: "name", render: (v: string) => <strong>{v}</strong> },
    { title: "Version", dataIndex: "version", key: "version" },
    {
      title: "Formats",
      dataIndex: "supported_formats",
      key: "formats",
      render: (formats: string[]) => formats.map(f => <Tag key={f} color="blue" style={{ marginBottom: 2 }}>{f}</Tag>),
    },
    {
      title: "Status",
      dataIndex: "is_installed",
      key: "is_installed",
      render: (installed: boolean) => installed
        ? <Tag color="green">Installed</Tag>
        : <Tag color="default">Not Installed</Tag>,
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: unknown, record: Plugin) => (
        <Space>
          <Button size="small" onClick={() => { setSelectedPlugin(record); setDetailOpen(true); }}>
            Details
          </Button>
          {record.is_installed ? (
            <Button size="small" danger icon={<DeleteOutlined />}
              onClick={() => removeMutation.mutate({ id: record.id })}>
              Remove
            </Button>
          ) : (
            <Button size="small" type="primary" icon={<PlusOutlined />}
              onClick={() => installMutation.mutate({
                name: record.name,
                version: record.version,
                launcher_path: record.launcher_path,
                formats_json: JSON.stringify(record.supported_formats),
              })}>
              Install
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>Plugin Manager</Typography.Title>
        <Button icon={<ScanOutlined />} onClick={() => refetch()}>Scan for Plugins</Button>
      </div>

      <Card>
        <Table dataSource={plugins} columns={columns} rowKey="id" loading={isLoading} pagination={false} />
      </Card>

      <Modal
        title={selectedPlugin?.name}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
      >
        {selectedPlugin && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Version">{selectedPlugin.version}</Descriptions.Item>
            <Descriptions.Item label="Description">{selectedPlugin.description}</Descriptions.Item>
            <Descriptions.Item label="Launcher">{selectedPlugin.launcher_path}</Descriptions.Item>
            <Descriptions.Item label="Supported Formats">
              {selectedPlugin.supported_formats.map(f => <Tag key={f}>{f}</Tag>)}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
```

- [ ] **Step 6: Build and final compile check**

```bash
cd /d/YoloDesktop/src-tauri && cargo check 2>&1
cd /d/YoloDesktop && npx tsc --noEmit 2>&1
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add plugin manager, workspace commands, and annotation plugin stubs"
```

---

### Task 11: Integration — Dashboard Live Data + Error Boundaries + Final Polish

**Files:**
- Rewrite: `src/routes/dashboard.tsx`
- Modify: `src/App.tsx` (add ErrorBoundary)
- Modify: `src/main.tsx` (add global error handler)
- Create: `src/components/error-boundary.tsx`

- [ ] **Step 1: Add ErrorBoundary component**

`src/components/error-boundary.tsx`:

```tsx
import { Component, ReactNode } from "react";
import { Button, Result } from "antd";

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="error"
          title="Something went wrong"
          subTitle={this.state.error?.message}
          extra={
            <Button type="primary" onClick={() => this.setState({ hasError: false, error: null })}>
              Try Again
            </Button>
          }
        />
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Wire up Dashboard with real data**

`src/routes/dashboard.tsx`:

```tsx
import { Card, Col, Row, Statistic, Typography, Table, Tag, Button } from "antd";
import {
  ExperimentOutlined, DatabaseOutlined, CloudServerOutlined,
  ExportOutlined, PlusOutlined, PlayCircleOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useInvokeQuery } from "../hooks/use-invoke";
import { useWorkspaceStore } from "../stores/workspace-store";

export default function Dashboard() {
  const navigate = useNavigate();
  const { activeProject, projects } = useWorkspaceStore();

  const { data: envs = [] } = useInvokeQuery<any[]>(["envs"], "list_envs");
  const { data: datasets = [] } = useInvokeQuery<any[]>(
    ["datasets", activeProject?.id ?? ""], "list_datasets",
    { project_id: activeProject?.id ?? "" }, { enabled: !!activeProject }
  );
  const { data: runs = [] } = useInvokeQuery<any[]>(
    ["training-runs", activeProject?.id ?? ""], "list_training_runs",
    { project_id: activeProject?.id ?? "" }, { enabled: !!activeProject }
  );

  const installedEnvs = envs.filter((e: any) => e.status === "installed").length;
  const completedRuns = runs.filter((r: any) => r.status === "completed").length;

  const recentRuns = runs.slice(0, 5);

  const runColumns = [
    { title: "Run ID", dataIndex: "id", key: "id", render: (v: string) => v.slice(0, 8) + "..." },
    {
      title: "Status", dataIndex: "status", key: "status",
      render: (s: string) => {
        const colors: Record<string, string> = {
          running: "processing", completed: "success", stopped: "warning", error: "error",
        };
        return <Tag color={colors[s] || "default"}>{s}</Tag>;
      },
    },
    { title: "Best mAP50", dataIndex: "best_map50", key: "map50", render: (v: number | null) => v?.toFixed(4) ?? "—" },
    { title: "Started", dataIndex: "started_at", key: "started", render: (v: string | null) => v ? new Date(v).toLocaleDateString() : "—" },
    {
      title: "", key: "actions",
      render: (_: unknown, record: any) => (
        <Button size="small" onClick={() => navigate(`/train/${record.id}`)}>
          {record.status === "running" ? "Monitor" : "View"}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={3}>Dashboard</Typography.Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Installed YOLO Versions" value={installedEnvs}
              prefix={<CloudServerOutlined />}
              suffix={installedEnvs > 0 ? undefined : <Button size="small" type="link" onClick={() => navigate("/env")}>Install</Button>}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Datasets" value={datasets.length}
              prefix={<DatabaseOutlined />}
              suffix={datasets.length === 0 && activeProject ? <Button size="small" type="link" onClick={() => navigate("/datasets")}>Import</Button> : undefined}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Completed Runs" value={completedRuns}
              prefix={<ExperimentOutlined />}
              suffix={runs.length === 0 && activeProject ? <Button size="small" type="link" onClick={() => navigate("/train")}>Start</Button> : undefined}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Exported Models" value={0}
              prefix={<ExportOutlined />}
              suffix={<Button size="small" type="link" onClick={() => navigate("/export")}>Export</Button>}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Recent Training Runs" style={{ marginTop: 16 }}>
        {activeProject ? (
          <Table dataSource={recentRuns} columns={runColumns} rowKey="id" pagination={false} size="small" />
        ) : (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Typography.Text type="secondary">Select or create a project to get started</Typography.Text>
            <br />
            <Button type="primary" icon={<PlusOutlined />} style={{ marginTop: 16 }}>Create Project</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Add ErrorBoundary to App**

Update `src/App.tsx` to wrap each route's outlet in an ErrorBoundary:

```tsx
import ErrorBoundary from "./components/error-boundary";

// Wrap the <Outlet /> in AppShell:
<ErrorBoundary>
  <Outlet />
</ErrorBoundary>
```

- [ ] **Step 4: Add ResizeObserver polyfill for React Flow**

```bash
cd /d/YoloDesktop && npm install @reactflow/core
```

Note: `@reactflow/core` types — ensure `skipLibCheck: true` is in tsconfig.json (already set).

- [ ] **Step 5: Final full build**

```bash
cd /d/YoloDesktop && npx tsc --noEmit 2>&1
cd /d/YoloDesktop/src-tauri && cargo build 2>&1
```

Fix any remaining compilation errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: integrate dashboard with live data, add error boundaries, final polish"
```

---

## Build Verification Checklist

After all tasks complete, verify:

1. `npx tsc --noEmit` passes (0 errors)
2. `cargo build` in `src-tauri/` passes (0 errors)
3. `cargo test` passes for Rust unit tests
4. `npm run build` produces dist/
5. The Tauri dev mode launches a window: `cargo tauri dev`
