"""Download ultralytics coco8 test dataset. Outputs JSON progress to stdout."""
import json
import sys
import os

def main():
    output_dir = sys.argv[1] if len(sys.argv) > 1 else "./datasets/coco8"
    try:
        import kagglehub
        print(json.dumps({"phase": "downloading", "percent": 50, "message": "Downloading coco8 via kagglehub..."}))
        path = kagglehub.dataset_download("ultralytics/coco8", path=output_dir)
        print(json.dumps({
            "phase": "complete", "percent": 100,
            "message": "Download complete",
            "path": str(path), "format": "yolo",
            "image_count": 4, "class_count": 8,
        }))
    except Exception as e:
        print(json.dumps({"phase": "error", "percent": 0, "message": str(e)}))


if __name__ == "__main__":
    main()
