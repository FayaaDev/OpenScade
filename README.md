# OpenScade

OpenScade turns source artwork and technical references into editable, printable OpenSCAD models. The current deterministic workflow focuses on PNG artwork relief plaques: clean the raster, trace it to SVG, build an OpenSCAD wrapper, validate it, render previews, export STL, and hand off the result to the local CAD Viewer.

## Features

- PNG artwork-to-relief pipeline using ImageMagick, potrace, SVG cleanup, and OpenSCAD.
- Editable final `.scad` files written under `models/` instead of treating STL files as the source of truth.
- STL export and preview generation through the local OpenSCAD helper scripts.
- CAD Viewer handoff links for reviewing exported STL files locally.
- Local web app for uploading a PNG, choosing an artwork or technical drawing pathway, and watching stage progress.
- Saved OpenCode commands for artwork and technical drawing workflows in `opencode.json`.
- Optional hosted image-to-3D helper scripts under `HuggingFace3dModels/` for generating GLB, OBJ, PLY, or STL assets from images.

## Requirements

The primary supported setup is macOS with Homebrew. Equivalent tools can be installed on other operating systems.

Required command-line tools:

- Node.js and npm
- ImageMagick, with the `magick` command available
- potrace
- OpenSCAD
- zip

## Installation

Clone the repository:

```bash
git clone git@github.com:FayaaDev/OpenScade.git
cd OpenScade
```

Install system dependencies on macOS:

```bash
brew install node imagemagick potrace openscad zip
```

Install local web app packages:

```bash
npm --prefix web install
```

If the CAD Viewer package is present, install its dependencies too:

```bash
npm --prefix .agents/skills/cad-viewer/scripts/viewer install
```

Verify the toolchain:

```bash
node --version
npm --version
magick --version
potrace --version
zip --version
/bin/bash -lc '. ./.agents/skills/openscad/tools/common.sh && openscad_version'
```

## Run The Local App

Start the local web interface:

```bash
npm --prefix web start
```

Then open:

```text
http://127.0.0.1:4317
```

The app accepts a single PNG upload, asks for the processing pathway, streams progress, and shows the CAD Viewer link when the run completes.

## Run The Artwork Pipeline Directly

Use the deterministic CLI pipeline when you already have a PNG input:

```bash
node scripts/artwork-relief-pipeline.mjs \
  --input path/to/source.png \
  --output-dir exports/example-run \
  --name example
```

Common optional parameters:

```bash
node scripts/artwork-relief-pipeline.mjs \
  --input path/to/source.png \
  --output-dir exports/example-run \
  --name example \
  --target-width 120 \
  --base-margin 4 \
  --base-thickness 2 \
  --relief-height 2.4 \
  --base-corner-radius 3 \
  --artwork-offset 0.25 \
  --threshold 55
```

The run writes generated artifacts under the selected output directory and writes the editable final OpenSCAD wrapper to `models/<name>-svg-final.scad`.

## Repository Layout

- `scripts/artwork-relief-pipeline.mjs`: deterministic PNG artwork relief pipeline.
- `web/`: local upload and progress UI.
- `models/`: editable generated OpenSCAD wrappers.
- `exports/`: generated previews, STL files, manifests, and run outputs.
- `.agents/skills/openscad/`: OpenSCAD validation, preview, and STL export helpers.
- `.agents/skills/cad-viewer/`: local CAD Viewer handoff tooling.
- `HuggingFace3dModels/`: optional hosted image-to-3D scripts.

## Notes

- The deterministic CLI currently supports PNG artwork/logo/calligraphy relief plaques.
- Technical drawing reconstruction is represented as a saved OpenCode workflow, but is not part of the deterministic CLI pipeline yet.
- Do not hand-edit generated STL files; edit the final `.scad` wrapper instead.
