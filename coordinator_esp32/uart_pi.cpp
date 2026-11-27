#include "uart_pi.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <HardwareSerial.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <string.h>
#include <stdio.h>

// Declared in main sketch, shared across modules
extern QueueHandle_t xTxQueue;

static HardwareSerial PiSerial(UART_PI_PORT);

// ─── Init ──────────────────────────────────────────────────────
void uart_pi_init(void) {
    PiSerial.setRxBufferSize(PROTO_MAX_BYTES * 4);   // phai goi TRUOC begin() tren core 3.x
    PiSerial.begin(UART_PI_BAUD, SERIAL_8N1, UART_PI_RX_PIN, UART_PI_TX_PIN);
}

// ─── Read one JSON-Lines line ──────────────────────────────────
uint16_t uart_pi_readline(char *buf, uint16_t max_len, uint32_t timeout_ms) {
    uint16_t idx    = 0;
    uint32_t start  = millis();
    while (millis() - start < timeout_ms) {
        while (PiSerial.available()) {
            char c = (char)PiSerial.read();
            if (c == '\n') {
                buf[idx] = '\0';
                return idx;
            }
            if (idx < max_len - 1) {
                buf[idx++] = c;
            } else {
                // Line too long — discard remainder until newline
                while (PiSerial.available() && PiSerial.read() != '\n');
                return 0;
            }
        }
        vTaskDelay(pdMS_TO_TICKS(1));
    }
    return 0; // timeout
}

// ─── Parse incoming JSON line into PiCommand ──────────────────
bool uart_pi_parse(const char *buf, uint16_t len, PiCommand *out_cmd) {
    if (len == 0 || len >= PROTO_MAX_BYTES) return false;

    StaticJsonDocument<PROTO_MAX_BYTES> doc;
    DeserializationError err = deserializeJson(doc, buf, len);
    if (err) return false;

    // Validate envelope
    if (!doc.containsKey("version") || (int)doc["version"] != PROTO_VERSION) return false;
    if (!doc.containsKey("seq") || !doc["seq"].is<int>())                   return false;
    if (!doc.containsKey("type") || !doc["type"].is<const char*>())         return false;
    if (!doc.containsKey("payload") || !doc["payload"].is<JsonObject>())    return false;

    uint16_t    seq        = (uint16_t)(int)doc["seq"];
    const char *msg_type   = doc["type"];
    JsonObject  payload    = doc["payload"];

    // --- waypoint ---
    if (strcmp(msg_type, MSG_WAYPOINT) == 0) {
        out_cmd->type               = CMD_WAYPOINT;
        WaypointCmd &wp             = out_cmd->waypoint;
        wp.seq                      = seq;
        wp.robot_id                 = (uint8_t)(int)payload["robot_id"];
        wp.move_id                  = (uint8_t)(int)payload["move_id"];
        wp.wp_index                 = (uint8_t)(int)payload["index"];
        wp.wp_count                 = (uint8_t)(int)payload["count"];
        wp.x_mm                     = (int16_t)(int)payload["x_mm"];
        wp.y_mm                     = (int16_t)(int)payload["y_mm"];
        wp.heading_mrad             = (int16_t)(int)payload["heading_mrad"];
        wp.speed                    = (uint8_t)(int)payload["speed"];
        // Basic sanity checks (mirrors coordinator_protocol.py validation)
        if (wp.robot_id < 1 || wp.robot_id > 6)    return false;
        if (wp.wp_count == 0 || wp.wp_index >= wp.wp_count) return false;
        if (wp.speed > 255)                         return false;
        return true;
    }

    // --- emergency_stop ---
    if (strcmp(msg_type, MSG_EMERGENCY_STOP) == 0) {
        out_cmd->type = CMD_EMERGENCY_STOP;
        EmergencyStopCmd &es = out_cmd->estop;
        es.seq = seq;
        const char *scope = payload["scope"] | "all";
        strncpy(es.scope, scope, sizeof(es.scope) - 1);
        es.scope[sizeof(es.scope) - 1] = '\0';
        return true;
    }

    // --- set_led ---
    if (strcmp(msg_type, MSG_SET_LED) == 0) {
        out_cmd->type = CMD_SET_LED;
        LedCmd &lc    = out_cmd->led;
        lc.seq        = seq;
        int rid       = payload["robot_id"] | 0;
        int r         = payload["r"] | -1;
        int g         = payload["g"] | -1;
        int b         = payload["b"] | -1;
        int br        = payload["brightness"] | 200;
        if (rid < 1 || rid > 6) return false;
        if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) return false;
        if (br < 0 || br > 255) return false;
        lc.robot_id = (uint8_t)rid;
        lc.r = (uint8_t)r; lc.g = (uint8_t)g; lc.b = (uint8_t)b;
        lc.brightness = (uint8_t)br;
        return true;
    }

    // --- ping ---
    if (strcmp(msg_type, MSG_PING) == 0) {
        out_cmd->type = CMD_PING;
        PingCmd &pc   = out_cmd->ping;
        pc.seq        = seq;
        int rid       = payload.containsKey("robot_id") ? (int)payload["robot_id"] : 0;
        // rid == 0: diem danh toan bo 6 xe; rid == 1..6: ping le 1 xe
        if (rid < 0 || rid > MAX_ROBOTS) return false;
        pc.robot_id   = (uint8_t)rid;
        return true;
    }

    out_cmd->type = CMD_UNKNOWN;
    return false;
}

