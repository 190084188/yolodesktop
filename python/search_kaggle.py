"""Search Kaggle datasets. Outputs JSON to stdout."""
import json
import sys
import os


def main():
    keyword = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        import kagglehub
        kaggle_dir = os.path.expanduser("~/.kaggle")
        kaggle_json = os.path.join(kaggle_dir, "kaggle.json")
        if not os.path.exists(kaggle_json):
            print(json.dumps({"error": "kaggle_not_configured", "results": []}))
            return

        results = kagglehub.dataset_search(keyword)
        output = []
        for r in (results[:20] if isinstance(results, list) else []):
            output.append({
                "id": str(r.get("ref", "")),
                "name": str(r.get("title", "")),
                "description": str(r.get("subtitle", "")),
                "url": f"https://www.kaggle.com/datasets/{r.get('ref', '')}",
                "size": str(r.get("size", "")),
                "download_count": r.get("downloadCount", 0),
                "source": "kaggle",
                "format": "various",
            })
        print(json.dumps({"results": output}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e), "results": []}))


if __name__ == "__main__":
    main()
