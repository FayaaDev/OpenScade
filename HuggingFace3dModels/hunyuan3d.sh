#!/usr/bin/env bash

set -euo pipefail

SPACE_ROOT="https://tencent-hunyuan3d-2.hf.space"
API_ROOT="$SPACE_ROOT"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

output_format="glb"
output_path=""
inference_steps=30
guidance_scale="5"
seed=1234
randomize_seed=true
octree_resolution=256
remove_background=true
num_chunks=8000
simplify_mesh=false
target_face_number=10000
print_json=false
debug=false
input_path=""

usage() {
  cat <<'EOF'
Usage: ./hunyuan3d.sh [options] /path/to/image.webp

Options:
  -o, --output PATH              Save downloaded model to PATH
      --format VALUE             glb, obj, ply, or stl (default: glb)
      --inference-steps N        Inference steps (default: 30)
      --guidance-scale VALUE     Guidance scale (default: 5)
      --seed N                   Seed value (default: 1234)
      --no-randomize-seed        Use the provided seed as-is
      --octree-resolution N      Octree resolution (default: 256)
      --no-remove-background     Keep the input background
      --num-chunks N             Number of chunks (default: 8000)
      --simplify-mesh            Enable export mesh simplification
      --target-face-number N     Export target face count (default: 10000)
      --json                     Print final result JSON to stdout
      --debug                    Print raw Hunyuan3D payloads to stderr
  -h, --help                     Show this help

If HF_TOKEN is not already exported, the script will try to load it from
./.env next to the script. The public Space currently works without auth,
but the token is sent when available.
EOF
}

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

require_number() {
  case "$2" in
    ''|*[!0-9]*) fail "$1 must be an integer" ;;
  esac
}

require_decimal() {
  jq -en --arg value "$2" '$value | tonumber' >/dev/null 2>&1 || fail "$1 must be numeric"
}

compact_json() {
  printf '%s' "$1" | jq -c '.'
}

queue_join() {
  local payload="$1"
  "${curl_args[@]}" -X POST "$API_ROOT/queue/join" -H "Content-Type: application/json" -d "$payload"
}

