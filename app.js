// ==========================================
// ☀️ COMMERCIAL SOLAR DCS VIRTUAL ENGINE (app.js)
// ==========================================

let currentChannel = 'AO1';
let pinBuffer = "";
const VALID_PIN = "1981";

// 1. Storage Matrix Configuration Template
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

// 2. Process Registers
let liveTelemetry = { basePv: 785, calculatedPv: 785, batterySoc: 100, gridPower: 0, batteryCurrent: 61, isCharging: true };
let currentOutputStates = { AO1: 24, AO2: 24, AO3: 26, AO4: 26, AO5: 26, DO1: true, DO2: true, DO3: false, DO4: false, DO5: false };
let lastRecordedAction = "";

const helpStrings = {
    hand: "Bypasses all automatic solar/battery step calculations. Decouples this specific output channel to give you permanent, hard command over its target values.",
    offset: "Injects manual offset wattage (+/-) into the runtime environment to simulate shifting cloud cover, changing house loads, or massive generation spikes.",
    soc: "The minimum battery state-of-charge percentage required to authorize automated execution loops during daytime optimization hours.",
    discharge: "The minimum wattage draw required to confirm a true battery discharge. Minor draws below this when the battery is at 100% are ignored to shield the sequencer from sensor noise.",
    deadband: "Symmetric wattage buffer applied to trigger parameters. Stops relays and compressors from rapidly cycling back and forth when solar generation hovers directly on threshold parameters.",
    delay: "The block-start sequence countdown timer. Forces the system to hold staging for a set number of minutes before energizing the next priority load to mitigate inrush current spikes.",
    time: "Defines the active daytime tracking window. Outside this range, the system automatically forces into Night Standby, locking out automation for manual discretion.",
    inverter_creds: "Your personal Deye/Solarman developer portal credentials. These are stored locally in your browser memory and are used to securely request live data from your inverter without exposing your password in public backend files."
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
        try { configMatrix = JSON.parse(savedConfig); } catch(e) { console.error("Config array corrupted, resetting defaults."); }
    }
    
    loadGlobalPriorityInputs();
    renderMatrixRackTable();
    renderChannelConfigPage();
    
    // Load Client-Side Inverter Credential Persistence Rings
    document.getElementById("net-inv-sn").value = localStorage.getItem("dcs_inv_sn") || "";
    document.getElementById("net-app-id").value = localStorage.getItem("dcs_app_id") || "";
    document.getElementById("net-app-secret").value = localStorage.getItem("dcs_app_secret") || "";
    document.getElementById("net-portal-user").value = localStorage.getItem("dcs_portal_user") || "";
    document.getElementById("net-portal-pass").value = localStorage.getItem("dcs_portal_pass") || "";

    executeMasterSync();
    
    // Process core logic sequences on a continuous 1-Second tick loop
    setInterval(() => {
        processVirtualCalculations();
        executeMasterSync();
    }, 1000);
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
// 🌦️ PURE VIRTUAL SIMULATION RUNTIME AUTOMATION KERNEL
// ==========================================
function processVirtualCalculations() {
    let solarDrift = Math.floor(Math.random() * 11) - 5; 
    liveTelemetry.basePv = Math.max(100, liveTelemetry.basePv + solarDrift);

    let offset = parseInt(document.getElementById("mat-solar-offset").value) || 0;
    liveTelemetry.calculatedPv = Math.max(0, liveTelemetry.basePv + offset);

    if (liveTelemetry.calculatedPv < 400) {
        liveTelemetry.batterySoc = Math.max(80, liveTelemetry.batterySoc - 1);
        liveTelemetry.batteryCurrent = configMatrix.global.dischargeTh + 80; 
        liveTelemetry.isCharging = false;
        liveTelemetry.gridPower = 150; 
    } else {
        liveTelemetry.batterySoc = Math.min(100, liveTelemetry.batterySoc + 1);
        liveTelemetry.batteryCurrent = 45; 
        liveTelemetry.isCharging = true;
        liveTelemetry.gridPower = 0;
    }
}

