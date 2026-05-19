use crate::db::{queries, DbState};
use crate::errors::{AppError, AppResult};
use crate::python::venv::VenvManager;
use serde::Serialize;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

static DOWNLOAD_PCT_RE: OnceLock<regex::Regex> = OnceLock::new();
fn get_download_regex() -> &'static regex::Regex {
    DOWNLOAD_PCT_RE.get_or_init(|| regex::Regex::new(r"(\d+)%").unwrap())
}

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
pub async fn check_gpu_diagnostics() -> Result<serde_json::Value, AppError> {
    let script = {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_default();
        // During dev: exe is in src-tauri/target/debug/, python is at ../../python/
        // In production: exe is in app root, python scripts are bundled as resources
        let dev_path = exe_dir.join("../../python/check_gpu.py");
        let prod_path = exe_dir.join("python/check_gpu.py");
        if dev_path.exists() {
            dev_path
        } else if prod_path.exists() {
            prod_path
        } else {
            // Fallback to cwd-based path for edge cases
            std::env::current_dir()
                .unwrap_or_default()
                .join("../python/check_gpu.py")
        }
    };
    let python = crate::python::venv::VenvManager::detect_system_python()
        .unwrap_or_else(|_| "python".to_string());

    let output = std::process::Command::new(&python)
        .arg(script.to_str().unwrap())
        .output()
        .map_err(|e| AppError::CommandFailed(format!("GPU diagnostics failed: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::CommandFailed(format!("GPU diagnostic error: {}", stderr)));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&stdout)
        .map_err(|e| AppError::CommandFailed(format!("Failed to parse GPU diagnostics JSON: {}", e)))
}

#[tauri::command]
pub async fn install_yolo(
    app: AppHandle,
    state: State<'_, DbState>,
    version: String,
    device: Option<String>,
) -> Result<String, AppError> {
    let id = Uuid::new_v4().to_string();
    let base_dir = dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("yolodesktop")
        .join("envs");
    std::fs::create_dir_all(&base_dir)?;

    let vm = VenvManager::new(base_dir);
    let venv_path = vm.venv_path(&version);

    app.emit("env:log", format!("Creating virtual environment for YOLO {}...", version)).ok();
    let python_path = vm.create_venv(&version)?;

    queries::create_env(&state, &id, &version, venv_path.to_str().unwrap(), &python_path)?;

    let packages = vec!["ultralytics", "torch", "torchvision", "onnx", "opencv-python", "pyyaml"];
    let device_type = device.unwrap_or_else(|| "cpu".to_string());
    let torch_index_url = if device_type == "cuda" {
        "https://download.pytorch.org/whl/cu121"
    } else {
        "https://download.pytorch.org/whl/cpu"
    };

    let app_handle = app.clone();
    let python_path_clone = python_path.clone();

    tokio::task::spawn_blocking(move || -> AppResult<()> {
        let num_packages = packages.len();
        let mut current_phase = 0u8; // 0=start, 1=collecting, 2=downloading, 3=installing, 4=complete
        let mut package_index = 0usize;

        let mut child = std::process::Command::new(&python_path_clone)
            .args(["-m", "pip", "install", "--quiet", "--progress-bar", "on"])
            .arg("--extra-index-url").arg(torch_index_url)
            .args(&packages)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| AppError::CommandFailed(format!("pip failed: {}", e)))?;

        use std::io::BufRead;

        // Read from stderr (pip outputs progress to stderr)
        if let Some(stderr) = child.stderr.take() {
            let reader = std::io::BufReader::new(stderr);
            for line in reader.lines().flatten() {
                // Phase detection
                if line.contains("Collecting") || line.contains("Obtaining") {
                    if current_phase < 1 { current_phase = 1; }
                    package_index += 1;
                    let pct = 5 + (package_index as u32 * 15 / num_packages.max(1) as u32);
                    app_handle.emit("env:progress", serde_json::json!({
                        "phase": "collecting",
                        "phaseLabel": "Collecting packages...",
                        "percent": pct.min(20),
                        "message": &line
                    })).ok();
                } else if line.contains("Downloading") {
                    if current_phase < 2 { current_phase = 2; }
                    let pct = if let Some(cap) = get_download_regex().captures(&line) {
                        let download_pct: u32 = cap[1].parse().unwrap_or(50);
                        20 + (download_pct as f64 * 0.60) as u32
                    } else {
                        20u32
                    };
                    app_handle.emit("env:progress", serde_json::json!({
                        "phase": "downloading",
                        "phaseLabel": "Downloading packages...",
                        "percent": pct.min(80),
                        "message": &line
                    })).ok();
                } else if line.contains("Installing collected packages") {
                    if current_phase < 3 { current_phase = 3; }
                    app_handle.emit("env:progress", serde_json::json!({
                        "phase": "installing",
                        "phaseLabel": "Installing packages...",
                        "percent": 85,
                        "message": &line
                    })).ok();
                } else if line.contains("Successfully installed") {
                    current_phase = 4;
                    app_handle.emit("env:progress", serde_json::json!({
                        "phase": "complete",
                        "phaseLabel": "Complete!",
                        "percent": 100,
                        "message": &line
                    })).ok();
                }
                app_handle.emit("env:log", &line).ok();
            }
        }

        let status = child.wait()?;
        if !status.success() {
            return Err(AppError::CommandFailed("pip install failed".into()));
        }
        Ok(())
    }).await.map_err(|e| AppError::CommandFailed(format!("Join error: {:?}", e)))??;

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
    let parent = std::path::Path::new(&env.venv_path).parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_default();
    let vm = VenvManager::new(parent);
    let version = std::path::Path::new(&env.venv_path)
        .file_name()
        .and_then(|n| n.to_str())
        .and_then(|n| n.strip_prefix("yolo-"))
        .unwrap_or(&env.version);
    vm.remove_venv(version)?;
    queries::delete_env(&state, &id)?;
    Ok(())
}
