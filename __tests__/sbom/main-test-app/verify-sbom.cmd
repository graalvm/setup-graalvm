@echo off
cd target

for %%p in (
    "\"pkg:maven/org.json/json@20211205\""
    "\"main-test-app\""
    "\"svm\""
    "\"nativeimage\""
) do (
    echo Checking for %%p
    findstr /c:%%p sbom.sbom.json || exit /b 1
)

echo SBOM was successfully generated and contained the expected components