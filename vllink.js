/**
 * Vllink 硬件通讯管理类
 * 适配固件版本 >= V00.40
 */
class VllinkManager {
    constructor() {
        this.device = null;
        this.interfaceNum = 0;
        this.filters = [{ vendorId: 0x1209, productId: 0x6666 }, { vendorId: 0x0d28, productId: 0x0204 }];
        this.isBusy = false; // 通讯排队锁
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
        if (!this.device || this.isBusy) return null;
        const result = await this.device.controlTransferIn({
            requestType: 'vendor', recipient: 'interface',
            request: 0x00, value: 0x00, index: this.interfaceNum
        }, 512);
        if (result.status === 'ok') return this.parseInfo(result.data.buffer);
    }

    async selectDebugger(idx) {
        if (!this.device) return;
        await this.device.controlTransferOut({
            requestType: 'vendor', recipient: 'interface',
            request: 0x00, value: idx & 0xFF, index: this.interfaceNum
        });
    }

    /**
     * WebUSB 专用 DAP 通讯：请求 -> 查询 -> 应答
     * 注意：pkg 首字节必须是 0x91 (VENDOR_ID_VLLINK_CONFIG)
     */
    async dapExecute(payload) {
        if (!this.device) throw new Error("Device disconnected");
        
        // 1. 发送请求 (0x10)
        await this.device.controlTransferOut({
            requestType: 'vendor', recipient: 'interface',
            request: 0x10, value: 0, index: this.interfaceNum
        }, payload);

        // 2. 循环查询结果 (0x11)
        let ready = false;
        for (let i = 0; i < 100; i++) {
            await new Promise(r => setTimeout(r, 2)); 
            const res = await this.device.controlTransferIn({
                requestType: 'vendor', recipient: 'interface',
                request: 0x11, value: 0, index: this.interfaceNum
            }, 2);
            if (res.data.getInt16(0, true) > 0) { ready = true; break; }
        }
        if (!ready) throw new Error("DAP Communication Timeout");

        // 3. 提取应答 (0x10)
        const resp = await this.device.controlTransferIn({
            requestType: 'vendor', recipient: 'interface',
            request: 0x10, value: 0, index: this.interfaceNum
        }, 512);
        return new Uint8Array(resp.data.buffer);
    }

    async getConfigInfo() {
        const pkg = new Uint8Array([0x91, 0x01]); // 0x91 + GET_INFO
        const resp = await this.dapExecute(pkg);
        const view = new DataView(resp.buffer);
        // resp: [0x91, subcmd, DAP_OK, VLLINK_RESP, data...]
        if (resp[2] !== 0 || resp[3] !== 0) throw new Error("Get Info Failed");
        return {
            version: view.getUint32(4, true).toString(16),
            size: view.getUint32(8, true),      // config_size (4096)
            fileLimit: view.getUint32(12, true) // data_file_limit
        };
    }

    async resetDevice() {
        const pkg = new Uint8Array([0x91, 0x02]); // 0x91 + RESET
        const resp = await this.dapExecute(pkg);
        return resp[2] === 0 && resp[3] === 0;
    }

    async readConfig(totalSize) {
        let offset = 0;
        let completeData = new Uint8Array(0);
        const decoder = new TextDecoder();

        while (offset < totalSize) {
            const len = Math.min(256, totalSize - offset); 
            const pkg = new Uint8Array(18); // 0x91 + subcmd(1) + head(16)
            pkg[0] = 0x91; pkg[1] = 0x10; 
            const view = new DataView(pkg.buffer);
            view.setUint32(2, 0, true);
            view.setUint32(6, totalSize, true);
            view.setUint32(10, offset, true);
            view.setUint32(14, len, true);

            const resp = await this.dapExecute(pkg);
            if (resp[2] !== 0 || resp[3] !== 0) break;
            
            const chunkLen = new DataView(resp.buffer).getUint32(4, true);
            const chunkData = resp.slice(8, 8 + chunkLen);
            
            const tmp = new Uint8Array(completeData.length + chunkData.length);
            tmp.set(completeData); tmp.set(chunkData, completeData.length);
            completeData = tmp;
            offset += chunkLen;
            if (chunkLen === 0) break;
        }
        return decoder.decode(completeData).replace(/\0/g, '');
    }

    async writeConfig(text, totalSize) {
        const encoder = new TextEncoder();
        const rawBytes = encoder.encode(text);
        
        // 强制构建 totalSize 长度的 Buffer (全量写入)
        const fullPayload = new Uint8Array(totalSize);
        fullPayload.set(rawBytes.slice(0, totalSize));

        let offset = 0;
        while (offset < totalSize) {
            const len = Math.min(256, totalSize - offset);
            const pkg = new Uint8Array(18 + len);
            pkg[0] = 0x91; pkg[1] = 0x20; 
            const view = new DataView(pkg.buffer);
            view.setUint32(2, 0, true);
            view.setUint32(6, totalSize, true);
            view.setUint32(10, offset, true);
            view.setUint32(14, len, true);
            pkg.set(fullPayload.slice(offset, offset + len), 18);

            const resp = await this.dapExecute(pkg);
            if (resp[2] !== 0 || resp[3] !== 0) throw new Error("Flash Write Error");
            offset += len;
        }
    }

    parseInfo(buffer) {
        const view = new DataView(buffer);
        const decoder = new TextDecoder();
        const info = { select_idx: view.getUint8(0), local: null, remote: [] };
        const parseNode = (offset) => {
            const macRaw = new Uint8Array(buffer, offset + 16, 6);
            const macStr = Array.from(macRaw).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
            const aliasRaw = new Uint8Array(buffer, offset + 22, 26);
            let aliasStr = decoder.decode(aliasRaw).replace(/\0/g, '').trim();
            return {
                us: view.getBigUint64(offset, true),
                delay_us: view.getUint32(offset + 8, true),
                mac: macStr,
                alias: aliasStr || "Unnamed"
            };
        };
        info.local = parseNode(32);
        for (let i = 0; i < 9; i++) {
            const offset = 32 + 48 + (i * 48);
            const node = parseNode(offset);
            if (node.us > 0n) info.remote.push({ ...node, id: i + 1 });
        }
        return info;
    }
}