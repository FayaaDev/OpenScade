# User Notes

- The label text was updated from `Latency` to `Throughput` using the Inkscape CLI project workflow, not by editing SVG XML directly.
- The value text was moved slightly right with a `10px` translation to keep the layout visually balanced after the longer label change.
- Uncertainty: the phrase "slightly right" is subjective; `10px` is a conservative nudge rather than a full re-layout.
- Unsupported-feature risk is low for this asset. The source imports cleanly as a basic rect plus two text objects.
- Fidelity note: the harness PNG exporter rejected the document background value `none`, so the preview was exported with an explicit white background override. The SVG itself remains exported from the project without manual XML edits.
