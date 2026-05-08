// ============================================================
// Dashboard Application Logic
// ============================================================

let allSimulations = [];
let chartInstances = {};
let currentSort = { field: 'launchDateTime', order: 'desc' };

// ============================================================
// Data Loading
// ============================================================

async function loadData() {
    showLoading(true);
    try {
        // Fetch simulations and coverage data in parallel
        const [sims, coverage] = await Promise.all([
            fetchAllSimulations(),
            fetchCoverageData()
        ]);
        allSimulations = sims;
        coverageData = coverage;
        updateKPIs();
        renderCharts();
        renderTable();
        updateLastRefresh();
    } catch (error) {
        console.error('Failed to load data:', error);
        alert('Failed to load simulation data: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function fetchAllSimulations() {
    let simulations = [];
    let url = '/security/attackSimulation/simulations?$top=100&$orderby=launchDateTime desc';

    while (url) {
        const data = await callGraphAPI(url, true); // Use beta API
        if (data.value) {
            simulations = simulations.concat(data.value);
        }
        // Handle pagination
        if (data['@odata.nextLink']) {
            const nextUrl = data['@odata.nextLink'];
            const pathMatch = nextUrl.match(/(?:v1\.0|beta)(\/.*)/);
            url = pathMatch ? pathMatch[1] : null;
        } else {
            url = null;
        }
    }

    return simulations;
}

// Fetch aggregate coverage data from reports endpoints
async function fetchCoverageData() {
    let userCoverage = [];
    let trainingCoverage = [];

    try {
        const userResp = await callGraphAPI('/reports/security/getAttackSimulationSimulationUserCoverage', true);
        userCoverage = userResp.value || [];
    } catch (err) {
        console.warn('Could not fetch user coverage:', err);
    }

    try {
        const trainingResp = await callGraphAPI('/reports/getAttackSimulationTrainingUserCoverage', true);
        trainingCoverage = trainingResp.value || [];
    } catch (err) {
        console.warn('Could not fetch training coverage:', err);
    }

    return { userCoverage, trainingCoverage };
}

let coverageData = { userCoverage: [], trainingCoverage: [] };

async function refreshData() {
    const btn = document.getElementById('btn-refresh');
    btn.classList.add('refreshing');
    await loadData();
    btn.classList.remove('refreshing');
}

// ============================================================
// KPI Calculations
// ============================================================

function updateKPIs() {
    const sims = allSimulations;
    const total = sims.length;
    const active = sims.filter(s => s.status === 'running' || s.status === 'scheduled').length;
    const succeeded = sims.filter(s => s.status === 'succeeded').length;

    // Use coverage data for user stats
    const { userCoverage, trainingCoverage } = coverageData;

    // Total unique users targeted (from user coverage report)
    const totalUsers = userCoverage.length;

    // Compromise rate — users compromised / total users targeted
    const totalCompromised = userCoverage.reduce((sum, u) => sum + (u.compromisedCount || 0), 0);
    const totalSimUserEvents = userCoverage.reduce((sum, u) => sum + (u.simulationCount || 0), 0);
    const avgCompromise = totalSimUserEvents > 0
        ? (totalCompromised / totalSimUserEvents * 100)
        : null;

    // Training assigned users
    const trainingUsers = trainingCoverage.length;

    animateNumber('kpi-total', total);
    animateNumber('kpi-active', active);
    animateNumber('kpi-succeeded', succeeded);
    document.getElementById('kpi-avg-compromise').textContent =
        avgCompromise != null ? avgCompromise.toFixed(1) + '%' : 'N/A';
    animateNumber('kpi-total-users', totalUsers);
    animateNumber('kpi-training', trainingUsers);
}

function animateNumber(elementId, target) {
    const el = document.getElementById(elementId);
    const start = parseInt(el.textContent) || 0;
    const duration = 600;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(start + (target - start) * eased).toLocaleString();
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

// ============================================================
// Charts
// ============================================================

const CHART_COLORS = {
    blue: '#e63946',
    green: '#10b981',
    red: '#ff2e4c',
    orange: '#ff6b35',
    purple: '#8b5cf6',
    cyan: '#06b6d4',
    pink: '#ec4899',
    gray: '#5c5470',
    indigo: '#6366f1',
    teal: '#14b8a6',
};

const STATUS_COLORS = {
    succeeded: CHART_COLORS.green,
    running: CHART_COLORS.blue,
    scheduled: CHART_COLORS.orange,
    failed: CHART_COLORS.red,
    canceled: CHART_COLORS.gray,
    draft: CHART_COLORS.purple,
    excluded: '#475569',
    unknown: '#334155',
};

const TECHNIQUE_LABELS = {
    credentialHarvesting: 'Credential Harvesting',
    attachmentMalware: 'Attachment Malware',
    driveByUrl: 'Drive-by URL',
    linkInAttachment: 'Link in Attachment',
    linkToMalwareFile: 'Link to Malware',
    oAuthConsentGrant: 'OAuth Consent',
    unknown: 'Unknown',
};

const TECHNIQUE_COLORS = {
    credentialHarvesting: CHART_COLORS.blue,
    attachmentMalware: CHART_COLORS.red,
    driveByUrl: CHART_COLORS.orange,
    linkInAttachment: CHART_COLORS.purple,
    linkToMalwareFile: CHART_COLORS.pink,
    oAuthConsentGrant: CHART_COLORS.cyan,
    unknown: CHART_COLORS.gray,
};

function getChartDefaults() {
    return {
        color: '#a89bb5',
        borderColor: '#2a2535',
        font: { family: "'Segoe UI', sans-serif" }
    };
}

function renderCharts() {
    Chart.defaults.color = '#a89bb5';
    Chart.defaults.borderColor = '#2a2535';
    Chart.defaults.font.family = "'Segoe UI', sans-serif";

    renderStatusChart();
    renderTechniqueChart();
    renderTrendChart();
    renderTimelineChart();
    renderPlatformChart();
}

function destroyChart(name) {
    if (chartInstances[name]) {
        chartInstances[name].destroy();
        chartInstances[name] = null;
    }
}

function renderStatusChart() {
    destroyChart('status');
    const counts = {};
    allSimulations.forEach(s => {
        const st = s.status || 'unknown';
        counts[st] = (counts[st] || 0) + 1;
    });

    const labels = Object.keys(counts);
    const data = Object.values(counts);
    const colors = labels.map(l => STATUS_COLORS[l] || CHART_COLORS.gray);

    chartInstances.status = new Chart(document.getElementById('chart-status'), {
        type: 'doughnut',
        data: {
            labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: '#16141f',
                borderWidth: 2,
                hoverOffset: 6,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { padding: 12, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } }
                }
            },
            cutout: '60%',
        }
    });
}

