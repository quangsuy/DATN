// comms.h - ESP-NOW phia xe: nhan lenh tu Coordinator, gui trang thai ve
#pragma once
#include <stdint.h>
#include <stdbool.h>
#include "espnow_protocol.h"

// Khung lenh tho (18 byte) lay ra tu hang doi
typedef struct { uint8_t raw[sizeof(RobotCmdPacket)]; } RxFrame;

void comms_init(void);
// Lay 1 khung lenh (khong block). true neu co.
bool comms_poll(RxFrame *out);
// Xoa het lenh dang cho (dung khi dung khan cap)
void comms_flush(void);
bool comms_send_status(uint8_t status, uint8_t move_id, uint8_t wp_index, uint8_t error_code);
