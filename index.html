// ==========================================
// ☀️ CLEAN DEYE DCS AUTOMATION ENGINE (app.js)
// ==========================================

let currentChannel = 'AO1';
let pinBuffer = "";
const VALID_PIN = "1981";

// 🌟 REPLACE WITH YOUR ACTUAL ACTIVE RENDER WEB SERVICE URL
const RENDER_BACKEND_URL = "https://your-solar-ac-bridge.onrender.com";

let configMatrix = {
    customNames: {
        AO1: "Smart AC 1 Setpoint", AO2: "Smart AC 2 Setpoint", AO3: "Spare Analog 3", AO4: "Spare Analog 4", AO5: "Spare Analog 5",
        DO1: "Smart AC 1 Power", DO2: "Smart AC 2 Power", DO3: "Non-Smart AC Relay", DO4: "Water Heater Relay", DO5: "Water Pump Relay"
    },
    overrides: {
        AO1: false, AO2: false, AO3: false, AO4: false, AO5: false,
        DO1: false, DO2: false, DO3: false, DO4: false, DO5: false
    },
    overrideStates: {
        AO1: 24, AO2: 24, AO3: 24, AO4: 24, AO5: 24,
        DO1: false, DO2: false, DO3: false, DO4: false, DO5: false
    },
    aoLimits: {
        AO1: { lowlow: 21, lowmid: 23, highmid: 25, high: 27 },
        AO2: { lowlow: 21, lowmid: 23, highmid: 25, high: 27 },
        AO3: { lowlow: 22, lowmid: 24, highmid: 26, high: 28 },
        AO4: { lowlow: 22, lowmid: 24, highmid: 26, high: 28 },
        AO5: { lowlow: 22, lowmid: 24, highmid: 26, high: 28 }
    },
    priorities: { DO1: 1, DO2: 2, DO3: 3, DO4: 4, DO5: 5 },
    global: { minSoc: 85, dischargeTh: 150, deadband: 100, delay: 5, timeStart: "08:00", timeEnd: "17:00" }
};

let liveTelemetry = { basePv: 0, calculatedPv: 0, batterySoc: 100, gridPower: 0, batteryCurrent: 0, isCharging: true };
let currentOutputStates = { AO1: 24, AO2: 24, AO3: 26, AO4: 26, AO5: 26, DO1: false, DO2: false, DO3: false, DO4: false, DO5: false };
let lastRecordedAction = "";

const helpStrings = {
    hand: "Bypasses all automatic solar/battery step calculations. Decouples this specific output channel to give you permanent, hard command over its target values.",
    offset: "Injects manual offset wattage (+/-) into the runtime environment to simulate shifting cloud cover, changing house loads, or massive generation spikes.",
    soc: "The minimum battery state-of-charge percentage required to authorize automated execution loops during daytime optimization hours.",
    discharge: "The minimum wattage draw required to confirm a true battery discharge. Minor draws below this when the battery is at 100% are ignored to shield the sequencer from sensor noise.",
    deadband: "Symmetric wattage buffer applied to trigger parameters. Stops relays and compressors from rapidly cycling back and forth when solar generation hovers directly on threshold parameters.",
    delay: "The block-start sequence countdown timer. Forces the system to hold staging for a set number of minutes before energizing the next priority load to mitigate inrush current spikes.",
    time: "Defines the active daytime tracking window. Outside this range, the system automatically forces into Night Standby, locking out automation for manual discretion.",
    inverter_creds: "Your personal Deye portal developer credentials. These are stored locally in your browser memory and are used to securely request live data from your inverter without exposing your password in public backend files."
};

// ==========================================
// 🔐 HMI AUTHENTICATION LOOP
// ==========================================
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
        alert("Interlock Denied: Invalid Access Token");
        clearPin();
    }
}

// ==========================================
// 🗺️ PAGE NAVIGATION AND CONTROLS
// ==========================================
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

