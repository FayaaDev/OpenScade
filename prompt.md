# Deterministic Artwork Pipeline Agent Runbook

Use this document as an agent-driven setup and verification guide for a bare-metal machine. The goal is to install every local tool required to run this repo's fixed `PNG -> SVG -> OpenSCAD -> STL -> CAD Viewer` artwork workflow, then prove the install with one successful pipeline run.

## Agent Assumptions

- The user is starting from a local machine with this repo checked out or available to clone.
- The primary supported setup path is macOS with Homebrew.
- The deterministic local pipeline currently supports the artwork/logo/calligraphy pathway only.
- The technical drawing pathway is intentionally unavailable in deterministic mode until it has a constrained non-AI input model.
- The generated `.scad` file is the editing surface. Do not hand-edit exported STL files.

If any assumption is wrong, ask one concise clarification question before installing tools.

## Success Criteria

Setup is complete only when all of these pass:

- required command-line tools are available from the shell
- the CLI pipeline completes for a PNG input
- `manifest.json` records completed stages and tool versions
- the editable final `.scad` exists under `models/`
- preview PNG files exist under the run output directory
- the STL export exists under the run output directory
- the local web app starts at `http://127.0.0.1:4317`
- the run returns a CAD Viewer URL, or a CAD Viewer startup failure is clearly reported

## Supported Workflow

Supported now:

- single PNG input
- artwork / logo / calligraphy workflow
- single-color relief plaque output
- editable final `.scad`
- validation, previews, STL export, and CAD Viewer handoff

## Agent Setup Checklist

Work from the repo root unless a command says otherwise.

1. Confirm the operating system and shell.
2. Install Homebrew if it is missing.
3. Install Node.js, ImageMagick, potrace, OpenSCAD, and zip support.
4. Verify each required command is reachable.
5. Install local npm packages where package manifests exist.
6. Run the deterministic CLI pipeline with a known PNG.
7. Start the local web app and confirm the browser entry point loads.

## Install System Tools

### macOS With Homebrew

Check for Homebrew:

```bash
brew --version
```

If Homebrew is missing, install it from the official installer:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Install the required tools:

```bash
brew install node imagemagick potrace openscad zip
```

Notes:

- `node` provides both `node` and `npm`.
- ImageMagick must provide the `magick` command.
- OpenSCAD may be available as either a CLI command or through the macOS app bundle. The repo's OpenSCAD helper scripts try to locate both.
- `zip` is usually already present on macOS, but the web app uses it when building downloadable CAD bundles.

### Other Operating Systems

Install equivalent packages with the system package manager. The required commands are:

```text
node
npm
magick
potrace
openscad
zip
```

After installation, run the verification commands below. If `openscad` is not on `PATH`, install the OpenSCAD CLI or configure the local OpenSCAD app/binary so `.agents/skills/openscad/tools/*.sh` can find it.

## Verify Toolchain

Run these checks from the repo root:

```bash
node --version
npm --version
magick --version
potrace --version
zip --version
```

Check OpenSCAD through the repo helper because it supports the macOS app-bundle fallback:

```bash
/bin/bash -lc '. ./.agents/skills/openscad/tools/common.sh && openscad_version'
```

If any command fails, install or repair that tool before continuing.

## Install Local Project Packages

The local web app currently has no external package dependencies, but this command is safe and keeps the setup flow consistent:

```bash
npm --prefix web install
```

CAD Viewer is launched by the pipeline through the local skill at `.agents/skills/cad-viewer/scripts/viewer`. If that directory contains a `package.json`, install its packages before running the pipeline:

```bash
npm --prefix .agents/skills/cad-viewer/scripts/viewer install
```

If the directory is absent or has no package manifest, do not invent a replacement. Report that CAD Viewer local skill files are missing or incomplete.

## CLI Verification Run

Run the deterministic pipeline directly with a known PNG:

```bash
node scripts/artwork-relief-pipeline.mjs \
  --input web/uploads/2026-05-31T16-33-20-716Z-wathba.png \
  --output-dir exports/test-wathba-run \
  --name test-wathba
```

Optional parameters:

