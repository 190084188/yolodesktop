"""Search HuggingFace datasets. Outputs JSON to stdout."""
import json
import sys
import os


def main():
    keyword = sys.argv[1] if len(sys.argv) > 1 else ""
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    try:
        from huggingface_hub import HfApi
        token = os.environ.get("HF_TOKEN") or None
        api = HfApi(token=token)
        results = list(api.list_datasets(search=keyword, limit=limit))
        output = []
        for ds in results:
            output.append({
                "id": ds.id,
                "name": str(ds.id),
                "description": getattr(ds, "description", "") or "",
                "url": f"https://huggingface.co/datasets/{ds.id}",
                "downloads": getattr(ds, "downloads", 0),
                "tasks": getattr(ds, "tags", []) or [],
                "source": "huggingface",
                "format": "parquet",
            })
        print(json.dumps({"results": output}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e), "results": []}))


if __name__ == "__main__":
    main()
