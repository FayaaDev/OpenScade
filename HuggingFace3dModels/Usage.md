# Image To 3D Usage

This folder contains two standalone image-to-3D scripts:

- `sparc3d.sh` converts an existing image into `GLB`, `OBJ`, or `STL`.
- `hunyuan3d.sh` converts an existing image into `GLB`, `OBJ`, `PLY`, or `STL`.
- `pixal3d.sh` converts an existing image into `GLB`.

## Sparc3D

Convert an existing image into a model with Sparc3D:

```bash
./sparc3d.sh "outputs/robot.webp"
```

Choose another format and output path:

```bash
./sparc3d.sh \
  --format stl \
  --output "outputs/robot.stl" \
  "outputs/robot.webp"
```

Check Sparc3D JobId Status
```
curl -fsS \
  -H "appid: 20009406" \
  -H "huggingface: 1" \
  "https://3dserver.hitem3d.ai/aigc/api/generate/result?jobId=<JOBIDHERE>" | jq
```


## Hunyuan3D

Convert an existing image into a model with Hunyuan3D:

```bash
./hunyuan3d.sh "outputs/robot.webp"
```

Choose another format and output path:

```bash
./hunyuan3d.sh \
  --format stl \
  --output "outputs/robot.stl" \
  "outputs/robot.webp"
```

## Pixal3D

Convert an existing image into a GLB model with Pixal3D:

```bash
./pixal3d.sh "outputs/robot.webp"
```

Choose another output path and generation settings:

```bash
./pixal3d.sh \
  --output "outputs/robot-pixal.glb" \
  --resolution 1024 \
  --seed 42 \
  "outputs/robot.webp"
```

Pixal3D currently exports `GLB` only through the public Hugging Face Space API.
Generation time: 50s
Mesh time: 3m