// =============================================================
// espnow_robot.h  -  ESP-NOW link to 6 autonomous robots
// Coordinator is WiFi STA mode; all robots must be in same channel.
// =============================================================
#pragma once
#include <stdint.h>
#include <stdbool.h>
#include "espnow_protocol.h"

// Initialise WiFi (STA mode) + ESP-NOW + register all robot peers.
void espnow_robot_init(void);

// Send a waypoint command to one robot.
// Returns true if esp_now_send() was accepted (not confirmed delivered).
bool espnow_send_waypoint(const RobotCmdPacket *pkt, uint8_t robot_id);

// Send LED colour command (ROBOT_CMD_SET_LED) to one robot.
bool espnow_send_led(const RobotLedPacket *pkt, uint8_t robot_id);

// Broadcast emergency-stop to ALL robots simultaneously.
void espnow_broadcast_stop(void);

// Ping one robot (liveness check).
void espnow_ping(uint8_t robot_id);

// Called internally by the ESP-NOW recv callback; pushes to xRobotRxQueue.
// Do NOT call from user code.
void _espnow_on_recv_internal(const uint8_t *mac, const uint8_t *data, int len);
