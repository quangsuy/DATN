#include "cmd_handler.h"
#include "uart_pi.h"
#include "espnow_robot.h"
#include "robot_registry.h"
#include "espnow_protocol.h"
#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/event_groups.h>
#include <string.h>
#include <stdio.h>

// Shared event group: bit N-1 = robot N ACK received (robots 1-6 -> bits 0-5)
extern EventGroupHandle_t xRobotAckEvent;

// Timeout waiting for robot to reach a waypoint (ms)
#define ROBOT_ACK_TIMEOUT_MS  15000

// ─── Handle waypoint command ──────────────────────────────────
static void handle_waypoint(const WaypointCmd *wp) {
    uint8_t rid = wp->robot_id;

    // Build ESP-NOW command packet
    RobotCmdPacket pkt = {};
    pkt.cmd_type     = ROBOT_CMD_WAYPOINT;
    pkt.robot_id     = rid;
    pkt.move_id      = wp->move_id;
    pkt.wp_index     = wp->wp_index;
    pkt.wp_count     = wp->wp_count;
    pkt.x_mm         = wp->x_mm;
    pkt.y_mm         = wp->y_mm;
    pkt.heading_mrad = wp->heading_mrad;
    pkt.speed        = wp->speed;

    // Clear previous ACK bit for this robot
    EventBits_t bit = (1 << (rid - 1));
    xEventGroupClearBits(xRobotAckEvent, bit);

    // Send to robot via ESP-NOW
    bool sent = espnow_send_waypoint(&pkt, rid);
    if (!sent) {
        char msg[64];
        snprintf(msg, sizeof(msg), "espnow_send failed for robot %d", rid);
        uart_pi_send_fault(msg, rid);
        return;
    }

    Serial.printf("[CMD] WP robot=%d move=%d idx=%d/%d x=%d y=%d speed=%d\n",
                  rid, wp->move_id, wp->wp_index, wp->wp_count,
                  wp->x_mm, wp->y_mm, wp->speed);

    // Wait for robot to report REACHED or ARRIVED
    EventBits_t result = xEventGroupWaitBits(
        xRobotAckEvent,
        bit,
        pdTRUE,           // clear on exit
        pdFALSE,
        pdMS_TO_TICKS(ROBOT_ACK_TIMEOUT_MS)
    );

    if (result & bit) {
        // Robot acknowledged; determine status string
        bool is_last = (wp->wp_index == wp->wp_count - 1);
        const char *ack_status = is_last ? ACK_COMPLETED : ACK_REACHED;
        uart_pi_send_ack(wp->seq, ack_status);

        // Also push robot_status event for Dashboard
        RobotInfo *ri = robot_registry_get(rid);
        if (ri) {
            char pos[8];
            snprintf(pos, sizeof(pos), "%d", ri->last_wp_index);
            uart_pi_send_robot_status(rid,
                is_last ? "arrived" : "moving",
                pos, ri->battery_pct);
        }
    } else {
        // Timeout
        char msg[64];
        snprintf(msg, sizeof(msg), "robot %d wp %d timeout", rid, wp->wp_index);
        uart_pi_send_fault(msg, rid);
        Serial.printf("[CMD] TIMEOUT robot %d wp %d\n", rid, wp->wp_index);
    }
}

// ─── Handle emergency stop ────────────────────────────────────
static void handle_emergency_stop(const EmergencyStopCmd *es) {
    Serial.printf("[CMD] EMERGENCY STOP scope=%s\n", es->scope);
    espnow_broadcast_stop();

    // Mark all robots as error in registry (positions unknown after e-stop)
    for (int i = 1; i <= MAX_ROBOTS; i++) {
        RobotInfo *ri = robot_registry_get(i);
        if (ri) {
            if (ri->state == RSTATE_MOVING) {
                ri->state = RSTATE_ERROR;
                uart_pi_send_robot_status(i, "error", "UNKNOWN", ri->battery_pct);
            }
        }
    }

    // ACK e-stop immediately (no need to wait for robot reply)
    uart_pi_send_ack(es->seq, ACK_COMPLETED);
    uart_pi_send_fault("emergency_stop executed", -1);
}

// ─── Handle LED colour command ───────────────────────────────
static void handle_set_led(const LedCmd *lc) {
    RobotLedPacket pkt = {};
    pkt.cmd_type   = ROBOT_CMD_SET_LED;
    pkt.robot_id   = lc->robot_id;
    pkt.r          = lc->r;
    pkt.g          = lc->g;
    pkt.b          = lc->b;
    pkt.brightness = lc->brightness;
    bool sent = espnow_send_led(&pkt, lc->robot_id);
    Serial.printf("[CMD] LED robot=%d rgb=(%d,%d,%d) br=%d %s\n", lc->robot_id,
                  lc->r, lc->g, lc->b, lc->brightness, sent ? "ok" : "FAILED");
    if (sent) {
        uart_pi_send_ack(lc->seq, ACK_COMPLETED);   // khong cho robot phan hoi
    } else {
        char msg[64];
        snprintf(msg, sizeof(msg), "espnow_led failed for robot %d", lc->robot_id);
        uart_pi_send_fault(msg, lc->robot_id);
    }
}

// ─── Handle PING command (pre-flight check) ──────────────────
static void handle_ping(const PingCmd *pc) {
    uint8_t rid = pc->robot_id;
    EventBits_t bit = (1 << (rid - 1));
    xEventGroupClearBits(xRobotAckEvent, bit);
    espnow_ping(rid);
    EventBits_t result = xEventGroupWaitBits(
        xRobotAckEvent,
        bit,
        pdTRUE,
        pdFALSE,
        pdMS_TO_TICKS(400)
    );
    if (result & bit) {
        uart_pi_send_ack(pc->seq, ACK_COMPLETED);
    } else {
        uart_pi_send_ack(pc->seq, "timeout");
    }
}

// ─── Public dispatcher ────────────────────────────────────────
void cmd_handle(const PiCommand *cmd) {
    switch (cmd->type) {
        case CMD_WAYPOINT:
            handle_waypoint(&cmd->waypoint);
            break;
        case CMD_EMERGENCY_STOP:
            handle_emergency_stop(&cmd->estop);
            break;
        case CMD_SET_LED:
            handle_set_led(&cmd->led);
            break;
        case CMD_PING:
            handle_ping(&cmd->ping);
            break;
        case CMD_UNKNOWN:
        default:
            Serial.println("[CMD] Unknown command type received");
            break;
    }
}