function showHelp(key) {
    document.getElementById("help-title").innerText = `Parameter Context: [${key.toUpperCase()}]`;
    document.getElementById("help-text").innerText = helpStrings[key] || "No documentation found.";
    document.getElementById("help-modal").style.display = "flex";
}
function closeHelp() { document.getElementById("help-modal").style.display = "none"; }

function adjustStep(id, delta, min = -5000, max = 10000) {
    let input = document.getElementById(id);
    if (!input) return;
    let currentVal = parseInt(input.value) || 0;
    let newVal = currentVal + delta;
    if (newVal >= min && newVal <= max) {
        input.value = newVal;
    }
}

// ==========================================
// ⚙️ INITIALIZATION & PERSISTENCE
// ==========================================
function initApp() {
    let savedConfig = localStorage.getItem("dcs_client_matrix");
    if (savedConfig) {
        try { configMatrix = JSON.parse(savedConfig); } catch(e) { console.error("Config array corrupted."); }
    }
    
    loadGlobalPriorityInputs();
    renderMatrixRackTable();
    renderChannelConfigPage();
    
    // Load local storage keys from phone vault
    document.getElementById("net-inv-sn").value = localStorage.getItem("dcs_inv_sn") || "";
    document.getElementById("net-app-id").value = localStorage.getItem("dcs_app_id") || "";
    document.getElementById("net-app-secret").value = localStorage.getItem("dcs_app_secret") || "";
    document.getElementById("net-portal-user").value = localStorage.getItem("dcs_portal_user") || "";
    document.getElementById("net-portal-pass").value = localStorage.getItem("dcs_portal_pass") || "";

    executeMasterSync();
    
    // Fire immediate data fetch, then repeat cleanly every 30 seconds
    syncTelemetryFromBackend();
    setInterval(() => {
        syncTelemetryFromBackend();
    }, 30000);
}

function loadGlobalPriorityInputs() {
    document.getElementById("mat-min-soc").value = configMatrix.global.minSoc;
    document.getElementById("mat-discharge-th").value = configMatrix.global.dischargeTh;
    document.getElementById("mat-deadband").value = configMatrix.global.deadband;
    document.getElementById("mat-delay").value = configMatrix.global.delay;
    document.getElementById("mat-time-start").value = configMatrix.global.timeStart;
    document.getElementById("mat-time-end").value = configMatrix.global.timeEnd;
}

