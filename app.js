/**
 * 三模态主题管理器 (Dark / Auto / Light)
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
        if (this.slider) this.slider.style.left = `calc(${activeIdx * 33.33}% + 4px)`;
        this.btns.forEach(btn => {
            const isActive = btn.dataset.theme === mode;
            btn.classList.toggle('text-white', isActive);
            btn.classList.toggle('text-slate-500', !isActive);
        });
    }
};

/**
 * 选项页切换管理
 */
const TabManager = {
    btns: { config: document.getElementById('tab-btn-config'), tbd: document.getElementById('tab-btn-tbd') },
    contents: { config: document.getElementById('tab-content-config'), tbd: document.getElementById('tab-content-tbd') },
    init() {
        if (this.btns.config) this.btns.config.addEventListener('click', () => this.switch('config'));
        if (this.btns.tbd) this.btns.tbd.addEventListener('click', () => this.switch('tbd'));
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
 * 配置编辑器：负责行维护、全量写入校验与颜色渲染
 */
const ConfigEditor = {
    container: document.getElementById('tab-content-config'),
    lines: [], // 结构: { original, current, el, isDirty }
    isBusy: false,
    lastSelectedIdx: -1,

    init() {
        this.container.addEventListener('mouseleave', () => this.sync());
    },

    async load(manager) {
        if (this.isBusy) return;
        this.isBusy = true;
        this.lockUI(true);
        manager.isBusy = true; 

        try {
            this.container.innerHTML = `<div class="p-20 text-center animate-pulse text-slate-500 italic">Reading configuration...</div>`;
            const info = await manager.getConfigInfo();
            const text = await manager.readConfig(info.size);
            this.render(text);
        } catch (e) {
            this.container.innerHTML = `<div class="p-20 text-red-500 text-center font-bold">Load Failed: ${e.message}</div>`;
        } finally {
            this.isBusy = false;
            manager.isBusy = false;
            this.lockUI(false);
        }
    },

    render(text) {
        // 核心变更：移除回车符，分割行，并过滤掉敏感的 Config_Password 行
        const rows = text.replace(/\r/g, '')
                         .split('\n')
                         .filter(line => !line.trim().startsWith('Config_Password='));

        this.container.innerHTML = `
            <div class="flex flex-col font-mono text-sm bg-white dark:bg-slate-900/40 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl">
                ${rows.map((line, i) => `
                    <div class="editor-line flex items-center border-b border-slate-100 dark:border-slate-800/50 transition-colors">
                        <span class="w-12 text-right pr-4 text-slate-400 select-none bg-slate-50 dark:bg-slate-800/30 py-2.5 border-r border-slate-100 dark:border-slate-800/50">${i+1}</span>
                        <input type="text" class="flex-1 bg-transparent px-4 py-2.5 outline-none text-slate-700 dark:text-slate-200" 
                               value="${line.replace(/"/g, '&quot;')}" data-idx="${i}">
                    </div>
                `).join('')}
            </div>`;

        const inputs = this.container.querySelectorAll('input');
        this.lines = Array.from(inputs).map((el, i) => {
            const rowData = { original: rows[i], current: rows[i], el: el, isDirty: false };
            el.addEventListener('input', (e) => {
                rowData.current = e.target.value;
                rowData.isDirty = rowData.current !== rowData.original;
                this.updateStyle(rowData);
            });
            el.addEventListener('blur', () => this.sync());
            return rowData;
        });
    },

    updateStyle(line, status = 'none') {
        const row = line.el.closest('.editor-line');
        row.classList.remove('bg-amber-500/10', 'bg-emerald-500/20', 'bg-rose-500/20');
        if (status === 'success') row.classList.add('bg-emerald-500/20');
        else if (status === 'fail') row.classList.add('bg-rose-500/20');
        else if (line.isDirty) row.classList.add('bg-amber-500/10');
    },

    /**
     * 同步逻辑：全量写入 -> 硬件重析 -> 回读校验
     */
    async sync() {
        if (this.lines.every(l => !l.isDirty) || this.isBusy) return;
        this.isBusy = true;
        this.lockUI(true);
        vllink.isBusy = true;

        try {
            const info = await vllink.getConfigInfo();
            // 注意：由于 render 时过滤了 Password 行，fullText 中也不会包含该行
            const fullText = this.lines.map(l => l.current).join('\n');
            
            // 写入全量数据（vllink.js 会负责填充补齐 totalSize）
            await vllink.writeConfig(fullText, info.size);

            // 回读并清洗，同样需要过滤 Password 行以保持比对一致
            const verifyText = await vllink.readConfig(info.size);
            const verifyRows = verifyText.replace(/\r/g, '')
                                         .split('\n')
                                         .filter(line => !line.trim().startsWith('Config_Password='));

            this.lines.forEach((line, i) => {
                const newValue = (verifyRows[i] || "");
                if (line.isDirty) {
                    const ok = line.current.trim() === newValue.trim();
                    this.updateStyle(line, ok ? 'success' : 'fail');
                }
                
                line.original = newValue;
                line.current = newValue;
                line.el.value = newValue;
                line.isDirty = false;
            });
        } catch (e) {
            console.error("Sync error:", e);
        } finally {
            this.isBusy = false;
            vllink.isBusy = false;
            this.lockUI(false);
        }
    },

    lockUI(locked) {
        document.body.classList.toggle('pointer-events-none', locked);
        this.container.classList.toggle('opacity-50', locked);
    }
};

