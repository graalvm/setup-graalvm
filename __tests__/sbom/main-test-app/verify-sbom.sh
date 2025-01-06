#!/bin/bash
script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

required_patterns=(
    '"pkg:maven/org.json/json@20241224"'
    '"main-test-app"'
    '"svm"'
    '"nativeimage"'
)

for pattern in "${required_patterns[@]}"; do
    echo "Checking for $pattern"
    if ! grep -q "$pattern" "$script_dir/target/main-test-app.sbom.json"; then
        echo "Pattern not found: $pattern"
        exit 1
    fi
done

echo "SBOM was successfully generated and contained the expected components"