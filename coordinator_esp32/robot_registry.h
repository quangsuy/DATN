// =============================================================
// robot_registry.h  -  Runtime state of all 6 robots
// =============================================================
#pragma once
#include <stdint.h>
#include <esp_now.h>
#include "espnow_protocol.h"

#define MAX_ROBOTS 6

// Known robot MAC addresses - update with real hardware MACs
// Format: {0x24, 0xDC, 0xC3, 0x00, 0x00, robot_id}
static const uint8_t ROBOT_MACS[MAX_ROBOTS][6] = {
    {0x24, 0xDC, 0xC3, 0x00, 0x00, 0x01},  // Robot 1 (Team 1)
    {0x24, 0xDC, 0xC3, 0x00, 0x00, 0x02},  // Robot 2 (Team 1)
    {0x24, 0xDC, 0xC3, 0x00, 0x00, 0x03},  // Robot 3 (Team 1)
    {0x24, 0xDC, 0xC3, 0x00, 0x00, 0x04},  // Robot 4 (Team 2)
    {0x24, 0xDC, 0xC3, 0x00, 0x00, 0x05},  // Robot 5 (Team 2)
    {0x24, 0xDC, 0xC3, 0x00, 0x00, 0x06},  // Robot 6 (Team 2)
};

typedef enum : uint8_t {
    RSTATE_IDLE    = 0,
    RSTATE_MOVING  = 1,
    RSTATE_ARRIVED = 2,
    RSTATE_ERROR   = 3,
    RSTATE_OFFLINE = 4,
} RobotState;

typedef struct {
    uint8_t    robot_id;     // 1-6
    uint8_t    team;         // 1 or 2
    RobotState state;
    uint8_t    battery_pct;
    int8_t     rssi_dbm;
    uint8_t    last_move_id;
    uint8_t    last_wp_index;
    uint32_t   last_seen_ms; // millis() of last ESP-NOW status
} RobotInfo;

// ----- API ---------------------------------------------------
void     robot_registry_init(void);
RobotInfo* robot_registry_get(uint8_t robot_id);   // NULL if invalid id
void     robot_registry_update(const RobotStatusPacket *pkt);
const char* robot_state_str(RobotState s);
