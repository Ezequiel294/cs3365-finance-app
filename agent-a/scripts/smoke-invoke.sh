#!/bin/sh
# Invoke the deployed ApiFn directly with a synthetic Cognito claim and print status and body.
# Usage: scripts/smoke-invoke.sh <function-name> <METHOD> <path?query> [json-body] [sub]
# Needs the agent's AWS profile; see README "Smoke testing".
set -e
FN="$1"; shift
DIR=$(mktemp -d)
node "$(dirname "$0")/invoke-api.mjs" "$@" > "$DIR/event.json"
HOME=/Users/keisynf/.finance-aws AWS_CONFIG_FILE=/Users/keisynf/.finance-aws/config \
AWS_SHARED_CREDENTIALS_FILE=/Users/keisynf/.finance-aws/credentials AWS_PROFILE=finance-agent AWS_REGION=us-east-2 \
  aws lambda invoke --function-name "$FN" --cli-binary-format raw-in-base64-out \
  --payload "fileb://$DIR/event.json" "$DIR/out.json" > /dev/null
node -e "const r=JSON.parse(require('fs').readFileSync('$DIR/out.json','utf8')); console.log(r.statusCode); console.log(r.body)"
rm -rf "$DIR"
