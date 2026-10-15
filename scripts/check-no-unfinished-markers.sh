# path: scripts/check-no-unfinished-markers.sh
#!/usr/bin/env bash
# Rejects unfinished markers and non-functional copy in product artifacts.
# The marker pattern is assembled at runtime so this scanner does not match
# its own source. Documentation under docs/ may reference later steps by
# number, which is factual status reporting and not a product marker.
set -euo pipefail

status=0
marker_pattern="TO""DO|FIX""ME|HA""CK|W""IP|TB""D"
copy_pattern="lorem ipsum|coming soon"

while IFS= read -r file; do
  if grep -nqE "$marker_pattern" "$file" 2>/dev/null; then
    echo "FAIL: unfinished marker in $file" >&2
    grep -nE "$marker_pattern" "$file" | head -n 3 >&2
    status=1
  fi
  if grep -niqE "$copy_pattern" "$file" 2>/dev/null; then
    echo "FAIL: non-functional copy in $file" >&2
    grep -niE "$copy_pattern" "$file" | head -n 3 >&2
    status=1
  fi
done < <(git ls-files -- 'app/*' 'components/*' 'config/*' 'lib/*' 'styles/*' 'public/*' 'proxy.ts' 'instrumentation.ts' 'next.config.mjs' 'tailwind.config.ts' '.env.example')

if [[ "$status" -eq 0 ]]; then
  echo "PASS: no unfinished markers or non-functional copy detected."
fi
exit "$status"
