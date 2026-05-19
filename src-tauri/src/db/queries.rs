use crate::db::DbState;
use crate::errors::AppResult;
use rusqlite::params;
use rusqlite::Connection;

// ---- Projects ----

#[derive(Debug, Clone, serde::Serialize)]
pub struct ProjectRow {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: String,
    pub updated_at: String,
}

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
         VALUES (?1, ?2, ?3, ?4, ?5, 'running', datetime('now'), ?6)",
        params![row.id, row.project_id, row.dataset_id, row.env_id, row.config_yaml, row.checkpoint_dir],
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

// --- Settings ---

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>, rusqlite::Error> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let result = stmt.query_row([key], |row| row.get::<_, String>(0));
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = datetime('now')",
        [key, value],
    )?;
    Ok(())
}

// --- Search Cache ---

pub fn get_search_cache(
    conn: &Connection,
    keyword: &str,
    source: &str,
    filters_json: &str,
) -> Result<Option<String>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT results_json FROM search_cache
         WHERE keyword = ?1 AND source = ?2 AND filters_json = ?3
         AND cached_at > datetime('now', '-1 hour')",
    )?;
    let result = stmt.query_row(rusqlite::params![keyword, source, filters_json], |row| {
        row.get::<_, String>(0)
    });
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn set_search_cache(
    conn: &Connection,
    keyword: &str,
    source: &str,
    filters_json: &str,
    results_json: &str,
    source_updated_at: Option<&str>,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO search_cache (keyword, source, filters_json, results_json, cached_at, source_updated_at)
         VALUES (?1, ?2, ?3, ?4, datetime('now'), ?5)
         ON CONFLICT(keyword, source, filters_json) DO UPDATE
         SET results_json = ?4, cached_at = datetime('now'), source_updated_at = ?5",
        rusqlite::params![keyword, source, filters_json, results_json, source_updated_at],
    )?;
    Ok(())
}
