#!/usr/bin/env python3

import json
import os
import xml.etree.ElementTree as ET
from pathlib import Path


SVG_NS = {"svg": "http://www.w3.org/2000/svg"}


def svg_text_content(root: ET.Element) -> str:
    return " ".join("".join(root.itertext()).split())


def style_map(element: ET.Element) -> dict[str, str]:
    result: dict[str, str] = {}
    raw_style = element.get("style", "")
    for part in raw_style.split(";"):
        if ":" not in part:
            continue
        key, value = part.split(":", 1)
        result[key.strip()] = value.strip()
    for attr in ("fill", "stroke", "opacity"):
        if element.get(attr) is not None:
            result[attr] = str(element.get(attr))
    return result


def visible_summary(user_notes_path: Path) -> dict:
    if not user_notes_path.exists():
        return {"uncertainties": [], "needs_review": [], "workarounds": []}
    lines = [line.strip("- ") for line in user_notes_path.read_text().splitlines() if line.strip().startswith("-")]
    return {"uncertainties": lines, "needs_review": [], "workarounds": []}


def execution_metrics(outputs_dir: Path, transcript: str) -> dict:
    output_chars = 0
    files_created = []
    for child in outputs_dir.iterdir():
        if child.is_file():
            files_created.append(child.name)
            output_chars += child.stat().st_size
    return {
        "tool_calls": {},
        "total_tool_calls": 0,
        "total_steps": transcript.count("```bash"),
        "errors_encountered": 0,
        "output_chars": output_chars,
        "transcript_chars": len(transcript),
        "files_created": files_created,
    }


def grade_eval(eval_id: int, outputs_dir: Path, assertions: list[str]) -> dict:
    revised_svg_path = outputs_dir / "revised.svg"
    project_path = outputs_dir / "project.inkscape-cli.json"
    preview_path = outputs_dir / "preview.png"
    transcript_path = outputs_dir / "transcript.md"
    user_notes_path = outputs_dir / "user_notes.md"

    revised_svg = ET.parse(revised_svg_path).getroot()
    project = json.loads(project_path.read_text()) if project_path.exists() else {}
    transcript = transcript_path.read_text() if transcript_path.exists() else ""
    text_blob = svg_text_content(revised_svg)

    expectations = []

    if eval_id == 0:
        icon = revised_svg.find(".//*[@id='badge-icon']")
        icon_fill = style_map(icon).get("fill", "") if icon is not None else ""
        checks = [
            ("Design Systems Week" in text_blob, f"SVG text content: {text_blob}"),
            (icon_fill == "#f97316", f"badge-icon fill is {icon_fill or 'missing'}"),
            (project_path.exists(), f"project file exists at {project_path.name}"),
        ]
    elif eval_id == 1:
        accent = revised_svg.find(".//*[@id='accent-bar']")
        accent_fill = style_map(accent).get("fill", "") if accent is not None else ""
        overlay = revised_svg.find(".//*[@id='overlay']")
        overlay_style = overlay.get("style", "") if overlay is not None else ""
        checks = [
            ("Public release" in text_blob, f"SVG text content: {text_blob}"),
            (accent_fill == "#0f766e", f"accent-bar fill is {accent_fill or 'missing'}"),
            ("display:none" in overlay_style.replace(" ", ""), f"overlay style is {overlay_style or 'missing'}"),
        ]
    else:
        value_obj = next((obj for obj in project.get("objects", []) if obj.get("id") == "chip-value"), None)
        transform = value_obj.get("transform", "") if value_obj else ""
        moved_right = False
        if value_obj is not None:
            moved_right = float(value_obj.get("x", 44)) > 44
            if not moved_right and "translate(" in transform:
                raw = transform.split("translate(", 1)[1].split(")", 1)[0]
                x_part = raw.split(",", 1)[0].strip()
                try:
                    moved_right = float(x_part) > 0
                except ValueError:
                    moved_right = False
        checks = [
            ("Throughput" in text_blob, f"SVG text content: {text_blob}"),
            (moved_right, f"chip-value x={value_obj.get('x') if value_obj else 'missing'}, transform={transform or 'missing'}"),
            (preview_path.exists() and preview_path.stat().st_size > 0, f"preview.png size is {preview_path.stat().st_size if preview_path.exists() else 0} bytes"),
        ]

    for assertion, (passed, evidence) in zip(assertions, checks):
        expectations.append({
            "text": assertion,
            "passed": passed,
            "evidence": evidence,
        })

    passed_count = sum(1 for item in expectations if item["passed"])
    total = len(expectations)
    summary = {
        "passed": passed_count,
        "failed": total - passed_count,
        "total": total,
        "pass_rate": round(passed_count / total, 2) if total else 0.0,
    }

    grading = {
        "expectations": expectations,
        "summary": summary,
        "execution_metrics": execution_metrics(outputs_dir, transcript),
        "timing": {
            "executor_duration_seconds": 0.0,
            "grader_duration_seconds": 0.0,
            "total_duration_seconds": 0.0,
        },
        "claims": [],
        "user_notes_summary": visible_summary(user_notes_path),
        "eval_feedback": {
            "overall": "No suggestions, evals look solid",
            "suggestions": [],
        },
    }
    return grading


def main() -> None:
    root = Path(__file__).resolve().parent
    for eval_dir in sorted(root.glob("eval-*")):
        metadata = json.loads((eval_dir / "eval_metadata.json").read_text())
        eval_id = metadata["eval_id"]
        assertions = metadata["assertions"]
        for config_dir in [eval_dir / "with_skill", eval_dir / "old_skill"]:
            for run_dir in sorted(config_dir.glob("run-*")):
                outputs_dir = run_dir / "outputs"
                grading = grade_eval(eval_id, outputs_dir, assertions)
                (run_dir / "grading.json").write_text(json.dumps(grading, indent=2))


if __name__ == "__main__":
    main()
