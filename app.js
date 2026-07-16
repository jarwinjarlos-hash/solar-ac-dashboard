// =================================================================
// ☀️ CLEAN DEYE DCS AUTOMATION ENGINE (app.js) - RELEASE STAGE BETA 6.5
// =================================================================

let currentChannel = 'AO1';
let pinBuffer = "";
const VALID_PIN = "1981";

const RENDER_BACKEND_URL = "https://solar-ac-bridge.onrender.com";

// Expanded to track all new dynamic parameters in local storage
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
    global: { 
        minSoc: 85, 
        deadband: 100, 
        timeStart: "08:00", 
        timeEnd: "17:00", 
        solarOffset: 0,
        minChargeTh: 1000,   // Default: 1000W battery charge rate to kick off P1
        tierLow: 1200,       // Default: 1200W Tier 1 boundary
        tierMid: 2500,       // Default: 2500W Tier 2 boundary
        tierMax: 4000        // Default: 4000W Tier 4 boundary
    }
};

let liveTelemetry = { basePv: 0, calculatedPv: 0, batterySoc: 100, gridPower: 0, calculatedLoad: 0, batteryPower: 0, backendBatteryPower: 0 };
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

// Stepper adjustment controller tracking all bounds safely
function adjustStep(id, delta, min = -5000, max = 10000) {
    let input = document.getElementById(id);
    if (!input) return;
    let currentVal = parseInt(input.value) || 0;
    let newVal = currentVal + delta;
    if (newVal >= min && newVal <= max) {
        input.value = newVal;
        if (id === "mat-solar-offset") {
            configMatrix.global.solarOffset = newVal;
            recalculateAppliedOffsetTelemetry();
        }
        if (id === "mat-min-charge-th") configMatrix.global.minChargeTh = newVal;
        if (id === "mat-tier-low") configMatrix.global.tierLow = newVal;
        if (id === "mat-tier-mid") configMatrix.global.tierMid = newVal;
        if (id === "mat-tier-max") configMatrix.global.tierMax = newVal;
    }
}

