#!/bin/sh
# Nightly Codemagic trigger. For each workflow, find the commit of the most
# recent *finished* (successful) build on main; skip if it equals the commit
# this scheduled pipeline is running on, otherwise start a new build.
set -eu
API="https://api.codemagic.io"
AUTH="x-auth-token: ${CODEMAGIC_API_TOKEN}"
SHA="${CI_COMMIT_SHA}"
GITHUB_REPO="wsegbert65360/AcreLedger"
GITHUB_URL="https://github.com/$GITHUB_REPO.git"
GITLAB_URL="https://gitlab.com/wsegbert65360/acreledger.git"
GITLAB_SHA="$SHA"
GITHUB_SHA="unknown"
fail() {
  echo "NIGHTLY FAILED: GitLab main $GITLAB_SHA != GitHub main $GITHUB_SHA ($1)" >&2
  exit 1
}
github_main() {
  curl -fsS "https://api.github.com/repos/$GITHUB_REPO/commits/main" 2>/dev/null |
    jq -er '.sha | select(type == "string" and test("^[0-9a-f]{40}$"))' 2>/dev/null
}
GITHUB_SHA=$(github_main) || fail "cannot read GitHub main"
if [ "$GITLAB_SHA" != "$GITHUB_SHA" ]; then
  [ -n "${GITHUB_SYNC_TOKEN:-}" ] && [ -n "${GITLAB_SYNC_TOKEN:-}" ] ||
    fail "missing sync tokens"
  SYNC_DIR=$(mktemp -d) || fail "cannot create sync directory"
  trap 'rm -rf "$SYNC_DIR"' 0 HUP INT TERM
  git init -q "$SYNC_DIR" 2>/dev/null || fail "cannot initialize sync repository"
  # Credential-free URLs; authentication lives only in per-command environment.
  # Suppress Git diagnostics so a server cannot echo a credential into CI logs.
  sync_git() {
    case "$1" in
      github) SYNC_AUTH=$(printf 'x-access-token:%s' "$GITHUB_SYNC_TOKEN" | base64 | tr -d '\n') ;;
      gitlab) SYNC_AUTH=$(printf 'oauth2:%s' "$GITLAB_SYNC_TOKEN" | base64 | tr -d '\n') ;;
    esac
    shift
    GIT_TERMINAL_PROMPT=0 GIT_CONFIG_COUNT=1 \
      GIT_CONFIG_KEY_0=http.extraHeader \
      GIT_CONFIG_VALUE_0="Authorization: Basic $SYNC_AUTH" \
      git -C "$SYNC_DIR" "$@" >/dev/null 2>&1
  }
  sync_git github fetch --no-tags "$GITHUB_URL" refs/heads/main:refs/remotes/github/main ||
    fail "GitHub fetch failed"
  sync_git gitlab fetch --no-tags "$GITLAB_URL" refs/heads/main:refs/remotes/gitlab/main ||
    fail "GitLab fetch failed"
  GITHUB_SHA=$(git -C "$SYNC_DIR" rev-parse refs/remotes/github/main)
  GITLAB_SHA=$(git -C "$SYNC_DIR" rev-parse refs/remotes/gitlab/main)
  if git -C "$SYNC_DIR" merge-base --is-ancestor "$GITHUB_SHA" "$GITLAB_SHA"; then
    SHA="$GITLAB_SHA"
    if [ "$GITHUB_SHA" != "$GITLAB_SHA" ]; then
      sync_git github push "$GITHUB_URL" "$SHA:refs/heads/main" ||
        fail "GitHub fast-forward push failed"
    fi
  elif git -C "$SYNC_DIR" merge-base --is-ancestor "$GITLAB_SHA" "$GITHUB_SHA"; then
    SHA="$GITHUB_SHA"
    sync_git gitlab push "$GITLAB_URL" "$SHA:refs/heads/main" ||
      fail "GitLab fast-forward push failed"
  else
    fail "main branches diverged"
  fi
  GITHUB_SHA=$(github_main) || fail "cannot verify GitHub main after sync"
  [ "$GITHUB_SHA" = "$SHA" ] || fail "GitHub main changed after sync"
  echo "Nightly main synchronized at $SHA"
fi

FAILED=0
for WF in acreledger-ios acreledger-android; do
  # Capture curl before jq. A failed curl piped into jq would still look successful.
  BUILDS_JSON=$(curl -fsS -H "$AUTH" "$API/builds?appId=${CODEMAGIC_APP_ID}&workflowId=${WF}&branch=main") || {
    echo "NIGHTLY FAILED: $WF cannot list builds" >&2
    FAILED=1
    continue
  }
  RESP=$(printf '%s\n' "$BUILDS_JSON" | jq --arg wf "$WF" '{builds: [.builds[] | select(.fileWorkflowId==$wf and .branch=="main")]}') || {
    echo "NIGHTLY FAILED: $WF cannot parse builds" >&2
    FAILED=1
    continue
  }
  # Skip too if a build for this exact commit is already queued/running.
  ACTIVE=$(echo "$RESP" | jq -r --arg sha "$SHA" '[.builds[] | select(.status|IN("queued","preparing","fetching","building","publishing","testing")) | select(.commit.hash==$sha)] | length') || {
    echo "NIGHTLY FAILED: $WF cannot read active builds" >&2
    FAILED=1
    continue
  }
  LAST=$(echo "$RESP" | jq -r '[.builds[] | select(.status=="finished")] | sort_by(.startedAt) | last | .commit.hash // ""') || {
    echo "NIGHTLY FAILED: $WF cannot read last build" >&2
    FAILED=1
    continue
  }
  if [ "$ACTIVE" != "0" ]; then
    echo "$WF: build for $SHA already in progress - skip"; continue
  fi
  if [ "$LAST" = "$SHA" ]; then
    echo "$WF: no changes since last successful build ($SHA) - skip"; continue
  fi
  echo "$WF: last successful=${LAST:-none}, main=$SHA - starting build"
  TRIGGER_JSON=$(curl -fsS -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"appId\":\"${CODEMAGIC_APP_ID}\",\"workflowId\":\"${WF}\",\"branch\":\"main\"}" \
    "$API/builds") || {
    echo "NIGHTLY FAILED: $WF cannot start build" >&2
    FAILED=1
    continue
  }
  # jq -er treats "" as success; accept only a non-empty string.
  BUILD_ID=$(printf '%s\n' "$TRIGGER_JSON" | jq -er '.buildId | select(type == "string" and length > 0)') || {
    echo "NIGHTLY FAILED: $WF response missing buildId" >&2
    FAILED=1
    continue
  }
  echo "$WF: started build $BUILD_ID"
done
[ "$FAILED" = 0 ] || exit 1
