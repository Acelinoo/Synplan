@echo off
set "ACTION=%~1"
set "TASK_ID=%~2"
set "EXTRA=%~3"
set "API_URL=https://piardify.vercel.app"
set "TOKEN=piar_live_0f1a1d11a890f50fe50035b28b6e6c6b2e3b9b2d"
set "PROJECT_ID=cmtdctr8a0001jv042bs0m9x0"

if "%ACTION%"=="start" (
  curl -s -X POST "%API_URL%/api/agent/tasks/%TASK_ID%/start?projectId=%PROJECT_ID%" -H "Authorization: Bearer %TOKEN%" -H "Content-Type: application/json"
  exit /b
)
if "%ACTION%"=="complete" (
  curl -s -X POST "%API_URL%/api/agent/tasks/%TASK_ID%/complete?projectId=%PROJECT_ID%" -H "Authorization: Bearer %TOKEN%" -H "Content-Type: application/json"
  exit /b
)
if "%ACTION%"=="fail" (
  curl -s -X POST "%API_URL%/api/agent/tasks/%TASK_ID%/fail?projectId=%PROJECT_ID%" -H "Authorization: Bearer %TOKEN%" -H "Content-Type: application/json" -d "{\"reason\":\"%EXTRA%\"}"
  exit /b
)
if "%ACTION%"=="current" (
  curl -s "%API_URL%/api/agent/tasks/current?projectId=%PROJECT_ID%" -H "Authorization: Bearer %TOKEN%"
  exit /b
)
if "%ACTION%"=="context" (
  curl -s "%API_URL%/api/agent/project?projectId=%PROJECT_ID%&section=context" -H "Authorization: Bearer %TOKEN%"
  exit /b
)
if "%ACTION%"=="design" (
  curl -s "%API_URL%/api/agent/project?projectId=%PROJECT_ID%&section=design" -H "Authorization: Bearer %TOKEN%"
  exit /b
)
if "%ACTION%"=="prd" (
  curl -s "%API_URL%/api/agent/project?projectId=%PROJECT_ID%&section=prd" -H "Authorization: Bearer %TOKEN%"
  exit /b
)
if "%ACTION%"=="taste" (
  curl -s "%API_URL%/api/agent/project?projectId=%PROJECT_ID%&section=taste-skill&skill=%TASK_ID%" -H "Authorization: Bearer %TOKEN%"
  exit /b
)
if "%ACTION%"=="validate" (
  npx piardify validate-ui
  exit /b
)
if "%ACTION%"=="theme" (
  npx piardify init-theme
  exit /b
)