function renderTechniqueChart() {
    destroyChart('technique');
    const counts = {};
    allSimulations.forEach(s => {
        const t = s.attackTechnique || 'unknown';
        counts[t] = (counts[t] || 0) + 1;
    });

    const labels = Object.keys(counts);
    const data = Object.values(counts);
    const colors = labels.map(l => TECHNIQUE_COLORS[l] || CHART_COLORS.gray);

    chartInstances.technique = new Chart(document.getElementById('chart-technique'), {
        type: 'bar',
        data: {
            labels: labels.map(l => TECHNIQUE_LABELS[l] || l),
            datasets: [{
                data: data,
                backgroundColor: colors.map(c => c + '99'),
                borderColor: colors,
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 },
                    grid: { color: '#2a253540' }
                },
                y: {
                    grid: { display: false },
                    ticks: { font: { size: 11 } }
                }
            }
        }
    });
}

function renderTrendChart() {
    destroyChart('trend');

    // Show compromise rate per user from coverage data
    const { userCoverage } = coverageData;
    const usersWithCompromise = userCoverage
        .filter(u => u.compromisedCount > 0)
        .sort((a, b) => (b.compromisedCount / b.simulationCount) - (a.compromisedCount / a.simulationCount));

    // Build a per-simulation timeline using launch dates and overall compromise rate
    const completedSims = allSimulations
        .filter(s => s.launchDateTime && s.status === 'succeeded')
        .sort((a, b) => new Date(a.launchDateTime) - new Date(b.launchDateTime));

    // Calculate overall compromise rate as a flat line if no per-sim data
    const totalCompromised = userCoverage.reduce((sum, u) => sum + (u.compromisedCount || 0), 0);
    const totalSimEvents = userCoverage.reduce((sum, u) => sum + (u.simulationCount || 0), 0);
    const overallRate = totalSimEvents > 0 ? (totalCompromised / totalSimEvents * 100) : 0;

    if (completedSims.length === 0) {
        chartInstances.trend = new Chart(document.getElementById('chart-trend'), {
            type: 'line',
            data: { labels: ['No data'], datasets: [{ data: [0] }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
        return;
    }

    const labels = completedSims.map(s => formatDateShort(s.launchDateTime));
    const rates = completedSims.map(() => overallRate);

    chartInstances.trend = new Chart(document.getElementById('chart-trend'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Compromise Rate (%)',
                data: rates,
                borderColor: CHART_COLORS.red,
                backgroundColor: CHART_COLORS.red + '20',
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: CHART_COLORS.red,
                pointBorderColor: '#16141f',
                pointBorderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `Compromise Rate: ${ctx.parsed.y.toFixed(1)}%`,
                        title: (items) => simsWithRate[items[0].dataIndex]?.displayName || items[0].label,
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: '#2a253540' },
                    ticks: { maxRotation: 45, font: { size: 10 } }
                },
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: '#2a253540' },
                    ticks: {
                        callback: v => v + '%',
                        font: { size: 11 }
                    }
                }
            }
        }
    });
}

