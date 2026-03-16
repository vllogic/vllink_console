class VllinkManager {
    constructor() {
        this.device = null;
        this.interfaceNum = 0;
        this.filters = [
            { vendorId: 0x1209, productId: 0x6666 },
            { vendorId: 0x0d28, productId: 0x0204 }
        ];
    }

    async connect() {
        this.device = await navigator.usb.requestDevice({ filters: this.filters });
        await this.device.open();
        const iface = this.device.configuration.interfaces.find(i => 
            i.alternate.interfaceClass === 0xFF && i.alternate.interfaceSubclass === 0x03
        );
        if (!iface) throw new Error("WebUSB Interface not found");
        this.interfaceNum = iface.interfaceNumber;
        await this.device.claimInterface(this.interfaceNum);
        return this.device;
    }

    async queryInfo() {
        const result = await this.device.controlTransferIn({
            requestType: 'vendor', recipient: 'interface',
            request: 0x00, value: 0x00, index: this.interfaceNum
        }, 512);

        if (result.status === 'ok') {
            return this.parseInfo(result.data.buffer);
        }
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
        
        const info = {
            select_idx: view.getUint8(0),
            local: null,
            remote: []
        };

        // 核心解析函数 (基于新结构：us[8], delay_us[4], reserved[4], alias[32] = 48 bytes)
        const parseNode = (offset) => ({
            us: view.getBigUint64(offset, true),
            delay_us: view.getUint32(offset + 8, true),
            alias: decoder.decode(new Uint8Array(buffer, offset + 16, 32)).replace(/\0/g, '')
        });

        // 头部 32 字节后，第一个是 local
        info.local = parseNode(32);

        // 后面跟着 9 个 remote 节点
        for (let i = 0; i < 9; i++) {
            const offset = 32 + 48 + (i * 48);
            const node = parseNode(offset);
            if (node.us > 0n) { // 如果 us 为 0 表示该通道未连接
                info.remote.push({ ...node, id: i + 1 });
            }
        }
        return info;
    }
}