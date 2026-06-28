---
name: openscad
description: "Create and repair OpenSCAD models, especially Inkscape-cleaned SVG artwork reliefs and technical drawing reconstructions. Use when working with OpenSCAD, SVG path pieces, native technical geometry, Customizer bars, hex-colored models, preview images, STL export, or OrcaSlicer print checks."
---

# OpenSCAD Skill

Use this skill to create, repair, validate, preview, and export OpenSCAD models in this repo.

This skill is the canonical workflow authority for OpenSCAD model work in this repo. `rules.md` is only an entry point that tells agents to load and follow this skill. If this skill and `rules.md` ever conflict, follow this skill.

## Mandatory Activation

Load and follow this skill before any source classification, model creation, final wrapper review, preview generation, STL export, or slicer-readiness assessment.

This requirement applies even when the user already describes the source as a logo, artwork, calligraphy, floor plan, technical drawing, diagram, plaque, sign, badge, or any other source type.

Do not choose a conversion pathway before this skill has been loaded and applied.

## Canonical Rules

This skill owns the durable workflow requirements for:

- source classification.
- pathway selection.
- artwork SVG cleanup.
- technical drawing reconstruction.
- generated/final file separation.
- Customizer and hex-color requirements.
- STL export, CAD Viewer handoff, and OrcaSlicer validation rules.

Update this skill whenever the workflow, command syntax, validation expectations, or execution behavior changes.

## Naming And Language

- Prefer descriptive names in code, comments, parameter names, module names, and explanations.
- Avoid compressed or vague names like `hseg`, `vseg`, `walls_2d`, `tmp`, `shape`, or `part` when a clearer name is practical.
- Name geometry by architectural or modeling role when possible, such as `front_exterior_wall_segment`, `door_opening_gap`, `bathroom_upper_wall_segment`, or `architectural_wall_layout_2d`.
- Improve naming clarity when refactoring unless preserving a stable external API or explicit user request matters more.
- Structure code so future edits can be made by reading names rather than decoding coordinates alone.

## Pathway Decision

Classify every source before choosing a conversion pathway.

If the user has not explicitly chosen one of the pathways, ask with a single-select `question` tool prompt and wait for the answer before creating geometry:

```text
What is the type of file?

Artwork / logo / calligraphy
Technical drawing / floor plan / diagram
```

Do not ask this as a freeform prose question when the `question` tool is available.

Use exactly these single-select labels:

```json
{
  "questions": [
    {
      "header": "File Type",
      "question": "What is the type of file?",
      "multiple": false,
      "options": [
        {
          "label": "Artwork / logo / calligraphy",
          "description": "Preserve the cleaned artwork structure, including meaningful internal detail when present."
        },
        {
          "label": "Technical drawing / floor plan / diagram",
          "description": "Rebuild as clean parametric OpenSCAD geometry."
        }
      ]
    }
  ]
}
```

If the user has already classified the source, continue with the matching pathway after loading this skill. If the user's classification conflicts with the file contents or printability needs, ask one concise clarification question before proceeding.

Choose exactly one pathway:

- **Artwork / logo / calligraphy pathway:** Clean the source in Inkscape, save filled vector artwork as a plain SVG, and keep separated or layered paths when internal detail is important. Then import the SVG or individual SVG path IDs into a customizable OpenSCAD relief wrapper. Prefer this for logos, calligraphy, detailed artwork, silhouettes, badges, signs, and decorative reliefs.
- **Technical drawing pathway:** Use the source only as a visual reference and rebuild directly in OpenSCAD with clean primitives, descriptive modules, consistent feature widths, intentional openings, and editable dimensions. Prefer this for floor plans, diagrams, mechanical layouts, architectural plaques, and dimensioned objects.

## Artwork / Logo / Calligraphy Pathway