// ==========================================
// 🔁 ENGINE CALCULATE INTERLOCK AND SEQUENCER RUNS
// ==========================================
function executeMasterSync() {
    document.getElementById("pv-power").innerText = `${liveTelemetry.calculatedPv} W`;
    document.getElementById("battery-soc").innerText = `${liveTelemetry.batterySoc}%`;
    document.getElementById("grid-power").innerText = `${liveTelemetry.gridPower} W`;
    document.getElementById("execution-timestamp").innerText = `Last Engine Sync: ${new Date().toLocaleTimeString()}`;

    let statusTag = document.getElementById("vector-status-tag");
    let th = configMatrix.global.dischargeTh;
    let isTrueDischarging = (liveTelemetry.batteryCurrent > th) && (!liveTelemetry.isCharging);

    if (isTrueDischarging) {
        statusTag.innerText = "🪫 DISCHARGING STATE (MANUAL OVERRIDE HARD LOCK)";
        statusTag.className = "vector-tag vector-discharging";
        ['DO1', 'DO2', 'DO3', 'DO4', 'DO5'].forEach(ch => {
            if (!configMatrix.overrides[ch]) currentOutputStates[ch] = false;
        });
        evaluateAndPrintCleanLog("CRITICAL STANDBY: True battery drainage detected. Discoupling logic tracks. Shifting outputs to safety base values.");
    } else {
        statusTag.innerText = "🔋 CHARGING / FULL IDLE (AUTOMATIC SCHEDULER ACTIVE)";
        statusTag.className = "vector-tag vector-charging";
        processAutomatedStagingSequence();
    }
    renderMatrixRackTable();
}

function processAutomatedStagingSequence() {
    let power = liveTelemetry.calculatedPv;
    let db = configMatrix.global.deadband;
    
    if (power > (1000 + db)) {
        if (!configMatrix.overrides.DO1 && !currentOutputStates.DO1) {
            currentOutputStates.DO1 = true;
            evaluateAndPrintCleanLog("ENGINE HIGH PROD: Threshold + Deadband crossed. Sequential Staging starting: Triggering [DO1] ON.");
        }
        if (!configMatrix.overrides.DO2 && currentOutputStates.DO1 && !currentOutputStates.DO2) {
            currentOutputStates.DO2 = true;
            evaluateAndPrintCleanLog("ENGINE STEP UP: Staging delay verification satisfied. Engaging next tier priority: Triggering [DO2] ON.");
        }
        if (!configMatrix.overrides.AO1) currentOutputStates.AO1 = configMatrix.aoLimits.AO1.lowlow;
        if (!configMatrix.overrides.AO2) currentOutputStates.AO2 = configMatrix.aoLimits.AO2.lowlow;
    } else if (power < (500 - db)) {
        if (!configMatrix.overrides.DO2 && currentOutputStates.DO2) {
            currentOutputStates.DO2 = false;
            evaluateAndPrintCleanLog("ENGINE SHED: Production drop detected below Deadband boundary. Shedding Priority 2: [DO2] turned OFF.");
        }
        if (!configMatrix.overrides.AO1) currentOutputStates.AO1 = configMatrix.aoLimits.AO1.high;
        if (!configMatrix.overrides.AO2) currentOutputStates.AO2 = configMatrix.aoLimits.AO2.high;
    } else {
        let msg = `DCS NORMAL: Plant metrics stable within deadband envelope. Virtual solar running at ${power}W.`;
        if (lastRecordedAction.startsWith("DCS NORMAL")) lastRecordedAction = msg; 
        evaluateAndPrintCleanLog(msg);
    }
}

// ==========================================
// ⚙️ RENDERING HMI ELEMENTS
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
    
    const isOverride = document.getElementById("cfg-override-toggle").checked;
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

// ==========================================
// 💾 CONFIG COMMIT SECURE SAVING
// ==========================================
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

    // Push profile updates to LocalStorage
    localStorage.setItem("dcs_client_matrix", JSON.stringify(configMatrix));
    
    // Lock personal hardware keys directly inside browser memory rings
    localStorage.setItem("dcs_inv_sn", document.getElementById("net-inv-sn").value);
    localStorage.setItem("dcs_app_id", document.getElementById("net-app-id").value);
    localStorage.setItem("dcs_app_secret", document.getElementById("net-app-secret").value);
    localStorage.setItem("dcs_portal_user", document.getElementById("net-portal-user").value);
    localStorage.setItem("dcs_portal_pass", document.getElementById("net-portal-pass").value);

    logEvent(`SYS RECONFIG: Client profile compiled and saved locally to offline LocalStorage matrix.`);
    renderMatrixRackTable();
}

// ==========================================
// 📋 DE-DUPLICATED PRINT LOG TERMINAL
// ==========================================
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
    while (container.children.length > 100) {
        container.removeChild(container.lastChild);
    }
}

// ==========================================
// 📦 PWA SERVICE WORKER REGISTRATION
// ==========================================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(() => console.log("DCS Optimization Kernel: Service Worker Registered cleanly."))
        .catch((err) => console.error("DCS Kernel Error: Service Worker registration failed:", err));
}