```bash
node scripts/artwork-relief-pipeline.mjs \
  --input web/uploads/2026-05-31T16-33-20-716Z-wathba.png \
  --output-dir exports/test-wathba-run \
  --name test-wathba \
  --target-width 120 \
  --base-margin 4 \
  --base-thickness 2 \
  --relief-height 2.4 \
  --base-corner-radius 3 \
  --artwork-offset 0.25 \
  --threshold 55
```

Show help:

```bash
node scripts/artwork-relief-pipeline.mjs --help
```

The pipeline emits JSON progress events on stdout. Treat a non-zero exit code as a setup or pipeline failure and inspect the final error message.

## Expected Artifacts

The pipeline writes intermediate and final artifacts under the chosen output directory:

```text
exports/<run>/
  <name>-refined.png
  <name>-potrace-input.pbm
  <name>-potrace.svg
  <name>-openscad-clean.svg
  <name>.stl
  manifest.json
  preview/
```

It also writes the editable final wrapper here:

```text
models/<name>-svg-final.scad
```

`manifest.json` records:

- artifact paths
- stage status
- stage timings
- tool versions
- CAD Viewer URL when available

## Local Web App

Start the local app:

```bash
node web/server.mjs
```

Then open:

```text
http://127.0.0.1:4317
```

Current app behavior:

- accepts one PNG upload
- asks the user to choose a pathway
- runs the deterministic artwork pipeline locally when `Artwork` is selected
- streams stage progress
- returns a CAD Viewer link when the run completes and CAD Viewer starts successfully

The `Technical Drawing` button remains intentionally unavailable in deterministic mode until that pathway has a constrained non-AI input model.

## CAD Viewer Handoff

The deterministic pipeline currently attempts to start or reuse CAD Viewer automatically through `.agents/skills/cad-viewer/scripts/viewer` and records the returned link in `manifest.json`.

Expected link shape:

```text
http://127.0.0.1:4178/?dir=/absolute/path/to/exports/<run>&file=/absolute/path/to/exports/<run>/<name>.stl
```

If CAD Viewer does not start, the generated `.scad`, previews, and STL can still be valid. Report the CAD Viewer failure separately instead of calling the whole model invalid without checking the earlier artifacts.

## Troubleshooting

### `Required command is unavailable: magick`

Install or repair ImageMagick:

```bash
brew install imagemagick
```

Then verify:

```bash
magick --version
```

### `Required command is unavailable: potrace`

Install potrace:

```bash
brew install potrace
```

Then verify:

```bash
potrace --version
```

### OpenSCAD Validation Or STL Export Fails

Install OpenSCAD:

```bash
brew install openscad
```

Then verify with the repo helper:

```bash
/bin/bash -lc '. ./.agents/skills/openscad/tools/common.sh && openscad_version'
```

### CAD Viewer Does Not Start

Check whether the local viewer package exists:

```bash
npm --prefix .agents/skills/cad-viewer/scripts/viewer run start -- --host 127.0.0.1 --port 4178 --shutdown-after 12h
```

If npm reports a missing package manifest, the local CAD Viewer skill install is incomplete. Restore the skill files before expecting CAD Viewer links.

### Web App Bundle Download Fails

The web app uses `zip` for CAD bundle downloads. Verify it is available:

```bash
zip --version
```

Install it if needed:

```bash
brew install zip
```

### Input Is Rejected

The deterministic pipeline accepts PNG only. The file must:

- have a `.png` extension
- contain a valid PNG signature
- be readable from the local filesystem

### Artwork Looks Too Thick Or Too Thin

Rerun with a different threshold:

```bash
node scripts/artwork-relief-pipeline.mjs \
  --input web/uploads/2026-05-31T16-33-20-716Z-wathba.png \
  --output-dir exports/test-wathba-run-threshold-65 \
  --name test-wathba-threshold-65 \
  --threshold 65
```

Use lower or higher values until the traced SVG preserves the intended internal artwork detail.

## Agent Completion Report

When setup is finished, report:

- installed tool versions
- CLI command used for verification
- generated `.scad` path
- generated STL path
- generated preview directory
- `manifest.json` path
- CAD Viewer URL or CAD Viewer failure reason
- local web app URL

Do not call the machine ready until the verification run has produced the expected artifacts.
