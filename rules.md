# OpenSCAD Workflow Entry Point

Always load and follow the `openscad` skill before classifying a source, choosing a conversion pathway, creating or reviewing a final `.scad` wrapper, generating previews, exporting STL files, or assessing slicer readiness.

After a successful STL export, load and follow the local `cad-viewer` skill to
return a CAD Viewer review link for each exported STL. Keep this as an
agent-level handoff; do not auto-start CAD Viewer from the OpenSCAD export
scripts.

When raster artwork is involved, offload the image-preparation steps to the
dedicated subagents: use `@imagemagick-png-inspector` for PNG inspection and
ImageMagick cleanup, `@potrace-vectorizer` for monochrome bitmap-to-SVG
conversion, and `@inkscape-svg-cleaner` for the final Inkscape cleanup pass
before OpenSCAD work continues.

For raster artwork, logos, calligraphy, and similar image inputs that need to become
OpenSCAD-importable SVGs, use the local `inkscape` skill as the cleanup and
tracing workflow before importing into OpenSCAD.

When a workflow is launched from `web/` or another saved command, treat it as
an unattended run unless the prompt explicitly says a live user is available.
Do not stop for avoidable clarification when a conservative default preserves
source fidelity and printability. State the assumption in the final summary
instead. If a question is truly required, keep it single-select and include a
clear recommended or default option.

Prefer artifacts derived from the current uploaded source over older similarly
named traced SVGs, cleaned SVGs, or `.scad` wrappers already in the repo.
Reuse older artifacts only when they are explicitly verified as matching the
current source and that reuse is stated.

When the source is a noisy or low-contrast raster, use ImageMagick first to
prepare a cleaner monochrome mask by thresholding, flattening transparency,
cropping, resizing, or boosting contrast as needed then produce a single most detailed and refined PNG. Do not create more than one PNG.
Never reduce artwork to an outer silhouette when internal visual detail is part
of the source. Preserve and refine the internal artwork structure needed for the
final model instead of tracing only the exterior outline.

Reject raster or image inputs that contain visible watermarks, stock-site overlays,
or repeated branding text/strokes. Do not trace, vectorize, or model directly from
watermarked artwork. Ask for a clean source image instead, citing print-quality
reasons: watermarks introduce false edges, tiny junk islands, contour noise,
unreliable relief detail, and poor OpenSCAD/STL import quality.

When the source is a high-contrast bitmap with refined and detailed content, use
`potrace` when it is the fastest way to generate clean vector paths before the
Inkscape cleanup pass, but keep the traced result focused on the artwork's
internal features rather than a silhouette-only outline.

That raster-to-vector preparation should produce:
- use ImageMagick only for preprocessing, not as the final editable vector step
- use `potrace` for monochrome bitmap-to-path conversion when it improves speed or fidelity
- trace the bitmap into vector paths
- preserve meaningful internal artwork detail instead of collapsing the image to a silhouette
- delete the original embedded bitmap from the SVG
- keep only clean filled vector geometry
- fit the page to the drawing or selection so bounds are predictable
- export a plain SVG that OpenSCAD can import cleanly
- break apart the SVG to pieces

Prefer a single-color vector-only SVG when the traced color separation introduces edge
halos or overlapping artifacts that would hurt OpenSCAD import quality.

For local app or saved-command runs, do not consider the cycle complete after
only producing a `.scad` file or exporting STL files. The expected finish line
is: final editable `.scad`, validation pass, preview generation, STL export,
and at least one valid CAD Viewer handoff URL with an absolute `?dir=` value.

Do not infer the image-to-model workflow from this file. If this file and the `openscad` skill ever conflict, the `openscad` skill wins.