function renderTimelineChart() {
    destroyChart('timeline');

    // Group simulations by month
    const monthlyData = {};
    allSimulations.forEach(s => {
        if (!s.launchDateTime) return;
        const d = new Date(s.launchDateTime);
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        if (!monthlyData[key]) monthlyData[key] = { total: 0, succeeded: 0, failed: 0, other: 0 };
        monthlyData[key].total++;
        if (s.status === 'succeeded') monthlyData[key].succeeded++;
        else if (s.status === 'failed') monthlyData[key].failed++;
        else monthlyData[key].other++;
    });

    const sortedMonths = Object.keys(monthlyData).sort();
    const labels = sortedMonths.map(m => {
        const [y, mo] = m.split('-');
        return new Date(y, mo - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    });

    chartInstances.timeline = new Chart(document.getElementById('chart-timeline'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Succeeded',
                    data: sortedMonths.map(m => monthlyData[m].succeeded),
                    backgroundColor: CHART_COLORS.green + '99',
                    borderColor: CHART_COLORS.green,
                    borderWidth: 1,
                    borderRadius: 3,
                },
                {
                    label: 'Failed',
                    data: sortedMonths.map(m => monthlyData[m].failed),
                    backgroundColor: CHART_COLORS.red + '99',
                    borderColor: CHART_COLORS.red,
                    borderWidth: 1,
                    borderRadius: 3,
                },
                {
                    label: 'Other',
                    data: sortedMonths.map(m => monthlyData[m].other),
                    backgroundColor: CHART_COLORS.gray + '99',
                    borderColor: CHART_COLORS.gray,
                    borderWidth: 1,
                    borderRadius: 3,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { usePointStyle: true, pointStyle: 'rect', padding: 12, font: { size: 11 } }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: { font: { size: 10 } }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: { stepSize: 1 },
                    grid: { color: '#2a253540' }
                }
            }
        }
    });
}

