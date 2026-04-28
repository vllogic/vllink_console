# 1
角色设定：你是一个精通 WebUSB API 的前端工程师。
任务目标：接收任务文档，持续维护一份WebUSB网页。

# 2
现在给你代码和文档，先全局看一下[上传其余文件]

# 3
spec_dap_protocal.md已完善，现在需要根据这份文档给网页增加两个功能：
1. 给选定的调试器添加重启功能
2. 完成右侧功能区的配置功能，要求如下：
2.1 当选定的设备更新时（根据`调试器查询`命令解析），自动通过VLLINK_CONFIG_SUBCMD_CONFIG_READ获取调试器的配置文本，文本长度要根据VLLINK_CONFIG_SUBCMD_GET_INFO返回的数据决定。
2.2 获取文本后，在配置功能页下显示文本，并允许用户编辑文本
2.3 如果用户编辑了某行文本，通过调整此行背景色（具体颜色效果自行决定）表示此行已变更
2.4 当用户将光标移动到令一行时，或者将鼠标移出配置功能区时，需要触发同步操作，同步期间禁止编辑、禁止选定其他调试器
2.5 同步操作：将所有配置文本通过VLLINK_CONFIG_SUBCMD_CONFIG_WRITE发送给调试器。然后再次通过VLLINK_CONFIG_SUBCMD_CONFIG_READ获取调试器的配置文本。比较同步前与同步后的文本，如果变更行在同步后无变化，调整此行背景色（具体颜色效果自行决定）表示此行已成功变更，如果有变化，表示变更失败，也需要调整背景色。
2.6 背景色的清除：如果该行在两次读取之间未被用户变更，则读取（或者说同步）后，清除其背景色。
请先综合评估下要求的可行性

# 4
确定
* [合并AI反馈的代码]

# 5
这个版本，重启OK，读取OK，同步写入OK。但一行内容修改后，回读的文本与修改的一致后，黄色背景会变成红色背景。这与未成功写入的颜色一致，一般来讲正确写入后背景颜色应该是绿色系列。
* [合并AI反馈的代码]

# 6
在配置文本中，存在一行 `Config_Password=` 这行配置比较敏感。为了防止用户误操作导致硬件锁死，需要屏蔽这一行，具体操作建议：读取配置时，如果在一行的头部匹配`Config_Password=`，则删除此行。同步时，由于未传入`Config_Password=`配置，所以也不影响既有配置。

# 7
现在要在右侧功能区的待定区块中新增如下功能：
## 数据结构变更：
增加了数据文件长度，单位是千字节，uint16_t格式，最多8个
```
struct vllink_config_info_t {
    uint32_t config_version;            // USR_CONFIG_VERSION
    uint32_t config_size;               // APP_CFG_IFLASH_APP_CONFIG_SIZE
    uint32_t data_file_limit;           // USR_CONFIG_DATA_FILE_LIMIT
} VSF_CAL_PACKED;
```
变更为
```
struct vllink_config_info_t {
    uint32_t config_version;            // USR_CONFIG_VERSION
    uint32_t config_size;               // APP_CFG_IFLASH_APP_CONFIG_SIZE
    uint32_t data_file_limit;           // USR_CONFIG_DATA_FILE_LIMIT
    uint16_t data_file_length_kB[8];
} VSF_CAL_PACKED;
```
1. 将`待定`改为`数据`
2. 当用户点开`数据`区块后，先通过`getConfigInfo`获得`fileLimit`，这表示当前硬件支持读写几个数据文件。
3. data_file_length[8]，表示数据文件的空间长度，若为0，则表示不具备空间不能读写。
4. 根据`data_file_limit`与`data_file_length_kB[8]`的值，将允许读写的数据快命令为`Data 0`、`Data 1`...`Data 7`，只显示允许读写的数据块
5. 对于每个数据块，需要显示空间长度，单位是KB，需要支持文件载入，不限制文件格式，但限制文件大小，不允许载入超过空间长度的文件。
6. `SUBCMD_FILE_WRITE`与`SUBCMD_FILE_READ`的数据偏移及长度都需要256字节对齐，若文件尾部数据不够，填充`0xff`
7. 在文件完成载入后，需要支持回读校验功能
8. 综上，在每个数据块上，需要显示空间长度；需要一个载入按钮，用户点击载入时，要求用户选择一个长度不大于空间长度的文件，用户选择后，先进行文件尾部填充256对齐，再执行文件写入操作，写入时需要显示进度条和写入速度；在完成写入后，需要允许用户点击另一个按钮进行回读验证，回读通过`SUBCMD_FILE_READ`进行，同样显示进度条和回读速度

补充：
1. `SUBCMD_FILE_WRITE`与`SUBCMD_FILE_READ`的header部分数据结构完全一致
2. 命令 Header 中的 idx 直接对应 Data 0...Data 7 。
3. 传输分片是256，另外 full_length 需要加上 最后一片尾部填充的长度，否则最后一包会报错
4. `显示 i < data_file_limit 且 data_file_length_kB[i] > 0 的数据块。`：没错，就是这样
5. 文件读取与校验：逐块回读并验证
6. 对于`SUBCMD_FILE_WRITE`与`SUBCMD_FILE_READ`命令，硬件都会做应答。参数合法就执行写入并返回 VLLINK_CONFIG_SUBCMD_RESP_OK 否则返回 VLLINK_CONFIG_SUBCMD_RESP_INVALID_PARAM

