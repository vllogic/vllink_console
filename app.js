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
 * 配置编辑器：支持全选、行维护、快捷键同步与状态显示
 */
const ConfigEditor = {
    container: document.getElementById('tab-content-config'),
    editor: null,
    originalLines: [], 
    isBusy: false,
    lastSelectedIdx: -1,

    init() {
        this.container.addEventListener('mouseleave', () => this.sync());
    },

    /**
     * 更新状态条 UI
     */
    updateStatus(type) {
        const dot = document.getElementById('editor-status-dot');
        const text = document.getElementById('editor-status-text');
        if (!dot || !text) return;

        const states = {
            synced: { color: 'bg-emerald-500', label: '已同步' },
            modified: { color: 'bg-amber-500', label: '未同步 (CTRL + Enter 保存)' },
            syncing: { color: 'bg-primary animate-pulse', label: '同步中...' },
            error: { color: 'bg-rose-500', label: '同步失败' }
        };

        const s = states[type];
        dot.className = `w-2 h-2 rounded-full transition-colors ${s.color}`;
        text.innerText = s.label;
    },

    async load(manager) {
        if (this.isBusy) return;
        this.isBusy = true;
        this.lockUI(true);
        manager.isBusy = true; // 独占通讯

        try {
            this.container.innerHTML = `<div class="p-20 text-center animate-pulse text-slate-500 italic">正在读取硬件配置...</div>`;
            const info = await manager.getConfigInfo();
            const text = await manager.readConfig(info.size);
            this.render(text);
            this.updateStatus('synced');
        } catch (e) {
            this.container.innerHTML = `<div class="p-20 text-red-500 text-center font-bold">读取失败: ${e.message}</div>`;
        } finally {
            this.isBusy = false;
            manager.isBusy = false;
            this.lockUI(false);
        }
    },

    render(text) {
        const rows = text.replace(/\r/g, '')
                         .split('\n')
                         .filter(line => !line.trim().startsWith('Config_Password='));
        
        this.originalLines = [...rows];

        this.container.innerHTML = `
            <style>
                #vllink-editor { counter-reset: line; outline: none; }
                .line-row { display: flex; transition: background 0.3s; }
                .line-row::before { 
                    counter-increment: line; 
                    content: counter(line); 
                    width: 3rem; text-align: right; padding-right: 1rem;
                    color: #94a3b8; user-select: none; flex-shrink: 0;
                    border-right: 1px solid rgba(148, 163, 184, 0.2);
                    margin-right: 1rem; background: rgba(248, 250, 252, 0.05);
                }
                .line-content { flex: 1; white-space: pre-wrap; word-break: break-all; min-height: 1.5rem; outline: none; }
            </style>
            
            <div class="flex items-center justify-between mb-3 px-1">
                <div class="flex items-center gap-3">
                    <div id="editor-status-dot" class="w-2 h-2 rounded-full"></div>
                    <span id="editor-status-text" class="text-[10px] font-black uppercase tracking-widest text-slate-400"></span>
                </div>
                <div class="text-[9px] text-slate-400 bg-slate-200/50 dark:bg-white/5 px-2 py-0.5 rounded border border-slate-300/30">
                    <span class="font-bold">CTRL + ENTER</span> 立即同步
                </div>
            </div>

            <div id="vllink-editor" contenteditable="true" spellcheck="false" 
                 class="flex flex-col font-mono text-sm bg-white dark:bg-slate-900/40 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl py-2">
                ${rows.map((line, i) => `
                    <div class="line-row" data-line="${i}">
                        <div class="line-content">${line}</div>
                    </div>
                `).join('')}
            </div>`;

        this.editor = document.getElementById('vllink-editor');

        this.editor.addEventListener('input', (e) => {
            this.updateStatus('modified');
            const lineRow = e.target.closest('.line-row');
            if (lineRow) {
                const idx = parseInt(lineRow.dataset.line);
                const currentText = lineRow.querySelector('.line-content').innerText;
                const isChanged = currentText !== this.originalLines[idx];
                this.updateRowStyle(lineRow, isChanged ? 'dirty' : 'none');
            }
        });

        this.editor.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.sync();
            }
        });

        this.editor.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.originalEvent || e).clipboardData.getData('text/plain');
            document.execCommand("insertText", false, text);
        });
    },

    updateRowStyle(el, status) {
        el.classList.remove('bg-amber-500/10', 'bg-emerald-500/20', 'bg-rose-500/20');
        if (status === 'dirty') el.classList.add('bg-amber-500/10');
        else if (status === 'success') el.classList.add('bg-emerald-500/20');
        else if (status === 'fail') el.classList.add('bg-rose-500/20');
    },

    async sync() {
        if (!this.editor || this.isBusy) return;
        
        const rows = Array.from(this.editor.querySelectorAll('.line-row'));
        const currentData = rows.map(r => r.querySelector('.line-content').innerText);
        
        const hasChange = currentData.some((text, i) => text !== this.originalLines[i]);
        if (!hasChange) {
            this.updateStatus('synced');
            return;
        }

        this.updateStatus('syncing');
        this.isBusy = true;
        this.lockUI(true);
        vllink.isBusy = true;

        try {
            const info = await vllink.getConfigInfo();
            const fullText = currentData.join('\n');
            await vllink.writeConfig(fullText, info.size);

            const verifyText = await vllink.readConfig(info.size);
            const verifyRows = verifyText.replace(/\r/g, '').split('\n')
                                         .filter(line => !line.trim().startsWith('Config_Password='));

            rows.forEach((row, i) => {
                const newValue = (verifyRows[i] || "").trim();
                const userTyped = currentData[i].trim();
                if (userTyped !== this.originalLines[i]) {
                    const ok = userTyped === newValue;
                    this.updateRowStyle(row, ok ? 'success' : 'fail');
                }
                this.originalLines[i] = verifyRows[i] || "";
            });
            this.updateStatus('synced');
        } catch (e) {
            this.updateStatus('error');
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
                console.error("Poll cycle error:", e);
                // 只有在确定断开时才重置 UI
                if (e.message.includes('disconnected') || e.message.includes('lost')) {
                    clearInterval(pollTimer);
                    UI.status.innerText = "OFFLINE";
                    UI.connectBtn.innerText = "RECONNECT";
                    UI.connectBtn.classList.replace('bg-green-600', 'bg-primary');
                }
            }
        }, 250);
    } catch (e) { alert("Connect error: " + e.message); }
});

UI.deviceList.addEventListener('click', async (e) => {
    const restartBtn = e.target.closest('.restart-btn');
    if (restartBtn) {
        e.stopPropagation();
        const card = restartBtn.closest('[data-id]');
        if (confirm(`确定重启节点 ${card.dataset.id}?`)) {
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

/**
 * 修正后的 formatTime 函数，解决了 ts 未定义的问题
 */
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