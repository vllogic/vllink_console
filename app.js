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
    btns: { config: document.getElementById('tab-btn-config'), data: document.getElementById('tab-btn-tbd') },
    contents: { config: document.getElementById('tab-content-config'), data: document.getElementById('tab-content-tbd') },
    init() {
        this.btns.config.onclick = () => this.switch('config');
        this.btns.data.onclick = () => { this.switch('data'); DataManager.load(); };
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
 * 数据区块管理模块 - 持续保留 UI 版
 */
const DataManager = {
    container: document.getElementById('tab-content-tbd'),
    activeBuffers: {}, // 内存中持有的原始数据

    async load() {
        this.container.innerHTML = `<div class="p-20 text-center animate-pulse text-slate-500 italic text-sm font-mono">Loading data segments...</div>`;
        vllink.isBusy = true;
        try {
            const info = await vllink.getConfigInfo();
            this.render(info);
        } catch (e) {
            this.container.innerHTML = `<div class="p-20 text-red-500 text-center font-mono">Failed: ${e.message}</div>`;
        } finally {
            vllink.isBusy = false;
        }
    },

    render(info) {
        let html = `<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">`;
        let blocksFound = 0;

        for (let i = 0; i < info.fileLimit; i++) {
            const kb = info.fileLengths[i];
            if (kb > 0) {
                blocksFound++;
                const hasData = !!this.activeBuffers[i];
                html += `
                <div class="glass border border-slate-200 dark:border-slate-800 rounded-3xl p-6 flex flex-col gap-5 shadow-xl transition-all relative overflow-hidden">
                    <!-- 标题行 -->
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-500 font-black text-xs border border-slate-200/50 dark:border-white/10">${i}</div>
                            <h3 class="font-black text-slate-700 dark:text-slate-200 uppercase tracking-tighter">Data Block ${i}</h3>
                        </div>
                        <span class="text-[10px] font-mono bg-slate-100 dark:bg-white/5 px-2 py-1 rounded text-slate-500">MAX: ${kb} KB</span>
                    </div>

                    <!-- 进度 UI (持续显示) -->
                    <div id="data-ui-${i}" class="space-y-3 bg-slate-50 dark:bg-black/20 p-4 rounded-2xl border border-slate-100 dark:border-white/5">
                        <div class="flex justify-between items-center">
                            <span id="data-status-text-${i}" class="text-[10px] font-black uppercase tracking-widest text-slate-400">准备就绪</span>
                            <span id="data-percent-${i}" class="text-[10px] font-mono text-slate-400">0%</span>
                        </div>
                        <div class="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div id="data-bar-${i}" class="h-full bg-primary transition-all duration-300 w-0" style="box-shadow: 0 0 10px rgba(0, 212, 255, 0.3)"></div>
                        </div>
                        <div class="flex justify-end">
                            <span id="data-speed-box-${i}" class="text-[9px] text-slate-400 font-mono opacity-60 italic">Speed: 0.0 KB/s</span>
                        </div>
                    </div>

                    <!-- 动作按钮 (持续显示) -->
                    <div class="flex gap-3">
                        <button onclick="DataManager.pickFile(${i}, ${kb})" id="btn-load-${i}" 
                            class="flex-1 py-3 bg-primary text-white rounded-xl font-black text-xs hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-primary/20">
                            载入并写入
                        </button>
                        <button onclick="DataManager.verify(${i})" id="btn-verify-${i}" 
                            ${hasData ? '' : 'disabled'}
                            class="flex-1 py-3 border-2 border-primary/30 text-primary rounded-xl font-black text-xs hover:bg-primary/5 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale disabled:pointer-events-none">
                            回读校验
                        </button>
                    </div>
                    <input type="file" id="input-file-${i}" class="hidden" onchange="DataManager.handlePick(${i}, ${kb})">
                </div>`;
            }
        }
        this.container.innerHTML = blocksFound > 0 ? html + `</div>` : `<div class="p-20 text-center italic text-slate-500">设备未定义数据区块</div>`;
    },

    pickFile(idx) { document.getElementById(`input-file-${idx}`).click(); },

    async handlePick(idx, maxKb) {
        const input = document.getElementById(`input-file-${idx}`);
        if (!input.files.length) return;
        const file = input.files[0];
        if (file.size > maxKb * 1024) {
            this.showFeedback(idx, `文件超限 (MAX ${maxKb}KB)`, 'fail');
            input.value = ''; return;
        }
        const rawBuffer = await file.arrayBuffer();
        const alignedLen = Math.ceil(rawBuffer.byteLength / 256) * 256;
        const paddedData = new Uint8Array(alignedLen).fill(0xff);
        paddedData.set(new Uint8Array(rawBuffer));
        
        this.activeBuffers[idx] = paddedData;
        await this.executeTransfer(idx, 'WRITE', paddedData);
    },

    showFeedback(idx, message, type) {
        const statusText = document.getElementById(`data-status-text-${idx}`);
        const bar = document.getElementById(`data-bar-${idx}`);
        const speedBox = document.getElementById(`data-speed-box-${idx}`);
        
        statusText.innerText = message.toUpperCase();
        statusText.classList.remove('text-primary', 'text-emerald-500', 'text-rose-500', 'animate-pulse');
        bar.classList.remove('bg-primary', 'bg-emerald-500', 'bg-rose-500');

        if (type === 'success') {
            statusText.classList.add('text-emerald-500');
            bar.classList.add('bg-emerald-500');
            speedBox.classList.add('opacity-0');
        } else if (type === 'fail') {
            statusText.classList.add('text-rose-500');
            bar.classList.add('bg-rose-500');
            speedBox.classList.remove('opacity-0');
        } else {
            statusText.classList.add('text-primary', 'animate-pulse');
            bar.classList.add('bg-primary');
            speedBox.classList.remove('opacity-0');
            speedBox.style.opacity = "1";
        }
    },

    async executeTransfer(idx, mode, data) {
        const isWrite = mode === 'WRITE';
        const bar = document.getElementById(`data-bar-${idx}`);
        const percentTxt = document.getElementById(`data-percent-${idx}`);
        const speedTxt = document.getElementById(`data-speed-box-${idx}`);
        const btnLoad = document.getElementById(`btn-load-${idx}`);
        const btnVerify = document.getElementById(`btn-verify-${idx}`);

        this.showFeedback(idx, isWrite ? '写入中...' : '校验中...', 'work');
        vllink.isBusy = true;
        
        // 锁定所有交互
        btnLoad.disabled = true;
        btnVerify.disabled = true;
        
        const startTime = Date.now();

        try {
            for (let pos = 0; pos < data.length; pos += 256) {
                const chunk = data.slice(pos, pos + 256);
                if (isWrite) {
                    await vllink.writeFileChunk(idx, data.length, pos, chunk);
                } else {
                    const hardwareChunk = await vllink.readFileChunk(idx, data.length, pos);
                    if (chunk.some((val, j) => val !== hardwareChunk[j])) {
                        throw new Error(`数据不一致 @ 0x${pos.toString(16)}`);
                    }
                }

                const totalDone = pos + 256;
                const elapsed = (Date.now() - startTime) / 1000;
                const speed = (totalDone / 1024 / (elapsed || 0.001)).toFixed(1);
                const percent = Math.round((totalDone / data.length) * 100);

                bar.style.width = `${percent}%`;
                percentTxt.innerText = `${percent}%`;
                speedTxt.innerText = `Speed: ${speed} KB/s`;
            }

            this.showFeedback(idx, isWrite ? '写入成功 ✓' : '校验通过 ✓', 'success');

        } catch (e) {
            this.showFeedback(idx, e.message, 'fail');
        } finally {
            vllink.isBusy = false;
            // 解锁逻辑
            btnLoad.disabled = false;
            // 只有内存里有数据时才解锁校验按钮
            if (this.activeBuffers[idx]) {
                btnVerify.disabled = false;
            }
        }
    },

    async verify(idx) {
        if (!this.activeBuffers[idx]) return;
        await this.executeTransfer(idx, 'VERIFY', this.activeBuffers[idx]);
    }
};

/**
 * 配置编辑器模块 (保持不变)
 */
const ConfigEditor = {
    container: document.getElementById('tab-content-config'),
    editor: null, gutter: null, highlightLayer: null,
    originalLines: [], syncResults: [], isBusy: false, lastSelectedIdx: -1,
    init() { this.container.addEventListener('mouseleave', () => this.sync()); },
    updateStatus(type) {
        const dot = document.getElementById('editor-status-dot');
        const text = document.getElementById('editor-status-text');
        if (!dot || !text) return;
        const states = {
            synced: { color: 'bg-emerald-500', label: '已同步' },
            modified: { color: 'bg-amber-500', label: '待同步 (CTRL + Enter)' },
            syncing: { color: 'bg-primary animate-pulse', label: '通讯中...' },
            error: { color: 'bg-rose-500', label: '错误' }
        };
        const s = states[type];
        dot.className = `w-2 h-2 rounded-full transition-colors ${s.color}`;
        text.innerText = s.label;
    },
    async load(manager) {
        if (this.isBusy) return;
        this.isBusy = true; this.lockUI(true); manager.isBusy = true;
        try {
            this.container.innerHTML = `<div class="p-20 text-center animate-pulse text-slate-500 italic text-sm font-mono">Loading config...</div>`;
            const info = await manager.getConfigInfo();
            const text = await manager.readConfig(info.size);
            this.render(text);
            this.updateStatus('synced');
        } catch (e) {
            this.container.innerHTML = `<div class="p-20 text-red-500 text-center">Load Failed: ${e.message}</div>`;
        } finally { this.isBusy = false; manager.isBusy = false; this.lockUI(false); }
    },
    render(text) {
        const rows = text.replace(/\r/g, '').split('\n').filter(line => !line.trim().startsWith('Config_Password='));
        this.originalLines = [...rows];
        this.syncResults = new Array(rows.length).fill('none');
        this.container.innerHTML = `
            <div class="flex items-center justify-between mb-3 px-1">
                <div class="flex items-center gap-3">
                    <div id="editor-status-dot" class="w-2 h-2 rounded-full"></div>
                    <span id="editor-status-text" class="text-[10px] font-black uppercase tracking-widest text-slate-400"></span>
                </div>
                <div class="text-[9px] text-slate-400 font-mono opacity-60 italic">CTRL + ENTER TO SYNC</div>
            </div>
            <div class="relative flex font-mono text-sm bg-white dark:bg-slate-900/40 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl min-h-[300px]">
                <div id="vllink-highlights" class="absolute left-12 right-0 top-4 bottom-4 pointer-events-none leading-6"></div>
                <div id="vllink-gutter" class="w-12 py-4 bg-slate-50 dark:bg-slate-800/30 text-right pr-3 text-slate-400 select-none border-r border-slate-200 dark:border-slate-800/50 leading-6 z-10"></div>
                <div id="vllink-editor" contenteditable="true" spellcheck="false" class="flex-1 py-4 px-4 outline-none text-slate-700 dark:text-slate-200 leading-6 overflow-x-auto whitespace-pre z-20 bg-transparent"></div>
            </div>`;
        this.editor = document.getElementById('vllink-editor');
        this.gutter = document.getElementById('vllink-gutter');
        this.highlightLayer = document.getElementById('vllink-highlights');
        this.editor.innerText = rows.join('\n');
        this.refreshUI();
        this.editor.onscroll = () => {
            this.gutter.scrollTop = this.editor.scrollTop;
            this.highlightLayer.style.transform = `translateY(-${this.editor.scrollTop}px)`;
        };
        this.editor.oninput = () => { this.syncResults = []; this.refreshUI(); this.updateStatus('modified'); };
        this.editor.onkeydown = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); this.sync(); } };
        this.editor.onpaste = (e) => { e.preventDefault(); document.execCommand("insertText", false, (e.originalEvent || e).clipboardData.getData('text/plain')); };
    },
    refreshUI() {
        const lines = this.editor.innerText.split('\n');
        let gutterHTML = '', highlightHTML = '';
        lines.forEach((text, i) => {
            gutterHTML += `<div>${i + 1}</div>`;
            let bgColor = 'transparent';
            const result = this.syncResults[i] || 'none';
            if (result === 'success') bgColor = 'rgba(16, 185, 129, 0.2)';
            else if (result === 'fail') bgColor = 'rgba(244, 63, 94, 0.2)';
            else if (text !== this.originalLines[i]) bgColor = 'rgba(245, 158, 11, 0.1)';
            highlightHTML += `<div style="height: 1.5rem; background: ${bgColor}; width: 100%;"></div>`;
        });
        this.gutter.innerHTML = gutterHTML;
        this.highlightLayer.innerHTML = highlightHTML;
    },
    async sync() {
        if (!this.editor || this.isBusy) return;
        const userInputText = this.editor.innerText;
        const userInputLines = userInputText.split('\n');
        if (userInputText === this.originalLines.join('\n')) return this.updateStatus('synced');
        this.updateStatus('syncing'); this.isBusy = true; this.lockUI(true); vllink.isBusy = true;
        try {
            const info = await vllink.getConfigInfo();
            await vllink.writeConfig(userInputText, info.size);
            const verifyText = await vllink.readConfig(info.size);
            const verifyRows = verifyText.replace(/\r/g, '').split('\n').filter(line => !line.trim().startsWith('Config_Password='));
            this.syncResults = verifyRows.map((real, i) => {
                const typed = (userInputLines[i] || "").trim();
                return typed !== (this.originalLines[i] || "").trim() ? (typed === real.trim() ? 'success' : 'fail') : 'none';
            });
            this.originalLines = [...verifyRows];
            this.editor.innerText = verifyRows.join('\n');
            this.refreshUI(); this.updateStatus('synced');
            setTimeout(() => { this.syncResults = []; this.refreshUI(); }, 3000);
        } catch (e) { this.updateStatus('error'); } finally { this.isBusy = false; vllink.isBusy = false; this.lockUI(false); }
    },
    lockUI(l) { document.body.classList.toggle('pointer-events-none', l); this.container.classList.toggle('opacity-50', l); }
};

