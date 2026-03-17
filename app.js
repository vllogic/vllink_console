// ... ThemeManager, TabManager 保持不变 ...

const vllink = new VllinkManager();
let pollTimer = null;
let lastDeviceFingerprint = ""; // 用于识别设备列表结构变化

const UI = {
    connectBtn: document.getElementById('connectBtn'),
    deviceList: document.getElementById('deviceList'),
    status: document.getElementById('connectionStatus')
};

// 事件委托：处理切换
UI.deviceList.addEventListener('click', (e) => {
    const card = e.target.closest('[data-id]');
    if (card) vllink.selectDebugger(parseInt(card.dataset.id));
});

UI.connectBtn.addEventListener('click', async () => {
    try {
        await vllink.connect();
        UI.status.innerText = "ONLINE: " + vllink.device.productName;
        UI.connectBtn.innerText = "CONNECTED";
        UI.connectBtn.classList.replace('bg-primary', 'bg-green-600');
        
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(async () => {
            try {
                const info = await vllink.queryInfo();
                updateDeviceDisplay(info);
            } catch (e) {
                clearInterval(pollTimer);
                UI.status.innerText = "OFFLINE";
                UI.connectBtn.innerText = "RECONNECT";
                UI.connectBtn.classList.replace('bg-green-600', 'bg-primary');
            }
        }, 250);
    } catch (e) {
        alert("Connection Failed: " + e.message);
    }
});

function updateDeviceDisplay(info) {
    const all = [{ ...info.local, id: 0, type: 'USB' }];
    info.remote.forEach(r => all.push({ ...r, type: 'WIFI' }));

    // 生成指纹（ID + MAC）来判断列表是否需要重构
    const currentFingerprint = all.map(d => `${d.id}-${d.mac}`).join('|');

    if (currentFingerprint !== lastDeviceFingerprint) {
        UI.deviceList.innerHTML = all.map(dev => `
            <div data-id="${dev.id}" class="glass p-4 rounded-2xl cursor-pointer transition-all border border-transparent opacity-60 hover:opacity-100 flex flex-col gap-2">
                <div class="flex justify-between items-center">
                    <span class="text-xs font-black tracking-tight text-slate-700 dark:text-slate-200 truncate pr-2">${dev.alias}</span>
                    <span class="text-[9px] bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-full font-bold text-slate-500">${dev.type}</span>
                </div>
                
                <div class="text-[10px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100/50 dark:bg-black/20 px-2 py-1 rounded flex justify-between">
                    <span class="opacity-70">MAC:</span>
                    <span>${dev.mac}</span>
                </div>

                <div class="flex justify-between items-end font-mono mt-1">
                    <div class="text-[9px] text-slate-500">UPTIME: <span class="uptime-val text-slate-600 dark:text-slate-300">00:00:00</span></div>
                    <div class="text-[10px] text-primary font-black delay-val">-</div>
                </div>
            </div>
        `).join('');
        lastDeviceFingerprint = currentFingerprint;
    }

    // 局部静默更新数据，防止 hover 闪烁
    all.forEach(dev => {
        const card = UI.deviceList.querySelector(`[data-id="${dev.id}"]`);
        if (!card) return;

        card.classList.toggle('card-active', info.select_idx === dev.id);

        let duration = dev.id === 0 ? Number(info.local.us) / 1000000 : Number(info.local.us - dev.us) / 1000000;
        card.querySelector('.uptime-val').innerText = formatTime(duration);

        const delayLabel = card.querySelector('.delay-val');
        delayLabel.innerText = dev.delay_us > 0 ? `${dev.delay_us}us` : "-";
    });
}

function formatTime(s) {
    if (s < 0) s = 0;
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${h}:${m}:${sec}`;
}