function renderPlatformChart() {
    destroyChart('platform');
    const counts = {};
    allSimulations.forEach(s => {
        const p = s.payloadDeliveryPlatform || 'unknown';
        counts[p] = (counts[p] || 0) + 1;
    });

    const labels = Object.keys(counts);
    const data = Object.values(counts);
    const colorMap = {
        email: CHART_COLORS.blue,
        sms: CHART_COLORS.green,
        teams: CHART_COLORS.purple,
        unknown: CHART_COLORS.gray,
    };
    const colors = labels.map(l => colorMap[l] || CHART_COLORS.gray);

    chartInstances.platform = new Chart(document.getElementById('chart-platform'), {
        type: 'polarArea',
        data: {
            labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
            datasets: [{
                data: data,
                backgroundColor: colors.map(c => c + '80'),
                borderColor: colors,
                borderWidth: 1,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { padding: 12, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } }
                }
            },
            scales: {
                r: {
                    grid: { color: '#2a253540' },
                    ticks: { display: false }
                }
            }
        }
    });
}

// ============================================================
// Table Rendering
// ============================================================

function renderTable() {
    const tbody = document.getElementById('simulations-tbody');
    const filtered = getFilteredSimulations();
    const sorted = sortSimulations(filtered);

    if (sorted.length === 0) {
        tbody.innerHTML = '';
        document.getElementById('no-results').style.display = 'block';
        return;
    }
    document.getElementById('no-results').style.display = 'none';

    tbody.innerHTML = sorted.map(sim => {
        return `
        <tr>
            <td><strong>${escapeHtml(sim.displayName || '—')}</strong></td>
            <td><span class="badge badge-${sim.status || 'unknown'}">${sim.status || 'unknown'}</span></td>
            <td><span class="tag">${TECHNIQUE_LABELS[sim.attackTechnique] || sim.attackTechnique || '—'}</span></td>
            <td>${(sim.payloadDeliveryPlatform || '—').charAt(0).toUpperCase() + (sim.payloadDeliveryPlatform || '—').slice(1)}</td>
            <td>${formatDate(sim.launchDateTime)}</td>
            <td>${formatDate(sim.completionDateTime)}</td>
            <td>${sim.durationInDays ? sim.durationInDays + 'd' : '—'}</td>
            <td><button class="btn-detail" onclick="showDetail('${sim.id}')">View</button></td>
        </tr>`;
    }).join('');
}

function renderCompromiseRate(rate) {
    if (rate == null) return '<span style="color:var(--text-muted)">—</span>';
    const level = rate < 15 ? 'low' : rate < 40 ? 'medium' : 'high';
    const color = level === 'low' ? 'var(--accent-green)' : level === 'medium' ? 'var(--accent-orange)' : 'var(--accent-red)';
    return `
        <div class="rate-bar">
            <div class="rate-bar-bg">
                <div class="rate-bar-fill ${level}" style="width:${Math.min(rate, 100)}%"></div>
            </div>
            <span class="rate-value" style="color:${color}">${rate.toFixed(1)}%</span>
        </div>`;
}

// ============================================================
// Table Filtering & Sorting
// ============================================================

function getFilteredSimulations() {
    const search = document.getElementById('search-input').value.toLowerCase();
    const statusFilter = document.getElementById('filter-status').value;
    const techniqueFilter = document.getElementById('filter-technique').value;

    return allSimulations.filter(sim => {
        const matchesSearch = !search ||
            (sim.displayName || '').toLowerCase().includes(search) ||
            (sim.description || '').toLowerCase().includes(search);
        const matchesStatus = !statusFilter || sim.status === statusFilter;
        const matchesTechnique = !techniqueFilter || sim.attackTechnique === techniqueFilter;
        return matchesSearch && matchesStatus && matchesTechnique;
    });
}

function filterTable() {
    renderTable();
}

function sortTable(field) {
    if (currentSort.field === field) {
        currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        currentSort.order = 'asc';
    }

    // Update sort indicators
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
    });
    const event = window.event;
    if (event && event.target) {
        const th = event.target.closest('th');
        if (th) th.classList.add(currentSort.order === 'asc' ? 'sorted-asc' : 'sorted-desc');
    }

    renderTable();
}

