#include "robot_registry.h"
#include <Arduino.h>
#include <string.h>

static RobotInfo g_robots[MAX_ROBOTS];
static portMUX_TYPE g_mux = portMUX_INITIALIZER_UNLOCKED;

void robot_registry_init(void) {
    for (int i = 0; i < MAX_ROBOTS; i++) {
        g_robots[i].robot_id     = i + 1;
        g_robots[i].team         = (i < 3) ? 1 : 2;
        g_robots[i].state        = RSTATE_OFFLINE;
        g_robots[i].battery_pct  = 0;
        g_robots[i].rssi_dbm     = 0;
        g_robots[i].last_move_id = 0;
        g_robots[i].last_wp_index = 0;
        g_robots[i].last_seen_ms = 0;
    }
}

RobotInfo* robot_registry_get(uint8_t robot_id) {
    if (robot_id < 1 || robot_id > MAX_ROBOTS) return NULL;
    return &g_robots[robot_id - 1];
}

void robot_registry_update(const RobotStatusPacket *pkt) {
    if (!pkt || pkt->robot_id < 1 || pkt->robot_id > MAX_ROBOTS) return;
    portENTER_CRITICAL(&g_mux);
    RobotInfo *r = &g_robots[pkt->robot_id - 1];
    r->battery_pct   = pkt->battery_pct;
    r->rssi_dbm      = pkt->rssi_dbm;
    r->last_move_id  = pkt->move_id;
    r->last_wp_index = pkt->wp_index;
    r->last_seen_ms  = (uint32_t)millis();
    switch ((RobotStatusCode)pkt->status) {
        case ROBOT_STATUS_IDLE:    r->state = RSTATE_IDLE;    break;
        case ROBOT_STATUS_MOVING:  r->state = RSTATE_MOVING;  break;
        case ROBOT_STATUS_REACHED:
        case ROBOT_STATUS_ARRIVED: r->state = RSTATE_ARRIVED; break;
        case ROBOT_STATUS_ERROR:   r->state = RSTATE_ERROR;   break;
        case ROBOT_STATUS_PONG:
            if (r->state == RSTATE_OFFLINE) r->state = RSTATE_IDLE;
            break;
        default:                   break;
    }
    portEXIT_CRITICAL(&g_mux);
}

const char* robot_state_str(RobotState s) {
    switch (s) {
        case RSTATE_IDLE:    return "idle";
        case RSTATE_MOVING:  return "moving";
        case RSTATE_ARRIVED: return "arrived";
        case RSTATE_ERROR:   return "error";
        case RSTATE_OFFLINE: return "offline";
        default:             return "unknown";
    }
}
