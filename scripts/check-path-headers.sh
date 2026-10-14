# path: scripts/check-path-headers.sh
#!/usr/bin/env bash
# Verifies every authored file starts with its repository path in a comment
# form valid for that file's format. Strict JSON and binary or regenerated
# files are exempt and documented in the step handoff instead.
set -euo pipefail

status=0

while IFS= read -r file; do
  case "$file" in
    package.json | package-lock.json | tsconfig.json | components.json | next-env.d.ts | .nvmrc | *.woff2 | *.png | *.ico | *.tsbuildinfo | public/design-tokens.json)
      continue
      ;;
  esac

  first_line="$(head -n 1 "$file" | tr -d '\r')"

  header_value=""
  case "$first_line" in
    "// path: "*) header_value="${first_line#"// path: "}" ;;
    "# path: "*) header_value="${first_line#"# path: "}" ;;
    "-- path: "*) header_value="${first_line#"-- path: "}" ;;
    "/* path: "*" */")
      header_value="${first_line#"/* path: "}"
      header_value="${header_value%" */"}"
      ;;
    "<!-- path: "*" -->")
      header_value="${first_line#"<!-- path: "}"
      header_value="${header_value%" -->"}"
      ;;
  esac

  if [[ -z "$header_value" ]]; then
    echo "FAIL: missing path header in $file" >&2
    status=1
    continue
  fi

  if [[ "$header_value" != "$file" ]]; then
    echo "FAIL: header path '$header_value' does not match file '$file'" >&2
    status=1
  fi
done < <(git ls-files -- ':!:node_modules' ':!:.next' ':!:.husky/_/*' ':!:*.woff2')

if [[ "$status" -eq 0 ]]; then
  echo "PASS: every authored file carries a valid path header."
fi
exit "$status"
