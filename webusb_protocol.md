# WebUSB通讯协议

## 一、说明
* WebUSB是Vllink产品中预留的专用接口，其数据通过`端点0`传输，可以与其他上位机同时使用，甚至能实现访问目标芯片的功能
* 本文所有数据结构皆为小端模式，为方便撰写，部分内容以伪代码或者C语言呈现

### 1.1 适用硬件
* Vllink Basic2，且固件版本>=`V00.40`

### 1.2 查找接口
* {vendorId, productId} ：{0x1209, 0x6666} 或者 {0x0d28, 0x0204}
* interfaceClass == 0xFF 
* interfaceSubclass == 0x03
* 满足上述条件后，`claimInterface`，检查：interfaceName == "WebUSB: CMSIS-DAP"

### 1.3 接口参数
* 控制传输、端点0
* 包最大长度为512字节，且DAP请求及应答长度都限制在512字节

### 1.4 限制
* 本接口为专用单一接口，未防止出现多主机干扰，通讯前需要`claimInterface`，独占该接口

## 二、通讯
### 读
* bRequestType == (USB_TYPE_VENDOR | USB_RECIP_INTERFACE | USB_DIR_IN)
* bRequest 为 命令，见协议章节
* wValue 为 命令参数，见协议章节
* wIndex 为 "1.2节中获得的接口号"
* wLength 为 数据长度，不得超过512，可以统一为512字节，USB设备会返回实际长度
### 写
* bRequestType == (USB_TYPE_VENDOR | USB_RECIP_INTERFACE | USB_DIR_OUT)
* bRequest 为 命令，见协议章节
* wValue 为 命令参数，见协议章节
* wIndex == "1.2节中获得的接口号"
* wLength 为 数据长度，不得超过512

## 三、协议
### 3.1 读命令
#### 3.1.1 调试器查询 `bRequest == 0x00`
* 获取调试器及其已连接的无线调试器信息，数据结构如下：
    ```
    struct {
        uint8_t select_idx;
        uint8_t reserved[27];

        struct {
            uint64_t us;
            uint32_t delay_us;
            uint8_t alias[32];
        } local, remote[10];
    } __attribute__((packed)) debugger_info;
    ```
* `debugger_info.select_idx`表示选定的调试器
* `debugger_info.local.us`表示应答时间戳，单位为微秒，每次应答时更新
* `debugger_info.remote[i].us`表示远端建立连接时的时间戳，单位为微秒，建立连接时更新；若为0，表示未连接
* `debugger_info.*.delay_us`表示DAP命令响应延迟，基于简易查询命令测量，仅对已选定的调试器测量
* `debugger_info.*.alias`表示调试器的别名
#### 3.1.2 DAP应答 `bRequest == 0x10`
* `wValue`无意义
* 获取DAP应答，应答数据在`DAP请求`完成后更新
* 此命令需配合**DAP查询**使用
* 数据格式-遵循DAP协议
#### 3.1.3 DAP查询 `bRequest == 0x11`
* `wValue`无意义
* 获取DAP请求的结果，数据结构如下：
    ```
    struct {
        int16_t result;
    } dap_result;
    ```
* `dap_result.result < 0`表示DAP请求错误，无应答数据
* `dap_result.result == 0`表示DAP请求未完成
* `dap_result.result > 0`表示DAP请求完成，可以继续执行**DAP应答**
* 注意：`dap_result.result > 0`时，`dap_result.result`的值可以作为**DAP应答**的最大长度，但实际应答长度可能小于此最大长度，甚至为0
### 3.2 写命令
#### 3.2.1 调试器选定 `bRequest == 0x00`
* `wValue` 数据结构如下：
    ```
    union {
        uint16_t wValue;
        struct {
            uint8_t select_idx;
            uint8_t reserved;
        };
    } debugger_select;
    ```
* `debugger_select.select_idx == 0`表示选定有线调试器
* `debugger_select.select_idx > 0`表示选定无线调试器，对应**调试器查询**命令中的`debugger_info.remote[select.select_idx - 1]`，且要求`debugger_info.remote[select.select_idx - 1].us != 0`
#### 3.2.2 DAP请求 `bRequest == 0x10`
* 通过`wValue`指定调试器，数据结构如下：
    ```
    union {
        uint16_t wValue;
        struct {
            uint8_t select_idx;
            uint8_t reserved;
        };
    } req_select;
    ```
* 支持`req_select.select_idx == 0`，表示`DAP请求`传递给有线调试器
* 支持`req_select.select_idx == debugger_info.select_idx`，表示`DAP请求`传递给当前选定的调试器
* 发送DAP请求
* 数据格式遵循DAP协议
### 3.3 建议
* **调试器查询** 的轮询间隔推荐`250`毫秒
* **DAP查询** 的轮询间隔推荐`2`毫秒，仅在 **DAP请求** 之后进行
