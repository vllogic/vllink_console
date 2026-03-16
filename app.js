/**
 * 三模态主题管理器
 */
const ThemeManager = {
    btns: document.querySelectorAll('[data-theme]'),
    slider: document.getElementById('themeSlider'),

    init() {
        const saved = localStorage.getItem('vllink-theme') || 'auto';
        this.apply(saved);
        this.btns.forEach(btn => btn.addEventListener('click', () => this.apply(btn.dataset.theme)));
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (localStorage.getItem('vllink-theme') === 'auto') this.apply('auto');
        });
    },

    apply(mode) {
        localStorage.setItem('vllink-theme', mode);
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
 * 业务逻辑
 */
const vllink = new VllinkManager();
let pollTimer = null;

const UI = {
    connectBtn: document.getElementById('connectBtn'),
    deviceList: document.getElementById('deviceList'),
    localAlias: document.getElementById('localAlias'),
    localDelay: document.getElementById('localDelay'),
    selectedTitle: document.getElementById('selectedTitle'),
    status: document.getElementById('connectionStatus'),
    targetIcon: document.getElementById('targetIcon')
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
                updateUI(info);
            } catch (e) {
                clearInterval(pollTimer);
                UI.status.innerText = "OFFLINE";
            }
        }, 250);
    } catch (e) {
        alert("连接失败: " + e.message);
    }
});

function updateUI(info) {
    // 更新左半部有线状态
    UI.localAlias.innerText = info.local.alias || 'Vllink Basic2';
    UI.localDelay.innerText = info.local.delay_us;

    // 整合所有在线设备
    const all = [{ ...info.local, id: 0, type: 'USB' }];
    info.remote.forEach(r => all.push({ ...r, type: 'WIFI' }));

    UI.deviceList.innerHTML = all.map(dev => {
        const isSelected = info.select_idx === dev.id;
        // 计算时长：(local.us - remote.us) / 1000000
        const duration = Number(info.local.us - dev.us) / 1000000;
        const timeStr = dev.us > 0n ? formatTime(duration) : "00:00:00";

        if (isSelected) {
            UI.selectedTitle.innerText = `${dev.type} : ${dev.alias || 'Debugger'}`;
            UI.targetIcon.innerText = dev.type === 'USB' ? '🔌' : '📡';
        }

        return `
            <div onclick="vllink.selectDebugger(${dev.id})" 
                 class="glass p-4 rounded-2xl cursor-pointer transition-all border border-transparent opacity-60 hover:opacity-100 ${isSelected ? 'card-active' : ''}">
                <div class="flex justify-between items-start mb-2">
                    <span class="text-[10px] font-black tracking-tight">${dev.alias || 'UNKNOWN'}</span>
                    <span class="text-[9px] bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-full font-bold">${dev.type}</span>
                </div>
                <div class="flex justify-between items-end font-mono">
                    <div class="text-[10px] text-slate-500">UPTIME: <span class="text-slate-400">${timeStr}</span></div>
                    <div class="text-[10px] text-primary font-bold">${dev.delay_us}us</div>
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

// 启动
ThemeManager.init();