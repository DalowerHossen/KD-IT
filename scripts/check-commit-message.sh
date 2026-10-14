# path: scripts/check-commit-message.sh
#!/usr/bin/env bash
# Validates that a commit message follows the Conventional Commits specification.
set -euo pipefail

message_file="${1:-}"
if [[ -z "$message_file" || ! -f "$message_file" ]]; then
  echo "Usage: check-commit-message.sh <commit-message-file>" >&2
  exit 1
fi

subject="$(head -n 1 "$message_file")"
pattern='^(feat|fix|docs|style|refactor|perf|build|ci|chore|revert)(\([a-z0-9][a-z0-9-]*\))?!?: [^ ].{0,99}$'

if [[ "$subject" =~ $pattern ]]; then
  echo "Commit message accepted: $subject"
  exit 0
fi

echo "Rejected commit subject: $subject" >&2
echo "Expected format: type(optional-scope): imperative description" >&2
echo "Allowed types: feat fix docs style refactor perf build ci chore revert" >&2
exit 1
