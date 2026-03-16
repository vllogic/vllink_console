/**
 * 三模态主题管理器 (Dark | AUTO | Light)
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
 * 选项页切换管理器
 */
const TabManager = {
    btns: {
        config: document.getElementById('tab-btn-config'),
        tbd: document.getElementById('tab-btn-tbd')
    },
    contents: {
        config: document.getElementById('tab-content-config'),
        tbd: document.getElementById('tab-content-tbd')
    },

    init() {
        this.btns.config.addEventListener('click', () => this.switch('config'));
        this.btns.tbd.addEventListener('click', () => this.switch('tbd'));
    },

    switch(target) {
        Object.keys(this.btns).forEach(key => {
            if (key === target) {
                this.btns[key].classList.add('tab-active');
                this.btns[key].classList.remove('text-slate-400');
                this.contents[key].classList.remove('hidden');
            } else {
                this.btns[key].classList.remove('tab-active');
                this.btns[key].classList.add('text-slate-400');
                this.contents[key].classList.add('hidden');
            }
        });
    }
};

/**
 * 核心业务逻辑
 */
const vllink = new VllinkManager();
let pollTimer = null;

const UI = {
    connectBtn: document.getElementById('connectBtn'),
    deviceList: document.getElementById('deviceList'),
    status: document.getElementById('connectionStatus')
};

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
                updateDeviceList(info);
            } catch (e) {
                clearInterval(pollTimer);
                UI.status.innerText = "OFFLINE";
                UI.connectBtn.innerText = "RECONNECT";
                UI.connectBtn.classList.replace('bg-green-600', 'bg-primary');
            }
        }, 250);
    } catch (e) {
        console.error(e);
        alert("Connection Failed: " + e.message);
    }
});

function updateDeviceList(info) {
    // 整合所有节点
    const all = [{ ...info.local, id: 0, type: 'USB' }];
    info.remote.forEach(r => all.push({ ...r, type: 'WIFI' }));

    UI.deviceList.innerHTML = all.map(dev => {
        const isSelected = info.select_idx === dev.id;
        
        // UPTIME 逻辑: Local 节点显示 raw us, Remote 节点显示 diff (local.us - remote.us)
        let duration = dev.id === 0 ? Number(info.local.us) / 1000000 : Number(info.local.us - dev.us) / 1000000;
        const timeStr = formatTime(duration);

        return `
            <div onclick="vllink.selectDebugger(${dev.id})" 
                 class="glass p-4 rounded-2xl cursor-pointer transition-all border border-transparent opacity-60 hover:opacity-100 ${isSelected ? 'card-active' : ''}">
                <div class="flex justify-between items-start mb-2">
                    <span class="text-[10px] font-black tracking-tight text-slate-400 uppercase">${dev.alias}</span>
                    <span class="text-[9px] bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-full font-bold">${dev.type}</span>
                </div>
                <div class="flex justify-between items-end font-mono">
                    <div class="text-[10px] text-slate-500">UPTIME: <span class="text-slate-600 dark:text-slate-200">${timeStr}</span></div>
                    <div class="text-[10px] text-primary font-black">${dev.delay_us}us</div>
                </div>
            </div>
        `;
    }).join('');
}

function formatTime(s) {
    if (s < 0) s = 0;
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${h}:${m}:${sec}`;
}

// 初始化管理器
ThemeManager.init();
TabManager.init();