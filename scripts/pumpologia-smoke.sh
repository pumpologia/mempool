#!/bin/sh
set -eu

base_url=${1:-https://pumpologia.app}
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT HUP INT TERM

request_json() {
  path=$1
  output=$2
  curl --fail --silent --show-error \
    --connect-timeout 5 --max-time 20 \
    -H 'Accept: application/json' \
    "${base_url}${path}" > "$output"
}

request_json /api/v1/blocks/tip/height "$work_dir/tip.json"
jq -e 'type == "number" and . > 0' "$work_dir/tip.json" >/dev/null

status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --connect-timeout 5 --max-time 20 \
  "${base_url}/api/pumpologia/v1/health")
test "$status" = "404"

request_json /api/pumpologia/v1/summary "$work_dir/summary.json"
jq -e '
  (.as_of.block_height | type == "number") and
  (.positions.total | type == "number") and
  (.positions.open_interest_sats | type == "string") and
  (.markets | type == "array") and
  (.recent_activity | type == "array")
' "$work_dir/summary.json" >/dev/null

status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --connect-timeout 5 --max-time 20 \
  -X POST "${base_url}/api/pumpologia/v1/summary")
case "$status" in
  403|405) ;;
  *)
    echo "Expected Pumpologia gateway POST rejection, got HTTP $status" >&2
    exit 1
    ;;
esac

status=$(curl --silent --output "$work_dir/invalid.json" --write-out '%{http_code}' \
  --connect-timeout 5 --max-time 20 \
  "${base_url}/api/pumpologia/v1/positions/not-a-position")
test "$status" = "400"
jq -e '.error == "invalid_request"' "$work_dir/invalid.json" >/dev/null

curl --fail --silent --show-error \
  --connect-timeout 5 --max-time 20 \
  "${base_url}/protocol" > "$work_dir/protocol.html"
grep -q 'Pumpologia' "$work_dir/protocol.html"

echo "Pumpologia Explorer smoke test passed: ${base_url}"
