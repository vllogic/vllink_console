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
let lastDeviceIds = ""; // 用于记录设备 ID 序列，判断是否需要重构 DOM

const UI = {
    connectBtn: document.getElementById('connectBtn'),
    deviceList: document.getElementById('deviceList'),
    status: document.getElementById('connectionStatus')
};

// 修复问题3: 使用事件委托处理点击切换，避免 DOM 重绘导致的点击失效
UI.deviceList.addEventListener('click', (e) => {
    const card = e.target.closest('[data-id]');
    if (card) {
        const id = parseInt(card.dataset.id);
        console.log("Switching to debugger index:", id);
        vllink.selectDebugger(id);
    }
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
                console.error("Poll Error:", e);
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

/**
 * 局部更新逻辑，修复问题2导致的闪烁
 */
function updateDeviceDisplay(info) {
    const all = [{ ...info.local, id: 0, type: 'USB' }];
    info.remote.forEach(r => all.push({ ...r, type: 'WIFI' }));

    // 生成当前设备序列指纹
    const currentIds = all.map(d => d.id).join(',');

    // 如果设备增减了，重新渲染 HTML 结构
    if (currentIds !== lastDeviceIds) {
        UI.deviceList.innerHTML = all.map(dev => `
            <div data-id="${dev.id}" class="glass p-4 rounded-2xl cursor-pointer transition-all border border-transparent opacity-60 hover:opacity-100">
                <div class="flex justify-between items-start mb-2">
                    <span class="text-[10px] font-black tracking-tight text-slate-400 uppercase">${dev.alias}</span>
                    <span class="text-[9px] bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-full font-bold">${dev.type}</span>
                </div>
                <div class="flex justify-between items-end font-mono">
                    <div class="text-[10px] text-slate-500">UPTIME: <span class="uptime-val text-slate-600 dark:text-slate-200">--:--:--</span></div>
                    <div class="text-[10px] text-primary font-black delay-val">--</div>
                </div>
            </div>
        `).join('');
        lastDeviceIds = currentIds;
    }

    // 局部更新每个卡片的数据，不销毁 DOM，从而消除闪烁
    all.forEach(dev => {
        const card = UI.deviceList.querySelector(`[data-id="${dev.id}"]`);
        if (!card) return;

        // 更新高亮状态 (select_idx)
        const isSelected = info.select_idx === dev.id;
        card.classList.toggle('card-active', isSelected);

        // 更新时长
        let duration = dev.id === 0 ? Number(info.local.us) / 1000000 : Number(info.local.us - dev.us) / 1000000;
        card.querySelector('.uptime-val').innerText = formatTime(duration);

        // 修复问题1: 延迟为 0 时显示 "-"
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

// 初始化
ThemeManager.init();
TabManager.init();