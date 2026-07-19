// =================================================================
// ☀️ CLEAN DEYE DCS CLIENT INTERRUPT (app.js) - RELEASE STAGE BETA 9.2.0
// =================================================================

let currentChannel = 'AO1';
let pinBuffer = "";
const VALID_PIN = "1981";

const RENDER_BACKEND_URL = "https://solar-ac-bridge.onrender.com";

// Schema initialization (will be updated dynamically by backend values)
let configMatrix = {
    customNames: {},
    overrides: {},
    overrideStates: {},
    aoLimits: {},
    priorities: {},
    global: {
        minSoc: 85,
        deadband: 100,
        timeStart: "08:00",
        timeEnd: "17:00",
        solarOffset: 0,
        minChargeTh: 1000,
        tierLow: 1200,    // Tier 1
        tierMid: 2500,    // Tier 2
        tierHigh: 3300,   // Tier 3
        tierMax: 4000     // Tier 4
    }
};

let liveTelemetry = { basePv: 0, batterySoc: 100, gridPower: 0, calculatedLoad: 0, batteryPower: 0 };
let currentOutputStates = {};

window.onload = function() {
    if (sessionStorage.getItem("panel_authenticated") === "true") {
        document.getElementById("auth-screen").style.display = "none";
        document.getElementById("main-dashboard").style.display = "block";
        initApp();
    }
};

function appendPin(num) {
    if (pinBuffer.length < 4) {
        pinBuffer += num;
        document.getElementById("pin-display").innerText = "*".repeat(pinBuffer.length);
    }
}
function clearPin() { pinBuffer = ""; document.getElementById("pin-display").innerText = ""; }
function verifyPin() {
    if (pinBuffer === VALID_PIN) {
        sessionStorage.setItem("panel_authenticated", "true");
        document.getElementById("auth-screen").style.display = "none";
        document.getElementById("main-dashboard").style.display = "block";
        initApp();
    } else {
        alert("Interlock Denied");
        clearPin();
    }
}

function switchTab(tabId, btn) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    btn.classList.add('active');
}

