# DAP协议
* 本协议部分内容以`C代码`呈现

## 如何基于CMSIS-DAP V1 / V2接口通信
* 通过对应OUT端点发送请求
* 通过对应IN端点读取应答即可

## 如何基于WebUSB接口通信
* WebUSB接口需要进行请求-查询-应答三步
* 一般不对非选定的调试器进行DAP通讯，此功能保留
* 通过`DAP请求`命令发送对选定的调试器发送请求
* 通过`DAP查询`命令查询命令完成情况，推荐间隔`2`毫秒
* 通过`DAP应答`命令提取应答

## 标准部分
* 标准DAP命令遵循ARM的CMSIS-DAP协议，此处不展开，当前工具也不会使用这些命令

## 自定义部分
* ID_DAP_Vendor定义
    ```
    #define ID_DAP_Vendor17 0x91U
    enum vender_id_rename_t {
        VENDOR_ID_VLLINK_CONFIG         = ID_DAP_Vendor17,
    };
    ```
    ```
    // request_handler_config_only 是usb层调用的，注意此函数会执行req_ptr++与resp_ptr++动作
    static uint16_t request_handler_config_only(dap_param_t* param, uint8_t* request,
            uint8_t* response, uint16_t pkt_size)
    {
        uint8_t cmd_id, cmd_num;
        uint32_t req_ptr, resp_ptr;

        req_ptr = 0;
        resp_ptr = 0;
        cmd_num = 1;

        do {
            cmd_num--;
            cmd_id = request[req_ptr++];
            response[resp_ptr++] = cmd_id;

            if ((cmd_id >= ID_DAP_Vendor17) && (cmd_id <= ID_DAP_Vendor17)) {       // ID_DAP_Vendor17 -> VENDOR_ID_VLLINK_CONFIG
                uint32_t ret = dap_vendor_request_handler(param, request + req_ptr, response + resp_ptr, cmd_id, pkt_size - resp_ptr);
                if (ret == 0)
                    goto fault;
                else {
                    req_ptr += ret & 0xffff;
                    resp_ptr += ret >> 16;
                }
            }
        } while (cmd_num && (resp_ptr < pkt_size));
        goto exit;

    fault:
        response[resp_ptr - 1] = ID_DAP_Invalid;
    exit:
        return resp_ptr;
    }
    // 注意，cmd_id 即 request[0]
    uint32_t dap_vendor_request_handler(dap_param_t* param, uint8_t* request,
            uint8_t* response, uint8_t cmd_id, uint16_t remaining_size)
    {
        uint16_t req_ptr = 0, resp_ptr = 0;

        switch (cmd_id) {
        case VENDOR_ID_VLLINK_CONFIG:
            return dap_vendor_vllink_config_handler(param, request, response, remaining_size);
        default:
            break;
        }
        return ((uint32_t)resp_ptr << 16) | req_ptr;
    }
    ```
    ```
    // 注意，部分定义未用到
    enum vllink_config_subcmd_t {
        VLLINK_CONFIG_SUBCMD_GET_INFO               = 0x1,
        VLLINK_CONFIG_SUBCMD_RESET                  = 0x2,
        VLLINK_CONFIG_SUBCMD_GET_RECORD             = 0x7,
        VLLINK_CONFIG_SUBCMD_RESET_RECORD           = 0x8,
        VLLINK_CONFIG_SUBCMD_CONFIG_READ            = 0x10,
        VLLINK_CONFIG_SUBCMD_FILE_READ              = 0x11,
        VLLINK_CONFIG_SUBCMD_CONFIG_WRITE           = 0x20,
        VLLINK_CONFIG_SUBCMD_FILE_WRITE             = 0x21,
    };
    enum vllink_config_subcmd_resp_t {
        VLLINK_CONFIG_SUBCMD_RESP_OK                = 0,
        VLLINK_CONFIG_SUBCMD_RESP_NOT_SUPPORT,
        VLLINK_CONFIG_SUBCMD_RESP_LOCKED,
        VLLINK_CONFIG_SUBCMD_RESP_INVALID_PASSWORD,
        VLLINK_CONFIG_SUBCMD_RESP_INVALID_PARAM,
        VLLINK_CONFIG_SUBCMD_RESP_FAIL,
    };
    struct vllink_config_subcmd_read_head_t {
        uint32_t idx;
        uint32_t full_length;
        uint32_t data_pos;
        uint32_t data_len;
    };
    struct vllink_config_subcmd_write_head_t {
        uint32_t idx;
        uint32_t full_length;
        uint32_t data_pos;
        uint32_t data_len;
    };
    ```
    ```
    #define USR_CONFIG_VERSION                              0x20250505
    #define USR_CONFIG_DATA_FILE_LIMIT                      9
    #define APP_CFG_IFLASH_APP_CONFIG_SIZE                  (4 * 1024)
    struct vllink_config_info_t {
        uint32_t config_version;            // USR_CONFIG_VERSION
        uint32_t config_size;               // APP_CFG_IFLASH_APP_CONFIG_SIZE
        uint32_t data_file_limit;           // USR_CONFIG_DATA_FILE_LIMIT
    };
    uint32_t dap_vendor_vllink_config_handler(dap_param_t* param, uint8_t* request,
            uint8_t* response, uint16_t remaining_size)
    {
        uint8_t subcmd;
        uint16_t req_ptr = 0, resp_ptr = 0;

        subcmd = request[req_ptr++];
        response[resp_ptr++] = subcmd;

        switch (subcmd) {
        case VLLINK_CONFIG_SUBCMD_GET_INFO: {
            struct vllink_config_info_t config_info;

            memset(&config_info, 0, sizeof(struct vllink_config_info_t));
            config_info.config_version = USR_CONFIG_VERSION;
            config_info.config_size = APP_CFG_IFLASH_APP_CONFIG_SIZE;
            config_info.data_file_limit = USR_CONFIG_DATA_FILE_LIMIT;

            response[resp_ptr++] = DAP_OK;
            response[resp_ptr++] = VLLINK_CONFIG_SUBCMD_RESP_OK;
            memcpy(response + resp_ptr, &config_info, sizeof(struct vllink_config_info_t));
            resp_ptr += sizeof(struct vllink_config_info_t);
        } break;
        case VLLINK_CONFIG_SUBCMD_RESET: {
            usr.run_param.reset_ms = vsfhal_tickcnt_get_ms_64() + 100;
            led_ctrl_special(LED_CTRL_FORCE_OFF_ALL, 0);
            response[resp_ptr++] = DAP_OK;
            response[resp_ptr++] = VLLINK_CONFIG_SUBCMD_RESP_OK;
        } break;
        case VLLINK_CONFIG_SUBCMD_CONFIG_READ:
        {
            uint8_t resp = VLLINK_CONFIG_SUBCMD_RESP_FAIL;
            struct vllink_config_subcmd_read_head_t *head = (struct vllink_config_subcmd_read_head_t *)&request[req_ptr];
            req_ptr += sizeof(struct vllink_config_subcmd_read_head_t);
            uint8_t *data = response + resp_ptr + 6;

            if (subcmd == VLLINK_CONFIG_SUBCMD_CONFIG_READ) {
                if ((head->full_length <= APP_CFG_IFLASH_APP_CONFIG_SIZE) && ((head->data_pos + head->data_len) <= head->full_length)) {
                    resp = __config_read(head, data);
                }
            } else {
            }
            response[resp_ptr++] = DAP_OK;
            response[resp_ptr++] = resp;
            put_unaligned_le32(head->data_len, response + resp_ptr);
            resp_ptr += 4;
            if (resp == VLLINK_CONFIG_SUBCMD_RESP_OK) {
                resp_ptr += head->data_len;
            }
        } break;
        case VLLINK_CONFIG_SUBCMD_CONFIG_WRITE:
        {
            uint8_t resp = VLLINK_CONFIG_SUBCMD_RESP_FAIL;
            struct vllink_config_subcmd_write_head_t *head = (struct vllink_config_subcmd_write_head_t *)&request[req_ptr];
            req_ptr += sizeof(struct vllink_config_subcmd_write_head_t);
            uint8_t *data = (uint8_t *)&request[req_ptr];
            req_ptr += head->data_len;

            if (subcmd == VLLINK_CONFIG_SUBCMD_CONFIG_WRITE) {
                if ((head->full_length <= APP_CFG_IFLASH_APP_CONFIG_SIZE) && ((head->data_pos + head->data_len) <= head->full_length)) {
                    resp = __config_write(head, data);
                }
            } else {
            }
            response[resp_ptr++] = DAP_OK;
            response[resp_ptr++] = resp;
            put_unaligned_le32(head->data_len, response + resp_ptr);
            resp_ptr += 4;
        } break;
        default: {
            response[resp_ptr++] = DAP_OK;
            response[resp_ptr++] = VLLINK_CONFIG_SUBCMD_RESP_NOT_SUPPORT;
        } break;
        }

        return ((uint32_t)resp_ptr << 16) | req_ptr;
    }
    ```
* 配置同步的补充说明：配置文本长度由`config_info.config_size`定义，读取需要完整读取此长度，写入也需要完整写入此长度，只有完整写入才能触发解析