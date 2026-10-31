# Start the Gmail mail-merge dashboard.
#   .\run.ps1            -> http://127.0.0.1:8200
#   .\run.ps1 -Port 8300 -> custom port (also update OAUTH_REDIRECT_URI in .env)
param(
    [string]$Port = ""
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".env")) {
    Write-Host "No .env found - copying .env.example. Fill in your Google OAuth client!" -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
}

$missing = @()
foreach ($pkg in @("flask", "google_auth", "cryptography", "requests", "dotenv")) {
    python -c "import $pkg" 2>$null
    if ($LASTEXITCODE -ne 0) { $missing += $pkg }
}
if ($missing.Count -gt 0) {
    Write-Host "Installing missing packages: $($missing -join ', ')" -ForegroundColor Yellow
    pip install -r requirements.txt
}

if ($Port) { $env:DASHBOARD_PORT = $Port }
python app.py