queue_wait() {
  local stage="$1"
  local session_hash="$2"
  local stream
  local completed

  stream="$("${curl_args[@]}" -N "$API_ROOT/queue/data?session_hash=$session_hash")"
  completed="$(printf '%s\n' "$stream" | awk '/^data: / && /"msg":"process_completed"/{line=$0} END{sub(/^data: /, "", line); print line}')"
  [[ -n "$completed" ]] || fail "did not receive process_completed payload"

  if [[ "$debug" == true ]]; then
    printf 'Hunyuan3D %s: %s\n' "$stage" "$(compact_json "$completed")" >&2
  fi

  if [[ "$(printf '%s' "$completed" | jq -r '.success')" != "true" ]]; then
    fail "$stage failed: $(printf '%s' "$completed" | jq -r '.output.error // .title // "Hunyuan3D request failed"')"
  fi

  printf '%s' "$completed"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--output)
      [[ $# -ge 2 ]] || fail "missing value for $1"
      output_path="$2"
      shift 2
      ;;
    --format)
      [[ $# -ge 2 ]] || fail "missing value for $1"
      output_format="$2"
      shift 2
      ;;
    --inference-steps)
      [[ $# -ge 2 ]] || fail "missing value for $1"
      inference_steps="$2"
      shift 2
      ;;
    --guidance-scale)
      [[ $# -ge 2 ]] || fail "missing value for $1"
      guidance_scale="$2"
      shift 2
      ;;
    --seed)
      [[ $# -ge 2 ]] || fail "missing value for $1"
      seed="$2"
      shift 2
      ;;
    --no-randomize-seed)
      randomize_seed=false
      shift
      ;;
    --octree-resolution)
      [[ $# -ge 2 ]] || fail "missing value for $1"
      octree_resolution="$2"
      shift 2
      ;;
    --no-remove-background)
      remove_background=false
      shift
      ;;
    --num-chunks)
      [[ $# -ge 2 ]] || fail "missing value for $1"
      num_chunks="$2"
      shift 2
      ;;
    --simplify-mesh)
      simplify_mesh=true
      shift
      ;;
    --target-face-number)
      [[ $# -ge 2 ]] || fail "missing value for $1"
      target_face_number="$2"
      shift 2
      ;;
    --json)
      print_json=true
      shift
      ;;
    --debug)
      debug=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      fail "unknown option: $1"
      ;;
    *)
      break
      ;;
  esac
done

if [[ $# -ne 1 ]]; then
  fail "exactly one input image path is required"
fi

input_path="$1"
[[ -f "$input_path" ]] || fail "input image does not exist: $input_path"

require_number "inference steps" "$inference_steps"
require_decimal "guidance scale" "$guidance_scale"
require_number "seed" "$seed"
require_number "octree resolution" "$octree_resolution"
require_number "number of chunks" "$num_chunks"
require_number "target face number" "$target_face_number"

case "$output_format" in
  glb|obj|ply|stl) ;;
  *) fail "format must be one of: glb, obj, ply, stl" ;;
esac

if [[ -z "${HF_TOKEN:-}" && -f "$SCRIPT_DIR/.env" ]]; then
  set -a
  . "$SCRIPT_DIR/.env"
  set +a
fi

curl_args=(curl -fsSL)
if [[ -n "${HF_TOKEN:-}" ]]; then
  curl_args+=(-H "Authorization: Bearer $HF_TOKEN")
fi

config="$("${curl_args[@]}" "$SPACE_ROOT/config")"
shape_fn="$(printf '%s' "$config" | jq -r '.dependencies[] | select(.api_name=="shape_generation") | .id')"
export_fn="$(printf '%s' "$config" | jq -r '.dependencies[] | select(.api_name=="on_export_click") | .id')"
shape_trigger_id="$(printf '%s' "$config" | jq -r '.components[] | select(.type=="button" and .props.value=="Gen Shape") | .id')"
export_trigger_id="$(printf '%s' "$config" | jq -r '.components[] | select(.type=="button" and .props.value=="Transform") | .id')"

[[ -n "$shape_fn" && -n "$export_fn" && -n "$shape_trigger_id" && -n "$export_trigger_id" ]] || fail "could not resolve Hunyuan3D endpoint ids"

session_hash="$(uuidgen | tr 'A-Z' 'a-z' | tr -d '-' | cut -c1-11)"
upload_id="$(uuidgen | tr 'A-Z' 'a-z' | tr -d '-' | cut -c1-10)"
upload_path="$("${curl_args[@]}" -X POST "$API_ROOT/upload?upload_id=$upload_id" -F "files=@$input_path" | jq -r '.[0] // empty')"
[[ -n "$upload_path" ]] || fail "image upload did not return a server path"
upload_url="$SPACE_ROOT/file=$upload_path"
upload_size="$(wc -c < "$input_path" | tr -d '[:space:]')"
mime_type="$(file --brief --mime-type "$input_path" 2>/dev/null || printf 'application/octet-stream')"

shape_payload="$(jq -nc \
  --arg path "$upload_path" \
  --arg url "$upload_url" \
  --arg name "$(basename -- "$input_path")" \
  --arg mime_type "$mime_type" \
  --arg session_hash "$session_hash" \
  --argjson fn_index "$shape_fn" \
  --argjson trigger_id "$shape_trigger_id" \
  --argjson size "$upload_size" \
  --argjson inference_steps "$inference_steps" \
  --argjson guidance_scale "$guidance_scale" \
  --argjson seed "$seed" \
  --argjson octree_resolution "$octree_resolution" \
  --argjson remove_background "$remove_background" \
  --argjson num_chunks "$num_chunks" \
  --argjson randomize_seed "$randomize_seed" \
  '{
    data: [
      "",
      {
        path: $path,
        url: $url,
        orig_name: $name,
        size: $size,
        mime_type: $mime_type,
        meta: {_type: "gradio.FileData"}
      },
      null,
      null,
      null,
      null,
      $inference_steps,
      $guidance_scale,
      $seed,
      $octree_resolution,
      $remove_background,
      $num_chunks,
      $randomize_seed
    ],
    event_data: null,
    fn_index: $fn_index,
    trigger_id: $trigger_id,
    session_hash: $session_hash
  }')"

printf 'Started Hunyuan3D shape generation session %s\n' "$session_hash" >&2
queue_join "$shape_payload" >/dev/null
shape_result="$(queue_wait "shape_generation" "$session_hash")"
mesh_file="$(printf '%s' "$shape_result" | jq -c '.output.data[0].value // .output.data[0] // empty')"
mesh_url="$(printf '%s' "$shape_result" | jq -r '.output.data[0].value.url // .output.data[0].url // empty')"
mesh_name="$(printf '%s' "$shape_result" | jq -r '.output.data[0].value.orig_name // .output.data[0].orig_name // "white_mesh.glb"')"
[[ -n "$mesh_file" && -n "$mesh_url" ]] || fail "shape_generation did not return a mesh file"

export_payload="$(jq -nc \
  --argjson mesh_file "$mesh_file" \
  --arg output_format "$output_format" \
  --arg session_hash "$session_hash" \
  --argjson fn_index "$export_fn" \
  --argjson trigger_id "$export_trigger_id" \
  --argjson simplify_mesh "$simplify_mesh" \
  --argjson target_face_number "$target_face_number" \
  '{
    data: [$mesh_file, null, $output_format, $simplify_mesh, false, $target_face_number],
    event_data: null,
    fn_index: $fn_index,
    trigger_id: $trigger_id,
    session_hash: $session_hash
  }')"

printf 'Exporting %s\n' "$output_format" >&2
queue_join "$export_payload" >/dev/null
export_result="$(queue_wait "on_export_click" "$session_hash")"

download_url="$(printf '%s' "$export_result" | jq -r '.output.data[1].value.url // .output.data[1].url // .output.data[0].value.url // .output.data[0].url // empty')"
download_name="$(printf '%s' "$export_result" | jq -r '.output.data[1].value.orig_name // .output.data[1].orig_name // .output.data[0].value.orig_name // .output.data[0].orig_name // empty')"

if [[ -z "$download_url" ]]; then
  download_url="$mesh_url"
  download_name="$mesh_name"
fi

[[ -n "$download_url" ]] || fail "export did not return a download URL"

if [[ -z "$output_path" ]]; then
  mkdir -p "$SCRIPT_DIR/outputs"
  if [[ -n "$download_name" ]]; then
    output_path="$SCRIPT_DIR/outputs/$download_name"
  else
    base_name="$(basename -- "$input_path")"
    base_name="${base_name%.*}"
    output_path="$SCRIPT_DIR/outputs/${base_name}.${output_format}"
  fi
fi

"${curl_args[@]}" "$download_url" -o "$output_path"

printf 'Saved %s to %s\n' "$output_format" "$output_path" >&2

if [[ "$print_json" == true ]]; then
  jq -nc \
    --arg input_path "$input_path" \
    --arg output_path "$output_path" \
    --arg output_format "$output_format" \
    --arg session_hash "$session_hash" \
    --arg download_url "$download_url" \
    --argjson shape_result "$shape_result" \
    --argjson export_result "$export_result" \
    '{input_path: $input_path, output_path: $output_path, output_format: $output_format, session_hash: $session_hash, download_url: $download_url, shape_result: $shape_result, export_result: $export_result}'
fi
