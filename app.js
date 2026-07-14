if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.log('SW registration error:', err));
    });
}

// ================= CONFIGURATION =================
const BACKEND_URL = "https://solar-ac-bridge.onrender.com"; 
const ACCESS_PIN = "1981"; 
// =================================================

let enteredPin = "";
const pinDisplay = document.getElementById("pin-display");
const authScreen = document.getElementById("auth-screen");
const mainDashboard = document.getElementById("main-dashboard");

function appendPin(number) {
    if (enteredPin.length < 4) {
        enteredPin += number;
        pinDisplay.textContent = "*".repeat(enteredPin.length);
    }
}
function clearPin() { enteredPin = ""; pinDisplay.textContent = ""; }

function verifyPin() {
    if (enteredPin === ACCESS_PIN) {
        authScreen.style.display = "none";
        mainDashboard.style.display = "block";
        executeMasterSync(); 
    } else {
        alert("Invalid access pin code.");
        clearPin();
    }
}

function switchTab(tabId, btnHandle) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    btnHandle.classList.add('active');
    
    if (tabId === 'logs-tab') {
        fetchEventHistory();
    }
}

const pvPowerEl = document.getElementById('pv-power');
const batterySocEl = document.getElementById('battery-soc');
const automationActionEl = document.getElementById('automation-action');
const timestampEl = document.getElementById('execution-timestamp');
const refreshBtn = document.getElementById('btn-refresh');
const saveBtn = document.getElementById('btn-save');
const logTerminal = document.getElementById('event-log-terminal');

// Array Mapping for all 11 variables to handle slider visualization changes
const sliders = [
    { id: 'param-sp-lowlow', valId: 'val-sp-lowlow', suffix: '°C' },
    { id: 'param-sp-low-mid', valId: 'val-sp-low-mid', suffix: '°C' },
    { id: 'param-sp-high-mid', valId: 'val-sp-high-mid', suffix: '°C' },
    { id: 'param-sp-high', valId: 'val-sp-high', suffix: '°C' },
    { id: 'param-excess-max', valId: 'val-excess-max', suffix: 'W' },
    { id: 'param-excess-mid', valId: 'val-excess-mid', suffix: 'W' },
    { id: 'param-excess-low', valId: 'val-excess-low', suffix: 'W' },
    { id: 'param-deadband', valId: 'val-deadband', suffix: 'W' },
    { id: 'param-bat-cutoff', valId: 'val-bat-cutoff', suffix: '%' }
];

sliders.forEach(slider => {
    const inputEl = document.getElementById(slider.id);
    const displayEl = document.getElementById(slider.valId);
    if(inputEl && displayEl) {
        inputEl.addEventListener('input', (e) => { displayEl.textContent = e.target.value + slider.suffix; });
    }
});

async function executeMasterSync() {
    refreshBtn.textContent = "Syncing...";
    refreshBtn.disabled = true;
    await fetchTelemetry();
    await fetchEventHistory();
    refreshBtn.textContent = "🔄 Force Sync";
    refreshBtn.disabled = false;
}

async function fetchTelemetry() {
    try {
        const response = await fetch(`${BACKEND_URL}/sync`);
        const data = await response.json();
        if (data.status === 'success') {
            const pv = data.measurements ? data.measurements.PV_Generation_W : (data.telemetry ? data.telemetry.PV_Power_W : 0);
            const soc = data.measurements ? data.measurements.Battery_SOC : (data.telemetry ? data.telemetry.Battery_SOC : 0);
            
            pvPowerEl.textContent = `${parseInt(pv)} W`;
            batterySocEl.textContent = `${parseInt(soc)}%`;
            automationActionEl.textContent = data.automation_action;

            const currentTimestamp = new Date();
            timestampEl.textContent = `Logic Matrix Executed: ${currentTimestamp.toLocaleDateString()} @ ${currentTimestamp.toLocaleTimeString()}`;
            updateSimulatedIORack(data.target_temperature, pv, soc);
        }
    } catch (error) {
        automationActionEl.textContent = "DCS link error to Render Engine endpoint.";
    }
}

