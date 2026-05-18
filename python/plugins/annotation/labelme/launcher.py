"""LabelMe annotation launcher stub."""
import sys
import argparse

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", help="Input image directory")
    parser.add_argument("--output", help="Output annotation directory")
    args = parser.parse_args()
    print("LabelMe launcher — install LabelMe via: pip install labelme")
    print(f"Would annotate: {args.input} -> {args.output}")

if __name__ == "__main__":
    main()
