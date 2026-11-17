// =============================================================
// espnow_protocol.h  -  Coordinator <-> Robot binary protocol
// Transmitted over ESP-NOW (max 250 bytes per frame)
// =============================================================
#pragma once
#include <stdint.h>

// ----- Command types (Coordinator -> Robot) -------------------
typedef enum : uint8_t {
    ROBOT_CMD_WAYPOINT       = 0x01,
    ROBOT_CMD_EMERGENCY_STOP = 0x02,
    ROBOT_CMD_PING           = 0x03,
    ROBOT_CMD_SET_LED        = 0x04,  // Đặt màu 5 LED RGB trên thân xe
} RobotCmdType;

// ----- Status codes (Robot -> Coordinator) -------------------
typedef enum : uint8_t {
    ROBOT_STATUS_IDLE    = 0,
    ROBOT_STATUS_MOVING  = 1,
    ROBOT_STATUS_REACHED = 2,  // arrived at intermediate waypoint
    ROBOT_STATUS_ARRIVED = 3,  // arrived at final destination
    ROBOT_STATUS_ERROR   = 4,
    ROBOT_STATUS_PONG    = 5,
} RobotStatusCode;

// ----- Coordinator -> Robot command packet (18 bytes) ----------
typedef struct __attribute__((packed)) {
    uint8_t  cmd_type;      // RobotCmdType
    uint8_t  robot_id;      // 1-6 (robot validates its own ID)
    uint8_t  move_id;       // logical move ID (low byte, wraps 0-255)
    uint8_t  wp_index;      // waypoint index (0-based)
    uint8_t  wp_count;      // total waypoints
    int16_t  x_mm;          // target X (mm)
    int16_t  y_mm;          // target Y (mm)
    int16_t  heading_mrad;  // target heading (milli-radians)
    uint8_t  speed;         // PWM speed 0-255
    uint8_t  reserved[5];   // padding / future use
} RobotCmdPacket;           // sizeof = 18

// ----- Coordinator -> Robot LED color packet (8 bytes) --------
// Dùng cmd_type = ROBOT_CMD_SET_LED (0x04).
// Robot nhận packet này sẽ đặt màu cho cả 5 LED NeoPixel/WS2812B
// trên thân xe theo giá trị r, g, b với brightness chung.
typedef struct __attribute__((packed)) {
    uint8_t  cmd_type;      // ROBOT_CMD_SET_LED = 0x04
    uint8_t  robot_id;      // 1-6
    uint8_t  r;             // Red channel   0-255
    uint8_t  g;             // Green channel 0-255
    uint8_t  b;             // Blue channel  0-255
    uint8_t  brightness;    // Global brightness 0-255 (255 = tối đa)
    uint8_t  reserved[2];   // Dự phòng để cân bằng alignment
} RobotLedPacket;           // sizeof = 8

// ----- Robot -> Coordinator status packet (8 bytes) -----------
typedef struct __attribute__((packed)) {
    uint8_t  robot_id;      // 1-6
    uint8_t  status;        // RobotStatusCode
    uint8_t  move_id;       // echoes move_id from last command
    uint8_t  wp_index;      // echoes wp_index reached/failed
    uint8_t  battery_pct;   // 0-100 % (giữ cho tương thích giao thức, có thể = 0)
    int8_t   rssi_dbm;      // self-reported RSSI to coordinator
    uint8_t  error_code;    // 0 = no error
    uint8_t  reserved;
} RobotStatusPacket;        // sizeof = 8

_Static_assert(sizeof(RobotCmdPacket)    == 18, "RobotCmdPacket size mismatch");
_Static_assert(sizeof(RobotLedPacket)    == 8,  "RobotLedPacket size mismatch");
_Static_assert(sizeof(RobotStatusPacket) == 8,  "RobotStatusPacket size mismatch");
