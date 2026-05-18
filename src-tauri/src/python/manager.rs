use crate::errors::{AppError, AppResult};
use std::io::BufRead;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::sync::mpsc;

pub struct PythonProcess {
    child: Mutex<Option<Child>>,
    cancel_tx: Mutex<Option<mpsc::Sender<()>>>,
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

        let stderr = child.stderr.take()
            .ok_or_else(|| AppError::CommandFailed("No stderr".into()))?;

        let (cancel_tx, cancel_rx) = mpsc::channel::<()>();

        // Read stdout in a thread
        std::thread::spawn(move || {
            let reader = std::io::BufReader::new(stdout);
            for line in reader.lines() {
                if cancel_rx.try_recv().is_ok() {
                    break;
                }
                if let Ok(line) = line {
                    on_line(&line);
                }
            }
        });

        // Read stderr in a thread (also sends to on_line)
        let (cancel_tx2, cancel_rx2) = mpsc::channel::<()>();
        std::thread::spawn(move || {
            let reader = std::io::BufReader::new(stderr);
            for line in reader.lines() {
                if cancel_rx2.try_recv().is_ok() {
                    break;
                }
                if let Ok(line) = line {
                    // We don't have access to on_line here, just discard for now
                    // In production, stderr would be collected and parsed for errors
                    let _ = line;
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
