// =============================================================
// protocol.h  -  Three Men's Morris: Pi <-> Coordinator
// JSON Lines protocol  (coordinator_protocol.py compatible)
// =============================================================
// Packet format (UTF-8, newline-terminated, <= 512 bytes):
//   {"payload":{...},"seq":N,"type":"...","version":1}\n
// Keys sorted alphabetically (matches python json.dumps sort_keys=True)
// =============================================================
#pragma once
#include <stdint.h>

// Protocol constants
#define PROTO_VERSION    1
#define PROTO_MAX_BYTES  512

// Pi -> Coordinator message types
#define MSG_WAYPOINT       "waypoint"
#define MSG_EMERGENCY_STOP "emergency_stop"
#define MSG_SET_LED        "set_led"   // Payload: {robot_id, r, g, b, brightness}
#define MSG_PING           "ping"      // Payload: {robot_id} (1-6)

// Coordinator -> Pi message types
#define MSG_ACK            "ack"
#define MSG_ROBOT_STATUS   "robot_status"
#define MSG_SYSTEM_INFO    "system_info"
#define MSG_FAULT          "fault"

// ACK status values (checked by _wait_for_ack on Pi side)
#define ACK_REACHED    "reached"    // robot arrived at intermediate waypoint
#define ACK_COMPLETED  "completed"  // robot completed final waypoint

// ----- Parsed waypoint command (Pi -> Coordinator) -----------
typedef struct {
    uint16_t seq;           // echo back in ACK
    uint8_t  robot_id;      // 1-6
    uint8_t  move_id;       // logical game move ID (stable for one move)
    uint8_t  wp_index;      // 0-based waypoint index
    uint8_t  wp_count;      // total waypoints in path
    int16_t  x_mm;          // target X (mm), signed 16-bit
    int16_t  y_mm;          // target Y (mm), signed 16-bit
    int16_t  heading_mrad;  // heading (mrad), signed 16-bit
    uint8_t  speed;         // PWM 0-255
} WaypointCmd;

// ----- Parsed emergency-stop command -------------------------
typedef struct {
    uint16_t seq;
    char     scope[16];     // "all" or "robot_N"
} EmergencyStopCmd;

// ----- Parsed LED command (Pi -> Coordinator) ----------------
typedef struct {
    uint16_t seq;
    uint8_t  robot_id;      // 1-6
    uint8_t  r, g, b;
    uint8_t  brightness;
} LedCmd;

// ----- Parsed PING command (Pi -> Coordinator) ---------------
// robot_id = 0 : diem danh dong loat ca 6 xe (tra ve online_ids & missing_ids)
// robot_id = 1..6 : ping don le 1 xe
typedef struct {
    uint16_t seq;
    uint8_t  robot_id;      // 0..6
} PingCmd;

// ----- Generic incoming command union ------------------------
typedef enum : uint8_t {
    CMD_WAYPOINT = 0,
    CMD_EMERGENCY_STOP,
    CMD_SET_LED,
    CMD_PING,
    CMD_UNKNOWN
} CmdType;

typedef struct {
    CmdType type;
    union {
        WaypointCmd      waypoint;
        EmergencyStopCmd estop;
        LedCmd           led;
        PingCmd          ping;
    };
} PiCommand;

// ----- Outgoing response (queued for UART TX task) -----------
#define RESPONSE_BUF PROTO_MAX_BYTES
typedef struct {
    char     buf[RESPONSE_BUF]; // pre-serialised JSON + '\n'
    uint16_t len;
} PiResponse;
