#!/usr/bin/env bash
# One measurement window of the CI latency A/B: start a built copy of the app,
# warm it up, drive synthetic traffic for a fixed time, then stop it.
#
#   scripts/ci-latency-window.sh <label> <app-dir> <version> <minutes>
#
#   label     base | head — names the step outputs (<label>_start, <label>_end)
#   app-dir   a platform/ directory that has already been built (`npm run build`)
#   version   reported as APP_VERSION, so the spans carry service.version=<sha>
#   minutes   length of the measured traffic window
#
# Traffic always comes from this checkout's scripts/traffic.ts, so both builds
# see the same load. Expects ELASTICSEARCH_URL, DASH0_ENDPOINT, DASH0_AUTH_TOKEN,
# DASH0_DATASET and OTEL_SERVICE_NAME in the environment.
set -euo pipefail

label=$1
app_dir=$2
version=$3
minutes=$4
port=${PORT:-3000}
here=$(cd "$(dirname "$0")/.." && pwd)
log_dir=${RUNNER_TEMP:-/tmp}
server_log="$log_dir/server-$label.log"

echo "▶ [$label] starting $app_dir as $version on :$port"
(cd "$app_dir" && APP_VERSION="$version" nohup npx next start -p "$port" >"$server_log" 2>&1) &
server_pid=$!

stop_server() {
  # `npx next start` forks; kill the whole group listening on the port.
  pkill -TERM -f "next start -p $port" 2>/dev/null || true
  kill "$server_pid" 2>/dev/null || true
  sleep 3
  pkill -KILL -f "next start -p $port" 2>/dev/null || true
}
trap stop_server EXIT

for _ in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$port/agenda" || true)
  [ "$code" != "000" ] && break
  sleep 2
done
if [ "${code:-000}" = "000" ]; then
  echo "::error::[$label] server did not come up"
  tail -50 "$server_log"
  exit 1
fi

# Warm-up pass (JIT, connection pools, route compilation) outside the window.
(cd "$here" && node --import tsx scripts/traffic.ts --base "http://localhost:$port" --workers 4 --once) >/dev/null

start=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "▶ [$label] measuring for $minutes min from $start"
# SIGINT lets the generator finish its current sessions and print a summary.
(cd "$here" && timeout -s INT -k 60 "$((minutes * 60))" \
  node --import tsx scripts/traffic.ts --base "http://localhost:$port" --workers 4) \
  | tr '\r' '\n' | tail -3 || true
end=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Give the OTel batch exporter time to flush the last spans before shutdown.
sleep 10

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "${label}_start=$start" >>"$GITHUB_OUTPUT"
  echo "${label}_end=$end" >>"$GITHUB_OUTPUT"
fi
echo "▶ [$label] window $start → $end"
