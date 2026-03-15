const vllink = new VllinkManager();
let pollTimer = null;

// UI 元素引用
const elements = {
    connectBtn: document.getElementById('connectBtn'),
    deviceList: document.getElementById('deviceList'),
    localAlias: document.getElementById('localAlias'),
    localDelay: document.getElementById('localDelay'),
    selectedTitle: document.getElementById('selectedTitle'),
    status: document.getElementById('deviceStatus')
};

// 1. 连接处理
elements.connectBtn.addEventListener('click', async () => {
    try {
        await vllink.connect();
        startPolling();
        elements.status.innerText = "已连接: " + vllink.device.productName;
        elements.connectBtn.classList.add('bg-green-600');
    } catch (e) {
        alert("连接失败: " + e.message);
    }
});

// 2. 状态轮询
function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
        try {
            const info = await vllink.queryInfo();
            updateUI(info);
        } catch (e) {
            console.error("轮询中断", e);
            clearInterval(pollTimer);
        }
    }, 250);
}

// 3. UI 更新逻辑
function updateUI(info) {
    // 更新本地信息
    elements.localAlias.innerText = info.local.alias || 'Vllink Basic2';
    elements.localDelay.innerText = info.local.delay_us;

    // 选定标题更新
    let currentSelectedName = "有线调试器";

    // 构建所有可用设备数组
    const allDevices = [
        { ...info.local, id: 0, isRemote: false }
    ].concat(info.remote.map(r => ({ ...r, isRemote: true })));

    // 渲染卡片
    elements.deviceList.innerHTML = allDevices.map(dev => {
        const isSelected = info.select_idx === dev.id;
        if (isSelected) currentSelectedName = dev.alias || (dev.isRemote ? `无线-${dev.id}` : "有线");

        // 连接时长计算
        const durationSec = Number(info.local.us - dev.us) / 1000000;
        const timeStr = dev.us > 0n ? formatTime(durationSec) : "00:00:00";

        return `
            <div onclick="vllink.selectDebugger(${dev.id})" 
                 class="glass p-3 rounded-xl cursor-pointer transition-all ${isSelected ? 'card-active' : 'opacity-70 hover:opacity-100'}">
                <div class="flex justify-between items-start">
                    <span class="text-xs font-bold ${isSelected ? 'text-primary' : ''}">${dev.alias || '未命名'}</span>
                    <span class="text-[10px] bg-slate-800 px-1 rounded">${dev.isRemote ? 'WIFI' : 'USB'}</span>
                </div>
                <div class="mt-2 text-[10px] flex justify-between text-slate-500">
                    <span>时长: ${timeStr}</span>
                    <span>${dev.delay_us}us</span>
                </div>
            </div>
        `;
    }).join('');

    elements.selectedTitle.innerText = currentSelectedName;
}

function formatTime(sec) {
    const h = Math.floor(sec / 3600).toString().padStart(2, '0');
    const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

// 4. 主题切换
document.getElementById('themeToggle').addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
});

// 5. 自动重连 (尝试连接已授权设备)
window.addEventListener('load', async () => {
    const devices = await navigator.usb.getDevices();
    if (devices.length > 0) {
        // 这里可以实现自动连接第一个逻辑
    }
});