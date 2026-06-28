---
name: inkscape
description: Modify existing SVG artwork through the local Inkscape CLI harness. Use this whenever the user wants to edit, clean up, restyle, relabel, resize, or export an existing SVG logo, badge, poster, icon, diagram, or layered vector asset, even if they do not explicitly mention Inkscape. Especially use it when the task is safer as a structured SVG workflow than hand-editing raw XML.
---

# Inkscape

Use this skill to make controlled edits to an existing SVG by importing it into the
Inkscape CLI project format, inspecting the imported objects, applying minimal
changes, and exporting a new SVG or preview image.

## When To Use This Skill

Use this skill when the user wants to:
- modify an existing `.svg` file instead of creating artwork from scratch
- recolor shapes, adjust text, move or scale elements, or change layer visibility
- update a badge, poster, icon, logo, thumbnail plate, diagram, or similar vector asset
- export a revised SVG and optionally a PNG preview for review

Do not use this skill when:
- the task is primarily raw XML surgery and the user explicitly wants direct source edits
- the SVG contains advanced effects such as filters, masks, clip paths, or other
  unsupported features that must be preserved exactly without simplification

## Mental Model

This harness works from a JSON project file, not by editing the source SVG in place.
For existing artwork, import the SVG into a temporary `.inkscape-cli.json` project,
edit that project, then export a new SVG. This keeps the source file untouched and
makes each change inspectable and reversible.

Imported SVG support is best for:
- `rect`, `circle`, `ellipse`, `line`, `polygon`, `polyline`, `path`, `text`, and `image`
- basic layers represented as Inkscape layer groups
- basic gradients referenced from `<defs>`

Be cautious with:
- filters, masks, clip paths, symbols, complex text layout, and other SVG features
  that are outside the harness model

If the artwork depends on unsupported features, say so clearly and avoid pretending
the export is lossless.

## Local Harness Command

This skill is self-contained under `.agents/skills/inkscape/`.

Always use the repo-local wrapper instead of assuming a globally installed command:

```bash
INKSCAPE_CLI="./.agents/skills/inkscape/tools/cli-anything-inkscape"
```

The wrapper injects the correct `PYTHONPATH` for the bundled harness and runs
`python3 -m cli_anything.inkscape`.

## Default Workflow

### 1. Import the existing SVG

Start by converting the source SVG into an editable project file:

```bash
$INKSCAPE_CLI document import-svg \
  "/abs/path/source.svg" \
  --output "/abs/path/work/project.inkscape-cli.json"
```

Why: this gives you structured objects, layers, and gradients you can inspect and edit.

### 2. Inspect before changing anything

Gather structure first so you change the right object instead of guessing indexes:

```bash
$INKSCAPE_CLI --json --project "/abs/path/work/project.inkscape-cli.json" document info
$INKSCAPE_CLI --json --project "/abs/path/work/project.inkscape-cli.json" layer list
$INKSCAPE_CLI --json --project "/abs/path/work/project.inkscape-cli.json" shape list
$INKSCAPE_CLI --json --project "/abs/path/work/project.inkscape-cli.json" text list
```

If you need to inspect one object in detail:

```bash
$INKSCAPE_CLI --json --project "/abs/path/work/project.inkscape-cli.json" shape get 3
$INKSCAPE_CLI --json --project "/abs/path/work/project.inkscape-cli.json" style get 3
$INKSCAPE_CLI --json --project "/abs/path/work/project.inkscape-cli.json" transform get 3
```

### 3. Make the smallest correct edits

Prefer surgical edits over rebuilding the artwork.

Common patterns:

```bash
# Change text content or typography
$INKSCAPE_CLI --project project.json text set 0 text "Updated copy"
$INKSCAPE_CLI --project project.json text set 0 font-size 64

# Recolor an object
$INKSCAPE_CLI --project project.json style set-fill 2 "#ff5a36"
$INKSCAPE_CLI --project project.json style set-stroke 2 "#111111" --width 2

# Move or scale an object
$INKSCAPE_CLI --project project.json transform translate 2 24 --ty -12
$INKSCAPE_CLI --project project.json transform scale 2 1.1 --sy 1.1

# Hide or reorder layers
$INKSCAPE_CLI --project project.json layer set 1 visible false
$INKSCAPE_CLI --project project.json layer reorder 2 0
```

