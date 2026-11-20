#include "espnow_robot.h"
#include "robot_registry.h"
#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <esp_mac.h>
#include <string.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

// Shared queues (declared in main sketch)
extern QueueHandle_t xRobotRxQueue;

// ─── ESP-NOW receive callback (runs in WiFi task context) ─────
static void handle_rx(const uint8_t *data, int data_len) {
    if (data_len != sizeof(RobotStatusPacket)) return; // ignore malformed frames
    RobotStatusPacket pkt;
    memcpy(&pkt, data, sizeof(pkt));
    if (pkt.robot_id < 1 || pkt.robot_id > MAX_ROBOTS) return;
    // Callback chay trong WiFi task (khong phai ISR) -> dung xQueueSend khong block
    xQueueSend(xRobotRxQueue, &pkt, 0);
}

// Chu ky callback khac nhau giua ESP32 Arduino core 2.x va 3.x
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
static void on_espnow_recv(const esp_now_recv_info_t *info, const uint8_t *data, int data_len) {
    (void)info;
    handle_rx(data, data_len);
}
static void on_espnow_sent(const wifi_tx_info_t *info, esp_now_send_status_t status) {
    (void)info; (void)status;   // MVP: dua vao ACK timeout phia Pi
}
#else
static void on_espnow_recv(const uint8_t *mac_addr, const uint8_t *data, int data_len) {
    (void)mac_addr;
    handle_rx(data, data_len);
}
static void on_espnow_sent(const uint8_t *mac_addr, esp_now_send_status_t status) {
    (void)mac_addr; (void)status;
}
#endif

// ─── Init ──────────────────────────────────────────────────────
void espnow_robot_init(void) {
    // WiFi must be STA mode for ESP-NOW to work on the standard channel
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    // Khoa cung kenh ESP-NOW (khong ket noi router) de khop voi 6 xe
    esp_wifi_set_promiscuous(true);
    esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);
    esp_wifi_set_promiscuous(false);
    uint8_t self_mac[6] = {0};
    esp_read_mac(self_mac, ESP_MAC_WIFI_STA);
    Serial.printf("[ESPNOW] Coordinator MAC: %02X:%02X:%02X:%02X:%02X:%02X, channel %d\n",
                  self_mac[0], self_mac[1], self_mac[2], self_mac[3], self_mac[4], self_mac[5],
                  ESPNOW_CHANNEL);

    if (esp_now_init() != ESP_OK) {
        Serial.println("[ESPNOW] Init FAILED");
        return;
    }

    esp_now_register_recv_cb(on_espnow_recv);
    esp_now_register_send_cb(on_espnow_sent);

    // Register each robot as a peer (kenh co dinh, khong ma hoa)
    esp_now_peer_info_t peer = {};
    peer.channel   = ESPNOW_CHANNEL;  // phai trung kenh da khoa o tren
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

// ─── Send LED colour to one robot ─────────────────────────────
bool espnow_send_led(const RobotLedPacket *pkt, uint8_t robot_id) {
    if (robot_id < 1 || robot_id > MAX_ROBOTS) return false;
    return esp_now_send(ROBOT_MACS[robot_id - 1], (const uint8_t*)pkt, sizeof(RobotLedPacket)) == ESP_OK;
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
