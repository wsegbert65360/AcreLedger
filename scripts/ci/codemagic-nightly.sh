#!/bin/sh
# Nightly Codemagic trigger. For each workflow, find the commit of the most
# recent *finished* (successful) build on main; skip if it equals the commit
# this scheduled pipeline is running on, otherwise start a new build.
set -eu
API="https://api.codemagic.io"
AUTH="x-auth-token: ${CODEMAGIC_API_TOKEN}"
SHA="${CI_COMMIT_SHA}"
for WF in acreledger-ios acreledger-android; do
  RESP=$(curl -fsS -H "$AUTH" "$API/builds?appId=${CODEMAGIC_APP_ID}&workflowId=${WF}&branch=main" \
    | jq --arg wf "$WF" '{builds: [.builds[] | select(.fileWorkflowId==$wf and .branch=="main")]}')
  # Skip too if a build for this exact commit is already queued/running.
  ACTIVE=$(echo "$RESP" | jq -r --arg sha "$SHA" '[.builds[] | select(.status|IN("queued","preparing","fetching","building","publishing","testing")) | select(.commit.hash==$sha)] | length')
  LAST=$(echo "$RESP" | jq -r '[.builds[] | select(.status=="finished")] | sort_by(.startedAt) | last | .commit.hash // ""')
  if [ "$ACTIVE" != "0" ]; then
    echo "$WF: build for $SHA already in progress - skip"; continue
  fi
  if [ "$LAST" = "$SHA" ]; then
    echo "$WF: no changes since last successful build ($SHA) - skip"; continue
  fi
  echo "$WF: last successful=${LAST:-none}, main=$SHA - starting build"
  curl -fsS -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"appId\":\"${CODEMAGIC_APP_ID}\",\"workflowId\":\"${WF}\",\"branch\":\"main\"}" \
    "$API/builds" | jq -c .
done