function sortSimulations(sims) {
    const { field, order } = currentSort;
    const mult = order === 'asc' ? 1 : -1;

    return [...sims].sort((a, b) => {
        let valA, valB;

        if (field === 'compromiseRate') {
            valA = a.report?.overview?.simulationEventsContent?.compromisedRate ?? -1;
            valB = b.report?.overview?.simulationEventsContent?.compromisedRate ?? -1;
        } else if (field === 'launchDateTime' || field === 'completionDateTime') {
            valA = a[field] ? new Date(a[field]).getTime() : 0;
            valB = b[field] ? new Date(b[field]).getTime() : 0;
        } else {
            valA = (a[field] || '').toString().toLowerCase();
            valB = (b[field] || '').toString().toLowerCase();
        }

        if (valA < valB) return -1 * mult;
        if (valA > valB) return 1 * mult;
        return 0;
    });
}

// ============================================================
// Simulation Detail Modal
// ============================================================

async function showDetail(simId) {
    const sim = allSimulations.find(s => s.id === simId);
    if (!sim) return;

    const modal = document.getElementById('detail-modal');
    const body = document.getElementById('modal-body');

    // Show loading state immediately
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    body.innerHTML = `<div style="text-align:center;padding:40px;"><div class="spinner"></div><p>Loading simulation report...</p></div>`;

    // Get user coverage data filtered to users who participated in this simulation's timeframe
    const { userCoverage, trainingCoverage } = coverageData;

    // Calculate simulation-level stats from coverage data
    const totalUsersTargeted = userCoverage.length;
    const usersCompromised = userCoverage.filter(u => u.compromisedCount > 0).length;
    const totalClicks = userCoverage.reduce((sum, u) => sum + (u.clickCount || 0), 0);
    const totalCompromised = userCoverage.reduce((sum, u) => sum + (u.compromisedCount || 0), 0);
    const totalSimEvents = userCoverage.reduce((sum, u) => sum + (u.simulationCount || 0), 0);
    const compromiseRate = totalSimEvents > 0 ? (totalCompromised / totalSimEvents * 100) : 0;

    // Training stats
    const usersWithTraining = trainingCoverage.length;

    body.innerHTML = `
        <div class="detail-header">
            <h2>${escapeHtml(sim.displayName || 'Untitled Simulation')}</h2>
            <p class="detail-description">${escapeHtml(sim.description || 'No description provided.')}</p>
        </div>

        <div class="detail-grid">
            <div class="detail-item">
                <div class="detail-item-label">Status</div>
                <div class="detail-item-value"><span class="badge badge-${sim.status}">${sim.status || '—'}</span></div>
            </div>
            <div class="detail-item">
                <div class="detail-item-label">Attack Technique</div>
                <div class="detail-item-value" style="font-size:13px;">${TECHNIQUE_LABELS[sim.attackTechnique] || sim.attackTechnique || '—'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-item-label">Attack Type</div>
                <div class="detail-item-value" style="font-size:13px;text-transform:capitalize;">${sim.attackType || '—'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-item-label">Platform</div>
                <div class="detail-item-value" style="font-size:13px;text-transform:capitalize;">${sim.payloadDeliveryPlatform || '—'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-item-label">Launch Date</div>
                <div class="detail-item-value" style="font-size:13px;">${formatDate(sim.launchDateTime)}</div>
            </div>
            <div class="detail-item">
                <div class="detail-item-label">Completion Date</div>
                <div class="detail-item-value" style="font-size:13px;">${formatDate(sim.completionDateTime)}</div>
            </div>
            <div class="detail-item">
                <div class="detail-item-label">Duration</div>
                <div class="detail-item-value">${sim.durationInDays ? sim.durationInDays + ' days' : '—'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-item-label">Automated</div>
                <div class="detail-item-value">${sim.isAutomated ? 'Yes' : 'No'}</div>
            </div>
            <div class="detail-item">
                <div class="detail-item-label">Created By</div>
                <div class="detail-item-value" style="font-size:13px;">${escapeHtml(sim.createdBy?.displayName || sim.createdBy?.email || '—')}</div>
            </div>
            <div class="detail-item">
                <div class="detail-item-label">Last Modified</div>
                <div class="detail-item-value" style="font-size:13px;">${escapeHtml(sim.lastModifiedBy?.displayName || '—')}</div>
            </div>
        </div>

        <div class="detail-section">
            <h3>Overall User Coverage Report</h3>
            <div class="detail-stats-row">
                <div class="detail-stat">
                    <span class="detail-stat-value">${totalUsersTargeted}</span>
                    <span class="detail-stat-label">Users Targeted</span>
                </div>
                <div class="detail-stat">
                    <span class="detail-stat-value" style="color:var(--accent-red)">${usersCompromised}</span>
                    <span class="detail-stat-label">Users Compromised</span>
                </div>
                <div class="detail-stat">
                    <span class="detail-stat-value" style="color:var(--accent-orange)">${totalClicks}</span>
                    <span class="detail-stat-label">Total Clicks</span>
                </div>
                <div class="detail-stat">
                    <span class="detail-stat-value" style="color:${getCompromiseColor(compromiseRate)}">${compromiseRate.toFixed(1)}%</span>
                    <span class="detail-stat-label">Compromise Rate</span>
                </div>
                <div class="detail-stat">
                    <span class="detail-stat-value" style="color:var(--accent-blue)">${usersWithTraining}</span>
                    <span class="detail-stat-label">Users Assigned Training</span>
                </div>
            </div>
        </div>

        ${userCoverage.length > 0 ? `
        <div class="detail-section">
            <h3>User Activity (${userCoverage.length} users)</h3>
            <div class="table-wrapper" style="max-height:400px;overflow-y:auto;">
                <table class="users-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Email</th>
                            <th>Simulations</th>
                            <th>Clicks</th>
                            <th>Compromised</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${userCoverage.slice(0, 100).map(u => `
                            <tr>
                                <td>${escapeHtml(u.attackSimulationUser?.displayName || '—')}</td>
                                <td>${escapeHtml(u.attackSimulationUser?.email || '—')}</td>
                                <td>${u.simulationCount || 0}</td>
                                <td>${u.clickCount || 0}</td>
                                <td class="${u.compromisedCount > 0 ? 'compromised-yes' : 'compromised-no'}">${u.compromisedCount || 0}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${userCoverage.length > 100 ? `<p style="text-align:center;color:var(--text-muted);padding:10px;font-size:12px;">Showing first 100 of ${userCoverage.length} users</p>` : ''}
            </div>
        </div>` : '<div class="detail-section"><p style="color:var(--text-muted)">No user activity data available.</p></div>'}

        ${trainingCoverage.length > 0 ? `
        <div class="detail-section">
            <h3>Training Coverage (${trainingCoverage.length} users)</h3>
            <div class="table-wrapper" style="max-height:300px;overflow-y:auto;">
                <table class="users-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Email</th>
                            <th>Trainings Assigned</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${trainingCoverage.slice(0, 100).map(u => `
                            <tr>
                                <td>${escapeHtml(u.attackSimulationUser?.displayName || '—')}</td>
                                <td>${escapeHtml(u.attackSimulationUser?.email || '—')}</td>
                                <td>${u.userTrainings ? u.userTrainings.length : 0}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${trainingCoverage.length > 100 ? `<p style="text-align:center;color:var(--text-muted);padding:10px;font-size:12px;">Showing first 100 of ${trainingCoverage.length} users</p>` : ''}
            </div>
        </div>` : ''}
    `;
}

function closeModal(event) {
    if (event && event.target !== document.getElementById('detail-modal')) return;
    document.getElementById('detail-modal').style.display = 'none';
    document.body.style.overflow = '';
}

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

// ============================================================
// Utilities
// ============================================================

function showLoading(show) {
    document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}

function updateLastRefresh() {
    const now = new Date();
    document.getElementById('last-updated').textContent =
        'Last updated: ' + now.toLocaleTimeString();
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateShort(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatEventName(name) {
    if (!name) return 'Unknown';
    // Convert camelCase to Title Case
    return name
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, s => s.toUpperCase())
        .trim();
}

function getCompromiseColor(rate) {
    if (rate == null) return 'var(--text-muted)';
    if (rate < 15) return 'var(--accent-green)';
    if (rate < 40) return 'var(--accent-orange)';
    return 'var(--accent-red)';
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
