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
static void handle_rx(const uint8_t *mac_addr, const uint8_t *data, int data_len) {
    if (!mac_addr || !data) return;
    if (data_len != (int)sizeof(RobotStatusPacket)) {
        Serial.printf("[ESPNOW_RX] Unexpected packet len=%d expected=%u\n",
                      data_len, (unsigned)sizeof(RobotStatusPacket));
        return;
    }
    RobotStatusPacket pkt;
    memcpy(&pkt, data, sizeof(pkt));
    if (pkt.robot_id < 1 || pkt.robot_id > MAX_ROBOTS) {
        Serial.printf("[ESPNOW_RX] Invalid robot_id=%u\n", pkt.robot_id);
        return;
    }
    // Doi chieu MAC nguon voi bang ROBOT_MACS de loai bo goi tin nhieu hoac sai ID
    const uint8_t *expected_mac = ROBOT_MACS[pkt.robot_id - 1];
    if (memcmp(mac_addr, expected_mac, 6) != 0) {
        Serial.printf("[ESPNOW_RX] MAC mismatch for robot %u: got %02X:%02X:%02X:%02X:%02X:%02X\n",
                      pkt.robot_id,
                      mac_addr[0], mac_addr[1], mac_addr[2],
                      mac_addr[3], mac_addr[4], mac_addr[5]);
        return;
    }
    // Callback chay trong WiFi task (khong phai ISR) -> dung xQueueSend khong block
    xQueueSend(xRobotRxQueue, &pkt, 0);
}

static void handle_send_status(esp_now_send_status_t status) {
    if (status != ESP_NOW_SEND_SUCCESS) {
        Serial.println("[ESPNOW_TX] Radio delivery FAILED (kiem tra nguon xe / kenh Wi-Fi / MAC)");
    }
}

// Chu ky callback khac nhau giua ESP32 Arduino core 2.x va 3.x
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
static void on_espnow_recv(const esp_now_recv_info_t *info, const uint8_t *data, int data_len) {
    handle_rx(info ? info->src_addr : nullptr, data, data_len);
}
static void on_espnow_sent(const wifi_tx_info_t *info, esp_now_send_status_t status) {
    (void)info;
    handle_send_status(status);
}
#else
static void on_espnow_recv(const uint8_t *mac_addr, const uint8_t *data, int data_len) {
    handle_rx(mac_addr, data, data_len);
}
static void on_espnow_sent(const uint8_t *mac_addr, esp_now_send_status_t status) {
    (void)mac_addr;
    handle_send_status(status);
}
#endif

// ─── Init ──────────────────────────────────────────────────────
void espnow_robot_init(void) {
    // WiFi must be STA mode for ESP-NOW to work on the standard channel
    if (!WiFi.mode(WIFI_STA)) {
        Serial.println("[ESPNOW] ERROR: could not enable Wi-Fi STA mode");
        return;
    }
    WiFi.disconnect();

    // QUAN TRONG: Gan cung MAC Coordinator (38:18:2B:B1:BC:E4) cho giao dien STA
    // de ca 6 xe (da dang ky COORDINATOR_MAC lam peer duy nhat) gui RobotStatusPacket ve dung dich!
    esp_err_t mac_err = esp_wifi_set_mac(WIFI_IF_STA, COORDINATOR_MAC);
    if (mac_err != ESP_OK) {
        Serial.printf("[ESPNOW] ERROR: esp_wifi_set_mac failed: %s\n", esp_err_to_name(mac_err));
    }

    uint8_t sta_mac[6] = {0};
    esp_wifi_get_mac(WIFI_IF_STA, sta_mac);
    bool mac_ok = (memcmp(sta_mac, COORDINATOR_MAC, 6) == 0);
    Serial.printf("[ESPNOW] Coordinator STA MAC: %02X:%02X:%02X:%02X:%02X:%02X (%s), channel %d\n",
                  sta_mac[0], sta_mac[1], sta_mac[2], sta_mac[3], sta_mac[4], sta_mac[5],
                  mac_ok ? "MATCHED" : "MISMATCH!", ESPNOW_CHANNEL);

    // Khoa cung kenh ESP-NOW (khong ket noi router) de khop voi 6 xe
    esp_wifi_set_promiscuous(true);
    esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);
    esp_wifi_set_promiscuous(false);

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
