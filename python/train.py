"""Yolo training script called by Rust backend. Emits metrics per epoch on stdout."""
import sys
import json
import time
import threading
import argparse
from pathlib import Path
from ultralytics import YOLO


# ── GPU Monitoring ────────────────────────────────────────────────────────────

HAS_NVML = False
try:
    import pynvml
    pynvml.nvmlInit()
    HAS_NVML = True
except Exception:
    pass


def get_gpu_stats():
    """Return dict with gpu_name, utilization_pct, memory_used_mb, memory_total_mb."""
    stats = {"gpu_name": "unknown", "utilization_pct": 0.0, "memory_used_mb": 0.0, "memory_total_mb": 0.0}
    if HAS_NVML:
        try:
            count = pynvml.nvmlDeviceGetCount()
            if count > 0:
                handle = pynvml.nvmlDeviceGetHandleByIndex(0)
                util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
                name = pynvml.nvmlDeviceGetName(handle) or "unknown"
                stats["gpu_name"] = name
                stats["utilization_pct"] = float(util.gpu)
                stats["memory_used_mb"] = round(float(mem.used) / (1024 * 1024), 1)
                stats["memory_total_mb"] = round(float(mem.total) / (1024 * 1024), 1)
        except Exception:
            pass
    else:
        try:
            import torch
            if torch.cuda.is_available():
                stats["gpu_name"] = torch.cuda.get_device_name(0)
                allocated = torch.cuda.memory_allocated(0) / (1024 * 1024)
                reserved = torch.cuda.memory_reserved(0) / (1024 * 1024)
                stats["memory_used_mb"] = round(allocated, 1)
                stats["memory_total_mb"] = round(reserved, 1)
                # Approximate utilization from memory pressure
                if reserved > 0:
                    stats["utilization_pct"] = round(min(100.0, (allocated / max(reserved, 1)) * 100), 1)
        except Exception:
            pass
    return stats


