/**
 * 三模态主题管理器
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
 * 选项页切换
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
 * 配置编辑器：负责行级文本编辑、同步及背景色逻辑
 */
const ConfigEditor = {
    container: document.getElementById('tab-content-config'),
    lines: [], // 存储结构: { original: string, current: string, el: HTMLElement, isDirty: boolean }
    isBusy: false,
    lastSelectedIdx: -1,

    init() {
        // 鼠标移出配置区触发同步
        this.container.addEventListener('mouseleave', () => this.sync());
    },

    // 加载配置
    async load(manager) {
        if (this.isBusy) return;
        this.isBusy = true;
        this.lockUI(true);
        manager.isBusy = true; // 停止主循环轮询

        try {
            this.container.innerHTML = `<div class="p-20 text-center animate-pulse text-slate-500 italic">Reading device configuration...</div>`;
            
            const info = await manager.getConfigInfo();
            const text = await manager.readConfig(info.size);
            
            this.render(text);
        } catch (e) {
            this.container.innerHTML = `<div class="p-20 text-red-500 text-center">Failed to load config: ${e.message}</div>`;
        } finally {
            this.isBusy = false;
            manager.isBusy = false;
            this.lockUI(false);
        }
    },

    // 渲染编辑器界面
    render(text) {
        const rows = text.split('\n');
        this.container.innerHTML = `
            <div class="flex flex-col font-mono text-sm bg-white dark:bg-slate-900/50 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl">
                ${rows.map((line, i) => `
                    <div class="editor-line flex items-center border-b border-slate-100 dark:border-slate-800/50 transition-colors duration-300">
                        <span class="w-12 text-right pr-4 text-slate-400 select-none bg-slate-50 dark:bg-slate-800/30 py-2.5 border-r border-slate-100 dark:border-slate-800/50">${i+1}</span>
                        <input type="text" 
                               class="flex-1 bg-transparent px-4 py-2.5 outline-none text-slate-700 dark:text-slate-200" 
                               value="${line.replace(/"/g, '&quot;')}" 
                               data-idx="${i}">
                    </div>
                `).join('')}
            </div>
            <p class="mt-4 text-[10px] text-slate-400 italic">Tips: Editing lines will turn them yellow. Move focus or mouse out to sync with hardware.</p>
        `;

        const inputs = this.container.querySelectorAll('input');
        this.lines = Array.from(inputs).map((el, i) => {
            const rowData = {
                original: rows[i],
                current: rows[i],
                el: el,
                isDirty: false
            };

            // 监听输入变化
            el.addEventListener('input', (e) => {
                rowData.current = e.target.value;
                rowData.isDirty = rowData.current !== rowData.original;
                this.updateLineStyle(rowData);
            });

            // 失去焦点触发同步
            el.addEventListener('blur', () => this.sync());

            return rowData;
        });
    },

    // 更新单行样式
    updateLineStyle(lineData, status = 'none') {
        const rowEl = lineData.el.closest('.editor-line');
        // 清除所有背景色类
        rowEl.classList.remove('bg-amber-500/10', 'bg-emerald-500/20', 'bg-rose-500/20');
        
        if (status === 'success') {
            rowEl.classList.add('bg-emerald-500/20');
        } else if (status === 'fail') {
            rowEl.classList.add('bg-rose-500/20');
        } else if (lineData.isDirty) {
            rowEl.classList.add('bg-amber-500/10');
        }
    },

    // 同步到硬件
    async sync() {
        const changedLines = this.lines.filter(l => l.isDirty);
        if (changedLines.length === 0 || this.isBusy) return;

        this.isBusy = true;
        this.lockUI(true);
        vllink.isBusy = true; // 独占 USB

        try {
            // 1. 获取最新信息（确认大小）并发送写入
            const info = await vllink.getConfigInfo();
            const fullText = this.lines.map(l => l.current).join('\n');
            await vllink.writeConfig(fullText, info.size);

            // 2. 立即回读进行校验
            const verifyText = await vllink.readConfig(info.size);
            const verifyRows = verifyText.split('\n');

            // 3. 逐行比对结果
            this.lines.forEach((line, i) => {
                const newValue = verifyRows[i] || "";
                
                if (line.isDirty) {
                    // 如果这一行是用户改过的，判断写入是否成功
                    const success = line.current === newValue;
                    this.updateLineStyle(line, success ? 'success' : 'fail');
                } else {
                    // 如果用户没改过这一行，且读到的内容变了（由于硬件逻辑），则更新背景
                    if (line.original !== newValue) {
                        this.updateLineStyle(line, 'none');
                    } else {
                        this.updateLineStyle(line, 'none'); // 清除背景
                    }
                }

                // 更新状态追踪
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

    // UI 锁定：同步期间禁止操作
    lockUI(locked) {
        document.body.classList.toggle('pointer-events-none', locked);
        document.body.style.cursor = locked ? 'wait' : 'default';
        const configTab = document.getElementById('tab-content-config');
        configTab.classList.toggle('opacity-50', locked);
    }
};

/**
 * 核心逻辑集成
 */
const vllink = new VllinkManager();
let pollTimer = null;
let lastDeviceFingerprint = "";

const UI = {
    connectBtn: document.getElementById('connectBtn'),
    deviceList: document.getElementById('deviceList'),
    status: document.getElementById('connectionStatus')
};

// 处理卡片点击与重启
UI.deviceList.addEventListener('click', async (e) => {
    // 检查是否点击了重启按钮
    const restartBtn = e.target.closest('.restart-btn');
    if (restartBtn) {
        e.stopPropagation();
        const card = restartBtn.closest('[data-id]');
        if (confirm(`Confirm RESTART for node [${card.dataset.id}]?`)) {
            try {
                await vllink.resetDevice();
                UI.status.innerText = "DEVICE REBOOTING...";
                setTimeout(() => location.reload(), 1000); // 1秒后自动重连
            } catch (err) {
                alert("Reset Failed: " + err.message);
            }
        }
        return;
    }

    // 切换调试器
    const card = e.target.closest('[data-id]');
    if (card) {
        const newIdx = parseInt(card.dataset.id);
        vllink.selectDebugger(newIdx);
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
                if (!info) return; // 如果处于 Busy 状态

                updateDeviceDisplay(info);

                // 自动加载配置逻辑：当硬件层面的 select_idx 发生变化时
                if (info.select_idx !== ConfigEditor.lastSelectedIdx) {
                    ConfigEditor.lastSelectedIdx = info.select_idx;
                    ConfigEditor.load(vllink);
                }
            } catch (e) {
                console.error("Poll error:", e);
                // 严重错误断开处理
                if (e.message.includes('disconnected') || e.message.includes('lost')) {
                    clearInterval(pollTimer);
                    UI.status.innerText = "OFFLINE";
                    UI.connectBtn.innerText = "RECONNECT";
                    UI.connectBtn.classList.replace('bg-green-600', 'bg-primary');
                }
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
        UI.deviceList.innerHTML = all.map(dev => `
            <div data-id="${dev.id}" class="device-card p-5 rounded-2xl cursor-pointer opacity-80 hover:opacity-100 flex flex-col gap-3 relative group">
                
                <!-- 别名与重启层 -->
                <div class="flex justify-between items-center">
                    <span class="text-sm font-black tracking-tight text-slate-800 dark:text-slate-50 truncate uppercase pr-8">
                        ${dev.alias}
                    </span>
                    <div class="flex items-center gap-2">
                         <!-- 重启按钮：仅在选中时显现更加明显，或通过 group-hover 显示 -->
                        <button class="restart-btn opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 rounded-lg text-red-500 transition-all" title="Restart Node">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                        </button>
                        <span class="text-[10px] bg-slate-300/50 dark:bg-white/10 px-2 py-1 rounded font-black text-slate-600 dark:text-slate-400">
                            ${dev.type}
                        </span>
                    </div>
                </div>
                
                <!-- MAC 地址层 -->
                <div class="flex items-center gap-2 font-mono text-xs">
                    <span class="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-tighter">Addr</span>
                    <span class="text-slate-600 dark:text-slate-300">${dev.mac}</span>
                </div>

                <!-- 监控数据层 -->
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

    // 局部更新活跃状态和时间
    all.forEach(dev => {
        const card = UI.deviceList.querySelector(`[data-id="${dev.id}"]`);
        if (!card) return;
        
        const isActive = info.select_idx === dev.id;
        card.classList.toggle('card-active', isActive);
        
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

// 初始化
ThemeManager.init();
TabManager.init();
ConfigEditor.init();