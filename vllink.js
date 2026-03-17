class VllinkManager {
    // ... constructor, connect, queryInfo, selectDebugger 保持不变 ...
    constructor() {
        this.device = null;
        this.interfaceNum = 0;
        this.filters = [{ vendorId: 0x1209, productId: 0x6666 }, { vendorId: 0x0d28, productId: 0x0204 }];
    }

    async connect() {
        this.device = await navigator.usb.requestDevice({ filters: this.filters });
        await this.device.open();
        const iface = this.device.configuration.interfaces.find(i => 
            i.alternate.interfaceClass === 0xFF && i.alternate.interfaceSubclass === 0x03
        );
        if (!iface) throw new Error("Vllink WebUSB Interface not found");
        this.interfaceNum = iface.interfaceNumber;
        await this.device.claimInterface(this.interfaceNum);
        return this.device;
    }

    async queryInfo() {
        const result = await this.device.controlTransferIn({
            requestType: 'vendor', recipient: 'interface',
            request: 0x00, value: 0x00, index: this.interfaceNum
        }, 512);
        if (result.status === 'ok') return this.parseInfo(result.data.buffer);
    }

    async selectDebugger(idx) {
        await this.device.controlTransferOut({
            requestType: 'vendor', recipient: 'interface',
            request: 0x00, value: idx & 0xFF, index: this.interfaceNum
        });
    }

    parseInfo(buffer) {
        const view = new DataView(buffer);
        const decoder = new TextDecoder();
        const info = { select_idx: view.getUint8(0), local: null, remote: [] };

        // 解析单个节点 (48字节): us[8], delay_us[4], reserved[4], mac[6], alias[26]
        const parseNode = (offset) => {
            // 1. 提取 MAC 地址 (6字节)
            const macRaw = new Uint8Array(buffer, offset + 16, 6);
            const macStr = Array.from(macRaw).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(':');

            // 2. 提取 Alias (26字节)
            const aliasRaw = new Uint8Array(buffer, offset + 22, 26);
            let aliasStr = decoder.decode(aliasRaw).replace(/\0/g, '').trim();

            return {
                us: view.getBigUint64(offset, true),
                delay_us: view.getUint32(offset + 8, true),
                mac: macStr,
                alias: aliasStr || "Unnamed"
            };
        };

        // Header (32字节) 后是 Local
        info.local = parseNode(32);
        // 后面跟着 9 个 Remote 节点
        for (let i = 0; i < 9; i++) {
            const offset = 32 + 48 + (i * 48);
            const node = parseNode(offset);
            if (node.us > 0n) info.remote.push({ ...node, id: i + 1 });
        }
        return info;
    }
}