### 4. Export the revised asset

Always write a new output unless the user explicitly asks to overwrite a target:

```bash
$INKSCAPE_CLI --project project.json export svg "/abs/path/out/revised.svg" --overwrite
$INKSCAPE_CLI --project project.json export png "/abs/path/out/revised.png" --overwrite
```

Exporting a PNG preview is useful because it reveals layout mistakes quickly.

### 5. Verify the result

After export:
- confirm the expected output files exist
- inspect the exported SVG or preview image when the task is visual
- mention any fidelity risk from unsupported SVG features

## Editing Heuristics

- Keep the original SVG unchanged. Import into a work project and export a revised file.
- Inspect object and layer lists before mutating indexes. Index guesses are fragile.
- Prefer editing imported objects over deleting and redrawing unless the structure is clearly broken.
- When editing text, check whether the import produced a text object rather than a path.
- Use wrapped text boxes for long replacement copy so exported lines stay stable.
- If an imported SVG effect is unsupported, tell the user what will be lost and choose a safe fallback.

## Commands That Matter Most

### Document

| Command | Use |
|---------|-----|
| `document import-svg` | Convert an existing SVG into an editable project JSON file |
| `document info` | Inspect canvas size, counts, and object summary |
| `document save` | Persist the working project JSON |
| `document json` | Dump raw project state when debugging |

### Object discovery

| Command | Use |
|---------|-----|
| `shape list` | List imported shapes and indexes |
| `shape get` | Inspect one object deeply |
| `text list` | List text objects and replacement targets |
| `layer list` | Inspect layer order and visibility |
| `style get` | Read an object's current styling |

### Edits

| Command | Use |
|---------|-----|
| `text set` | Replace copy or adjust typography |
| `style set-fill` / `style set-stroke` / `style set-opacity` | Restyle existing objects |
| `transform translate` / `rotate` / `scale` | Reposition objects without rebuilding them |
| `layer set` / `layer reorder` / `layer move-object` | Control layer structure |

### Export

| Command | Use |
|---------|-----|
| `export svg` | Write the revised vector asset |
| `export png` | Produce a quick visual review image |
| `export pdf` | Produce PDF when the environment has Inkscape installed |

## Examples

### Update a logo tagline in an existing SVG

```bash
$INKSCAPE_CLI document import-svg \
  "/abs/path/logo.svg" \
  --output "/abs/path/work/logo.inkscape-cli.json"

$INKSCAPE_CLI --json --project "/abs/path/work/logo.inkscape-cli.json" text list
$INKSCAPE_CLI --project "/abs/path/work/logo.inkscape-cli.json" text set 0 text "Trusted fabrication systems"
$INKSCAPE_CLI --project "/abs/path/work/logo.inkscape-cli.json" export svg "/abs/path/out/logo-updated.svg" --overwrite
```

### Recolor and enlarge a badge icon

```bash
$INKSCAPE_CLI document import-svg \
  "/abs/path/badge.svg" \
  --output "/abs/path/work/badge.inkscape-cli.json"

$INKSCAPE_CLI --json --project "/abs/path/work/badge.inkscape-cli.json" shape list
$INKSCAPE_CLI --project "/abs/path/work/badge.inkscape-cli.json" style set-fill 1 "#f97316"
$INKSCAPE_CLI --project "/abs/path/work/badge.inkscape-cli.json" transform scale 1 1.08 --sy 1.08
$INKSCAPE_CLI --project "/abs/path/work/badge.inkscape-cli.json" export png "/abs/path/out/badge-preview.png" --overwrite
```

## For AI Agents

When using this harness programmatically:
- use absolute paths
- prefer `--json` for inspection commands
- inspect before mutating so object indexes are grounded in actual output
- save the working project JSON when you want a resumable edit state
- export a fresh SVG after modifications instead of assuming the project file is the deliverable
- call out any unsupported imported SVG features instead of silently flattening or dropping them
