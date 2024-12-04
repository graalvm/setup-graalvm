#!/bin/bash
cd target

required_patterns=(
    '"pkg:maven/org.json/json@20211205"'
    '"main-test-app"'
    '"svm"'
    '"nativeimage"'
)

for pattern in "${required_patterns[@]}"; do
    echo "Checking for $pattern"
    if ! grep -q "$pattern" sbom.sbom.json; then
        echo "Pattern not found: $pattern"
        exit 1
    fi
done

echo "SBOM was successfully generated and contained the expected components"