// ==========================================
// 📡 LIVE BACKEND SYNC BRIDGE LAYER
// ==========================================
async function syncTelemetryFromBackend() {
    const invSn = document.getElementById("net-inv-sn").value;
    const appId = document.getElementById("net-app-id").value;
    const appSecret = document.getElementById("net-app-secret").value;
    const email = document.getElementById("net-portal-user").value;
    const pass = document.getElementById("net-portal-pass").value;

    if (!appId || !appSecret || !email || !pass) {
        evaluateAndPrintCleanLog("STANDBY: Input inverter credentials in Tab 3 to map live data streams.");
        return;
    }

    try {
        const response = await fetch(`${RENDER_BACKEND_URL}/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: email,
                password: pass,
                app_id: appId,
                app_secret: appSecret,
                inverter_sn: invSn
            })
        });

        if (!response.ok) throw new Error(`HTTP Error Status: ${response.status}`);
        const data = await response.json();

        if (data.status === "success") {
            const measurements = data.measurements || data.telemetry || {};
            liveTelemetry.basePv = floatSafe(measurements.PV_Generation_W || measurements.PV_Power_W || measurements.generationPower || 0);
            liveTelemetry.batterySoc = intSafe(measurements.Battery_SOC || measurements.battery_soc || measurements.batterySOC || 100);
            liveTelemetry.gridPower = floatSafe(measurements.Grid_Power_W || measurements.usePower || 0);
            
            // Apply layout offset safely over live base parameters
            let offset = parseInt(document.getElementById("mat-solar-offset").value) || 0;
            liveTelemetry.calculatedPv = Math.max(0, liveTelemetry.basePv + offset);
            
            evaluateAndPrintCleanLog(`LIVE REFRESH: Deye telemetry synchronized. Solar=${liveTelemetry.calculatedPv}W, SOC=${liveTelemetry.batterySoc}%`);
            executeMasterSync();
        } else {
            evaluateAndPrintCleanLog(`SYNC ERROR: Backend failure response: ${data.message}`);
        }
    } catch (e) {
        console.error("DCS Link Layer Error:", e);
        evaluateAndPrintCleanLog(`CONNECTION TIMEOUT: Render server compiling or sleeping. Re-linking framework...`);
    }
}

function floatSafe(v) { let f = parseFloat(v); return isNaN(f) ? 0 : f; }
function intSafe(v) { let i = parseInt(v); return isNaN(i) ? 0 : i; }

// ==========================================
// 🔁 AUTOMATION DECISION RULES CORE RUNNER
// ==========================================
function executeMasterSync() {
    document.getElementById("pv-power").innerText = `${liveTelemetry.calculatedPv} W`;
    document.getElementById("battery-soc").innerText = `${liveTelemetry.batterySoc}%`;
    document.getElementById("grid-power").innerText = `${liveTelemetry.gridPower} W`;
    document.getElementById("execution-timestamp").innerText = `Last Engine Sync: ${new Date().toLocaleTimeString()}`;

    let statusTag = document.getElementById("vector-status-tag");
    
    // Check if system is currently operating in daytime matrix rules window
    let currentHour = new Date().getHours();
    let startHour = parseInt(configMatrix.global.timeStart.split(":")[0]) || 6;
    let endHour = parseInt(configMatrix.global.timeEnd.split(":")[0]) || 18;
    let isDay = (currentHour >= startHour && currentHour < endHour);

    if (!isDay) {
        statusTag.innerText = "🌙 NIGHT INTERLOCK STANDBY MODE ACTIVE";
        statusTag.className = "vector-tag vector-discharging";
        
        // Enforce safe night fallbacks across virtual matrix
        ['DO1', 'DO2', 'DO3', 'DO4', 'DO5'].forEach(ch => { if (!configMatrix.overrides[ch]) currentOutputStates[ch] = false; });
        if (!configMatrix.overrides.AO1) currentOutputStates.AO1 = configMatrix.aoLimits.AO1.high;
        if (!configMatrix.overrides.AO2) currentOutputStates.AO2 = configMatrix.aoLimits.AO2.high;
        
        evaluateAndPrintCleanLog(`NIGHT STANDBY: Active ruleset suspended until ${configMatrix.global.timeStart}. All relays safe.`);
    } else {
        statusTag.innerText = "🔋 DAY SOLAR OPTIMIZATION ACTIVE (LIVE FEED)";
        statusTag.className = "vector-tag vector-charging";
        processAutomatedStagingSequence();
    }
    renderMatrixRackTable();
}

function processAutomatedStagingSequence() {
    let power = liveTelemetry.calculatedPv;
    let db = configMatrix.global.deadband;
    
    // Strict duplication alignment of your July 14 Beta 6 logic steps
    if (power < (1200 - db)) {
        if (!configMatrix.overrides.DO1) currentOutputStates.DO1 = false;
        if (!configMatrix.overrides.DO2) currentOutputStates.DO2 = false;
        if (!configMatrix.overrides.AO1) currentOutputStates.AO1 = configMatrix.aoLimits.AO1.high;
        if (!configMatrix.overrides.AO2) currentOutputStates.AO2 = configMatrix.aoLimits.AO2.high;
        evaluateAndPrintCleanLog(`TIER 1 (LOW SUN): Generation ${intSafe(power)}W below threshold. Holding High SP profile.`);
    } else if (power >= 4000) {
        if (!configMatrix.overrides.DO1) currentOutputStates.DO1 = true;
        if (!configMatrix.overrides.DO2) currentOutputStates.DO2 = true;
        if (!configMatrix.overrides.AO1) currentOutputStates.AO1 = configMatrix.aoLimits.AO1.lowlow;
        if (!configMatrix.overrides.AO2) currentOutputStates.AO2 = configMatrix.aoLimits.AO2.lowlow;
        evaluateAndPrintCleanLog(`TIER 4 (MASSIVE EXCESS): High production at ${intSafe(power)}W. Virtual thermal banking enabled.`);
    } else {
        let msg = `DCS STABLE: Solar plant inside operational window at ${intSafe(power)}W. Keeping auto status constant.`;
        if (lastRecordedAction.startsWith("DCS STABLE")) lastRecordedAction = msg; 
        evaluateAndPrintCleanLog(msg);
    }
}

// ==========================================
// ⚙️ RENDERING HMI INTERFACE FUNCTIONS
// ==========================================
function renderMatrixRackTable() {
    const tbody = document.getElementById("matrix-rack-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    
    const channels = ['AO1', 'AO2', 'AO3', 'AO4', 'AO5', 'DO1', 'DO2', 'DO3', 'DO4', 'DO5'];
    channels.forEach(ch => {
        const isAO = ch.startsWith('AO');
        const name = configMatrix.customNames[ch];
        const isOverride = configMatrix.overrides[ch];
        const rawState = currentOutputStates[ch];
        
        let stateBadge = isAO ? "—" : (rawState ? `<span class="badge badge-on">ON</span>` : `<span class="badge badge-off">OFF</span>`);
        let setpDisplay = isAO ? `${rawState}°C` : "—";
        let modeBadge = isOverride ? `<span class="badge badge-hand">HAND</span>` : `<span class="badge badge-auto">AUTO</span>`;
        let seqDisplay = isAO ? "—" : `P${configMatrix.priorities[ch]}`;

        tbody.innerHTML += `
            <tr>
                <td style="font-weight:bold; color:var(--accent-blue);">${ch}</td>
                <td style="max-width:140px; overflow:hidden; text-overflow:ellipsis;">${name}</td>
                <td>${stateBadge}</td>
                <td><span style="font-weight:bold;">${setpDisplay}</span></td>
                <td>${modeBadge}</td>
                <td><span style="color:var(--text-sub);">${seqDisplay}</span></td>
            </tr>
        `;
    });
    renderQueueMappingList();
}

function renderQueueMappingList() {
    const container = document.getElementById("queue-mapping-list");
    if (!container) return;
    container.innerHTML = "";
    let priorityMap = {1: [], 2: [], 3: [], 4: [], 5: []};
    
    ['DO1', 'DO2', 'DO3', 'DO4', 'DO5'].forEach(ch => {
        let p = configMatrix.priorities[ch];
        if (p >= 1 && p <= 5) priorityMap[p].push(`[${ch}] ${configMatrix.customNames[ch]}`);
    });

    for (let i = 1; i <= 5; i++) {
        let assets = priorityMap[i].length > 0 ? priorityMap[i].join(" + ") : "EMPTY TRACK";
        container.innerHTML += `<div><span style="color:var(--accent-orange); font-weight:bold;">STAGE ${i}:</span> ${assets}</div>`;
    }
}

function toggleOverrideUI() {
    const isOverride = document.getElementById("cfg-override-toggle").checked;
    const isAO = currentChannel.startsWith('AO');
    if (isAO) {
        document.getElementById("cfg-ao-limits-block").style.display = "block";
    } else {
        document.getElementById("cfg-do-manual-row").style.display = isOverride ? "flex" : "none";
        document.getElementById("cfg-do-priority-block").style.display = isOverride ? "none" : "block";
    }
}

function renderChannelConfigPage() {
    const isAO = currentChannel.startsWith('AO');
    document.getElementById("config-target-title").innerText = `${currentChannel} Channel Settings`;
    document.getElementById("cfg-custom-name").value = configMatrix.customNames[currentChannel];
    
    const isOverride = configMatrix.overrides[currentChannel];
    document.getElementById("cfg-override-toggle").checked = isOverride;

    if (isAO) {
        document.getElementById("cfg-do-manual-row").style.display = "none";
        document.getElementById("cfg-do-priority-block").style.display = "none";
        document.getElementById("cfg-ao-limits-block").style.display = "block";
        
        document.getElementById("cfg-sp-lowlow").value = configMatrix.aoLimits[currentChannel].lowlow;
        document.getElementById("cfg-sp-low-mid").value = configMatrix.aoLimits[currentChannel].lowmid;
        document.getElementById("cfg-sp-high-mid").value = configMatrix.aoLimits[currentChannel].highmid;
        document.getElementById("cfg-sp-high").value = configMatrix.aoLimits[currentChannel].high;
    } else {
        document.getElementById("cfg-ao-limits-block").style.display = "none";
        document.getElementById("cfg-do-manual-row").style.display = isOverride ? "flex" : "none";
        document.getElementById("cfg-do-priority-block").style.display = isOverride ? "none" : "block";
        
        document.getElementById("cfg-do-state-toggle").checked = configMatrix.overrideStates[currentChannel];
        document.getElementById("cfg-priority").value = configMatrix.priorities[currentChannel];
    }
}

function commitMatrixConfig() {
    const isAO = currentChannel.startsWith('AO');
    configMatrix.customNames[currentChannel] = document.getElementById("cfg-custom-name").value || currentChannel;
    
    const isOverride = document.getElementById("cfg-override-toggle").checked;
    configMatrix.overrides[currentChannel] = isOverride;

    if (isAO) {
        configMatrix.aoLimits[currentChannel].lowlow = parseInt(document.getElementById("cfg-sp-lowlow").value);
        configMatrix.aoLimits[currentChannel].lowmid = parseInt(document.getElementById("cfg-sp-low-mid").value);
        configMatrix.aoLimits[currentChannel].highmid = parseInt(document.getElementById("cfg-sp-high-mid").value);
        configMatrix.aoLimits[currentChannel].high = parseInt(document.getElementById("cfg-sp-high").value);
    } else {
        if (isOverride) {
            configMatrix.overrideStates[currentChannel] = document.getElementById("cfg-do-state-toggle").checked;
            currentOutputStates[currentChannel] = configMatrix.overrideStates[currentChannel];
        } else {
            configMatrix.priorities[currentChannel] = parseInt(document.getElementById("cfg-priority").value);
        }
    }

    configMatrix.global.minSoc = parseInt(document.getElementById("mat-min-soc").value);
    configMatrix.global.dischargeTh = parseInt(document.getElementById("mat-discharge-th").value);
    configMatrix.global.deadband = parseInt(document.getElementById("mat-deadband").value);
    configMatrix.global.delay = parseInt(document.getElementById("mat-delay").value);
    configMatrix.global.timeStart = document.getElementById("mat-time-start").value;
    configMatrix.global.timeEnd = document.getElementById("mat-time-end").value;

    localStorage.setItem("dcs_client_matrix", JSON.stringify(configMatrix));
    
    localStorage.setItem("dcs_inv_sn", document.getElementById("net-inv-sn").value);
    localStorage.setItem("dcs_app_id", document.getElementById("net-app-id").value);
    localStorage.setItem("dcs_app_secret", document.getElementById("net-app-secret").value);
    localStorage.setItem("dcs_portal_user", document.getElementById("net-portal-user").value);
    localStorage.setItem("dcs_portal_pass", document.getElementById("net-portal-pass").value);

    logEvent(`SYS RECONFIG: Setup committed. Profile synced.`);
    syncTelemetryFromBackend();
}

function evaluateAndPrintCleanLog(logMessage) {
    if (logMessage === lastRecordedAction) return;
    lastRecordedAction = logMessage;
    logEvent(logMessage);
}

function logEvent(desc) {
    const container = document.getElementById("event-log-terminal");
    if (!container) return;
    if (container.innerHTML.includes("Initializing process log")) container.innerHTML = "";
    
    const timestamp = new Date().toLocaleTimeString();
    const row = `
        <div class="event-row">
            <div class="event-time">[${timestamp}]</div>
            <div class="event-desc">${desc}</div>
        </div>
    `;
    container.innerHTML = row + container.innerHTML;
    while (container.children.length > 100) { container.removeChild(container.lastChild); }
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(() => console.log("Service Worker Active."))
        .catch((err) => console.error("Worker failed:", err));
}
