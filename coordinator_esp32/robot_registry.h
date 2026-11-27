// =============================================================
// robot_registry.h  -  Runtime state of all 6 robots
// =============================================================
#pragma once
#include <stdint.h>
#include <esp_now.h>
#include "espnow_protocol.h"

#define MAX_ROBOTS 6

// EventGroup bit masks tren xRobotAckEvent:
//   Bits 0..5  : Tin hieu ACK thanh cong (REACHED / ARRIVED / PONG) cho xe 1..6
//   Bits 8..13 : Tin hieu LOI tuc thoi (ROBOT_STATUS_ERROR) cho xe 1..6
#define ROBOT_ACK_BIT(rid)      (1UL << ((rid) - 1))
#define ROBOT_ERR_BIT(rid)      (1UL << ((rid) - 1 + 8))
#define ROBOT_ALL_ACK_BITS      0x3FUL

// Nguong thoi gian mat ket noi de danh dau xe OFFLINE (ms)
#define ROBOT_OFFLINE_TIMEOUT_MS 10000UL

// Kenh WiFi co dinh cho ESP-NOW: Coordinator va CA 6 xe phai dung cung kenh nay.
#define ESPNOW_CHANNEL 1

// MAC cua Coordinator (ESP32-CAM) - cac xe dang ky lam peer duy nhat: 38:18:2B:B1:BC:E4
static const uint8_t COORDINATOR_MAC[6] = {0x38, 0x18, 0x2B, 0xB1, 0xBC, 0xE4};

// MAC thuc te 6 xe. Xe N <-> marker ArUco ID N (xe 1 = QR id 1, ...).
static const uint8_t ROBOT_MACS[MAX_ROBOTS][6] = {
    {0x70, 0x4B, 0xCA, 0x6D, 0x8F, 0xAC},  // Xe 1 (Team 1) 70:4B:CA:6D:8F:AC
    {0xA8, 0x42, 0xE3, 0x4A, 0x29, 0xAC},  // Xe 2 (Team 1) A8:42:E3:4A:29:AC
    {0xCC, 0xDB, 0xA7, 0x2D, 0xD6, 0x4C},  // Xe 3 (Team 1) CC:DB:A7:2D:D6:4C
    {0xF0, 0x08, 0xD1, 0x7C, 0x13, 0xD8},  // Xe 4 (Team 2) F0:08:D1:7C:13:D8
    {0x04, 0x83, 0x08, 0x59, 0x43, 0x6C},  // Xe 5 (Team 2) 04:83:08:59:43:6C
    {0xB0, 0x3F, 0xD3, 0x5B, 0x44, 0x60},  // Xe 6 (Team 2) B0:3F:D3:5B:44:60
};

typedef enum : uint8_t {
    RSTATE_IDLE    = 0,
    RSTATE_MOVING  = 1,
    RSTATE_ARRIVED = 2,
    RSTATE_ERROR   = 3,
    RSTATE_OFFLINE = 4,
} RobotState;

typedef struct {
    uint8_t    robot_id;        // 1-6
    uint8_t    team;            // 1 or 2
    RobotState state;
    uint8_t    battery_pct;
    int8_t     rssi_dbm;
    uint8_t    last_move_id;
    uint8_t    last_wp_index;
    uint8_t    last_error_code; // ma loi gan nhat tu RobotStatusPacket
    uint32_t   last_seen_ms;    // millis() of last ESP-NOW status
} RobotInfo;

// Bang tong hop si so & dinh danh xe co mat / xe thieu
typedef struct {
    uint8_t active_count;
    uint8_t online_ids[MAX_ROBOTS];
    uint8_t online_len;
    uint8_t missing_ids[MAX_ROBOTS];
    uint8_t missing_len;
} RosterSummary;

// ----- API ---------------------------------------------------
void        robot_registry_init(void);
RobotInfo*  robot_registry_get(uint8_t robot_id);   // NULL if invalid id
void        robot_registry_update(const RobotStatusPacket *pkt);
void        robot_registry_mark_offline(uint8_t robot_id);
uint8_t     robot_registry_check_timeouts(uint32_t timeout_ms, uint8_t *newly_offline_ids);
void        robot_registry_get_roster(RosterSummary *out);
const char* robot_state_str(RobotState s);
