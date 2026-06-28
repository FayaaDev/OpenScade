# User Notes

- The source SVG used only basic layers, rectangles, and text, so it fit the harness well.
- No unsupported filters, masks, clip paths, or symbol-heavy constructs were detected in the source.
- The harness PNG renderer could not initialize with the imported document background value `none`, so `preview.png` was exported with a background override of `#0f172a`.
- This background override affects only the raster preview export. The revised SVG keeps the artwork structure and hidden overlay layer state from the project export.
- The preview should be high fidelity for this file because the artwork is simple and fully covered by a dark background rectangle.
