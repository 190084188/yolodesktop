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
        for name in &["python3", "python"] {
            if let Ok(output) = Command::new(name).arg("--version").output() {
                if output.status.success() {
                    let version = String::from_utf8_lossy(&output.stdout);
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    let combined = format!("{}{}", version, stderr);
                    if combined.contains("3.") {
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
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        Ok(format!("{}{}", stdout, stderr).trim().to_string())
    }

    pub fn detect_cuda() -> bool {
        if let Ok(output) = Command::new("nvidia-smi").output() {
            return output.status.success();
        }
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

        Ok(Self::get_python_in_venv(&venv_dir))
    }

    pub fn get_python_in_venv(venv_dir: &PathBuf) -> String {
        #[cfg(target_os = "windows")]
        let python_path = venv_dir.join("Scripts").join("python.exe");
        #[cfg(not(target_os = "windows"))]
        let python_path = venv_dir.join("bin").join("python");

        python_path.to_str().unwrap().to_string()
    }

    pub fn remove_venv(&self, version: &str) -> AppResult<()> {
        let venv_dir = self.venv_path(version);
        if venv_dir.exists() {
            std::fs::remove_dir_all(&venv_dir)?;
        }
        Ok(())
    }
}
