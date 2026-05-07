# Attack Simulation Training Dashboard

A modern, interactive reporting dashboard for Microsoft Defender Attack Simulation Training campaigns, powered by the Microsoft Graph API.

## Features

- **KPI Cards** — Total simulations, active/scheduled, completed, avg compromise rate, users targeted, training assigned
- **Interactive Charts** — Status distribution (doughnut), attack technique breakdown (bar), compromise rate trend (line), monthly timeline (stacked bar), delivery platform (polar area)
- **Filterable & Sortable Table** — Search, filter by status/technique, sort by any column
- **Simulation Detail View** — Click "View" on any simulation to see full details including user activity, compromise stats, and training coverage
- **Real-time Data** — Refresh button for live data from Microsoft Graph
- **Dark Theme** — Professional security-focused design

## Prerequisites

- An Azure AD (Microsoft Entra ID) tenant
- Global Admin or Security Admin role (for granting API permissions)
- A modern web browser

## Quick Setup

### Option A: Automated Setup (PowerShell)

Run the included setup script (requires [Microsoft Graph PowerShell SDK](https://learn.microsoft.com/en-us/powershell/microsoftgraph/installation)):

```powershell
.\setup-app.ps1
```

This will create the app registration, configure permissions, and output the Client ID and Tenant ID.

### Option B: Manual Setup

1. Go to [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → **New registration**
2. Name: `AST Dashboard`
3. Supported account types: **Single tenant**
4. Redirect URI: Select **Single-page application (SPA)** → `http://localhost:8080/`
5. Click **Register**
6. Go to **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions**
7. Add `AttackSimulation.Read.All` and click **Grant admin consent**

### Configure & Run

1. Open `auth.js` and set your Application (client) ID and Tenant ID:

```javascript
clientId: 'your-client-id',
authority: 'https://login.microsoftonline.com/your-tenant-id',
```

2. Serve the dashboard with any static HTTP server:

```bash
python -m http.server 8080 -d .
```

3. Open `http://localhost:8080` and sign in with your Microsoft account.

## API Permissions

| Permission | Type | Description |
|---|---|---|
| `AttackSimulation.Read.All` | Delegated | Read attack simulation data |

## Microsoft Graph Endpoints Used

| Endpoint | Purpose |
|---|---|
| `GET /security/attackSimulation/simulations` | List all simulation campaigns |
| `GET /reports/security/getAttackSimulationSimulationUserCoverage` | Per-user simulation coverage (compromise rates, clicks) |
| `GET /reports/getAttackSimulationTrainingUserCoverage` | Per-user training coverage |

## Tech Stack

- **MSAL.js 2.38** — Microsoft Authentication Library (CDN)
- **Chart.js 4.4** — Data visualization (CDN)
- **Vanilla JS/HTML/CSS** — No build tools required

## Project Structure

```
ast-dashboard/
├── index.html      # Main dashboard page
├── auth.js         # MSAL authentication & Graph API calls
├── app.js          # Dashboard logic, charts, tables, detail view
├── styles.css      # Dark theme styling
├── setup-app.ps1   # Automated Azure AD app registration script
└── README.md       # This file
```
