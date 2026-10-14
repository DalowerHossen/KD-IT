# path: scripts/check-no-tests.sh
#!/usr/bin/env bash
# Enforces the project rule that automated test source files and test
# directories are excluded from the repository.
set -euo pipefail

status=0

while IFS= read -r file; do
  base="$(basename "$file")"
  case "$file" in
    */__tests__/* | */__mocks__/* | */tests/* | */test/* | tests/* | test/*)
      echo "FAIL: test directory detected: $file" >&2
      status=1
      ;;
  esac
  case "$base" in
    *.test.* | *.spec.* | *.e2e.* | jest.config.* | vitest.config.* | playwright.config.* | cypress.config.*)
      echo "FAIL: automated test source detected: $file" >&2
      status=1
      ;;
  esac
done < <(git ls-files -- ':!:node_modules')

if [[ "$status" -eq 0 ]]; then
  echo "PASS: no automated test source files are present."
fi
exit "$status"
