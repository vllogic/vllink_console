/**
 * 1. 主题管理模块
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
        
        if (isDark) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');

        // 更新滑块位置
        const activeIdx = Array.from(this.btns).findIndex(b => b.dataset.theme === mode);
        this.slider.style.left = `calc(${activeIdx * 33.33}% + 4px)`;
        
        this.btns.forEach(btn => {
            btn.classList.toggle('text-white', btn.dataset.theme === mode);
            btn.classList.toggle('text-slate-500', btn.dataset.theme !== mode);
        });
    }
};

/**
 * 2. 核心业务逻辑
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

// 连接逻辑
UI.connectBtn.addEventListener('click', async () => {
    try {
        await vllink.connect();
        UI.status.innerText = "Connected: " + vllink.device.productName;
        UI.connectBtn.innerText = "CONNECTED";
        UI.connectBtn.classList.replace('bg-primary', 'bg-green-600');
        startPolling();
    } catch (e) {
        console.error(e);
        UI.status.innerText = "Error: " + e.message;
    }
});

// 轮询与更新
function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
        try {
            const info = await vllink.queryInfo();
            updateDashboard(info);
        } catch (e) {
            clearInterval(pollTimer);
            UI.status.innerText = "DISCONNECTED";
        }
    }, 250);
}

function updateDashboard(info) {
    // 1. 更新本地面板
    UI.localAlias.innerText = info.local.alias || 'Vllink Basic2';
    UI.localDelay.innerText = info.local.delay_us;

    // 2. 组合所有设备并渲染列表
    const all = [{ ...info.local, id: 0, type: 'USB' }, ...info.remote.map(r => ({ ...r, type: 'WIFI' }))];
    
    UI.deviceList.innerHTML = all.map(dev => {
        const isSelected = info.select_idx === dev.id;
        const duration = Number(info.local.us - dev.us) / 1000000;
        const timeStr = formatTime(duration);

        if (isSelected) {
            UI.selectedTitle.innerText = `${dev.type} : ${dev.alias || 'Debugger'}`;
            UI.targetIcon.innerText = dev.type === 'USB' ? '🔌' : '📡';
        }

        return `
            <div onclick="vllink.selectDebugger(${dev.id})" 
                 class="glass p-4 rounded-2xl cursor-pointer transition-all border border-transparent opacity-60 hover:opacity-100 ${isSelected ? 'card-active' : ''}">
                <div class="flex justify-between items-start mb-2">
                    <span class="text-xs font-black tracking-tight">${dev.alias || 'DEBUGGER'}</span>
                    <span class="text-[9px] bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-full font-bold">${dev.type}</span>
                </div>
                <div class="flex justify-between items-end">
                    <div class="text-[10px] text-slate-500 font-mono">
                        UPTIME: <span class="text-slate-400 dark:text-slate-300">${timeStr}</span>
                    </div>
                    <div class="text-[10px] text-primary font-bold font-mono">${dev.delay_us}us</div>
                </div>
            </div>
        `;
    }).join('');
}

function formatTime(s) {
    if (s < 0) return "00:00:00";
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${h}:${m}:${sec}`;
}

// 初始化
ThemeManager.init();

// 自动重连探测
navigator.usb.getDevices().then(devices => {
    if (devices.length > 0) UI.status.innerText = "Authorized device found. Please select.";
});