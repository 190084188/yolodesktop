"""Scan for YOLO model (.pt) files. Outputs JSON array to stdout."""
import json
import sys
import os


def scan_directory(directory: str, results: list):
    if not os.path.isdir(directory):
        return
    for root, _, filenames in os.walk(directory):
        for fn in filenames:
            if fn.endswith(".pt"):
                full_path = os.path.join(root, fn)
                try:
                    stat = os.stat(full_path)
                    results.append({
                        "filename": fn,
                        "path": full_path,
                        "size_bytes": stat.st_size,
                        "modified_at": stat.st_mtime,
                    })
                except OSError:
                    pass


def main():
    project_root = sys.argv[1] if len(sys.argv) > 1 else "."
    extra_paths = sys.argv[2] if len(sys.argv) > 2 else ""

    results = []
    cache_dirs = [
        os.path.expanduser("~/.cache/ultralytics"),
        os.path.expanduser("~/.cache/torch/hub/checkpoints"),
    ]
    project_dirs = [
        os.path.join(project_root, "models"),
        os.path.join(project_root, "weights"),
    ]

    for d in cache_dirs + project_dirs:
        scan_directory(d, results)

    if extra_paths:
        for p in extra_paths.split(";"):
            p = p.strip()
            if p:
                scan_directory(p, results)

    # Deduplicate by path
    seen = set()
    unique = []
    for r in results:
        if r["path"] not in seen:
            seen.add(r["path"])
            unique.append(r)

    print(json.dumps(unique, ensure_ascii=False))


if __name__ == "__main__":
    main()