def gpu_monitor_thread(stop_event):
    """Background thread that emits GPU stats with adaptive polling interval."""
    warmup_end = time.time() + 30.0
    last_util = -1.0
    while not stop_event.is_set():
        stats = get_gpu_stats()
        stats["type"] = "gpu-stats"
        stats["timestamp"] = time.time()
        print(f"METRICS:{json.dumps(stats)}", flush=True)

        cur_util = stats["utilization_pct"]
        # Determine next polling interval
        if time.time() < warmup_end:
            interval = 2.0  # warmup: poll every 2s
        elif abs(cur_util - last_util) > 20.0:
            interval = 2.0  # burst: large utilization change
        else:
            interval = 10.0  # stable: poll every 10s
        last_util = cur_util
        stop_event.wait(interval)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, help="Path to training YAML config")
    parser.add_argument("--model", default="yolov8n.pt", help="Starting model/weights")
    parser.add_argument("--project", required=True, help="Output directory for checkpoints")
    parser.add_argument("--name", default="train", help="Experiment name")
    parser.add_argument("--device", default=None, help="Device to run training on (cpu, cuda:0, 0, 0,1,2, etc.)")
    args = parser.parse_args()

    config_path = Path(args.config)
    if not config_path.exists():
        print(f"ERROR: config not found: {args.config}", file=sys.stderr)
        sys.exit(1)

    # Parse YAML config to extract training parameters
    train_kwargs = {
        "project": args.project,
        "name": args.name,
        "exist_ok": True,
    }

    # Extract known training params from the YAML config file
    known_params = {
        "epochs", "batch", "imgsz", "device", "workers", "patience",
        "save_period", "cos_lr", "close_mosaic", "amp", "seed",
        "deterministic", "single_cls", "rect", "resume", "fraction",
        "freeze", "multi_scale", "save", "exist_ok",
        "optimizer", "lr0", "lrf", "momentum", "weight_decay",
        "warmup_epochs", "warmup_momentum", "warmup_bias_lr",
        "box", "cls", "dfl", "label_smoothing", "nbs",
        "hsv_h", "hsv_s", "hsv_v", "degrees", "translate", "scale",
        "shear", "perspective", "flipud", "fliplr", "mosaic", "mixup",
        "copy_paste", "erasing", "crop_fraction",
    }

    try:
        import yaml as _yaml_lib
    except ImportError:
        _yaml_lib = None

    config_params = {}
    if _yaml_lib is not None:
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                config_data = _yaml_lib.safe_load(f)
            if isinstance(config_data, dict):
                for k, v in config_data.items():
                    if k in known_params and v is not None:
                        config_params[k] = v
        except Exception:
            pass
    else:
        # Fallback: simple line-by-line parsing
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    parts = line.split(":", 1)
                    if len(parts) == 2:
                        key = parts[0].strip()
                        value = parts[1].strip()
                        if key in known_params:
                            try:
                                if value.lower() in ("true", "false"):
                                    config_params[key] = value.lower() == "true"
                                elif "." in value or value.lstrip("-").replace(".", "").isdigit():
                                    config_params[key] = float(value)
                                    if config_params[key] == int(config_params[key]):
                                        config_params[key] = int(config_params[key])
                                else:
                                    config_params[key] = value
                            except ValueError:
                                config_params[key] = value
        except Exception:
            pass

    # CLI --device overrides YAML device
    if args.device is not None:
        config_params["device"] = args.device

    # Remove data-related keys not meant for model.train()
    non_train_params = {"path", "train", "val", "test", "names", "nc"}
    for k in non_train_params:
        config_params.pop(k, None)

    train_kwargs.update(config_params)

    model = YOLO(args.model)

    # Per-epoch metrics callback
    def on_fit_epoch_end(trainer):
        metrics = trainer.metrics
        epoch = trainer.epoch + 1
        output = {
            "type": "metrics",
            "epoch": epoch,
            "loss": round(float(metrics.get("box_loss", 0)), 6),
            "cls_loss": round(float(metrics.get("cls_loss", 0)), 6),
            "dfl_loss": round(float(metrics.get("dfl_loss", 0)), 6),
        }
        if hasattr(trainer, "validator") and trainer.validator is not None:
            val_metrics = trainer.validator.metrics
            output["map50"] = round(float(val_metrics.get("metrics/mAP50(B)", 0)), 6)
            output["map50_95"] = round(float(val_metrics.get("metrics/mAP50-95(B)", 0)), 6)
            output["precision"] = round(float(val_metrics.get("metrics/precision(B)", 0)), 6)
            output["recall"] = round(float(val_metrics.get("metrics/recall(B)", 0)), 6)
        print(f"METRICS:{json.dumps(output)}", flush=True)

    # Training complete callback
    best_epoch_val = [None]  # mutable container for inner function
    best_map50_val = [0.0]

    def on_train_end(trainer):
        nonlocal best_epoch_val, best_map50_val
        try:
            best_epoch_val[0] = getattr(trainer, "best_epoch", None)
            if best_epoch_val[0] is None:
                best_epoch_val[0] = trainer.epoch
            if hasattr(trainer, "validator") and trainer.validator is not None:
                val_metrics = trainer.validator.metrics
                best_map50_val[0] = float(val_metrics.get("metrics/mAP50(B)", 0))
        except Exception:
            if best_epoch_val[0] is None:
                best_epoch_val[0] = trainer.epoch

    model.add_callback("on_fit_epoch_end", on_fit_epoch_end)
    model.add_callback("on_train_end", on_train_end)

    # Start GPU monitoring background thread
    gpu_stop_event = threading.Event()
    gpu_thread = threading.Thread(target=gpu_monitor_thread, args=(gpu_stop_event,), daemon=True)
    gpu_thread.start()

    try:
        results = model.train(
            data=args.config,
            **train_kwargs,
        )

        final = {
            "type": "complete",
            "best_map50": round(float(results.results_dict.get("metrics/mAP50(B)", 0)), 6),
            "best_map50_95": round(float(results.results_dict.get("metrics/mAP50-95(B)", 0)), 6),
            "best_epoch": best_epoch_val[0] if best_epoch_val[0] is not None else results.epoch,
        }
        print(f"METRICS:{json.dumps(final)}", flush=True)
    finally:
        gpu_stop_event.set()
        gpu_thread.join(timeout=5)


if __name__ == "__main__":
    main()
