// =============================================================
// coordinator_esp32.ino
// Three Men's Morris  -  ESP32 Coordinator Firmware
// Board: ESP32 38-pin DevKit (ESP32-WROOM-32)
// =============================================================
// Architecture (FreeRTOS, dual-core):
//
//   Core 0                          Core 1
//   -------                         -------
//   task_uart_rx  (prio 4)          task_cmd_handler (prio 3)
//   task_uart_tx  (prio 5)          task_robot_status (prio 2)
//   task_heartbeat(prio 1)
//
// Queues / sync primitives:
//   xCmdQueue      PiCommand    (uart_rx -> cmd_handler)
//   xTxQueue       PiResponse   (any task -> uart_tx)
//   xRobotRxQueue  RobotStatusPacket (ESP-NOW cb -> robot_status)
//   xRobotAckEvent EventGroup   (robot_status -> cmd_handler)
//
// Pin assignments (ESP32 38-pin DevKit):
//   GPIO16 = UART2 RX  (connect to Pi TX)
//   GPIO17 = UART2 TX  (connect to Pi RX)
//   GPIO2  = Onboard LED (status)
//   GND    = Common ground with Pi and robots
// =============================================================

#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/queue.h>
#include <freertos/event_groups.h>

#include "protocol.h"
#include "espnow_protocol.h"
#include "robot_registry.h"
#include "uart_pi.h"
#include "espnow_robot.h"
#include "cmd_handler.h"

// ─── Shared RTOS primitives ───────────────────────────────────
QueueHandle_t     xCmdQueue;       // PiCommand
QueueHandle_t     xTxQueue;        // PiResponse
QueueHandle_t     xRobotRxQueue;   // RobotStatusPacket
EventGroupHandle_t xRobotAckEvent; // bits 0-5 = robots 1-6

// ─── Pin defines ─────────────────────────────────────────────
#define PIN_LED   2

// ─── Heartbeat interval ──────────────────────────────────────
#define HEARTBEAT_INTERVAL_MS 5000

// ─── Task stacks (words, not bytes) ──────────────────────────
#define STACK_UART_RX     4096
#define STACK_UART_TX     2048
#define STACK_CMD_HANDLER 6144
#define STACK_ROBOT_STATUS 3072
#define STACK_HEARTBEAT   2048

// =============================================================
// Task: uart_rx_task
// Reads JSON Lines from Pi on UART2.
// Parses and pushes valid PiCommand to xCmdQueue.
// Runs on Core 0 (same core as WiFi to avoid contention).
// =============================================================
static void task_uart_rx(void *param) {
    char linebuf[PROTO_MAX_BYTES];
    PiCommand cmd;
    for (;;) {
        uint16_t n = uart_pi_readline(linebuf, sizeof(linebuf), 100);
        if (n == 0) continue;

        Serial.printf("[UART_RX] RAW: %.*s\n", n, linebuf);

        bool ok = uart_pi_parse(linebuf, n, &cmd);
        if (!ok) {
            Serial.println("[UART_RX] Parse error - discarding line");
            uart_pi_send_fault("malformed_packet", -1);
            continue;
        }

        // Block max 200ms if cmd_handler is busy; fault if overloaded
        if (xQueueSend(xCmdQueue, &cmd, pdMS_TO_TICKS(200)) != pdTRUE) {
            Serial.println("[UART_RX] xCmdQueue full - dropping command");
            uart_pi_send_fault("cmd_queue_full", -1);
        }
    }
}

// =============================================================
// Task: uart_tx_task
// Dequeues PiResponse and writes to UART2.
// Highest priority to ensure Pi doesn't hit ACK timeout.
// =============================================================
static void task_uart_tx(void *param) {
    PiResponse resp;
    for (;;) {
        if (xQueueReceive(xTxQueue, &resp, portMAX_DELAY) == pdTRUE) {
            uart_pi_write_response(&resp);
        }
    }
}

// =============================================================
// Task: cmd_handler_task
// Processes one PiCommand at a time (serialised by queue).
// Calls into cmd_handle() which blocks until robot ACK/timeout.
// =============================================================
static void task_cmd_handler(void *param) {
    PiCommand cmd;
    for (;;) {
        if (xQueueReceive(xCmdQueue, &cmd, portMAX_DELAY) == pdTRUE) {
            cmd_handle(&cmd);
        }
    }
}