function initApp() {
    let savedConfig = localStorage.getItem("dcs_client_matrix");
    if (savedConfig) {
        try { 
            let parsed = JSON.parse(savedConfig);
            // Ensure schema migration backward compatibility
            configMatrix = { ...configMatrix, ...parsed };
            configMatrix.global = { ...configMatrix.global, ...parsed.global };
        } catch(e) { 
            console.error("Config corrupted."); 
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

    executeMasterSync();
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
    document.getElementById("mat-tier-max").value = configMatrix.global.tierMax || 4000;
}

async function syncTelemetryFromBackend() {
    const invSn = document.getElementById("net-inv-sn").value;
    const appId = document.getElementById("net-app-id").value;
    const appSecret = document.getElementById("net-app-secret").value;
    const email = document.getElementById("net-portal-user").value;
    const pass = document.getElementById("net-portal-pass").value;

    try {
        // 🛠️ FIX: Correctly include inverter_sn so the Python backend receives it!
        const payload = (appId && appSecret && email && pass) ? {
            email: email, 
            password: pass, 
            app_id: appId, 
            app_secret: appSecret, 
            inverter_sn: invSn || ""
        } : {};

        const response = await fetch(`${RENDER_BACKEND_URL}/sync?_cb=${Date.now()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`Server Status: ${response.status}`);
        const data = await response.json();

        if (data.status === "success") {
            const measurements = data.measurements || data.telemetry || {};
            
            // Exact casing matches with Python backend:
            liveTelemetry.basePv = floatSafe(measurements.PV_Generation_W ?? measurements.PV_Power_W ?? 0);
            liveTelemetry.batterySoc = intSafe(measurements.Battery_SOC ?? 100);
            
            // Map the exact "usePower" variable sent from python
            liveTelemetry.calculatedLoad = floatSafe(measurements.usePower ?? 0);
            
            // Map the exact "Grid_Power_W" variable sent from python
            liveTelemetry.gridPower = floatSafe(measurements.Grid_Power_W ?? 0);
            
            // Map the exact "Battery_Power_W" variable sent from python
            liveTelemetry.backendBatteryPower = floatSafe(measurements.Battery_Power_W ?? 0);

            recalculateAppliedOffsetTelemetry();
        } else {
            evaluateAndPrintCleanLog(`SYNC ERROR: ${data.message}`);
        }
    } catch (e) {
        evaluateAndPrintCleanLog(`LINK TIMEOUT: Server linking...`);
    }
}

function recalculateAppliedOffsetTelemetry() {
    let offsetInput = document.getElementById("mat-solar-offset");
    let offset = offsetInput ? (parseInt(offsetInput.value) || 0) : 0;
    
    // Apply offset simulation directly to PV generation values
    liveTelemetry.calculatedPv = Math.max(0, liveTelemetry.basePv + offset);
    
    // Calculate precise battery power flow (Sign convention: positive is discharging, negative is charging)
    if (offset === 0 && liveTelemetry.backendBatteryPower !== 0) {
        liveTelemetry.batteryPower = liveTelemetry.backendBatteryPower;
    } else {
        liveTelemetry.batteryPower = liveTelemetry.calculatedLoad + liveTelemetry.gridPower - liveTelemetry.calculatedPv;
    }
    
    executeMasterSync();
}

function floatSafe(v) { let f = parseFloat(v); return isNaN(f) ? 0 : f; }
function intSafe(v) { let i = parseInt(v); return isNaN(i) ? 0 : i; }

// ==========================================
// 🔁 INTERLOCK MASTER REFRESH ENGINE
// ==========================================
function executeMasterSync() {
    document.getElementById("lbl-pv").innerText = `${(liveTelemetry.calculatedPv / 1000).toFixed(2)} kW`;
    document.getElementById("lbl-soc").innerText = `${liveTelemetry.batterySoc}% SOC`;
    document.getElementById("lbl-grid").innerText = `${liveTelemetry.gridPower} W`;
    document.getElementById("lbl-load").innerText = `${liveTelemetry.calculatedLoad} W`;
    
    // Signs are preserved (+ for discharge, - for charge)
    let batValue = liveTelemetry.batteryPower / 1000;
    document.getElementById("lbl-bat").innerText = `${batValue.toFixed(2)} kW`;
    
    document.getElementById("execution-timestamp").innerText = `Last Engine Sync: ${new Date().toLocaleTimeString()}`;

    let statusTag = document.getElementById("vector-status-tag");
    let currentHour = new Date().getHours();
    let startHour = parseInt(configMatrix.global.timeStart.split(":")[0]) || 8;
    let endHour = parseInt(configMatrix.global.timeEnd.split(":")[0]) || 17;
    
    if (!(currentHour >= startHour && currentHour < endHour)) {
        if (statusTag) { statusTag.innerText = "🌙 NIGHT INTERLOCK STANDBY ACTIVE"; statusTag.className = "vector-tag vector-discharging"; }
        ['DO1', 'DO2', 'DO3', 'DO4', 'DO5'].forEach(ch => { if (!configMatrix.overrides[ch]) currentOutputStates[ch] = false; });
    } else {
        if (statusTag) { statusTag.innerText = "🔋 DAY SOLAR OPTIMIZATION ACTIVE (LIVE FEED)"; statusTag.className = "vector-tag vector-charging"; }
        processAutomatedStagingSequence();
    }
    renderMatrixRackTable();
}

// ==========================================
// 🧠 PROCESS ENGINE DECISION MATRIX
// ==========================================
function processAutomatedStagingSequence() {
    let power = liveTelemetry.calculatedPv;
    let grid = liveTelemetry.gridPower;
    let batSoc = liveTelemetry.batterySoc;
    let batFlow = liveTelemetry.batteryPower; // Positive = Discharging, Negative = Charging
    
    // Dynamic Parameter Registrations from UI
    let minSoc = configMatrix.global.minSoc || 85;
    let db = configMatrix.global.deadband || 100;
    let chargeTrigger = configMatrix.global.minChargeTh || 1000;
    let t1_low = configMatrix.global.tierLow || 1200;
    let t2_mid = configMatrix.global.tierMid || 2500;
    let t4_max = configMatrix.global.tierMax || 4000;

    // ----------------------------------------------------
    // 🛡️ INTERLOCK 1: DAYTIME BATTERY DISCHARGE SHEDDING
    // ----------------------------------------------------
    // Since positive batFlow means DISCHARGING:
    if (batFlow > 50) {
        if (!configMatrix.overrides.DO1) currentOutputStates.DO1 = false;
        if (!configMatrix.overrides.DO2) currentOutputStates.DO2 = false;
        if (!configMatrix.overrides.AO1) currentOutputStates.AO1 = configMatrix.aoLimits.AO1?.high ?? 27;
        if (!configMatrix.overrides.AO2) currentOutputStates.AO2 = configMatrix.aoLimits.AO2?.high ?? 27;
        evaluateAndPrintCleanLog(`[⚠️ SHEDDING ACTIVE] Cloud cover detected. Battery discharging at ${intSafe(batFlow)}W. Shedding P1 loads to conserve battery.`);
        return; 
    }

    // ----------------------------------------------------
    // 🛡️ INTERLOCK 2: GRID STANDBY CONSUMPTION PROTECTION
    // ----------------------------------------------------
    if (grid > 50) {
        if (!configMatrix.overrides.DO1) currentOutputStates.DO1 = false;
        if (!configMatrix.overrides.DO2) currentOutputStates.DO2 = false;
        evaluateAndPrintCleanLog(`[⚠️ GRID PROTECTION] Grid import detected at ${intSafe(grid)}W. Restricting P1 loads.`);
        return;
    }

    // ----------------------------------------------------
    // 🔋 UNTHROTTLING DETECTOR: BATTERY CHARGE RATE STEP
    // ----------------------------------------------------
    // Since negative batFlow means CHARGING, we check if the charging rate (-batFlow) is greater than trigger:
    if (batSoc >= minSoc && batFlow <= -chargeTrigger) {
        if (!configMatrix.overrides.DO1) currentOutputStates.DO1 = true;
        if (!configMatrix.overrides.AO1) currentOutputStates.AO1 = configMatrix.aoLimits.AO1?.lowlow ?? 21;
        evaluateAndPrintCleanLog(`[🚀 UNTHROTTLE ACTIVE] Battery charging healthy at ${intSafe(Math.abs(batFlow))}W. Activating Priority 1 AC to unthrottle MPPT.`);
        return;
    }

    // ----------------------------------------------------
    // 📊 NORMAL OPERATIONAL TIERS (Fallbacks)
    // ----------------------------------------------------
    if (power < (t1_low - db)) {
        if (!configMatrix.overrides.DO1) currentOutputStates.DO1 = false;
        if (!configMatrix.overrides.DO2) currentOutputStates.DO2 = false;
        if (!configMatrix.overrides.AO1) currentOutputStates.AO1 = configMatrix.aoLimits.AO1?.high ?? 27;
        if (!configMatrix.overrides.AO2) currentOutputStates.AO2 = configMatrix.aoLimits.AO2?.high ?? 27;
        evaluateAndPrintCleanLog(`TIER 1 (LOW SUN): Generation ${intSafe(power)}W below threshold. Running High Eco SP.`);
    } else if (power >= t4_max) {
        // Full production excess
        if (!configMatrix.overrides.DO1) currentOutputStates.DO1 = true;
        if (!configMatrix.overrides.DO2) currentOutputStates.DO2 = true;
        if (!configMatrix.overrides.AO1) currentOutputStates.AO1 = configMatrix.aoLimits.AO1?.lowlow ?? 21;
        if (!configMatrix.overrides.AO2) currentOutputStates.AO2 = configMatrix.aoLimits.AO2?.lowlow ?? 21;
        evaluateAndPrintCleanLog(`TIER 4 (MASSIVE EXCESS): Overproducing at ${intSafe(power)}W. All channels active for deep thermal banking.`);
    } else {
        let msg = `DCS STABLE: Solar hovering in core envelope at ${intSafe(power)}W. Holding current states.`;
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
    document.getElementById("cfg-custom-name").value = configMatrix.customNames[currentChannel];
    
    const isOverride = configMatrix.overrides[currentChannel];
    document.getElementById("cfg-override-toggle").checked = isOverride;

    if (isAO) {
        document.getElementById("cfg-sp-lowlow").value = configMatrix.aoLimits[currentChannel]?.lowlow ?? 21;
        document.getElementById("cfg-sp-high").value = configMatrix.aoLimits[currentChannel]?.high ?? 27;
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
        if(!configMatrix.aoLimits[currentChannel]) configMatrix.aoLimits[currentChannel] = {};
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
    configMatrix.global.solarOffset = parseInt(document.getElementById("mat-solar-offset").value) || 0;
    configMatrix.global.minChargeTh = parseInt(document.getElementById("mat-min-charge-th").value) || 1000;
    configMatrix.global.tierLow = parseInt(document.getElementById("mat-tier-low").value) || 1200;
    configMatrix.global.tierMid = parseInt(document.getElementById("mat-tier-mid").value) || 2500;
    configMatrix.global.tierMax = parseInt(document.getElementById("mat-tier-max").value) || 4000;

    localStorage.setItem("dcs_client_matrix", JSON.stringify(configMatrix));
    localStorage.setItem("dcs_inv_sn", document.getElementById("net-inv-sn").value);
    localStorage.setItem("dcs_app_id", document.getElementById("net-app-id").value);
    localStorage.setItem("dcs_app_secret", document.getElementById("net-app-secret").value);
    localStorage.setItem("dcs_portal_user", document.getElementById("net-portal-user").value);
    localStorage.setItem("dcs_portal_pass", document.getElementById("net-portal-pass").value);

    logEvent(`SYS RECONFIG: Setup committed.`);
    recalculateAppliedOffsetTelemetry();
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
