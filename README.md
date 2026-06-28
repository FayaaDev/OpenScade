# OpenScade

OpenScade turns source artwork references into editable, printable OpenSCAD models. The current deterministic workflow focuses on PNG artwork relief plaques: clean the raster, trace it to SVG, build an OpenSCAD wrapper, validate it, render previews, export STL, and hand off the result to the local CAD Viewer.

You don’t have the use the artwork flow, you can simply describle what you want to build to the OpenScade agent. 

## Features

- PNG artwork-to-STL pipeline using ImageMagick, potrace, SVG cleanup, and OpenSCAD.
- Editable final `.scad` files written under `models/`.
- STL export and preview generation through the local OpenSCAD helper scripts.
- CAD Viewer handoff links for reviewing exported STL files locally.
- Local web app for uploading a PNG to process the image without using the terminal.
- Pre-Saved OpenCode command for a PNG-artwork drawing in `opencode.json`.
- Optional hosted image-to-3D helper scripts under `HuggingFace3dModels/` for generating GLB, OBJ, PLY, or STL assets from images. (Use this method if you want a high-quality, detail-oriainted result)

## Requirements

The primary supported setup is macOS with Homebrew. Equivalent tools can be installed on other operating systems.

Required command-line tools:

- Node.js and npm
- ImageMagick, with the `magick` command available
- potrace
- OpenSCAD

## Quick Install With An Agent

For an agent-driven setup, ask your coding agent to read and implement `prompt.md` from the repo root:

```text
Read prompt.md and implement it end-to-end. Install the required tools, verify the toolchain, run the deterministic artwork pipeline once, start the local web app, and report the generated artifacts and CAD Viewer link or failure reason.
```

`prompt.md` is the full setup and verification runbook for a bare-metal install.

## Manual Installation

Clone the repository:

```bash
git clone git@github.com:FayaaDev/OpenScade.git
cd OpenScade
```

Install system dependencies on macOS:

```bash
brew install node imagemagick potrace openscad
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

The app accepts a single PNG upload and shows the CAD Viewer link when the run completes.

## Run The Artwork Pipeline Directly

Use the deterministic CLI pipeline in two ways:

If you already have a PNG, use the /artwork command. 
Otherwise, describe what you want to create to the openscade agent (default agent in this repo).

The Will generate a STL (for your printer), and an SCADE file if you wish to further edit the result. 

## Repository Layout

- `scripts/artwork-relief-pipeline.mjs`: deterministic PNG artwork relief pipeline.
- `web/`: local upload and progress UI.
- `models/`: editable generated OpenSCAD wrappers.
- `exports/`: generated previews, STL files, manifests, and run outputs.
- `.agents/skills/openscad/`: OpenSCAD validation, preview, and STL export helpers.
- `.agents/skills/cad-viewer/`: local CAD Viewer handoff tooling.
- `HuggingFace3dModels/`: optional hosted image-to-3D scripts.

## Note:
- Do not edit generated STL files; edit the final `.scad` wrapper instead.
