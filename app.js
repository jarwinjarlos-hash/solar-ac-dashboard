// ==========================================
// ☀️ CLEAN DEYE DCS AUTOMATION ENGINE (app.js)
// ==========================================

let currentChannel = 'AO1';
let pinBuffer = "";
const VALID_PIN = "1981";

const RENDER_BACKEND_URL = "https://solar-ac-bridge.onrender.com";

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
        AO1: { lowlow: 21, high: 27 },
        AO2: { lowlow: 21, high: 27 }
    },
    priorities: { DO1: 1, DO2: 2, DO3: 3, DO4: 4, DO5: 5 },
    global: { minSoc: 85, dischargeTh: 150, deadband: 100, delay: 5, timeStart: "08:00", timeEnd: "17:00" }
};

let liveTelemetry = { basePv: 0, calculatedPv: 0, batterySoc: 100, gridPower: 0, calculatedLoad: 0, batteryPower: 0 };
let currentOutputStates = { AO1: 24, AO2: 24, AO3: 26, AO4: 26, AO5: 26, DO1: false, DO2: false, DO3: false, DO4: false, DO5: false };
let lastRecordedAction = "";

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

function adjustStep(id, delta, min = -5000, max = 10000) {
    let input = document.getElementById(id);
    if (!input) return;
    let currentVal = parseInt(input.value) || 0;
    let newVal = currentVal + delta;
    if (newVal >= min && newVal <= max) {
        input.value = newVal;
    }
}

function initApp() {
    let savedConfig = localStorage.getItem("dcs_client_matrix");
    if (savedConfig) {
        try { configMatrix = JSON.parse(savedConfig); } catch(e) { console.error("Config array corrupted."); }
    }
    
    loadGlobalPriorityInputs();
    renderMatrixRackTable();
    renderChannelConfigPage();
    
    document.getElementById("net-inv-sn").value = localStorage.getItem("dcs_inv_sn") || "";
    document.getElementById("net-app-id").value = localStorage.getItem("dcs_app_id") || "";
    document.getElementById("net-app-secret").value = localStorage.getItem("dcs_app_secret") || "";
    document.getElementById("net-portal-user").value = localStorage.getItem("dcs_portal_user") || "";
    document.getElementById("net-portal-pass").value = localStorage.getItem("dcs_portal_pass") || "";

    executeMasterSync();
    syncTelemetryFromBackend();
    setInterval(() => { syncTelemetryFromBackend(); }, 30000);
}

function loadGlobalPriorityInputs() {
    document.getElementById("mat-min-soc").value = configMatrix.global.minSoc;
    document.getElementById("mat-deadband").value = configMatrix.global.deadband;
    document.getElementById("mat-time-start").value = configMatrix.global.timeStart;
    document.getElementById("mat-time-end").value = configMatrix.global.timeEnd;
}