- Prepare a high-contrast source with solid artwork and minimal noise before using Inkscape.
- In Inkscape, remove shadows, gradients, blur, texture, stray pixels, and tiny islands that will not print reliably.
- If the source is raster artwork, use Inkscape's built-in bitmap tracing tools only as a starting point, then clean the resulting paths manually.
- Delete the original bitmap before saving the SVG so the final file contains vector paths only.
- Convert strokes to filled paths when strokes define visible geometry.
- Preserve printable internal contours, holes, negative space, and layered detail when they are part of the source intent.
- Use `Path > Union` only when pieces should become one solid artwork body and merging will not erase meaningful internal features, cutouts, or separations needed for the relief.
- Use `Path > Break Apart` when pieces need separate material/color exports.
- Keep piece paths named or identify their SVG IDs so wrappers can import each piece separately.
- Resize the page to the drawing or selection before saving so bounds are predictable.
- Save as plain SVG when possible.
- Preserve closed filled paths; avoid filters, clipping masks, hidden layers, and strokes-only geometry.
- Simplify excessive node counts only enough to avoid heavy geometry; do not destroy sharp tips, corners, or calligraphy character.
- Remove tiny artifacts that will not print reliably unless the user explicitly wants maximum visual fidelity.

## Technical Drawing Pathway

- Do not trace or import a floor plan, technical diagram, or dimensioned layout as final geometry.
- Use the source as a visual reference and rebuild clean geometry directly in OpenSCAD when editability, consistent dimensions, or printability matters more than exact pixel fidelity.
- Represent architectural or technical features with named modules such as `front_exterior_wall_segment`, `door_opening_gap`, `bathroom_upper_wall_segment`, or `mounting_hole_cutout`.
- Normalize repeated dimensions into parameters such as wall thickness, base margin, label height, opening width, corner radius, and target width.
- Use native OpenSCAD primitives such as `square()`, `circle()`, `cube()`, `cylinder()`, `offset()`, `hull()`, `union()`, and `difference()`.
- Document intentional simplifications near the affected dimensions or modules, for example when furniture, shadows, raster noise, or tiny annotation lines are omitted.
- Validate the rebuilt model visually against the source, but prioritize printable, editable geometry over literal pixel matching.

## File Roles

```text
source.png / source.jpg             Source raster reference or artwork
source.svg                          Cleaned plain SVG artwork from Inkscape
models/<name>-svg-final.scad        Editable final artwork wrapper
models/<name>-technical-final.scad  Manually rebuilt technical drawing wrapper
exports/<name>.stl                  Generated export, never hand-edited
```

- Final wrapper files are the editing surface.
- Generated exports are not the editing surface.
- For separated artwork, final wrappers may import individual SVG path IDs or separate SVG files per piece.
- Technical drawing wrappers should define geometry natively instead of importing source artwork as final geometry.

## Final Wrapper Requirements

- Call `main();` once.
- Put Customizer parameters near the top.
- Use Customizer sections in this order when applicable: `/* [Export] */`, `/* [Size] */`, `/* [Heights] */`, `/* [Shape] */`, `/* [Preview Colors] */`.
- Add ranges, steps, or dropdown options to user-tunable parameters.
- Include `target_width`, `base_margin`, `base_thickness`, `relief_height`, `base_corner_radius`, `artwork_offset`, and `show_base` for relief plaques.
- Include `export_part` when separate base/artwork/piece exports are useful.
- Preserve current defaults unless the user explicitly asks for a geometry change.
- Keep source bounds and derived scale values close together.
- Use `epsilon = 0.01;` or another small overlap for relief/base booleans.
- Put the broad base on `z = 0`.
- Center the final model in XY unless another assembly reference is more useful.
- Keep base, raised artwork, offset artwork, and individual piece modules separate.
- Do not hide visible geometry-defining numbers as unexplained inline literals.

Required relief-plaque control pattern:

```scad
/* [Export] */
export_part = "all";       // [all, base, artwork, piece_1]

/* [Size] */
target_width = 120;        // [40:1:220] Final artwork width in mm
base_margin = 4;           // [0:0.5:15] Border around the artwork

/* [Heights] */
base_thickness = 2.0;      // [1:0.2:6] Flat backing plate thickness
relief_height = 2.4;       // [0.6:0.2:8] Raised artwork height above the base

/* [Shape] */
base_corner_radius = 3;    // [0:0.5:12] Rounded backing plate corners
artwork_offset = 0.25;     // [-0.5:0.05:1.5] Grow/shrink artwork contours in mm
show_base = true;          // Add a backing plate
```

## Hex Coloring

- Use hex color strings for every preview color in final wrappers.
- Do not use named OpenSCAD colors like `"white"`, `"black"`, `"red"`, or `"blue"` in final wrappers.
- Prefer variables such as `base_color`, `artwork_color`, and `piece_1_color` over inline colors.
- Put all color variables under `/* [Preview Colors] */`.
- Explain in comments that STL exports do not preserve preview color.
- For color prints, export separate STLs by `export_part` and assign materials/colors in OrcaSlicer or the print service UI.

