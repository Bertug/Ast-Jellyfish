// ============================================================
// MSAL Authentication for Microsoft Graph
// ============================================================

const msalConfig = {
    auth: {
        clientId: '7e4e52e9-2daf-4077-a12d-ca525a1dd041',
        authority: 'https://login.microsoftonline.com/bf8f515a-8d6e-4764-8b59-9def0753d965',
        redirectUri: 'http://localhost:8080/',
        navigateToLoginRequestUrl: true,
    },
    cache: {
        cacheLocation: 'sessionStorage',
        storeAuthStateInCookie: false,
    }
};

const loginRequest = {
    scopes: ['https://graph.microsoft.com/AttackSimulation.Read.All']
};

const tokenRequest = {
    scopes: ['https://graph.microsoft.com/AttackSimulation.Read.All']
};

let msalInstance = null;
let currentAccount = null;

// Initialize MSAL and handle redirect response
async function initializeMsal() {
    msalInstance = new msal.PublicClientApplication(msalConfig);
    if (typeof msalInstance.initialize === 'function') {
        await msalInstance.initialize();
    }

    // Handle the redirect response (returns null if no redirect happened)
    try {
        const response = await msalInstance.handleRedirectPromise();
        if (response) {
            currentAccount = response.account;
            showDashboard();
            return;
        }
    } catch (err) {
        console.error('Redirect handling failed:', err);
    }

    // Check if user is already signed in
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
        currentAccount = accounts[0];
        showDashboard();
    }
}

let msalInitPromise = null;
async function ensureMsalReady() {
    if (!msalInitPromise) {
        msalInitPromise = initializeMsal();
    }
    await msalInitPromise;
}

// Sign In — uses redirect (full page navigation, no popup)
async function signIn() {
    const loginBtn = document.getElementById('btn-login');
    const loginError = document.getElementById('login-error');
    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in...';
    loginError.style.display = 'none';

    try {
        await ensureMsalReady();
        await msalInstance.loginRedirect(loginRequest);
    } catch (error) {
        console.error('Login failed:', error);
        loginError.textContent = `Sign-in failed: ${error.message || 'Unknown error'}`;
        loginError.style.display = 'block';
        loginBtn.disabled = false;
        loginBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg> Sign in with Microsoft`;
    }
}

// Sign Out
function signOut() {
    currentAccount = null;
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    msalInstance.logoutRedirect({ postLogoutRedirectUri: 'http://localhost:8080/' });
}

// Get Access Token (silent, fallback to redirect)
async function getAccessToken() {
    const request = { ...tokenRequest, account: currentAccount };
    try {
        const response = await msalInstance.acquireTokenSilent(request);
        return response.accessToken;
    } catch (error) {
        // If silent fails, redirect for new token
        await msalInstance.acquireTokenRedirect(request);
    }
}

// Call Microsoft Graph API
async function callGraphAPI(endpoint, useBeta = false) {
    const token = await getAccessToken();
    const baseUrl = useBeta ? 'https://graph.microsoft.com/beta' : 'https://graph.microsoft.com/v1.0';
    const response = await fetch(`${baseUrl}${endpoint}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    if (!response.ok) {
        throw new Error(`Graph API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

// Show Dashboard
function showDashboard() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('user-name').textContent = currentAccount.name || currentAccount.username;
    loadData();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => ensureMsalReady());
