// Register Service Worker for PWA compliance
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker Active!', reg.scope))
            .catch(err => console.log('Service Worker Crash:', err));
    });
}

// ================= CONFIGURATION =================
const BACKEND_URL = "https://solar-ac-bridge.onrender.com"; // Change to your actual backend domain
// =================================================

// UI Elements Links
const pvPowerEl = document.getElementById('pv-power');
const batterySocEl = document.getElementById('battery-soc');
const automationActionEl = document.getElementById('automation-action');
const timeManilaEl = document.getElementById('time-manila');
const saveBtn = document.getElementById('btn-save');

// Slider Parameter Linkers
const sliders = [
    { id: 'param-day-high-pv', valId: 'val-day-high-pv', suffix: 'W' },
    { id: 'param-day-high-bat', valId: 'val-day-high-bat', suffix: '%' },
    { id: 'param-day-low-pv', valId: 'val-day-low-pv', suffix: 'W' }
];

// Initialize visual value indicators on slides
sliders.forEach(slider => {
    const inputEl = document.getElementById(slider.id);
    const displayEl = document.getElementById(slider.valId);
    
    inputEl.addEventListener('input', (e) => {
        displayEl.textContent = e.target.value + slider.suffix;
    });
});

// Fetch Active Data from Render Bridge Engine
async function fetchTelemetry() {
    try {
        const response = await fetch(`${BACKEND_URL}/sync`);
        const data = await response.json();
        
        if (data.status === 'success') {
            // Update UI telemetry positions dynamically
            if(data.measurements) {
                pvPowerEl.textContent = `${parseInt(data.measurements.PV_Generation_W)} W`;
                batterySocEl.textContent = `${parseInt(data.measurements.Battery_SOC)}%`;
            } else if (data.telemetry) {
                pvPowerEl.textContent = `${parseInt(data.telemetry.PV_Power_W)} W`;
                batterySocEl.textContent = `${parseInt(data.telemetry.Battery_SOC)}%`;
            }
            
            automationActionEl.textContent = data.automation_action || data.action_taken;
            timeManilaEl.textContent = `Sync time: ${data.time_manila || 'Now'}`;
        } else {
            automationActionEl.textContent = `Backend error: ${data.message || 'Check logs'}`;
        }
    } catch (error) {
        console.error("Connection error:", error);
        automationActionEl.textContent = "Cannot link to Render Backend engine.";
    }
}

// Action Trigger on Setpoint Button Press
saveBtn.addEventListener('click', async () => {
    saveBtn.textContent = "Updating...";
    saveBtn.disabled = true;

    const payload = {
        day_high_pv: parseInt(document.getElementById('param-day-high-pv').value),
        day_high_bat: parseInt(document.getElementById('param-day-high-bat').value),
        day_low_pv: parseInt(document.getElementById('param-day-low-pv').value)
    };

    console.log("Sending updated parameters to backend:", payload);

    // This console layout matches our simulation phase.
    // It will execute cleanly as soon as we extend Render's POST /setpoints router block.
    setTimeout(() => {
        saveBtn.textContent = "Save Setpoints to Backend";
        saveBtn.disabled = false;
        alert("Setpoints buffered cleanly! Frontend ready for Backend route integration.");
    }, 1000);
});

// Run live metric tracking immediately on boot-up and loop every 30 seconds
fetchTelemetry();
setInterval(fetchTelemetry, 30000);
