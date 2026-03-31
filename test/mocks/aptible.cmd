@echo off
REM Mock aptible CLI for testing on Windows

if "%1"=="version" (
    echo aptible-cli v0.24.2 toolbelt
    exit /b 0
)
if "%1"=="environment:list" (
    echo [{"id":1,"handle":"my-env-dev-abc123"},{"id":2,"handle":"my-env-staging-def456"}]
    exit /b 0
)
if "%1"=="db:list" (
    echo [{"id":10,"handle":"mydb-dev","type":"postgresql","status":"provisioned"},{"id":11,"handle":"mydb-dev-redis","type":"redis","status":"provisioned"}]
    exit /b 0
)
if "%1"=="db:tunnel" (
    echo Creating postgresql tunnel to mydb-dev...
    echo Connect at postgresql://aptible:mockpassword123@localhost.aptible.in:55554/db
    echo Or, use the following arguments:
    echo * Host: localhost.aptible.in
    echo * Port: 55554
    echo * Username: aptible
    echo * Password: mockpassword123
    echo * Database: db
    echo Connected. Ctrl-C to close connection.
    node -e "setTimeout(function(){},3600000)"
    exit /b 0
)
if "%1"=="login" (
    echo Token written to %USERPROFILE%\.aptible\tokens.json
    exit /b 0
)
if "%1"=="apps" (
    echo [{"id":20,"handle":"myapp-dev","status":"running"}]
    exit /b 0
)
echo Unknown command: %1 1>&2
exit /b 1
