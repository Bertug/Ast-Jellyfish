# ============================================================
# AST Dashboard — Azure AD App Registration Setup
# ============================================================
# This script registers an Azure AD (Entra ID) app for the
# Attack Simulation Training Dashboard, configures the correct
# permissions, and updates auth.js with your client/tenant IDs.
# ============================================================

param(
    [string]$AppName = "AST Dashboard",
    [string]$RedirectUri = "http://localhost:8080"
)

$ErrorActionPreference = "Stop"

# --- 1. Connect to Microsoft Graph ---
Write-Host "`n[1/5] Signing in to Microsoft Graph..." -ForegroundColor Cyan
Write-Host "       A browser window will open for authentication." -ForegroundColor Gray

Import-Module Microsoft.Graph.Applications -ErrorAction Stop

Connect-MgGraph -Scopes "Application.ReadWrite.All" -NoWelcome

$context = Get-MgContext
if (-not $context) {
    Write-Error "Failed to authenticate. Please try again."
    exit 1
}

$tenantId = $context.TenantId
Write-Host "       Signed in to tenant: $tenantId" -ForegroundColor Green

# --- 2. Register the application ---
Write-Host "`n[2/5] Registering application '$AppName'..." -ForegroundColor Cyan

# Check if app already exists
$existingApp = Get-MgApplication -Filter "displayName eq '$AppName'" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($existingApp) {
    Write-Host "       App '$AppName' already exists (Client ID: $($existingApp.AppId))" -ForegroundColor Yellow
    $response = Read-Host "       Use existing app? (Y/n)"
    if ($response -eq 'n' -or $response -eq 'N') {
        Write-Host "       Aborting. Rename with -AppName 'New Name' or delete the existing app." -ForegroundColor Red
        Disconnect-MgGraph | Out-Null
        exit 1
    }
    $app = $existingApp
} else {
    # Microsoft Graph API ID (well-known)
    $graphResourceId = "00000003-0000-0000-c000-000000000000"

    # AttackSimulation.Read.All delegated permission ID
    $attackSimReadAllId = "104a7a4b-ca76-4571-a3a4-b4e340eeff96"

    $appBody = @{
        displayName = $AppName
        signInAudience = "AzureADMyOrg"
        spa = @{
            redirectUris = @($RedirectUri)
        }
        requiredResourceAccess = @(
            @{
                resourceAppId = $graphResourceId
                resourceAccess = @(
                    @{
                        id   = $attackSimReadAllId
                        type = "Scope"  # Delegated
                    }
                )
            }
        )
    }

    $app = New-MgApplication -BodyParameter $appBody
    Write-Host "       App registered successfully!" -ForegroundColor Green
}

$clientId = $app.AppId
Write-Host "       Client ID: $clientId" -ForegroundColor White

# --- 3. Create a service principal (required for consent) ---
Write-Host "`n[3/5] Ensuring service principal exists..." -ForegroundColor Cyan

$sp = Get-MgServicePrincipal -Filter "appId eq '$clientId'" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $sp) {
    $sp = New-MgServicePrincipal -AppId $clientId
    Write-Host "       Service principal created." -ForegroundColor Green
} else {
    Write-Host "       Service principal already exists." -ForegroundColor Green
}

# --- 4. Admin consent ---
Write-Host "`n[4/5] Opening admin consent page in browser..." -ForegroundColor Cyan
Write-Host "       Please grant consent in the browser window." -ForegroundColor Gray

$consentUrl = "https://login.microsoftonline.com/$tenantId/adminconsent?client_id=$clientId&redirect_uri=$RedirectUri"
Start-Process $consentUrl

Read-Host "`n       Press Enter after granting admin consent in the browser"

# --- 5. Update auth.js ---
Write-Host "`n[5/5] Updating auth.js..." -ForegroundColor Cyan

$authFile = Join-Path $PSScriptRoot "auth.js"
if (Test-Path $authFile) {
    $content = Get-Content $authFile -Raw

    $content = $content -replace "clientId:\s*'[^']*'", "clientId: '$clientId'"
    $content = $content -replace "authority:\s*'https://login\.microsoftonline\.com/[^']*'", "authority: 'https://login.microsoftonline.com/$tenantId'"

    Set-Content $authFile -Value $content -NoNewline
    Write-Host "       auth.js updated with:" -ForegroundColor Green
    Write-Host "         clientId:  $clientId" -ForegroundColor White
    Write-Host "         tenantId:  $tenantId" -ForegroundColor White
} else {
    Write-Host "       auth.js not found at $authFile" -ForegroundColor Red
    Write-Host "       Manually set clientId to: $clientId" -ForegroundColor Yellow
    Write-Host "       Manually set authority tenant to: $tenantId" -ForegroundColor Yellow
}

# --- Done ---
Disconnect-MgGraph | Out-Null

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host " Setup complete!" -ForegroundColor Green
Write-Host " Start the dashboard with:" -ForegroundColor White
Write-Host "   python -m http.server 8080" -ForegroundColor Yellow
Write-Host " Then open: $RedirectUri" -ForegroundColor Yellow
Write-Host "============================================`n" -ForegroundColor Cyan