function selectConfigChannel(ch, chip) {
    document.querySelectorAll('#config-tab .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentChannel = ch;
    renderChannelConfigPage();
}

// =================================================================
// 🛡️ CASCADING VALIDATION ENGINE FOR TIER SLIDER INTERLOCKS
// =================================================================
function handleTier1ManualInput(inputValue) {
    let value = parseInt(inputValue);
    if (isNaN(value)) return;

    // Rigidly bound manual keyboard inputs between 0W and 6000W Max
    if (value < 0) value = 0;
    if (value > 6000) value = 6000;

    configMatrix.global.tierLow = value;
    document.getElementById("mat-tier-low").value = value;

    // Sequential Cascade: Push Tier 2 upward if it falls below Tier 1
    if ((configMatrix.global.tierMid || 2500) < value) {
        configMatrix.global.tierMid = value;
        document.getElementById("mat-tier-mid").value = value;
    }
    // Cascade to Tier 3 if needed
    if ((configMatrix.global.tierHigh || 3300) < configMatrix.global.tierMid) {
        configMatrix.global.tierHigh = configMatrix.global.tierMid;
        let t3Input = document.getElementById("mat-tier-high");
        if (t3Input) t3Input.value = configMatrix.global.tierMid;
    }
    // Cascade to Tier 4 if needed
    if ((configMatrix.global.tierMax || 4000) < configMatrix.global.tierHigh) {
        configMatrix.global.tierMax = configMatrix.global.tierHigh;
        document.getElementById("mat-tier-max").value = configMatrix.global.tierHigh;
    }
}

function adjustTier2(direction) {
    let step = 100;
    let currentVal = parseInt(document.getElementById("mat-tier-mid").value) || 2500;
    let target = currentVal + (direction === 'plus' ? step : -step);

    let t1 = parseInt(document.getElementById("mat-tier-low").value) || 0;
    let t3 = parseInt(document.getElementById("mat-tier-high")?.value) || 3300;

    // Bounds Verification: Must remain perfectly between Tier 1 and Tier 3
    if (target >= t1 && target <= t3) {
        configMatrix.global.tierMid = target;
        document.getElementById("mat-tier-mid").value = target;
    }
}

function adjustTier3(direction) {
    let step = 100;
    let currentVal = parseInt(document.getElementById("mat-tier-high")?.value) || 3300;
    let target = currentVal + (direction === 'plus' ? step : -step);

    let t2 = parseInt(document.getElementById("mat-tier-mid").value) || 2500;
    let t4 = parseInt(document.getElementById("mat-tier-max").value) || 4000;

    // Bounds Verification: Must remain perfectly between Tier 2 and Tier 4
    if (target >= t2 && target <= t4) {
        configMatrix.global.tierHigh = target;
        let t3Input = document.getElementById("mat-tier-high");
        if (t3Input) t3Input.value = target;
    }
}

function adjustTier4(direction) {
    let step = 100;
    let currentVal = parseInt(document.getElementById("mat-tier-max").value) || 4000;
    let target = currentVal + (direction === 'plus' ? step : -step);

    let t3 = parseInt(document.getElementById("mat-tier-high")?.value) || 3300;

    // Bounds Verification: Must remain perfectly between Tier 3 and 6000W Ceiling
    if (target >= t3 && target <= 6000) {
        configMatrix.global.tierMax = target;
        document.getElementById("mat-tier-max").value = target;
    }
}

function adjustStep(id, delta, min = -5000, max = 10000) {
    // Intercept Tier adjust calls redirecting them into safe cascading validation loops
    if (id === "mat-tier-low") { handleTier1ManualInput((parseInt(document.getElementById(id).value) || 0) + delta); return; }
    if (id === "mat-tier-mid") { adjustTier2(delta > 0 ? 'plus' : 'minus'); return; }
    if (id === "mat-tier-high") { adjustTier3(delta > 0 ? 'plus' : 'minus'); return; }
    if (id === "mat-tier-max") { adjustTier4(delta > 0 ? 'plus' : 'minus'); return; }

    let input = document.getElementById(id);
    if (!input) return;
    let currentVal = parseInt(input.value) || 0;
    let newVal = currentVal + delta;
    if (newVal >= min && newVal <= max) {
        input.value = newVal;
        
        if (id === "mat-solar-offset") configMatrix.global.solarOffset = newVal;
        if (id === "mat-min-charge-th") configMatrix.global.minChargeTh = newVal;
        if (id === "mat-min-soc") configMatrix.global.minSoc = newVal;
        if (id === "mat-deadband") configMatrix.global.deadband = newVal;

        if (id === "cfg-sp-lowlow") configMatrix.aoLimits[currentChannel].lowlow = newVal;
        if (id === "cfg-sp-high") configMatrix.aoLimits[currentChannel].high = newVal;
        if (id === "cfg-priority") configMatrix.priorities[currentChannel] = newVal;
    }
}

async function initApp() {
    try {
        const res = await fetch(`${RENDER_BACKEND_URL}/get_config`);
        if (res.ok) {
            configMatrix = await res.json();
        }
    } catch (e) {
        console.warn("Could not load backend configurations, using browser backups.");
        let savedConfig = localStorage.getItem("dcs_client_matrix");
        if (savedConfig) {
            configMatrix = JSON.parse(savedConfig);
        }
    }
    
    loadGlobalPriorityInputs();
    renderMatrixRackTable();
    renderChannelConfigPage();
    
    document.getElementById("net-inv-sn").value = localStorage.getItem("dcs_inv_sn") || "";
    document.getElementById("net-app-id").value = localStorage.getItem("dcs_app_id") || "";
    document.getElementById("net-app-secret").value = localStorage.getItem("dcs_app_secret") || "";
    document.getElementById("net-portal-user").value = localStorage.getItem("dcs_portal_user") || "";
    document.getElementById("net-portal-pass").value = localStorage.getItem("dcs_portal_pass") || "";

    // Set listener on Tier 1 box for instant live manual input typing
    let tier1Box = document.getElementById("mat-tier-low");
    if (tier1Box) {
        tier1Box.removeAttribute("readonly");
        tier1Box.oninput = function() { handleTier1ManualInput(this.value); };
    }

    syncTelemetryFromBackend();
    setInterval(() => { syncTelemetryFromBackend(); }, 30000);
}

function loadGlobalPriorityInputs() {
    document.getElementById("mat-min-soc").value = configMatrix.global.minSoc || 85;
    document.getElementById("mat-deadband").value = configMatrix.global.deadband || 100;
    document.getElementById("mat-time-start").value = configMatrix.global.timeStart || "08:00";
    document.getElementById("mat-time-end").value = configMatrix.global.timeEnd || "17:00";
    document.getElementById("mat-solar-offset").value = configMatrix.global.solarOffset || 0;
    document.getElementById("mat-min-charge-th").value = configMatrix.global.minChargeTh || 1000;
    document.getElementById("mat-tier-low").value = configMatrix.global.tierLow || 1200;
    document.getElementById("mat-tier-mid").value = configMatrix.global.tierMid || 2500;
    
    let t3Input = document.getElementById("mat-tier-high");
    if (t3Input) t3Input.value = configMatrix.global.tierHigh || 3300;
    
    document.getElementById("mat-tier-max").value = configMatrix.global.tierMax || 4000;
}

async function syncTelemetryFromBackend() {
    const invSn = document.getElementById("net-inv-sn").value;
    const appId = document.getElementById("net-app-id").value;
    const appSecret = document.getElementById("net-app-secret").value;
    const email = document.getElementById("net-portal-user").value;
    const pass = document.getElementById("net-portal-pass").value;

    try {
        const payload = (appId && appSecret && email && pass) ? {
            email: email, 
            password: pass, 
            app_id: appId, 
            app_secret: appSecret, 
            inverter_sn: invSn || ""
        } : {};

        const response = await fetch(`${RENDER_BACKEND_URL}/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`Status Code: ${response.status}`);
        const data = await response.json();

        if (data.status === "success") {
            const measurements = data.measurements || {};
            
            liveTelemetry.basePv = parseFloat(measurements.PV_Generation_W || 0);
            liveTelemetry.batterySoc = parseInt(measurements.Battery_SOC || 100);
            liveTelemetry.calculatedLoad = parseFloat(measurements.usePower || 0);
            liveTelemetry.gridPower = parseFloat(measurements.Grid_Power_W || 0);
            liveTelemetry.batteryPower = parseFloat(measurements.Battery_Power_W || 0);

            currentOutputStates = data.output_states || {};
            
            // CONVERTED FROM kW TO W
            document.getElementById("lbl-pv").innerText = `${liveTelemetry.basePv.toFixed(0)} W`;
            document.getElementById("lbl-soc").innerText = `${liveTelemetry.batterySoc}% SOC`;
            document.getElementById("lbl-grid").innerText = `${liveTelemetry.gridPower} W`;
            document.getElementById("lbl-load").innerText = `${liveTelemetry.calculatedLoad} W`;
            document.getElementById("lbl-bat").innerText = `${(liveTelemetry.batteryPower / 1000).toFixed(2)} kW`;
            document.getElementById("execution-timestamp").innerText = `Last Engine Sync: ${data.inverter_time || new Date().toLocaleTimeString()}`;

            if (data.logs && data.logs.length > 0) {
                renderTerminalLogs(data.logs);
                const firstLog = data.logs[0].desc;
                const statusTag = document.getElementById("vector-status-tag");
                if (statusTag) {
                    statusTag.innerText = firstLog;
                    statusTag.className = firstLog.includes("🌙") ? "vector-tag vector-discharging" : "vector-tag vector-charging";
                }
            }

            renderMatrixRackTable();
        }
    } catch (e) {
        console.error(e);
        document.getElementById("execution-timestamp").innerText = "LINK TIMEOUT: Syncing...";
    }
}

function renderTerminalLogs(logs) {
    const container = document.getElementById("event-log-terminal");
    if (!container) return;
    container.innerHTML = "";
    logs.forEach(log => {
        container.innerHTML += `<div class="event-row"><div class="event-time">[${log.time}]</div><div class="event-desc">${log.desc}</div></div>`;
    });
}

function renderMatrixRackTable() {
    const tbody = document.getElementById("matrix-rack-body");
    if (!tbody) return; tbody.innerHTML = "";
    
    const channels = ['AO1', 'AO2', 'AO3', 'AO4', 'AO5', 'DO1', 'DO2', 'DO3', 'DO4', 'DO5'];
    channels.forEach(ch => {
        const isAO = ch.startsWith('AO');
        const name = configMatrix.customNames[ch] || ch;
        const isOverride = configMatrix.overrides[ch] || false;
        const rawState = currentOutputStates[ch] !== undefined ? currentOutputStates[ch] : (isAO ? 24 : false);
        
        let stateBadge = isAO ? "—" : (rawState ? `<span class="badge badge-on">ON</span>` : `<span class="badge badge-off">OFF</span>`);
        let setpDisplay = isAO ? `${rawState}°C` : "—";
        let modeBadge = isOverride ? `<span class="badge badge-hand">HAND</span>` : `<span class="badge badge-auto">AUTO</span>`;
        let seqDisplay = isAO ? "—" : `P${configMatrix.priorities[ch] || 1}`;

        tbody.innerHTML += `<tr><td>${ch}</td><td>${name}</td><td>${stateBadge}</td><td><b>${setpDisplay}</b></td><td>${modeBadge}</td><td>${seqDisplay}</td></tr>`;
    });
}

function toggleOverrideUI() {
    const isOverride = document.getElementById("cfg-override-toggle")?.checked;
    const isAO = currentChannel.startsWith('AO');
    document.getElementById("cfg-ao-limits-block").style.display = isAO ? "block" : "none";
    document.getElementById("cfg-do-manual-row").style.display = (!isAO && isOverride) ? "flex" : "none";
    document.getElementById("cfg-do-priority-block").style.display = (!isAO && !isOverride) ? "block" : "none";
}

function renderChannelConfigPage() {
    const isAO = currentChannel.startsWith('AO');
    document.getElementById("config-target-title").innerText = `${currentChannel} Settings`;
    document.getElementById("cfg-custom-name").value = configMatrix.customNames[currentChannel] || currentChannel;
    
    const isOverride = configMatrix.overrides[currentChannel] || false;
    document.getElementById("cfg-override-toggle").checked = isOverride;

    if (isAO) {
        if(!configMatrix.aoLimits[currentChannel]) configMatrix.aoLimits[currentChannel] = {lowlow: 21, high: 27};
        document.getElementById("cfg-sp-lowlow").value = configMatrix.aoLimits[currentChannel].lowlow;
        document.getElementById("cfg-sp-high").value = configMatrix.aoLimits[currentChannel].high;
    } else {
        document.getElementById("cfg-do-state-toggle").checked = configMatrix.overrideStates[currentChannel] || false;
        document.getElementById("cfg-priority").value = configMatrix.priorities[currentChannel] || 1;
    }
    toggleOverrideUI();
}

async function commitMatrixConfig() {
    const isAO = currentChannel.startsWith('AO');
    configMatrix.customNames[currentChannel] = document.getElementById("cfg-custom-name").value || currentChannel;
    configMatrix.overrides[currentChannel] = document.getElementById("cfg-override-toggle").checked;

    if (isAO) {
        if(!configMatrix.aoLimits[currentChannel]) configMatrix.aoLimits[currentChannel] = {};
        configMatrix.aoLimits[currentChannel].lowlow = parseInt(document.getElementById("cfg-sp-lowlow").value);
        configMatrix.aoLimits[currentChannel].high = parseInt(document.getElementById("cfg-sp-high").value);
    } else {
        configMatrix.priorities[currentChannel] = parseInt(document.getElementById("cfg-priority").value);
        if (configMatrix.overrides[currentChannel]) {
            configMatrix.overrideStates[currentChannel] = document.getElementById("cfg-do-state-toggle").checked;
        }
    }

    configMatrix.global.minSoc = parseInt(document.getElementById("mat-min-soc").value);
    configMatrix.global.deadband = parseInt(document.getElementById("mat-deadband").value);
    configMatrix.global.timeStart = document.getElementById("mat-time-start").value;
    configMatrix.global.timeEnd = document.getElementById("mat-time-end").value;
    configMatrix.global.solarOffset = parseInt(document.getElementById("mat-solar-offset").value) || 0;
    configMatrix.global.minChargeTh = parseInt(document.getElementById("mat-min-charge-th").value) || 1000;
    
    configMatrix.global.tierLow = parseInt(document.getElementById("mat-tier-low").value) || 1200;
    configMatrix.global.tierMid = parseInt(document.getElementById("mat-tier-mid").value) || 2500;
    configMatrix.global.tierHigh = parseInt(document.getElementById("mat-tier-high")?.value) || 3300;
    configMatrix.global.tierMax = parseInt(document.getElementById("mat-tier-max").value) || 4000;

    localStorage.setItem("dcs_inv_sn", document.getElementById("net-inv-sn").value);
    localStorage.setItem("dcs_app_id", document.getElementById("net-app-id").value);
    localStorage.setItem("dcs_app_secret", document.getElementById("net-app-secret").value);
    localStorage.setItem("dcs_portal_user", document.getElementById("net-portal-user").value);
    localStorage.setItem("dcs_portal_pass", document.getElementById("net-portal-pass").value);
    localStorage.setItem("dcs_client_matrix", JSON.stringify(configMatrix));

    try {
        const response = await fetch(`${RENDER_BACKEND_URL}/setpoints`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(configMatrix)
        });
        if (response.ok) {
            alert("Success: Configuration synced 24/7 with Cloud Engine!");
        }
    } catch(e) {
        alert("Warning: Local settings saved, but could not sync with Backend.");
    }

    syncTelemetryFromBackend();
}
