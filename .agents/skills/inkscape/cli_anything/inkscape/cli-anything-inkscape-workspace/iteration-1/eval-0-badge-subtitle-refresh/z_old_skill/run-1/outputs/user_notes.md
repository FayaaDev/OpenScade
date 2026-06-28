# User Notes

- The source SVG was not modified. All edits were applied to a separate imported project JSON and exported to new files.
- No unsupported SVG features were encountered in this badge file. The source only used a background rectangle, one circle, and two text nodes.
- The PNG exporter failed on the imported project because `document.background` came in as `"none"` and this CLI's PNG path could not parse that color value.
- To complete the preview export, I changed only the project JSON document background to `#fff7ed`, which matches the full-canvas background rectangle already present in the artwork. This should not materially change visual fidelity for this badge.
- Text rendering fidelity still depends on local font availability. If `Inter` is missing on another machine, SVG or PNG text metrics could shift slightly.