// =============================================================
// Task: robot_status_task
// Consumes RobotStatusPacket from xRobotRxQueue.
// Updates registry and signals xRobotAckEvent for cmd_handler.
// Also pushes robot_status events to Pi.
// =============================================================
static void task_robot_status(void *param) {
    RobotStatusPacket pkt;
    for (;;) {
        if (xQueueReceive(xRobotRxQueue, &pkt, portMAX_DELAY) != pdTRUE) continue;

        // Update registry
        robot_registry_update(&pkt);
        RobotInfo *ri = robot_registry_get(pkt.robot_id);
        if (!ri) continue;

        Serial.printf("[ROBOT] id=%d status=%d move=%d wp=%d batt=%d%%\n",
                      pkt.robot_id, pkt.status,
                      pkt.move_id, pkt.wp_index, pkt.battery_pct);

        // Signal ACK event so cmd_handler can unblock
        if (pkt.status == ROBOT_STATUS_REACHED ||
            pkt.status == ROBOT_STATUS_ARRIVED) {
            EventBits_t bit = (1 << (pkt.robot_id - 1));
            xEventGroupSetBits(xRobotAckEvent, bit);
        }

        // Push robot_status to Pi for Dashboard display
        const char *state_str = robot_state_str(ri->state);
        char pos[8];
        snprintf(pos, sizeof(pos), "%d", pkt.wp_index);

        if (pkt.status == ROBOT_STATUS_ERROR) {
            char msg[64];
            snprintf(msg, sizeof(msg), "robot_%d_error_code_%d",
                     pkt.robot_id, pkt.error_code);
            uart_pi_send_fault(msg, pkt.robot_id);
        } else {
            uart_pi_send_robot_status(pkt.robot_id, state_str, pos,
                                      pkt.battery_pct);
        }
    }
}

// =============================================================
// Task: heartbeat_task
// Sends system telemetry to Pi every HEARTBEAT_INTERVAL_MS.
// Pings any robot that has not been heard from recently.
// =============================================================
static void task_heartbeat(void *param) {
    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(HEARTBEAT_INTERVAL_MS));

        // Count active (non-offline) robots
        uint8_t active = 0;
        uint32_t now   = (uint32_t)millis();
        for (int i = 1; i <= MAX_ROBOTS; i++) {
            RobotInfo *ri = robot_registry_get(i);
            if (!ri) continue;
            if (ri->state != RSTATE_OFFLINE) active++;
            // Ping silent robots (no status in last 10 s)
            if (now - ri->last_seen_ms > 10000 && ri->state != RSTATE_OFFLINE) {
                espnow_ping(i);
            }
        }

        uart_pi_send_system_info(active, esp_get_free_heap_size());
        digitalWrite(PIN_LED, !digitalRead(PIN_LED)); // heartbeat blink
    }
}

// =============================================================
// setup()
// =============================================================
void setup() {
    Serial.begin(115200);
    pinMode(PIN_LED, OUTPUT);
    digitalWrite(PIN_LED, HIGH);

    Serial.println("\n[COORDINATOR] Starting Three Men's Morris coordinator...");

    // Create shared RTOS primitives
    xCmdQueue      = xQueueCreate(8,  sizeof(PiCommand));
    xTxQueue       = xQueueCreate(32, sizeof(PiResponse));
    xRobotRxQueue  = xQueueCreate(32, sizeof(RobotStatusPacket));
    xRobotAckEvent = xEventGroupCreate();

    if (!xCmdQueue || !xTxQueue || !xRobotRxQueue || !xRobotAckEvent) {
        Serial.println("[COORDINATOR] FATAL: failed to create RTOS primitives");
        for(;;) vTaskDelay(1000);
    }

    // Subsystem initialisation
    robot_registry_init();
    uart_pi_init();
    espnow_robot_init();   // also inits WiFi STA

    // Spawn tasks
    xTaskCreatePinnedToCore(task_uart_rx,     "uart_rx",    STACK_UART_RX,
                            NULL, 4, NULL, 0);
    xTaskCreatePinnedToCore(task_uart_tx,     "uart_tx",    STACK_UART_TX,
                            NULL, 5, NULL, 0);
    xTaskCreatePinnedToCore(task_cmd_handler, "cmd_hdlr",   STACK_CMD_HANDLER,
                            NULL, 3, NULL, 1);
    xTaskCreatePinnedToCore(task_robot_status,"robot_stat", STACK_ROBOT_STATUS,
                            NULL, 2, NULL, 1);
    xTaskCreatePinnedToCore(task_heartbeat,   "heartbeat",  STACK_HEARTBEAT,
                            NULL, 1, NULL, 0);

    Serial.println("[COORDINATOR] All tasks started. Listening on UART2...");
    digitalWrite(PIN_LED, LOW);
}

// =============================================================
// loop() - idle; all work done in tasks
// =============================================================
void loop() {
    vTaskDelay(pdMS_TO_TICKS(1000));
}
