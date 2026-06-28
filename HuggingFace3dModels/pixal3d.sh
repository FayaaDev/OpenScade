#!/usr/bin/env bash

set -euo pipefail

SPACE_ROOT="https://tencentarc-pixal3d.hf.space"
API_ROOT="$SPACE_ROOT/gradio_api"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

output_path=""
seed=1234
resolution=1536
decimation_target=200000
texture_size=1024
print_json=false
debug=false
input_path=""

usage() {
  cat <<'EOF'
Usage: ./pixal3d.sh [options] /path/to/image.webp

Options:
  -o, --output PATH            Save downloaded model to PATH
      --seed N                 Seed value (default: 1234)
      --resolution VALUE       1024 or 1536 (default: 1536)
      --decimation-target N    Mesh decimation target (default: 200000)
      --texture-size N         Texture size for GLB export (default: 1024)
      --json                   Print final result JSON to stdout
      --debug                  Print raw Pixal3D payloads to stderr
  -h, --help                   Show this help

Pixal3D currently exports GLB through the public Hugging Face Space API.
If HF_TOKEN is not already exported, the script will try to load it from
./.env next to the script.
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

compact_json() {
  printf '%s' "$1" | jq -c '.'
}

fail_on_error_payload() {
  local endpoint="$1"
  local payload="$2"
  local error_message

  error_message="$(printf '%s' "$payload" | jq -r '
    if type == "object" then
      .error // empty
    elif type == "array" and length > 0 and .[0] | type == "object" then
      .[0].error // empty
    else
      empty
    end
  ')"

  if [[ -n "$error_message" ]]; then
    fail "$endpoint failed: $error_message"
  fi
}

call_endpoint() {
  local endpoint="$1"
  local payload="$2"
  local start_response
  local event_id
  local stream
  local completed
  local fallback

  start_response="$("${curl_args[@]}" -X POST "$API_ROOT/call/v2/$endpoint" -H "Content-Type: application/json" -d "$payload")"
  event_id="$(printf '%s' "$start_response" | jq -r '.event_id // empty')"
  [[ -n "$event_id" ]] || fail "$endpoint did not return an event id"

  stream="$("${curl_args[@]}" -N "$API_ROOT/call/$endpoint/$event_id")"

  if [[ "$debug" == true ]]; then
    printf 'Pixal3D %s stream: %s\n' "$endpoint" "$(compact_json "$(printf '%s\n' "$stream" | awk '/^data: /{sub(/^data: /, "", $0); print}' | jq -cs '.')")" >&2
  fi

  completed="$(printf '%s\n' "$stream" | awk '/^data: /{sub(/^data: /, "", $0); print}' | jq -cs 'map(select(type == "object" and (.msg // "") == "process_completed")) | last // empty')"

  if [[ -n "$completed" && "$completed" != "null" ]]; then
    if [[ "$(printf '%s' "$completed" | jq -r '.success // true')" != "true" ]]; then
      fail "$endpoint failed: $(printf '%s' "$completed" | jq -r '.output.error // .title // "Pixal3D request failed"')"
    fi

    printf '%s' "$completed" | jq -c '.output.data // .output'
    return
  fi

  fallback="$(printf '%s\n' "$stream" | awk '/^data: /{sub(/^data: /, "", $0); line=$0} END{print line}')"
  [[ -n "$fallback" ]] || fail "did not receive a usable Pixal3D response for $endpoint"
  fail_on_error_payload "$endpoint" "$fallback"
  printf '%s' "$fallback"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--output)
      [[ $# -ge 2 ]] || fail "missing value for $1"
      output_path="$2"
      shift 2
      ;;
    --seed)
      [[ $# -ge 2 ]] || fail "missing value for $1"
      seed="$2"
      shift 2
      ;;
    --resolution)
      [[ $# -ge 2 ]] || fail "missing value for $1"
      resolution="$2"
      shift 2
      ;;
    --decimation-target)
      [[ $# -ge 2 ]] || fail "missing value for $1"
      decimation_target="$2"
      shift 2
      ;;
    --texture-size)
      [[ $# -ge 2 ]] || fail "missing value for $1"
      texture_size="$2"
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

require_number "seed" "$seed"
require_number "decimation target" "$decimation_target"
require_number "texture size" "$texture_size"

case "$resolution" in
  1024|1536) ;;
  *) fail "resolution must be 1024 or 1536" ;;
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

upload_response="$("${curl_args[@]}" -X POST "$API_ROOT/upload" -F "files=@$input_path")"
upload_path="$(printf '%s' "$upload_response" | jq -r '.[0] | if type == "string" then . else .path // empty end')"
[[ -n "$upload_path" ]] || fail "image upload did not return a server path"

upload_url="$SPACE_ROOT/file=$upload_path"
upload_size="$(wc -c < "$input_path" | tr -d '[:space:]')"
mime_type="$(file --brief --mime-type "$input_path" 2>/dev/null || printf 'application/octet-stream')"
session_id="$(uuidgen | tr 'A-Z' 'a-z' | tr -d '-')"

uploaded_file="$(jq -nc \
  --arg path "$upload_path" \
  --arg url "$upload_url" \
  --arg orig_name "$(basename -- "$input_path")" \
  --arg mime_type "$mime_type" \
  --argjson size "$upload_size" \
  '{path: $path, url: $url, size: $size, orig_name: $orig_name, mime_type: $mime_type, is_stream: false, meta: {_type: "gradio.FileData"}}')"

printf 'Preprocessing image\n' >&2
preprocess_response="$(call_endpoint "preprocess" "$(jq -nc --argjson image "$uploaded_file" '{image: $image}')")"
preprocessed_file="$(printf '%s' "$preprocess_response" | jq -c 'if type == "array" then .[0] else . end')"
[[ -n "$preprocessed_file" && "$preprocessed_file" != "null" ]] || fail "preprocess did not return an image"

printf 'Generating 3D latent\n' >&2
generate_payload="$(jq -nc \
  --argjson image "$preprocessed_file" \
  --argjson seed "$seed" \
  --argjson resolution "$resolution" \
  --arg session_id "$session_id" \
  '{image: $image, seed: $seed, resolution: $resolution, session_id: $session_id}')"
generate_response="$(call_endpoint "generate_3d" "$generate_payload")"
generate_result="$(printf '%s' "$generate_response" | jq -c 'if type == "array" then .[0] else . end')"

state_path="$(printf '%s' "$generate_result" | jq -r '.state_path // empty')"
camera_angle_x="$(printf '%s' "$generate_result" | jq -r '.camera_angle_x // empty')"
distance="$(printf '%s' "$generate_result" | jq -r '.distance // empty')"
[[ -n "$state_path" ]] || fail "generate_3d did not return a state path"

printf 'Extracting GLB\n' >&2
extract_payload="$(jq -nc \
  --arg state_path "$state_path" \
  --argjson decimation_target "$decimation_target" \
  --argjson texture_size "$texture_size" \
  --arg session_id "$session_id" \
  '{state_path: $state_path, decimation_target: $decimation_target, texture_size: $texture_size, session_id: $session_id}')"
extract_response="$(call_endpoint "extract_glb_api" "$extract_payload")"
download_file="$(printf '%s' "$extract_response" | jq -c 'if type == "array" then .[0] else . end')"
download_url="$(printf '%s' "$download_file" | jq -r '.url // empty')"
download_name="$(printf '%s' "$download_file" | jq -r '.orig_name // empty')"

[[ -n "$download_url" ]] || fail "extract_glb_api did not return a download URL"

if [[ -z "$output_path" ]]; then
  mkdir -p "$SCRIPT_DIR/outputs"
  if [[ -n "$download_name" ]]; then
    output_path="$SCRIPT_DIR/outputs/$download_name"
  else
    base_name="$(basename -- "$input_path")"
    base_name="${base_name%.*}"
    output_path="$SCRIPT_DIR/outputs/${base_name}.glb"
  fi
fi

"${curl_args[@]}" "$download_url" -o "$output_path"

printf 'Saved glb to %s\n' "$output_path" >&2

if [[ "$print_json" == true ]]; then
  jq -nc \
    --arg input_path "$input_path" \
    --arg output_path "$output_path" \
    --arg session_id "$session_id" \
    --arg state_path "$state_path" \
    --arg download_url "$download_url" \
    --arg camera_angle_x "$camera_angle_x" \
    --arg distance "$distance" \
    --argjson preprocess_result "$preprocessed_file" \
    --argjson generate_result "$generate_result" \
    --argjson download_file "$download_file" \
    '{input_path: $input_path, output_path: $output_path, output_format: "glb", session_id: $session_id, state_path: $state_path, download_url: $download_url, camera_angle_x: $camera_angle_x, distance: $distance, preprocess_result: $preprocess_result, generate_result: $generate_result, download_file: $download_file}'
fi
