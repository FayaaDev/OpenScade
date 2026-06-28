# AGENTS

## Scope

This workspace is a small utility repo for converting images into 3D assets with hosted image-to-3D tools.

Current files:
- `sparc3d.sh`: image-to-3D model generator script
- `hunyuan3d.sh`: image-to-3D model generator script
- `USAGE.md`: quick usage reference
- `.env`: local environment variables such as `HF_TOKEN`

## Working Rules

- Keep changes minimal and local.
- Prefer simple shell scripts over adding new dependencies.
- Do not commit secrets or copy token values into docs.
- Assume `.env` is local-only and should be read, not rewritten, unless explicitly requested.
- Default to ASCII when editing files.

## Script Conventions

- Keep `sparc3d.sh` runnable as a standalone script.
- Keep `hunyuan3d.sh` runnable as a standalone script.
- Preserve support for loading `HF_TOKEN` from `.env` when not already exported.
- Prefer stable CLI flags over breaking interface changes.
- If adding features, keep the image-to-3D paths straightforward and avoid unnecessary abstraction.

## Verification

For script changes, run:

```bash
bash -n "sparc3d.sh"
./sparc3d.sh --help
bash -n "hunyuan3d.sh"
./hunyuan3d.sh --help
```

If the change affects generation behavior, also run a small smoke test such as:

```bash
./sparc3d.sh --output "test.stl" --format stl "test.webp"
./hunyuan3d.sh --output "test.stl" --format stl "test.webp"
```

## Documentation

- Keep `IMAGE_TO_3D_USAGE.md` in sync with CLI behavior.
- Document only the common path unless more detail is clearly needed.
