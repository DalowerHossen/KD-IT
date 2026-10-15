# path: scripts/check-english-only.sh
#!/usr/bin/env bash
# Blocks non-ASCII script in authored product artifacts (English-only rule).
# Pre-existing authoritative planning documents at the repository root are
# out of scope because they are input requirements, not product artifacts.
set -euo pipefail

status=0

while IFS= read -r file; do
  case "$file" in
    FEATURE_LIST.md | MASTER_PROMPT.md | REQUIREMENTS_ADDENDUM.md | IMPLEMENTATION_PLAN.md | REQUIREMENTS_TRACEABILITY.md | PROVIDER_RESEARCH_PROTOCOL.md | CHAT_INSTRUCTIONS.md | EXECUTION_STATUS.md | README.md)
      continue
      ;;
  esac
  if LC_ALL=C grep -nP '[^\x00-\x7F]' "$file" >/dev/null 2>&1; then
    echo "FAIL: non-ASCII content in $file" >&2
    LC_ALL=C grep -nP '[^\x00-\x7F]' "$file" | head -n 3 >&2
    status=1
  fi
done < <(git ls-files -- ':!:node_modules' ':!:package-lock.json' ':!:*.woff2' ':!:*.png' ':!:*.ico' ':!:public/design-tokens.json')

if [[ "$status" -eq 0 ]]; then
  echo "PASS: English-only scan found no non-ASCII content in product artifacts."
fi
exit "$status"
