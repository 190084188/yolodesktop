"""Convert COCO/VOC/YOLO datasets to normalized YOLO format."""
import sys
import json
import argparse
from pathlib import Path
from collections import defaultdict


def detect_format(input_dir: Path) -> str:
    if (input_dir / "labels").exists() and list((input_dir / "labels").glob("*.txt")):
        return "yolo"
    for f in input_dir.glob("*.json"):
        try:
            data = json.loads(f.read_text())
            if "images" in data and "annotations" in data:
                return "coco"
        except (json.JSONDecodeError, KeyError):
            continue
    ann_dir = input_dir / "Annotations"
    if ann_dir.exists() and list(ann_dir.glob("*.xml")):
        return "voc"
    return "unknown"


def get_stats(input_dir: Path, fmt: str) -> dict:
    stats = {
        "format": fmt,
        "image_count": 0,
        "class_names": [],
        "class_counts": {},
    }

    if fmt == "yolo":
        images_dir = input_dir / "images"
        labels_dir = input_dir / "labels"
        if images_dir.exists():
            stats["image_count"] = len([f for f in images_dir.glob("*") if f.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp"}])
        yaml_path = input_dir / "data.yaml"
        if yaml_path.exists():
            import yaml
            with open(yaml_path) as f:
                data = yaml.safe_load(f)
                stats["class_names"] = data.get("names", [])
        if labels_dir.exists():
            counts = defaultdict(int)
            for label_file in labels_dir.glob("*.txt"):
                for line in label_file.read_text().strip().split("\n"):
                    if line.strip():
                        class_id = int(line.split()[0])
                        counts[class_id] += 1
            stats["class_counts"] = dict(counts)

    elif fmt == "coco":
        for f in input_dir.glob("*.json"):
            try:
                data = json.loads(f.read_text())
                if "images" in data:
                    stats["image_count"] = len(data["images"])
                    cats = {c["id"]: c["name"] for c in data.get("categories", [])}
                    stats["class_names"] = list(cats.values())
                    counts = defaultdict(int)
                    for ann in data.get("annotations", []):
                        counts[cats.get(ann["category_id"], str(ann["category_id"]))] += 1
                    stats["class_counts"] = dict(counts)
                    break
            except (json.JSONDecodeError, KeyError):
                continue

    elif fmt == "voc":
        ann_dir = input_dir / "Annotations"
        if ann_dir.exists():
            import xml.etree.ElementTree as ET
            stats["image_count"] = len(list(ann_dir.glob("*.xml")))
            name_counts = defaultdict(int)
            for xml_file in ann_dir.glob("*.xml"):
                tree = ET.parse(xml_file)
                for obj in tree.findall(".//object"):
                    name = obj.find("name")
                    if name is not None and name.text:
                        name_counts[name.text] += 1
            stats["class_names"] = list(name_counts.keys())
            stats["class_counts"] = dict(name_counts)

    return stats


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Input dataset directory")
    parser.add_argument("--output", default=".", help="Output directory for normalized dataset")
    parser.add_argument("--command", default="detect", choices=["detect", "stats"],
                        help="detect format or stats")
    args = parser.parse_args()

    input_dir = Path(args.input)

    if not input_dir.exists():
        print(f"ERROR: directory not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    fmt = detect_format(input_dir)

    if args.command == "detect":
        print(f"FORMAT:{fmt}", flush=True)
    elif args.command == "stats":
        stats = get_stats(input_dir, fmt)
        print(f"STATS:{json.dumps(stats)}", flush=True)


if __name__ == "__main__":
    main()
