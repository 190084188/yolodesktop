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

    model.add_callback("on_fit_epoch_end", on_fit_epoch_end)

    results = model.train(
        data=args.config,
        project=args.project,
        name=args.name,
        exist_ok=True,
    )

    final = {
        "type": "complete",
        "best_map50": round(float(results.results_dict.get("metrics/mAP50(B)", 0)), 6),
        "best_map50_95": round(float(results.results_dict.get("metrics/mAP50-95(B)", 0)), 6),
    }
    print(f"METRICS:{json.dumps(final)}", flush=True)


if __name__ == "__main__":
    main()
