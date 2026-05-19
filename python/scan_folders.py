"""Scan a root directory for dataset subfolders. Outputs JSON array to stdout."""
import json
import sys
import os


def detect_format(subdir: str) -> str:
    files = set(os.listdir(subdir))
    has_yaml = any(f for f in files if f.endswith(".yaml") or f.endswith(".yml"))
    has_images = "images" in files and os.path.isdir(os.path.join(subdir, "images"))
    has_labels = "labels" in files and os.path.isdir(os.path.join(subdir, "labels"))
    if has_yaml and has_images and has_labels:
        return "yolo"

    annotations_dir = os.path.join(subdir, "annotations")
    if os.path.isdir(annotations_dir):
        for f in os.listdir(annotations_dir):
            if f.startswith("instances_") and f.endswith(".json"):
                return "coco"

    has_annotations = "Annotations" in files and os.path.isdir(os.path.join(subdir, "Annotations"))
    has_jpegimages = "JPEGImages" in files and os.path.isdir(os.path.join(subdir, "JPEGImages"))
    if has_annotations and has_jpegimages:
        return "voc"

    return "unknown"


def count_images(subdir: str) -> int:
    image_exts = {".jpg", ".jpeg", ".png", ".bmp", ".tiff"}
    count = 0
    for root, _, filenames in os.walk(subdir):
        for fn in filenames:
            if os.path.splitext(fn)[1].lower() in image_exts:
                count += 1
    return count


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    if not os.path.isdir(root):
        print(json.dumps([]))
        return

    results = []
    for entry in os.listdir(root):
        subdir = os.path.join(root, entry)
        if not os.path.isdir(subdir):
            continue
        fmt = detect_format(subdir)
        results.append({
            "name": entry,
            "path": subdir,
            "format": fmt,
            "image_count": count_images(subdir),
        })

    print(json.dumps(results, ensure_ascii=False))


if __name__ == "__main__":
    main()
