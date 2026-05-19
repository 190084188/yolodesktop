use rusqlite::Connection;

pub fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    let version: i32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap_or(0);

    if version < 1 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS yolo_envs (
                id TEXT PRIMARY KEY, version TEXT NOT NULL, venv_path TEXT NOT NULL UNIQUE,
                python_path TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'not_installed',
                cuda_available INTEGER NOT NULL DEFAULT 0, installed_at TEXT
            );
            CREATE TABLE IF NOT EXISTS datasets (
                id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL,
                format TEXT NOT NULL, image_count INTEGER NOT NULL DEFAULT 0,
                class_count INTEGER NOT NULL DEFAULT 0, classes_json TEXT NOT NULL DEFAULT '[]',
                path TEXT NOT NULL, imported_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS training_runs (
                id TEXT PRIMARY KEY, project_id TEXT NOT NULL, dataset_id TEXT NOT NULL,
                env_id TEXT NOT NULL, config_yaml TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'idle', started_at TEXT, ended_at TEXT,
                best_map50 REAL, best_epoch INTEGER, checkpoint_dir TEXT,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS checkpoints (
                id TEXT PRIMARY KEY, run_id TEXT NOT NULL, epoch INTEGER NOT NULL,
                file_path TEXT NOT NULL, loss REAL, map50 REAL, map50_95 REAL,
                file_size INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (run_id) REFERENCES training_runs(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS exported_models (
                id TEXT PRIMARY KEY, run_id TEXT NOT NULL, checkpoint_id TEXT,
                format TEXT NOT NULL, file_path TEXT NOT NULL, file_size INTEGER,
                exported_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (run_id) REFERENCES training_runs(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS annotation_plugins (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL,
                formats_json TEXT NOT NULL DEFAULT '[]', launcher_path TEXT NOT NULL,
                is_installed INTEGER NOT NULL DEFAULT 1,
                installed_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        )?;
        conn.pragma_update(None, "user_version", 1)?;
    }

    if version < 2 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY, value TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS search_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                keyword TEXT NOT NULL, source TEXT NOT NULL,
                filters_json TEXT NOT NULL DEFAULT '{}',
                results_json TEXT NOT NULL, cached_at TEXT NOT NULL DEFAULT (datetime('now')),
                source_updated_at TEXT,
                UNIQUE(keyword, source, filters_json)
            );",
        )?;
        conn.pragma_update(None, "user_version", 2)?;
    }

    if version < 3 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS download_history (
                id TEXT PRIMARY KEY, url TEXT NOT NULL, name TEXT NOT NULL,
                source TEXT NOT NULL, file_path TEXT, file_size INTEGER,
                status TEXT NOT NULL DEFAULT 'pending',
                progress REAL NOT NULL DEFAULT 0,
                started_at TEXT NOT NULL DEFAULT (datetime('now')),
                completed_at TEXT
            );",
        )?;
        conn.pragma_update(None, "user_version", 3)?;
    }

    Ok(())
}