/**
 * 核心逻辑集成
 */
const vllink = new VllinkManager();
let pollTimer = null;
let lastFingerprint = "";

const UI = {
    connectBtn: document.getElementById('connectBtn'),
    deviceList: document.getElementById('deviceList'),
    status: document.getElementById('connectionStatus')
};

UI.deviceList.addEventListener('click', async (e) => {
    const restartBtn = e.target.closest('.restart-btn');
    if (restartBtn) {
        e.stopPropagation();
        const card = restartBtn.closest('[data-id]');
        if (confirm(`Restart Node ${card.dataset.id}?`)) {
            try {
                await vllink.resetDevice();
                UI.status.innerText = "REBOOTING...";
                setTimeout(() => location.reload(), 1200);
            } catch (err) { alert("Reset Error: " + err.message); }
        }
        return;
    }
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
                if (!info) return;

                updateDisplay(info);

                if (info.select_idx !== ConfigEditor.lastSelectedIdx) {
                    ConfigEditor.lastSelectedIdx = info.select_idx;
                    ConfigEditor.load(vllink);
                }
            } catch (e) {
                clearInterval(pollTimer);
                UI.status.innerText = "OFFLINE";
                UI.connectBtn.innerText = "RECONNECT";
                UI.connectBtn.classList.replace('bg-green-600', 'bg-primary');
            }
        }, 250);
    } catch (e) { alert("Connect error: " + e.message); }
});

function updateDisplay(info) {
    const all = [{ ...info.local, id: 0, type: 'USB' }];
    info.remote.forEach(r => all.push({ ...r, type: 'WIFI' }));

    const fingerprint = all.map(d => `${d.id}-${d.mac}`).join('|');
    if (fingerprint !== lastFingerprint) {
        UI.deviceList.innerHTML = all.map(dev => `
            <div data-id="${dev.id}" class="device-card p-5 rounded-2xl cursor-pointer opacity-80 hover:opacity-100 flex flex-col gap-3 relative group">
                <div class="flex justify-between items-center">
                    <span class="text-sm font-black text-slate-800 dark:text-slate-50 truncate uppercase pr-6">${dev.alias}</span>
                    <div class="flex items-center gap-2">
                        <button class="restart-btn opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded text-red-500 transition-all" title="Restart">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                        </button>
                        <span class="text-[10px] bg-slate-300/50 dark:bg-white/10 px-2 py-1 rounded font-black">${dev.type}</span>
                    </div>
                </div>
                <div class="flex items-center gap-2 font-mono text-xs text-slate-500">
                    <span class="uppercase tracking-tighter">Addr</span><span class="text-slate-600 dark:text-slate-300">${dev.mac}</span>
                </div>
                <div class="grid grid-cols-2 gap-2 mt-1">
                    <div class="flex flex-col">
                        <span class="text-[9px] text-slate-400 uppercase font-black">Uptime</span>
                        <span class="uptime-val font-mono text-sm font-bold text-slate-700 dark:text-slate-200">00:00:00</span>
                    </div>
                    <div class="flex flex-col items-end">
                        <span class="text-[9px] text-slate-400 uppercase font-black">Latency</span>
                        <span class="delay-val font-mono text-sm text-primary font-black">-</span>
                    </div>
                </div>
            </div>`).join('');
        lastFingerprint = fingerprint;
    }

    all.forEach(dev => {
        const card = UI.deviceList.querySelector(`[data-id="${dev.id}"]`);
        if (!card) return;
        card.classList.toggle('card-active', info.select_idx === dev.id);
        const s = dev.id === 0 ? Number(info.local.us)/1e6 : Number(info.local.us - dev.us)/1e6;
        card.querySelector('.uptime-val').innerText = formatTime(s);
        card.querySelector('.delay-val').innerText = dev.delay_us > 0 ? `${dev.delay_us} us` : "-";
    });
}

function formatTime(s) {
    const t = Math.max(0, s);
    const h = Math.floor(t / 3600).toString().padStart(2, '0');
    const m = Math.floor((t % 3600) / 60).toString().padStart(2, '0');
    const sec = Math.floor(t % 60).toString().padStart(2, '0');
    return `${h}:${m}:${sec}`;
}

// 全局初始化
ThemeManager.init();
TabManager.init();
ConfigEditor.init();