Recommended color block:

```scad
/* [Preview Colors] */
base_color = "#f8f5ef";    // Backing plate preview color
artwork_color = "#111111"; // Single-color artwork preview color
piece_1_color = "#e63946"; // Piece 1 preview color
piece_2_color = "#f77f00"; // Piece 2 preview color
```

## Tooling

OpenSCAD must be installed. The helper scripts in this skill locate either the CLI binary or the macOS app bundle.

```bash
brew install openscad
```

Run helper scripts from the repo root or from `.agents/skills/openscad/` with adjusted paths.

```bash
./.agents/skills/openscad/tools/validate.sh models/model.scad
./.agents/skills/openscad/tools/preview.sh models/model.scad exports/model.png
./.agents/skills/openscad/tools/multi-preview.sh models/model.scad exports/model_previews
./.agents/skills/openscad/tools/export-stl.sh models/model.scad exports/model.stl
./.agents/skills/openscad/tools/export-stl.sh models/model.scad exports/model_piece_1.stl -D 'export_part="piece_1"'
./.agents/skills/openscad/tools/extract-params.sh models/model.scad
./.agents/skills/openscad/tools/render-with-params.sh models/model.scad exports/model.png -D 'target_width=120'
```

## Execution Pattern

1. Load this skill.
2. Inspect the request and source enough to classify the input.
3. Ask the pathway question with a single-select `question` tool prompt if the user has not explicitly chosen a pathway.
4. Build editable OpenSCAD source, not hand-edited STL output.
5. Use Inkscape-cleaned SVG paths for artwork and native primitives for technical drawings.
6. Validate final wrappers with the local tools.
7. Generate multi-angle previews and inspect them visually.
8. Export STL only after validation and preview inspection pass.
9. After each successful STL export, load the local `cad-viewer` skill and return a Viewer link for the exported STL path.
10. For color/material-separated models, export separate STL files with `export_part` and review each exported STL with `cad-viewer`.
11. Treat OrcaSlicer layer preview as the practical printability checkpoint.

## Export And Validation

- Run the local OpenSCAD validation tool on final wrappers.
- Generate multi-angle previews and inspect them visually.
- Export STL only after validation and preview inspection pass.
- STL does not preserve OpenSCAD preview colors.
- Export `all` only for single-material preview or monochrome printing.
- Export `base`, `artwork`, and each `piece_N` separately for multi-material or color-separated printing.
- After STL export, use the local `cad-viewer` skill to start or reuse CAD Viewer and return review links for the exported STL files.
- Do not auto-start CAD Viewer from `export-stl.sh`; keep viewer startup as an agent-level post-export handoff.
- Confirm imported STL dimensions are correct in millimeters.
- Slice in OrcaSlicer and inspect layer preview before printing or ordering.
- Check small islands, minimum wall paths, thin strokes, missing holes, unsupported islands, and accidental extra bodies.
- If details are too thin, increase `artwork_offset`, increase `target_width`, simplify the source paths, or split pieces differently.
- Do not hand-edit STL files; change the `.scad` source and re-export.

Standard commands:

```bash
./.agents/skills/openscad/tools/validate.sh models/model.scad
./.agents/skills/openscad/tools/multi-preview.sh models/model.scad exports/model_previews
./.agents/skills/openscad/tools/export-stl.sh models/model.scad exports/model.stl
./.agents/skills/openscad/tools/export-stl.sh models/model.scad exports/model_piece_1.stl -D 'export_part="piece_1"'
```

## Quality Gate

Before reporting a model ready, confirm:

- OpenSCAD validation passes.
- previews show the intended model from multiple angles.
- STL dimensions are correct in millimeters.
- CAD Viewer links were returned for exported STL files, or Viewer startup failure was reported.
- OrcaSlicer layer preview shows no missing walls, failed islands, accidental bodies, or unprintable details.

## Skill Maintenance

Good prompts for checking this skill still triggers correctly:

- "Turn this PNG logo into a color-separated OpenSCAD relief with Customizer controls."
- "Rebuild this floor plan as clean OpenSCAD walls on a printable plaque."
- "Refactor this final wrapper so all colors are hex variables and all dimensions appear in the Customizer bar."
