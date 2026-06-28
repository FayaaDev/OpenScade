# User Notes

- The source SVG imported cleanly as one rectangle and two text objects. I did not see filters, masks, clip paths, or other advanced SVG features that would raise major fidelity risk.
- The value text was moved from `x=44` to `x=58` to keep it visually centered under the longer `Throughput` label. This is a small visual judgment, so a different offset could also be reasonable.
- The harness PNG export failed when it inherited the imported document background value `none`. I worked around that by exporting the preview with `--background "#ffffff"`. The revised SVG keeps the imported project background as `none`.
- The PNG preview comes from the harness renderer, so it is suitable as a quick layout check. For very high-fidelity text rendering comparisons, native Inkscape rasterization may still differ slightly depending on font availability and rendering behavior.
