#!/usr/bin/env bash

set -euo pipefail

SPACE_ROOT="https://3dserver.hitem3d.ai"
API_ROOT="$SPACE_ROOT/aigc/api"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

resolution="1536"
output_format="glb"
output_path=""
timeout_seconds=1800
poll_interval=3
print_json=false
input_path=""

usage() {
  cat <<'EOF'
Usage: ./sparc3d.sh [options] /path/to/image.webp

Options:
  -o, --output PATH          Save downloaded model to PATH
      --format VALUE         glb, obj, or stl (default: glb)
      --resolution VALUE     Only 1536 is currently supported (default: 1536)
      --timeout-seconds N    Stop polling after N seconds (default: 1800)
      --poll-interval N      Poll every N seconds (default: 3)
      --json                 Print final result JSON to stdout
  -h, --help                 Show this help

Sparc3D currently runs behind the hosted Hitem3D app rather than a public
Gradio queue. This script talks to that app directly and does not require
HF_TOKEN.
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
    --resolution)
      [[ $# -ge 2 ]] || fail "missing value for $1"
      resolution="$2"
      shift 2
      ;;
    --timeout-seconds)
      [[ $# -ge 2 ]] || fail "missing value for $1"
      timeout_seconds="$2"
      shift 2
      ;;
    --poll-interval)
      [[ $# -ge 2 ]] || fail "missing value for $1"
      poll_interval="$2"
      shift 2
      ;;
    --json)
      print_json=true
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

require_number "timeout seconds" "$timeout_seconds"
require_number "poll interval" "$poll_interval"

case "$resolution" in
  1536) ;;
  *) fail "resolution must be 1536 for the current Sparc3D app" ;;
esac

case "$output_format" in
  glb|obj|stl) ;;
  *) fail "format must be one of: glb, obj, stl" ;;
esac

cookie_jar="$(mktemp "${TMPDIR:-/tmp}/sparc3d-cookie.XXXXXX")"
trap 'rm -f "$cookie_jar"' EXIT

curl_args=(
  curl
  -fsSL
  -c "$cookie_jar"
  -b "$cookie_jar"
  -H "appid: 20009406"
  -H "huggingface: 1"
)

# Prime the guest cookie used by the hosted app. The endpoint returns 401 for
# anonymous users, but still sets the cookie we need for generation.
"${curl_args[@]}" "$API_ROOT/user/info" >/dev/null || true

start_response="$("${curl_args[@]}" \
  -F "sourceImage=@$input_path" \
  -F "voxelResolution=$resolution" \
  -F "version=v1.5" \
  "$API_ROOT/generate/img2model3d")"

if [[ "$(printf '%s' "$start_response" | jq -r '.code // empty')" != "200" ]]; then
  fail "generation request failed: $(printf '%s' "$start_response" | jq -r '.msg // "request failed"')"
fi

job_id="$(printf '%s' "$start_response" | jq -r '.data.jobId // empty')"
[[ -n "$job_id" ]] || fail "generation request did not return a job id"

printf 'Started Sparc3D job %s\n' "$job_id" >&2

deadline=$((SECONDS + timeout_seconds))
result_response=""

while :; do
  result_response="$("${curl_args[@]}" "$API_ROOT/generate/result?jobId=$job_id")"

  if [[ "$(printf '%s' "$result_response" | jq -r '.code // empty')" != "200" ]]; then
    fail "result polling failed: $(printf '%s' "$result_response" | jq -r '.msg // "request failed"')"
  fi

  progress="$(printf '%s' "$result_response" | jq -r '.data.percentage // 0')"
  position="$(printf '%s' "$result_response" | jq -r '.data.position // empty')"
  status="$(printf '%s' "$result_response" | jq -r '.data.status // empty')"
  model_count="$(printf '%s' "$result_response" | jq -r '.data.model3ds | length? // 0')"

  if [[ "$model_count" != "0" && "$progress" == "100" ]]; then
    break
  fi

  if [[ $SECONDS -ge $deadline ]]; then
    fail "timed out waiting for Sparc3D job to finish"
  fi

  if [[ -n "$position" && "$position" != "null" ]]; then
    printf 'Progress: %s%% (queue position: %s, status: %s)\n' "$progress" "$position" "$status" >&2
  else
    printf 'Progress: %s%% (status: %s)\n' "$progress" "$status" >&2
  fi

  sleep "$poll_interval"
done

model_glb_url="$(printf '%s' "$result_response" | jq -r '.data.model3ds[0].model3DGlbUrl // empty')"
model_obj_url="$(printf '%s' "$result_response" | jq -r '.data.model3ds[0].model3DObjUrl // empty')"
model_stl_url="$(printf '%s' "$result_response" | jq -r '.data.model3ds[0].model3DStlUrl // empty')"
source_image_url="$(printf '%s' "$result_response" | jq -r '.data.model3ds[0].sourceImageUrl // empty')"
num_vertices="$(printf '%s' "$result_response" | jq -r '.data.model3ds[0].numVertices // empty')"
num_faces="$(printf '%s' "$result_response" | jq -r '.data.model3ds[0].numFaces // empty')"

case "$output_format" in
  glb) download_url="$model_glb_url" ;;
  obj) download_url="$model_obj_url" ;;
  stl) download_url="$model_stl_url" ;;
esac

[[ -n "$download_url" ]] || fail "completed job did not include a $output_format download URL"

if [[ -z "$output_path" ]]; then
  mkdir -p "$SCRIPT_DIR/outputs"
  base_name="$(basename -- "$input_path")"
  base_name="${base_name%.*}"
  output_path="$SCRIPT_DIR/outputs/${base_name}.${output_format}"
fi

"${curl_args[@]}" "$download_url" -o "$output_path"

printf 'Saved %s to %s\n' "$output_format" "$output_path" >&2
[[ -n "$num_vertices" ]] && printf 'Vertices: %s\n' "$num_vertices" >&2
[[ -n "$num_faces" ]] && printf 'Faces: %s\n' "$num_faces" >&2

if [[ "$print_json" == true ]]; then
  jq -nc \
    --arg input_path "$input_path" \
    --arg output_path "$output_path" \
    --arg output_format "$output_format" \
    --arg job_id "$job_id" \
    --arg download_url "$download_url" \
    --arg source_image_url "$source_image_url" \
    --argjson result "$result_response" \
    '{input_path: $input_path, output_path: $output_path, output_format: $output_format, job_id: $job_id, download_url: $download_url, source_image_url: $source_image_url, result: $result}'
fi
