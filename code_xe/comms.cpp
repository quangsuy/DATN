#include "comms.h"
#include "config.h"
#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <string.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

static QueueHandle_t s_rxQueue = NULL;

static void handle_rx(const uint8_t *data, int len) {
    // Moi goi Coordinator->Robot deu 18 byte
    if (len != (int)sizeof(RobotCmdPacket)) return;
    // Chi nhan lenh gui cho xe nay (robot_id o byte 1 cua ca CmdPacket va LedPacket)
    if (data[1] != ROBOT_ID) return;
    RxFrame f;
    memcpy(f.raw, data, sizeof(f.raw));
    xQueueSend(s_rxQueue, &f, 0);   // callback chay trong WiFi task
}

#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
static void on_recv(const esp_now_recv_info_t *info, const uint8_t *data, int len) { (void)info; handle_rx(data, len); }
static void on_sent(const wifi_tx_info_t *info, esp_now_send_status_t st) { (void)info; (void)st; }
#else
static void on_recv(const uint8_t *mac, const uint8_t *data, int len) { (void)mac; handle_rx(data, len); }
static void on_sent(const uint8_t *mac, esp_now_send_status_t st) { (void)mac; (void)st; }
#endif

void comms_init(void) {
    s_rxQueue = xQueueCreate(CMD_QUEUE_LEN, sizeof(RxFrame));
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    esp_wifi_set_promiscuous(true);
    esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);
    esp_wifi_set_promiscuous(false);
    Serial.printf("[ESPNOW] Xe %d MAC=%s kenh=%d\n", ROBOT_ID, WiFi.macAddress().c_str(), ESPNOW_CHANNEL);

    if (esp_now_init() != ESP_OK) { Serial.println("[ESPNOW] init FAILED"); return; }
    esp_now_register_recv_cb(on_recv);
    esp_now_register_send_cb(on_sent);

    esp_now_peer_info_t peer = {};
    memcpy(peer.peer_addr, COORDINATOR_MAC, 6);
    peer.channel = ESPNOW_CHANNEL;
    peer.encrypt = false;
    esp_err_t r = esp_now_add_peer(&peer);
    if (r != ESP_OK && r != ESP_ERR_ESPNOW_EXIST) Serial.printf("[ESPNOW] add peer loi %d\n", r);
}

bool comms_poll(RxFrame *out) {
    return xQueueReceive(s_rxQueue, out, 0) == pdTRUE;
}

void comms_flush(void) { xQueueReset(s_rxQueue); }

bool comms_send_status(uint8_t status, uint8_t move_id, uint8_t wp_index, uint8_t error_code) {
    RobotStatusPacket p = {};
    p.robot_id    = ROBOT_ID;
    p.status      = status;
    p.move_id     = move_id;
    p.wp_index    = wp_index;
    p.battery_pct = 0;     // xe khong do pin
    p.rssi_dbm    = 0;
    p.error_code  = error_code;
    return esp_now_send(COORDINATOR_MAC, (const uint8_t *)&p, sizeof(p)) == ESP_OK;
}
