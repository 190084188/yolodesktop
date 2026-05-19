# Supported Dataset Formats

YoloDesktop supports three annotation formats: **YOLO**, **COCO**, and **Pascal VOC**. When scanning a folder, the app automatically detects the format and computes statistics (image count, class names, class distribution).

---

## 1. YOLO

**Directory structure:**

```
dataset/
  data.yaml          # dataset manifest
  images/
    train/
      0001.jpg
      0002.jpg
    val/
      0003.jpg
  labels/
    train/
      0001.txt       # one .txt per image, same stem
      0002.txt
    val/
      0003.txt
```

**`data.yaml` example:**

```yaml
path: ./dataset
train: images/train
val: images/val
nc: 2
names: ['cat', 'dog']
```

**Annotation format (one `.txt` per image):**  
Each line: `class_index center_x center_y width height` (all normalised to [0, 1]).

```
0 0.5123 0.6234 0.2340 0.1890
1 0.3010 0.5120 0.1120 0.0980
```

**Detection heuristic:** Folder contains `data.yaml` (or any `.yaml`), plus `images/` and `labels/` subdirectories.

---

## 2. COCO

**Directory structure:**

```
dataset/
  annotations/
    instances_train2017.json
    instances_val2017.json
  train2017/
    0001.jpg
    0002.jpg
  val2017/
    0003.jpg
```

**Annotation format (single JSON file):**

```json
{
  "images": [
    { "id": 1, "file_name": "0001.jpg", "width": 640, "height": 480 }
  ],
  "annotations": [
    {
      "id": 1,
      "image_id": 1,
      "category_id": 1,
      "bbox": [100, 200, 50, 75],
      "area": 3750,
      "iscrowd": 0
    }
  ],
  "categories": [
    { "id": 1, "name": "cat", "supercategory": "animal" }
  ]
}
```

- `bbox` is `[x, y, width, height]` in absolute pixel coordinates.
- `category_id` references the `categories` array.
- `iscrowd=1` marks a region as a crowd (RLE segmentation instead of polygon).

**Detection heuristic:** Folder contains an `annotations/` subdirectory with at least one `instances_*.json` file.

---

## 3. Pascal VOC

**Directory structure:**

```
dataset/
  Annotations/
    0001.xml
    0002.xml
  JPEGImages/
    0001.jpg
    0002.jpg
  ImageSets/
    Main/
      train.txt
      val.txt
```

**Annotation format (one `.xml` per image):**

```xml
<annotation>
  <filename>0001.jpg</filename>
  <size>
    <width>640</width>
    <height>480</height>
    <depth>3</depth>
  </size>
  <object>
    <name>cat</name>
    <bndbox>
      <xmin>100</xmin>
      <ymin>200</ymin>
      <xmax>150</xmax>
      <ymax>275</ymax>
    </bndbox>
  </object>
</annotation>
```

- Bounding boxes use `(xmin, ymin, xmax, ymax)` in absolute pixel coordinates.
- Multiple `<object>` elements per image for multiple instances.

**Detection heuristic:** Folder contains `Annotations/` and `JPEGImages/` subdirectories.

---

## Format Comparison

| Feature | YOLO | COCO | VOC |
|---|---|---|---|
| Annotations per image | 1 file | 1 merged file | 1 file |
| Annotation file type | `.txt` | `.json` | `.xml` |
| Bbox format | normalised cx/cy/w/h | absolute x/y/w/h | absolute xmin/ymin/xmax/ymax |
| Supports segmentation | No | Yes (polygon + RLE) | No |
| Multi-label / multi-class | Yes | Yes | Yes |