async function fetchEventHistory() {
    try {
        const response = await fetch(`${BACKEND_URL}/history`);
        const data = await response.json();
        if (data.status === 'success' && data.history.length > 0) {
            logTerminal.innerHTML = ""; 
            data.history.forEach(evt => {
                const row = document.createElement('div');
                row.className = "event-row";
                row.innerHTML = `<div class="event-time">[${evt.timestamp}]</div><div class="event-desc">${evt.description}</div>`;
                logTerminal.appendChild(row);
            });
        }
    } catch (error) {
        logTerminal.innerHTML = `<div style="color:var(--status-off); text-align:center; padding:10px;">Failed to read operational rolling log records.</div>`;
    }
}

function updateSimulatedIORack(targetTemp, pvPower, batterySoc) {
    const tTemp = targetTemp || 25;
    document.getElementById('txt-ao1').textContent = `${tTemp}°C`;
    document.getElementById('txt-ao2').textContent = `${tTemp}°C`;
    
    if (pvPower < 1200) {
        setChannelState('do1', false); setChannelState('do2', false); setChannelState('do3', false); setChannelState('do4', false); setChannelState('do5', false);
    } else if (pvPower >= 1200 && pvPower < 2500) {
        setChannelState('do1', true); setChannelState('do2', false); setChannelState('do3', false); setChannelState('do4', false); setChannelState('do5', false);
    } else if (pvPower >= 2500 && pvPower < 4000) {
        setChannelState('do1', true); setChannelState('do2', true); setChannelState('do3', true); setChannelState('do4', false); setChannelState('do5', false);
    } else if (pvPower >= 4000) {
        setChannelState('do1', true); setChannelState('do2', true); setChannelState('do3', true); setChannelState('do4', true); setChannelState('do5', true);
    }
}

function setChannelState(chId, isActive) {
    const div = document.getElementById(`ch-${chId}`);
    const txt = document.getElementById(`txt-${chId}`);
    if (isActive) { div.classList.add('active'); txt.textContent = "ON"; txt.className = "io-status status-on"; }
    else { div.classList.remove('active'); txt.textContent = "OFF"; txt.className = "io-status"; }
}

refreshBtn.addEventListener('click', executeMasterSync);

saveBtn.addEventListener('click', async () => {
    saveBtn.textContent = "Writing Matrix...";
    saveBtn.disabled = true;
    
    // Package all components cleanly to match control philosophy rules
    const payload = {
        sp_lowlow: parseInt(document.getElementById('param-sp-lowlow').value),
        sp_low_mid: parseInt(document.getElementById('param-sp-low-mid').value),
        sp_high_mid: parseInt(document.getElementById('param-sp-high-mid').value),
        sp_high: parseInt(document.getElementById('param-sp-high').value),
        excess_max: parseInt(document.getElementById('param-excess-max').value),
        excess_mid: parseInt(document.getElementById('param-excess-mid').value),
        excess_low: parseInt(document.getElementById('param-excess-low').value),
        deadband: parseInt(document.getElementById('param-deadband').value),
        time_start: document.getElementById('param-time-start').value,
        time_end: document.getElementById('param-time-end').value,
        bat_cutoff: parseInt(document.getElementById('param-bat-cutoff').value)
    };

    try {
        const res = await fetch(`${BACKEND_URL}/setpoints`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });
        const confirmation = await res.json();
        if (confirmation.status === 'success') { 
            alert("Control philosophy tuning matrix deployed successfully!"); 
            executeMasterSync(); 
        }
    } catch (e) { alert("Communication failure pushing tuning values down."); }
    finally { saveBtn.textContent = "💾 Save Config Matrix"; saveBtn.disabled = false; }
});
