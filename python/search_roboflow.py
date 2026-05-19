"""Search Roboflow Universe datasets. Outputs JSON to stdout."""
import json
import sys


def main():
    keyword = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        from roboflow import Roboflow
        api_key = sys.argv[2] if len(sys.argv) > 2 else ""
        rf = Roboflow(api_key=api_key) if api_key else Roboflow()
        results = rf.universe.search(query=keyword)
        output = []
        for r in (results if isinstance(results, list) else []):
            output.append({
                "id": str(r.get("id", "")),
                "name": str(r.get("name", "")),
                "description": str(r.get("description", "")),
                "url": f"https://universe.roboflow.com/{r.get('workspace', '')}/{r.get('name', '')}",
                "image_count": r.get("images", 0),
                "class_count": len(r.get("classes", {})) if r.get("classes") else 0,
                "source": "roboflow",
                "format": "yolo",
            })
        print(json.dumps({"results": output}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e), "results": []}))


if __name__ == "__main__":
    main()