// ─── Enqueue pre-formatted response ──────────────────────────
bool uart_pi_enqueue_response(const PiResponse *resp) {
    if (!resp || resp->len == 0) return false;
    return xQueueSend(xTxQueue, resp, pdMS_TO_TICKS(50)) == pdTRUE;
}

// ─── Helper: build compact JSON and enqueue ──────────────────
static void _enqueue_json(StaticJsonDocument<PROTO_MAX_BYTES> &doc) {
    PiResponse resp;
    size_t n = serializeJson(doc, resp.buf, sizeof(resp.buf) - 1);
    resp.buf[n] = '\n';
    resp.len    = (uint16_t)(n + 1);
    xQueueSend(xTxQueue, &resp, pdMS_TO_TICKS(50));
}

// ─── ACK ─────────────────────────────────────────────────────
void uart_pi_send_ack(uint16_t seq, const char *status_str) {
    StaticJsonDocument<PROTO_MAX_BYTES> doc;
    doc["version"] = PROTO_VERSION;
    doc["seq"]     = seq;
    doc["type"]    = MSG_ACK;
    JsonObject payload  = doc.createNestedObject("payload");
    payload["status"]   = status_str;
    _enqueue_json(doc);
}

// ─── PING / Roster ACK (includes online_ids & missing_ids) ───
void uart_pi_send_ping_ack(uint16_t seq, const char *status_str,
                           uint8_t target_robot_id, const RosterSummary *roster) {
    StaticJsonDocument<PROTO_MAX_BYTES> doc;
    doc["version"] = PROTO_VERSION;
    doc["seq"]     = seq;
    doc["type"]    = MSG_ACK;
    JsonObject payload = doc.createNestedObject("payload");
    payload["status"]       = status_str;
    payload["robot_id"]     = target_robot_id;
    payload["total_robots"] = MAX_ROBOTS;
    if (roster) {
        payload["active_peers"] = roster->active_count;
        JsonArray online_arr = payload.createNestedArray("online_ids");
        for (uint8_t i = 0; i < roster->online_len; i++) {
            online_arr.add(roster->online_ids[i]);
        }
        JsonArray missing_arr = payload.createNestedArray("missing_ids");
        for (uint8_t i = 0; i < roster->missing_len; i++) {
            missing_arr.add(roster->missing_ids[i]);
        }
    }
    _enqueue_json(doc);
}

// ─── Robot status push ───────────────────────────────────────
void uart_pi_send_robot_status(uint8_t robot_id, const char *status_str,
                               const char *position, uint8_t battery, int8_t rssi_dbm) {
    static uint16_t s_seq = 0x8000; // use high range to differ from Pi seq
    StaticJsonDocument<PROTO_MAX_BYTES> doc;
    doc["version"] = PROTO_VERSION;
    doc["seq"]     = s_seq++;
    doc["type"]    = MSG_ROBOT_STATUS;
    JsonObject p   = doc.createNestedObject("payload");
    p["robot_id"]  = robot_id;
    p["status"]    = status_str;
    p["position"]  = position;
    p["battery"]   = battery;
    p["rssi_dbm"]  = rssi_dbm;
    _enqueue_json(doc);
}

// ─── Fault ───────────────────────────────────────────────────
void uart_pi_send_fault(const char *message, int robot_id) {
    static uint16_t s_seq = 0xC000;
    StaticJsonDocument<PROTO_MAX_BYTES> doc;
    doc["version"] = PROTO_VERSION;
    doc["seq"]     = s_seq++;
    doc["type"]    = MSG_FAULT;
    JsonObject p   = doc.createNestedObject("payload");
    p["message"]   = message;
    if (robot_id >= 1) p["robot_id"] = robot_id;
    _enqueue_json(doc);
}

// ─── System info / telemetry (with online_ids & missing_ids) ─
void uart_pi_send_system_info(const RosterSummary *roster, uint32_t free_heap) {
    static uint16_t s_seq = 0xE000;
    StaticJsonDocument<PROTO_MAX_BYTES> doc;
    doc["version"] = PROTO_VERSION;
    doc["seq"]     = s_seq++;
    doc["type"]    = MSG_SYSTEM_INFO;
    JsonObject p         = doc.createNestedObject("payload");
    p["active_peers"]    = roster ? roster->active_count : 0;
    p["total_robots"]    = MAX_ROBOTS;
    p["free_heap_bytes"] = free_heap;
    p["uptime_s"]        = (uint32_t)(millis() / 1000);
    if (roster) {
        JsonArray online_arr = p.createNestedArray("online_ids");
        for (uint8_t i = 0; i < roster->online_len; i++) {
            online_arr.add(roster->online_ids[i]);
        }
        JsonArray missing_arr = p.createNestedArray("missing_ids");
        for (uint8_t i = 0; i < roster->missing_len; i++) {
            missing_arr.add(roster->missing_ids[i]);
        }
    }
    _enqueue_json(doc);
}

// ─── Low-level TX (called by uart_tx_task) ───────────────────
// Exposed as global so the task can call it directly
void uart_pi_write_response(const PiResponse *resp) {
    PiSerial.write((const uint8_t*)resp->buf, resp->len);
}
