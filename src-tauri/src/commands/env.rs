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

    app.emit("env:log", format!("Creating virtual environment for YOLO {}...", version)).ok();
    let python_path = vm.create_venv(&version)?;

    queries::create_env(&state, &id, &version, venv_path.to_str().unwrap(), &python_path)?;

    let packages = vec!["ultralytics", "torch", "torchvision", "onnx", "opencv-python", "pyyaml"];
    let app_handle = app.clone();
    let python_path_clone = python_path.clone();

    tokio::task::spawn_blocking(move || -> AppResult<()> {
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
