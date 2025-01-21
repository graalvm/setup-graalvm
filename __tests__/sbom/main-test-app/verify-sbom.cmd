@echo off
set "SCRIPT_DIR=%~dp0"

for %%p in (
    "\"pkg:maven/org.json/json@20241224\""
    "\"main-test-app\""
    "\"svm\""
    "\"nativeimage\""
) do (
    echo Checking for %%p
    findstr /c:%%p "%SCRIPT_DIR%target\main-test-app.sbom.json" || exit /b 1
)

echo SBOM was successfully generated and contained the expected components