#!/usr/bin/env python3
"""
Query Function Index (Python side-tool)
=======================================
Looks up functions in .agent-index/functions_index.json (TS atlas) and/or
.agent-index/python_functions_index.json.

Usage:
    python scripts/subfinder/query_function.py <name_or_pattern> [index_path]

Examples:
    python scripts/subfinder/query_function.py ClankAppProvider
    python scripts/subfinder/query_function.py "^fetch.*Market"
"""
import json
import re
import sys
from pathlib import Path


def load_index(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def search(functions, pattern: str):
    regex = re.compile(pattern, re.IGNORECASE)
    return [
        fn for fn in functions
        if regex.search(fn.get("name", "")) or regex.search(fn.get("qualname", ""))
    ]


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/subfinder/query_function.py <name_or_pattern> [index_path]")
        sys.exit(1)

    pattern = sys.argv[1]
    root = Path(".").resolve()

    if len(sys.argv) > 2:
        paths = [Path(sys.argv[2])]
    else:
        paths = [
            root / ".agent-index" / "functions_index.json",
            root / ".agent-index" / "python_functions_index.json",
        ]

    functions = []
    loaded = []
    for index_path in paths:
        if not index_path.exists():
            continue
        index = load_index(index_path)
        functions.extend(index.get("functions", []))
        loaded.append(str(index_path))

    if not loaded:
        print("Index not found. Run:")
        print("  npm run index:functions")
        print("  python scripts/subfinder/build_function_index.py .")
        sys.exit(1)

    matches = search(functions, pattern)
    if not matches:
        print(f"No functions matching '{pattern}' found.")
        return

    print(f"Sources: {', '.join(loaded)}")
    print(f"Found {len(matches)} match(es)\n")
    for fn in matches:
        location = f"{fn['file']}:{fn['line_start']}-{fn['line_end']}"
        print(f"{fn['qualname']}  ->  {location}")
        print(f"  {fn.get('signature', '')}")
        if fn.get("docstring"):
            print(f"  \"{fn['docstring'][:100]}\"")
        print()


if __name__ == "__main__":
    main()
