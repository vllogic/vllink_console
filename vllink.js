class VllinkManager {
    constructor() {
        this.device = null;
        this.interfaceNum = 0;
        this.filters = [{ vendorId: 0x1209, productId: 0x6666 }, { vendorId: 0x0d28, productId: 0x0204 }];
        this.isBusy = false; // 通讯锁
    }

    // ... 保留原来的 connect, queryInfo, selectDebugger ...
    async connect() { /* 同前 */
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
        if (this.isBusy) return null;
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

    /**
     * DAP 核心传输 (请求-查询-应答)
     */
    async dapExecute(payload) {
        // 1. 发送请求 (Request: 0x10)
        await this.device.controlTransferOut({
            requestType: 'vendor', recipient: 'interface',
            request: 0x10, value: 0, index: this.interfaceNum
        }, payload);

        // 2. 轮询结果 (Poll: 0x11)
        let ready = false;
        while (!ready) {
            await new Promise(r => setTimeout(r, 2)); // 推荐 2ms 间隔
            const res = await this.device.controlTransferIn({
                requestType: 'vendor', recipient: 'interface',
                request: 0x11, value: 0, index: this.interfaceNum
            }, 2);
            if (res.data.getInt16(0, true) > 0) ready = true;
        }

        // 3. 获取应答 (Response: 0x10)
        const resp = await this.device.controlTransferIn({
            requestType: 'vendor', recipient: 'interface',
            request: 0x10, value: 0, index: this.interfaceNum
        }, 512);
        return new Uint8Array(resp.data.buffer);
    }

    /**
     * 重启选定的设备
     */
    async resetDevice() {
        const pkg = new Uint8Array([0x91, 0x02]); // ID_DAP_Vendor17, VLLINK_CONFIG_SUBCMD_RESET
        return await this.dapExecute(pkg);
    }

    /**
     * 获取配置信息 (Version, Size)
     */
    async getConfigInfo() {
        const pkg = new Uint8Array([0x91, 0x01]); // VLLINK_CONFIG_SUBCMD_GET_INFO
        const resp = await this.dapExecute(pkg);
        const view = new DataView(resp.buffer);
        // resp[0]=subcmd, resp[1]=DAP_OK, resp[2]=VLLINK_RESP_OK
        return {
            version: view.getUint32(3, true).toString(16),
            size: view.getUint32(7, true),
            fileLimit: view.getUint32(11, true)
        };
    }

    /**
     * 读取完整配置文本
     */
    async readConfig(fullSize) {
        let offset = 0;
        let completeData = new Uint8Array(0);
        const decoder = new TextDecoder();

        while (offset < fullSize) {
            const len = Math.min(256, fullSize - offset); // 安全起见每片256
            const pkg = new Uint8Array(18);
            pkg[0] = 0x91; pkg[1] = 0x10; // CONFIG_READ
            const view = new DataView(pkg.buffer);
            view.setUint32(2, 0, true);        // idx
            view.setUint32(6, fullSize, true); // full_len
            view.setUint32(10, offset, true);  // data_pos
            view.setUint32(14, len, true);     // data_len

            const resp = await this.dapExecute(pkg);
            if (resp[2] !== 0) break; // VLLINK_CONFIG_SUBCMD_RESP_OK
            
            const chunkLen = new DataView(resp.buffer).getUint32(3, true);
            const chunkData = resp.slice(7, 7 + chunkLen);
            
            const tmp = new Uint8Array(completeData.length + chunkData.length);
            tmp.set(completeData);
            tmp.set(chunkData, completeData.length);
            completeData = tmp;
            offset += chunkLen;
            if (chunkLen === 0) break;
        }
        return decoder.decode(completeData).replace(/\0/g, '');
    }

    /**
     * 写入配置文本
     */
    async writeConfig(text, fullSize) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        let offset = 0;

        while (offset < data.length) {
            const len = Math.min(256, data.length - offset);
            const pkg = new Uint8Array(18 + len);
            pkg[0] = 0x91; pkg[1] = 0x20; // CONFIG_WRITE
            const view = new DataView(pkg.buffer);
            view.setUint32(2, 0, true);
            view.setUint32(6, fullSize, true);
            view.setUint32(10, offset, true);
            view.setUint32(14, len, true);
            pkg.set(data.slice(offset, offset + len), 18);

            const resp = await this.dapExecute(pkg);
            if (resp[2] !== 0) throw new Error("Write Failed");
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