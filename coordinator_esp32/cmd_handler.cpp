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

    // Clear previous ACK and ERR bits for this robot
    EventBits_t ack_bit = ROBOT_ACK_BIT(rid);
    EventBits_t err_bit = ROBOT_ERR_BIT(rid);
    xEventGroupClearBits(xRobotAckEvent, ack_bit | err_bit);

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

    // Wait for robot to report REACHED/ARRIVED (ack_bit) OR immediate ERROR (err_bit)
    EventBits_t result = xEventGroupWaitBits(
        xRobotAckEvent,
        ack_bit | err_bit,
        pdTRUE,           // clear on exit
        pdFALSE,          // unblock on EITHER ack_bit OR err_bit
        pdMS_TO_TICKS(ROBOT_ACK_TIMEOUT_MS)
    );

    if (result & err_bit) {
        RobotInfo *ri = robot_registry_get(rid);
        uint8_t err_code = ri ? ri->last_error_code : 0;
        char msg[64];
        snprintf(msg, sizeof(msg), "robot_%d_waypoint_%d_error_code_%u",
                 rid, wp->wp_index, (unsigned)err_code);
        uart_pi_send_fault(msg, rid);
        uart_pi_send_ack(wp->seq, "error");
        Serial.printf("[CMD] ERROR robot %d wp %d code=%u\n", rid, wp->wp_index, (unsigned)err_code);
        return;
    }

    if (result & ack_bit) {
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
                pos, ri->battery_pct, ri->rssi_dbm);
        }
    } else {
        // Timeout -> mark robot offline if unreachable
        char msg[64];
        snprintf(msg, sizeof(msg), "robot %d wp %d timeout", rid, wp->wp_index);
        uart_pi_send_fault(msg, rid);
        uart_pi_send_ack(wp->seq, "timeout");
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

// ─── Handle PING command (single robot 1..6 OR full roster 0) ─
static void handle_ping(const PingCmd *pc) {
    uint8_t rid = pc->robot_id;

    // rid == 0: Diem danh dong loat ca 6 xe trong 1 cua so 400ms
    if (rid == 0) {
        xEventGroupClearBits(xRobotAckEvent, ROBOT_ALL_ACK_BITS);
        for (uint8_t i = 1; i <= MAX_ROBOTS; i++) {
            espnow_ping(i);
        }
        EventBits_t bits = xEventGroupWaitBits(
            xRobotAckEvent,
            ROBOT_ALL_ACK_BITS,
            pdTRUE,
            pdTRUE,           // cho tat ca 6 bit hoac het 400ms
            pdMS_TO_TICKS(400)
        );
        // Cap nhat trang thai offline cho xe khong phan hoi PONG trong dot diem danh
        for (uint8_t i = 1; i <= MAX_ROBOTS; i++) {
            if (!(bits & ROBOT_ACK_BIT(i))) {
                RobotInfo *ri = robot_registry_get(i);
                if (ri && (uint32_t)(millis() - ri->last_seen_ms) > 1500) {
                    robot_registry_mark_offline(i);
                }
            }
        }
        RosterSummary roster;
        robot_registry_get_roster(&roster);
        Serial.printf("[PING] Roster roll-call: %u/%u online, %u missing\n",
                      roster.active_count, (unsigned)MAX_ROBOTS, roster.missing_len);
        uart_pi_send_ping_ack(pc->seq, ACK_COMPLETED, 0, &roster);
        return;
    }

    // rid == 1..6: Ping don le 1 xe
    EventBits_t bit = ROBOT_ACK_BIT(rid);
    xEventGroupClearBits(xRobotAckEvent, bit);
    espnow_ping(rid);
    EventBits_t result = xEventGroupWaitBits(
        xRobotAckEvent,
        bit,
        pdTRUE,
        pdFALSE,
        pdMS_TO_TICKS(400)
    );
    if (!(result & bit)) {
        robot_registry_mark_offline(rid);
    }
    RosterSummary roster;
    robot_registry_get_roster(&roster);
    if (result & bit) {
        uart_pi_send_ping_ack(pc->seq, ACK_COMPLETED, rid, &roster);
    } else {
        uart_pi_send_ping_ack(pc->seq, "timeout", rid, &roster);
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
