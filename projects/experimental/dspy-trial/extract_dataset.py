#!/usr/bin/env python3
"""Extract (content, tags) pairs from Obsidian vault for DSPy training."""

import os
import re
import json
import random
from pathlib import Path

VAULT_DIR = Path(os.path.expanduser("~/YD 2026/obsidian"))
OUTPUT_FILE = Path(__file__).parent / "dataset.json"

SKIP_PATTERNS = {"_index.md", "_tags.md", "_graph.md", "_graph_visual.md", "CONVENTIONS.md", "CLAUDE.md"}
SKIP_DIRS = {"templates", ".claude", ".obsidian"}


def parse_frontmatter(content: str) -> dict | None:
    match = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
    if not match:
        return None
    fm = {}
    for line in match.group(1).split("\n"):
        if ":" in line:
            key, val = line.split(":", 1)
            key, val = key.strip(), val.strip()
            if val.startswith("[") and val.endswith("]"):
                items = [s.strip().strip('"').strip("'") for s in val[1:-1].split(",")]
                fm[key] = [i for i in items if i]
            else:
                fm[key] = val.strip('"').strip("'")
    return fm


def extract_body(content: str, max_chars: int = 1500) -> str:
    match = re.match(r"^---\n.*?\n---\n", content, re.DOTALL)
    body = content[match.end():] if match else content
    body = re.sub(r"^#+\s+", "", body, flags=re.MULTILINE)
    body = re.sub(r"\n{3,}", "\n\n", body).strip()
    return body[:max_chars]


def collect_notes() -> list[dict]:
    notes = []
    for md_file in VAULT_DIR.rglob("*.md"):
        if md_file.name in SKIP_PATTERNS:
            continue
        if any(d in md_file.parts for d in SKIP_DIRS):
            continue
        content = md_file.read_text(encoding="utf-8")
        fm = parse_frontmatter(content)
        if not fm or "tags" not in fm or not fm["tags"]:
            continue
        notes.append({
            "file": str(md_file.relative_to(VAULT_DIR)),
            "title": fm.get("title", md_file.stem),
            "type": fm.get("type", ""),
            "summary": fm.get("summary", ""),
            "content": extract_body(content),
            "tags": fm["tags"],
        })
    return notes


def split_dataset(notes, train_ratio=0.7, seed=42):
    random.seed(seed)
    shuffled = notes.copy()
    random.shuffle(shuffled)
    split_idx = int(len(shuffled) * train_ratio)
    return shuffled[:split_idx], shuffled[split_idx:]


def main():
    notes = collect_notes()
    train, test = split_dataset(notes)
    all_tags = sorted(set(t for n in notes for t in n["tags"]))

    dataset = {
        "total_notes": len(notes),
        "train_count": len(train),
        "test_count": len(test),
        "unique_tags": all_tags,
        "tag_count": len(all_tags),
        "train": train,
        "test": test,
    }
    OUTPUT_FILE.write_text(json.dumps(dataset, ensure_ascii=False, indent=2))
    print(f"Extracted {len(notes)} notes with tags")
    print(f"  Train: {len(train)}, Test: {len(test)}")
    print(f"  Unique tags: {len(all_tags)}")
    print(f"  Saved to: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
