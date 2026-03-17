/**
 * 三模态主题管理器 (保持不变)
 */
const ThemeManager = {
    btns: document.querySelectorAll('[data-theme]'),
    slider: document.getElementById('themeSlider'),
    init() {
        const saved = localStorage.getItem('vllink-theme-preference') || 'auto';
        this.apply(saved);
        this.btns.forEach(btn => btn.addEventListener('click', () => this.apply(btn.dataset.theme)));
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (localStorage.getItem('vllink-theme-preference') === 'auto') this.apply('auto');
        });
    },
    apply(mode) {
        localStorage.setItem('vllink-theme-preference', mode);
        const isDark = mode === 'auto' ? window.matchMedia('(prefers-color-scheme: dark)').matches : mode === 'dark';
        document.documentElement.classList.toggle('dark', isDark);
        const activeIdx = Array.from(this.btns).findIndex(b => b.dataset.theme === mode);
        this.slider.style.left = `calc(${activeIdx * 33.33}% + 4px)`;
        this.btns.forEach(btn => {
            const isActive = btn.dataset.theme === mode;
            btn.classList.toggle('text-white', isActive);
            btn.classList.toggle('text-slate-500', !isActive);
        });
    }
};

/**
 * 选项页切换 (保持不变)
 */
const TabManager = {
    btns: { config: document.getElementById('tab-btn-config'), tbd: document.getElementById('tab-btn-tbd') },
    contents: { config: document.getElementById('tab-content-config'), tbd: document.getElementById('tab-content-tbd') },
    init() {
        this.btns.config.addEventListener('click', () => this.switch('config'));
        this.btns.tbd.addEventListener('click', () => this.switch('tbd'));
    },
    switch(target) {
        Object.keys(this.btns).forEach(key => {
            const active = key === target;
            this.btns[key].classList.toggle('tab-active', active);
            this.btns[key].classList.toggle('text-slate-400', !active);
            this.contents[key].classList.toggle('hidden', !active);
        });
    }
};

/**
 * 核心业务逻辑
 */
const vllink = new VllinkManager();
let pollTimer = null;
let lastDeviceFingerprint = "";

const UI = {
    connectBtn: document.getElementById('connectBtn'),
    deviceList: document.getElementById('deviceList'),
    status: document.getElementById('connectionStatus')
};

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

    const currentFingerprint = all.map(d => `${d.id}-${d.mac}`).join('|');

    if (currentFingerprint !== lastDeviceFingerprint) {
        // 优化：将 gap-4 减小为 gap-3，移除内部 pt-1 补白
        UI.deviceList.innerHTML = all.map(dev => `
            <div data-id="${dev.id}" class="device-card p-5 rounded-2xl cursor-pointer opacity-80 hover:opacity-100 flex flex-col gap-3">
                
                <!-- 别名层 -->
                <div class="flex justify-between items-center">
                    <span class="text-sm font-black tracking-tight text-slate-800 dark:text-slate-50 truncate uppercase">
                        ${dev.alias}
                    </span>
                    <span class="text-[10px] bg-slate-300/50 dark:bg-white/10 px-2 py-1 rounded font-black text-slate-600 dark:text-slate-400">
                        ${dev.type}
                    </span>
                </div>
                
                <!-- MAC 地址层 -->
                <div class="flex items-center gap-2 font-mono text-xs">
                    <span class="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-tighter">Addr</span>
                    <span class="text-slate-600 dark:text-slate-300">${dev.mac}</span>
                </div>

                <!-- 监控数据层 (移除了 pt-1) -->
                <div class="grid grid-cols-2 gap-2">
                    <div class="flex flex-col gap-0.5">
                        <span class="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-black tracking-tighter">Uptime</span>
                        <span class="uptime-val font-mono text-sm text-slate-700 dark:text-slate-200 font-bold">00:00:00</span>
                    </div>
                    <div class="flex flex-col gap-0.5 items-end">
                        <span class="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-black tracking-tighter">Latency</span>
                        <span class="delay-val font-mono text-sm text-primary font-black">-</span>
                    </div>
                </div>
            </div>
        `).join('');
        lastDeviceFingerprint = currentFingerprint;
    }

    // 局部更新逻辑保持不变
    all.forEach(dev => {
        const card = UI.deviceList.querySelector(`[data-id="${dev.id}"]`);
        if (!card) return;
        card.classList.toggle('card-active', info.select_idx === dev.id);
        let duration = dev.id === 0 ? Number(info.local.us) / 1000000 : Number(info.local.us - dev.us) / 1000000;
        card.querySelector('.uptime-val').innerText = formatTime(duration);
        const delayLabel = card.querySelector('.delay-val');
        delayLabel.innerText = dev.delay_us > 0 ? `${dev.delay_us} us` : "-";
    });
}

function formatTime(s) {
    if (s < 0) s = 0;
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${h}:${m}:${sec}`;
}

ThemeManager.init();
TabManager.init();