// ==========================================
// 📡 SYNC AND DIRECT REGISTERS RECTIFICATION LAYER
// ==========================================
async function syncTelemetryFromBackend() {
    const invSn = document.getElementById("net-inv-sn").value;
    const appId = document.getElementById("net-app-id").value;
    const appSecret = document.getElementById("net-app-secret").value;
    const email = document.getElementById("net-portal-user").value;
    const pass = document.getElementById("net-portal-pass").value;

    try {
        const payload = (appId && appSecret && email && pass) ? {
            email: email, password: pass, app_id: appId, app_secret: appSecret, inverter_sn: invSn
        } : {};

        const response = await fetch(`${RENDER_BACKEND_URL}/sync?_cb=${Date.now()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`HTTP Server Error: ${response.status}`);
        const data = await response.json();

        if (data.status === "success") {
            const measurements = data.measurements || data.telemetry || {};
            
            // Map exact backend telemetry parameters based on previous validation loop
            liveTelemetry.basePv = floatSafe(measurements.PV_Generation_W ?? measurements.PV_Power_W ?? 0);
            liveTelemetry.batterySoc = intSafe(measurements.Battery_SOC ?? 100);
            liveTelemetry.calculatedLoad = floatSafe(measurements.usePower ?? 652);
            
            // Extract Grid power dynamically to determine directional matrices
            liveTelemetry.gridPower = floatSafe(measurements.Grid_Power_W ?? measurements.Grid_Import_W ?? 0);

            let offset = parseInt(document.getElementById("mat-solar-offset").value) || 0;
            liveTelemetry.calculatedPv = Math.max(0, liveTelemetry.basePv + offset);
            
            // Recompute balance matrix vector cleanly based on new parameters
            liveTelemetry.batteryPower = liveTelemetry.calculatedPv - liveTelemetry.calculatedLoad - liveTelemetry.gridPower;

            evaluateAndPrintCleanLog(`LIVE REFRESH: Deye telemetry synchronized. Solar=${liveTelemetry.calculatedPv}W, Load=${liveTelemetry.calculatedLoad}W`);
            executeMasterSync();
        } else {
            evaluateAndPrintCleanLog(`SYNC ERROR: Backend failure response: ${data.message}`);
        }
    } catch (e) {
        evaluateAndPrintCleanLog(`LINK ERROR: D DCS Link Layer unstable.`);
    }
}

function floatSafe(v) { let f = parseFloat(v); return isNaN(f) ? 0 : f; }
function intSafe(v) { let i = parseInt(v); return isNaN(i) ? 0 : i; }

// ==========================================
// 🔁 ENGINE CALCULATE INTERLOCK & PATH DRIVERS
// ==========================================
function executeMasterSync() {
    // 1. DCS UI text fields updates track
    document.getElementById("lbl-pv").innerText = `${(liveTelemetry.calculatedPv / 1000).toFixed(2)} kW`;
    document.getElementById("lbl-soc").innerText = `${liveTelemetry.batterySoc}% SOC`;
    document.getElementById("lbl-grid").innerText = `${liveTelemetry.gridPower} W`;
    document.getElementById("lbl-load").innerText = `${liveTelemetry.calculatedLoad} W`;
    
    let batKw = (Math.abs(liveTelemetry.batteryPower) / 1000).toFixed(2);
    document.getElementById("lbl-bat").innerText = `${liveTelemetry.batteryPower < 0 ? '-' : ''}${batKw} kW`;
    document.getElementById("execution-timestamp").innerText = `Last Engine Sync: ${new Date().toLocaleTimeString()}`;

    // 🌟 ACTIVE DASHED PATHWAY DRIVE MATRICES (tracks `image_14.png` solid pipeline model logic)
    // Applied symmetric animation state deadbands to stop pathways from flickering at zero
    
    updateDashedPathwayState("path-pv", liveTelemetry.calculatedPv > 50, "active-out");
    updateDashedPathwayState("path-load", liveTelemetry.calculatedLoad > 50, "active-out");

    // Grid pathways drivers
    if (liveTelemetry.gridPower > 50) {
        // Power importing from utility ->moves backward towards Inverter node
        updateDashedPathwayState("path-grid", true, "active-in");
    } else if (liveTelemetry.gridPower < -50) {
        // Power exporting to utility ->moves forward outward from Inverter core node
        updateDashedPathwayState("path-grid", true, "active-out"); 
    } else {
        updateDashedPathwayState("path-grid", false);
    }

    // Battery pathways balance drivers
    if (liveTelemetry.batteryPower > 50) {
        // Power charging the pack ->moves outward towards Battery Unit node
        updateDashedPathwayState("path-bat", true, "active-out");
    } else if (liveTelemetry.batteryPower < -50) {
        // Power discharging from pack ->moves backward outward from unit towards core node
        updateDashedPathwayState("path-bat", true, "active-in"); 
    } else {
        updateDashedPathwayState("path-bat", false);
    }

    // 3. Output logic staging sequence Track
    let statusTag = document.getElementById("vector-status-tag");
    let currentHour = new Date().getHours();
    let startHour = parseInt(configMatrix.global.timeStart.split(":")[0]) || 6;
    let endHour = parseInt(configMatrix.global.timeEnd.split(":")[0]) || 18;
    
    if (!(currentHour >= startHour && currentHour < endHour)) {
        if (statusTag) { statusTag.innerText = "🌙 NIGHT INTERLOCK STANDBY ACTIVE"; statusTag.className = "vector-tag vector-discharging"; }
        ['DO1', 'DO2', 'DO3', 'DO4', 'DO5'].forEach(ch => { if (!configMatrix.overrides[ch]) currentOutputStates[ch] = false; });
    } else {
        if (statusTag) { statusTag.innerText = "🔋 DAY SOLAR OPTIMIZATION ACTIVE (LIVE FEED)"; statusTag.className = "vector-tag vector-charging"; }
        processAutomatedStagingSequence();
    }
    renderMatrixRackTable();
}

function updateDashedPathwayState(pathId, active, className = "") {
    const p = document.getElementById(pathId);
    if (!p) return;
    p.className.baseVal = active ? `flow-path ${className}` : "flow-path";
}

function processAutomatedStagingSequence() {
    let power = liveTelemetry.calculatedPv;
    let db = configMatrix.global.deadband;
    
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

function renderMatrixRackTable() {
    const tbody = document.getElementById("matrix-rack-body");
    if (!tbody) return; tbody.innerHTML = "";
    
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
    document.getElementById("config-target-title").innerText = `${currentChannel} Hardware Settings`;
    document.getElementById("cfg-custom-name").value = configMatrix.customNames[currentChannel];
    
    const isOverride = configMatrix.overrides[currentChannel];
    document.getElementById("cfg-override-toggle").checked = isOverride;

    if (isAO) {
        document.getElementById("cfg-sp-lowlow").value = configMatrix.aoLimits[currentChannel].lowlow;
        document.getElementById("cfg-sp-high").value = configMatrix.aoLimits[currentChannel].high;
    } else {
        document.getElementById("cfg-do-state-toggle").checked = configMatrix.overrideStates[currentChannel];
        document.getElementById("cfg-priority").value = configMatrix.priorities[currentChannel];
    }
    toggleOverrideUI();
}

function commitMatrixConfig() {
    const isAO = currentChannel.startsWith('AO');
    configMatrix.customNames[currentChannel] = document.getElementById("cfg-custom-name").value || currentChannel;
    configMatrix.overrides[currentChannel] = document.getElementById("cfg-override-toggle").checked;

    if (isAO) {
        configMatrix.aoLimits[currentChannel].lowlow = parseInt(document.getElementById("cfg-sp-lowlow").value);
        configMatrix.aoLimits[currentChannel].high = parseInt(document.getElementById("cfg-sp-high").value);
    } else {
        if (configMatrix.overrides[currentChannel]) {
            configMatrix.overrideStates[currentChannel] = document.getElementById("cfg-do-state-toggle").checked;
            currentOutputStates[currentChannel] = configMatrix.overrideStates[currentChannel];
        } else {
            configMatrix.priorities[currentChannel] = parseInt(document.getElementById("cfg-priority").value);
        }
    }

    configMatrix.global.minSoc = parseInt(document.getElementById("mat-min-soc").value);
    configMatrix.global.deadband = parseInt(document.getElementById("mat-deadband").value);
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
    if (container.innerHTML.includes("Initializing matrix loop")) container.innerHTML = "";
    const timestamp = new Date().toLocaleTimeString();
    const row = `<div class="event-row"><div class="event-time">[${timestamp}]</div><div class="event-desc">${desc}</div></div>`;
    container.innerHTML = row + container.innerHTML;
}