/**
 * 状态机集成
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
                    if (!TabManager.contents.data.classList.contains('hidden')) DataManager.load();
                }
            } catch (e) {
                if (e.message.includes('disconnected') || e.message.includes('lost')) {
                    clearInterval(pollTimer);
                    UI.status.innerText = "OFFLINE";
                    UI.connectBtn.innerText = "RECONNECT";
                }
            }
        }, 250);
    } catch (e) { console.error(e); }
});

UI.deviceList.addEventListener('click', async (e) => {
    const restartBtn = e.target.closest('.restart-btn');
    if (restartBtn) {
        e.stopPropagation();
        const card = restartBtn.closest('[data-id]');
        if (confirm(`Restart Node ${card.dataset.id}?`)) {
            try { await vllink.resetDevice(); location.reload(); } catch (err) { }
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
                        <button class="restart-btn opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded text-red-500 transition-all">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                        </button>
                        <span class="text-[10px] bg-slate-300/50 dark:bg-white/10 px-2 py-1 rounded font-black">${dev.type}</span>
                    </div>
                </div>
                <div class="flex items-center gap-2 font-mono text-xs text-slate-500">
                    <span class="uppercase tracking-tighter">Addr</span><span class="text-slate-600 dark:text-slate-300">${dev.mac}</span>
                </div>
                <div class="grid grid-cols-2 gap-2 mt-1">
                    <div class="flex flex-col"><span class="text-[9px] text-slate-400 uppercase font-black">Uptime</span><span class="uptime-val font-mono text-sm font-bold">00:00:00</span></div>
                    <div class="flex flex-col items-end"><span class="text-[9px] text-slate-400 uppercase font-black">Latency</span><span class="delay-val font-mono text-sm text-primary font-black">-</span></div>
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

ThemeManager.init();
TabManager.init();
ConfigEditor.init();