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
