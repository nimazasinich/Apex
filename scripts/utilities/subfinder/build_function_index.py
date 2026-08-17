#!/usr/bin/env python3
"""
Function Indexer (Python side-tool)
===================================
Walks Python files in the repo and merges into .agent-index/python_functions_index.json.
Primary TypeScript/TSX indexing is handled by:
  npm run index:functions
  npm run index:functions:watch

Usage:
    python scripts/subfinder/build_function_index.py [root_dir] [output_path]

Example:
    python scripts/subfinder/build_function_index.py .
"""
import ast
import hashlib
import json
import sys
from pathlib import Path
from datetime import datetime, timezone

EXCLUDE_DIRS = {
    ".git", "__pycache__", "venv", ".venv", "env", "node_modules",
    "dist", "build", ".mypy_cache", ".pytest_cache", ".agent-index",
    "temp", "tmp", "_archive",
}


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def get_signature(node) -> str:
    args = [a.arg for a in node.args.args]
    if node.args.vararg:
        args.append("*" + node.args.vararg.arg)
    args += [a.arg for a in node.args.kwonlyargs]
    if node.args.kwarg:
        args.append("**" + node.args.kwarg.arg)
    prefix = "async def" if isinstance(node, ast.AsyncFunctionDef) else "def"
    return f"{prefix} {node.name}({', '.join(args)})"


def extract_functions(filepath: Path, rel_path: str):
    try:
        source = filepath.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(filepath))
    except (SyntaxError, UnicodeDecodeError):
        return []

    results = []

    class Visitor(ast.NodeVisitor):
        def __init__(self):
            self.class_stack = []

        def visit_ClassDef(self, node):
            self.class_stack.append(node.name)
            self.generic_visit(node)
            self.class_stack.pop()

        def _handle_func(self, node):
            qualname = ".".join(self.class_stack + [node.name])
            try:
                decorators = [ast.unparse(d) for d in node.decorator_list]
            except Exception:
                decorators = []
            docstring = ast.get_docstring(node) or ""
            results.append({
                "name": node.name,
                "qualname": qualname,
                "file": rel_path,
                "line_start": node.lineno,
                "line_end": getattr(node, "end_lineno", node.lineno),
                "signature": get_signature(node),
                "docstring": docstring[:300],
                "decorators": decorators,
                "is_async": isinstance(node, ast.AsyncFunctionDef),
                "kind": "method" if self.class_stack else "function",
                "tags": ["python"],
            })
            self.generic_visit(node)

        def visit_FunctionDef(self, node):
            self._handle_func(node)

        def visit_AsyncFunctionDef(self, node):
            self._handle_func(node)

    Visitor().visit(tree)
    return results


def build_index(root: Path):
    functions = []
    file_hashes = {}
    for py_file in root.rglob("*.py"):
        if any(part in EXCLUDE_DIRS for part in py_file.parts):
            continue
        rel_path = str(py_file.relative_to(root)).replace("\\", "/")
        funcs = extract_functions(py_file, rel_path)
        functions.extend(funcs)
        file_hashes[rel_path] = file_hash(py_file)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "root": str(root),
        "total_functions": len(functions),
        "file_hashes": file_hashes,
        "functions": functions,
    }


def main():
    root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(".").resolve()
    output = (
        Path(sys.argv[2]).resolve()
        if len(sys.argv) > 2
        else root / ".agent-index" / "python_functions_index.json"
    )
    output.parent.mkdir(parents=True, exist_ok=True)

    index = build_index(root)
    output.write_text(json.dumps(index, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Indexed {index['total_functions']} Python functions from {root}")
    print(f"Written to: {output}")
    print("Note: For TypeScript/TSX use `npm run index:functions` (primary).")


if __name__ == "__main__":
    main()
