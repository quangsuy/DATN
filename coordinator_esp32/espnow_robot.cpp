#include "espnow_robot.h"
#include "robot_registry.h"
#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <string.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

// Shared queues (declared in main sketch)
extern QueueHandle_t xRobotRxQueue;

// ─── ESP-NOW receive callback (runs in WiFi task context) ─────
static void on_espnow_recv(const uint8_t *mac_addr, const uint8_t *data, int data_len) {
    if (data_len != sizeof(RobotStatusPacket)) return; // ignore malformed frames
    RobotStatusPacket pkt;
    memcpy(&pkt, data, sizeof(pkt));
    // Validate robot_id before forwarding
    if (pkt.robot_id < 1 || pkt.robot_id > MAX_ROBOTS) return;
    // Push to queue from ISR-like context; use FromISR variant for safety
    BaseType_t woken = pdFALSE;
    xQueueSendFromISR(xRobotRxQueue, &pkt, &woken);
    if (woken) portYIELD_FROM_ISR();
}

// ─── ESP-NOW send callback (optional, for TX diagnostics) ─────
static void on_espnow_sent(const uint8_t *mac_addr, esp_now_send_status_t status) {
    // Could log TX failures here; for MVP we rely on the ACK timeout on Pi side
    (void)mac_addr;
    (void)status;
}

// ─── Init ──────────────────────────────────────────────────────
void espnow_robot_init(void) {
    // WiFi must be STA mode for ESP-NOW to work on the standard channel
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();

    if (esp_now_init() != ESP_OK) {
        Serial.println("[ESPNOW] Init FAILED");
        return;
    }

    esp_now_register_recv_cb(on_espnow_recv);
    esp_now_register_send_cb(on_espnow_sent);

    // Register each robot as a peer (broadcast channel = 0, no encryption)
    esp_now_peer_info_t peer = {};
    peer.channel   = 0;       // 0 = auto-detect current channel
    peer.encrypt   = false;
    for (int i = 0; i < MAX_ROBOTS; i++) {
        memcpy(peer.peer_addr, ROBOT_MACS[i], 6);
        esp_err_t ret = esp_now_add_peer(&peer);
        if (ret != ESP_OK && ret != ESP_ERR_ESPNOW_EXIST) {
            Serial.printf("[ESPNOW] Failed to add peer robot %d (err %d)\n", i+1, ret);
        }
    }
    Serial.println("[ESPNOW] Initialised, 6 peers registered");
}

// ─── Send waypoint to one robot ───────────────────────────────
bool espnow_send_waypoint(const RobotCmdPacket *pkt, uint8_t robot_id) {
    if (robot_id < 1 || robot_id > MAX_ROBOTS) return false;
    const uint8_t *mac = ROBOT_MACS[robot_id - 1];
    esp_err_t ret = esp_now_send(mac, (const uint8_t*)pkt, sizeof(RobotCmdPacket));
    return ret == ESP_OK;
}

// ─── Emergency stop broadcast ─────────────────────────────────
void espnow_broadcast_stop(void) {
    RobotCmdPacket pkt = {};
    pkt.cmd_type = ROBOT_CMD_EMERGENCY_STOP;
    pkt.speed    = 0;
    for (int i = 0; i < MAX_ROBOTS; i++) {
        pkt.robot_id = i + 1;
        esp_now_send(ROBOT_MACS[i], (const uint8_t*)&pkt, sizeof(pkt));
    }
}

// ─── Ping one robot ───────────────────────────────────────────
void espnow_ping(uint8_t robot_id) {
    if (robot_id < 1 || robot_id > MAX_ROBOTS) return;
    RobotCmdPacket pkt = {};
    pkt.cmd_type = ROBOT_CMD_PING;
    pkt.robot_id = robot_id;
    esp_now_send(ROBOT_MACS[robot_id - 1], (const uint8_t*)&pkt, sizeof(pkt));
}
