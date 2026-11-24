"""Export saved stories + your notes to the Obsidian second-brain vault (design round 34, option A).

Run on your PC (not on GitHub):   python robot/obsidian_export.py
  --all       export everything saved/noted, not only what's new since the last export
  --dry       print what would be written, write nothing

Writes ONE new file: <vault>/raw/YYYY-MM-DD-investment-center-saved.md (the vault's rule: raw files are dated, never edited).
If that name exists (second export the same day) it adds -2, -3, ... instead of touching the old file.
Then ask Claude to "ingest" it to turn it into wiki pages.
Vault folder: OBSIDIAN_RAW_DIR in .env, else F:\\Claude Project\\Second brain base\\second-brain\\raw
Remembers the last export time in robot/.obsidian_export_state.json (not in git).
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATE = HERE / ".obsidian_export_state.json"
DEFAULT_RAW = Path(r"F:\Claude Project\Second brain base\second-brain\raw")


def load_env():
    env = HERE.parent / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))


def story_md(s, note):
    tick = ", ".join(s.get("tickers") or [])
    links = s.get("links") or []
    link = links[0].get("link") if links and isinstance(links[0], dict) else ""
    out = [f"## {s['headline']}", "",
           f"- **Date:** {str(s.get('created_at', ''))[:10]} · **Impact:** {s.get('impact_score', '?')}/10"
           + (f" · **Mood:** {s['sentiment']}" if s.get("sentiment") else "") + (f" · **Stocks:** {tick}" if tick else ""),
           f"- **Topics:** {', '.join(s.get('topics') or [])}" if s.get("topics") else "",
           f"- **Source:** {', '.join((s.get('outlets') or [])[:3])}" + (f" · {link}" if link else ""), ""]
    pts = s.get("summary") or s.get("key_points") or []
    if isinstance(pts, list) and pts:
        out += [f"- {p}" for p in pts] + [""]
    if s.get("what_it_means"):
        out += [f"**Why it matters:** {s['what_it_means']}", ""]
    if note:
        out += [f"**My note:** {note}", ""]
    return "\n".join(x for x in out if x is not None)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    load_env()
    sys.path.insert(0, str(HERE))
    import db

    raw_dir = Path(os.environ.get("OBSIDIAN_RAW_DIR") or DEFAULT_RAW)
    if not raw_dir.is_dir():
        return print(f"Vault folder not found: {raw_dir}\nSet OBSIDIAN_RAW_DIR in .env to your vault's raw folder.")
    since = None if a.all else json.loads(STATE.read_text()).get("last") if STATE.exists() else None
    uid = os.environ.get("OWNER_USER_ID")
    own = {"user_id": f"eq.{uid}"} if uid else {}
    f = {"created_at": f"gt.{since}"} if since else {}
    saved = db._req("GET", "saved", params={"select": "story_id,created_at", **own, **f}) or []
    notes = db._req("GET", "story_notes", params={"select": "story_id,note,updated_at", **own,
                                                  **({"updated_at": f"gt.{since}"} if since else {})}) or []
    note_of = {n["story_id"]: n["note"] for n in notes}
    ids = list(dict.fromkeys([r["story_id"] for r in saved] + list(note_of)))
    if not ids:
        return print("Nothing new to export" + (f" since {since[:16].replace('T', ' ')} UTC." if since else "."))
    # a story saved earlier but with a NEW note: include its note; a newly saved story: include any older note too
    all_notes = db._req("GET", "story_notes", params={"select": "story_id,note", "story_id": "in.(" + ",".join(ids) + ")", **own}) or []
    note_of.update({n["story_id"]: n["note"] for n in all_notes})
    stories = []
    for i in range(0, len(ids), 40):
        stories += db._req("GET", "stories", params={"select": "*", "id": "in.(" + ",".join(ids[i:i + 40]) + ")"}) or []
    stories.sort(key=lambda s: s.get("created_at", ""), reverse=True)
    now = datetime.now(timezone.utc)
    days = sorted(str(s.get("created_at", ""))[:10] for s in stories)
    head = [f"# Investment Center · saved stories · {days[0]} to {days[-1]}", "",
            f"Exported {now.astimezone().strftime('%Y-%m-%d %H:%M')} from Investment Center (My News). "
            f"{len(stories)} stories ({sum(1 for s in stories if note_of.get(s['id']))} with my notes). "
            "Story text is AI-written (Gemini) from news headlines; check the sources before relying on it.", ""]
    text = "\n".join(head) + "\n" + "\n".join(story_md(s, note_of.get(s["id"])) for s in stories)
    name = f"{now.astimezone().strftime('%Y-%m-%d')}-investment-center-saved"
    path, k = raw_dir / f"{name}.md", 2
    while path.exists():
        path, k = raw_dir / f"{name}-{k}.md", k + 1
    if a.dry:
        return print(f"[dry run] would write {path} ({len(stories)} stories)\n\n{text[:1500]}")
    path.write_text(text, encoding="utf-8")
    STATE.write_text(json.dumps({"last": now.isoformat()}))
    print(f"Wrote {path}\n{len(stories)} stories. Next: ask Claude to \"ingest {path.name}\" in your second brain.")


if __name__ == "__main__":
    main()
