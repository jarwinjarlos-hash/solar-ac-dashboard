// ==========================================
// ☀️ SOLAR AUTOMATION ENGINE CORE CONFIG (app.js)
// ==========================================

let currentChannel = 'AO1';
let pinBuffer = "";
const VALID_PIN = "1981";

let configMatrix = {
    permissives: { DO1: true, DO2: true, DO3: true, DO4: true, DO5: true },
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

let liveTelemetry = { pvPower: 785, batterySoc: 100, gridPower: 0, batteryCurrent: 61, isCharging: true };
let currentOutputStates = { AO1: 24, AO2: 24, AO3: 26, AO4: 26, AO5: 26, DO1: true, DO2: true, DO3: false, DO4: false, DO5: false };
let lastRecordedAction = "";

const helpStrings = {
    hand: "Bypasses all automatic solar/battery step calculations. Decouples this specific output channel to give you permanent, hard command over its target values.",
    soc: "The minimum battery state-of-charge percentage required to authorize automated execution loops during daytime optimization hours.",
    discharge: "The minimum wattage draw required to confirm a true battery discharge. Minor draws below this when the battery is at 100% are ignored to shield the sequencer from sensor noise.",
    deadband: "Symmetric wattage buffer applied to trigger parameters. Stops relays and compressors from rapidly cycling back and forth when solar generation hovers directly on threshold parameters.",
    delay: "The block-start sequence countdown timer. Forces the system to hold staging for a set number of minutes before energizing the next priority load to mitigate inrush current spikes.",
    time: "Defines the active daytime tracking window. Outside this range, the system automatically forces into Night Standby, locking out automation for manual discretion."
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

function adjustStep(id, delta, min = 0, max = 10000) {
    let input = document.getElementById(id);
    if (!input) return;
    let currentVal = parseInt(input.value) || 0;
    let newVal = currentVal + delta;
    if (newVal >= min && newVal <= max) {
        input.value = newVal;
    }
}

// ==========================================
// ⚙️ RENDER MATRIX LOGIC
// ==========================================
function initApp() {
    loadGlobalPriorityInputs();
    renderMatrixRackTable();
    renderChannelConfigPage();
    executeMasterSync();
}

function loadGlobalPriorityInputs() {
    document.getElementById("mat-min-soc").value = configMatrix.global.minSoc;
    document.getElementById("mat-discharge-th").value = configMatrix.global.dischargeTh;
    document.getElementById("mat-deadband").value = configMatrix.global.deadband;
    document.getElementById("mat-delay").value = configMatrix.global.delay;
    document.getElementById("mat-time-start").value = configMatrix.global.timeStart;
    document.getElementById("mat-time-end").value = configMatrix.global.timeEnd;
}

function renderMatrixRackTable() {
    const tbody = document.getElementById("matrix-rack-body");
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

// ==========================================
// 💾 CONFIG COMMIT LOGIC
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

    logEvent(`SYS RECONFIG: Changes saved and compiled to [${currentChannel}] hardware runtime memory context.`);
    renderMatrixRackTable();
}

// ==========================================
// 🔁 PROCESS AUTOMATION LOGIC SYNC
// ==========================================
function executeMasterSync() {
    document.getElementById("pv-power").innerText = `${liveTelemetry.pvPower} W`;
    document.getElementById("battery-soc").innerText = `${liveTelemetry.batterySoc}%`;
    document.getElementById("grid-power").innerText = `${liveTelemetry.gridPower} W`;
    document.getElementById("execution-timestamp").innerText = `Last Engine Sync: ${new Date().toLocaleTimeString()}`;

    let statusTag = document.getElementById("vector-status-tag");
    
    let th = configMatrix.global.dischargeTh;
    let isTrueDischarging = (liveTelemetry.batteryCurrent > th) && (!liveTelemetry.isCharging);

    if (isTrueDischarging) {
        statusTag.innerText = "🪫 DISCHARGING STATE (MANUAL OVERRIDE HARD LOCK)";
        statusTag.className = "vector-tag vector-discharging";
        processManualSafetyLock();
    } else {
        statusTag.innerText = "🔋 CHARGING / FULL IDLE (AUTOMATIC SCHEDULER ACTIVE)";
        statusTag.className = "vector-tag vector-charging";
        processAutomatedStagingLoop();
    }
    renderMatrixRackTable();
}

function processManualSafetyLock() {
    evaluateAndPrintCleanLog("CRITICAL STANDBY: True battery drainage detected. Discoupling logic trackers to Manual state.");
}

function processAutomatedStagingLoop() {
    let descString = `DCS NORMAL: System operating securely. Solar generation at ${liveTelemetry.pvPower}W with Battery SOC hovering at ${liveTelemetry.batterySoc}%.`;
    evaluateAndPrintCleanLog(descString);
}

// ==========================================
// 📋 DEDUPLICATED EVENT LOG TERMINAL
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
