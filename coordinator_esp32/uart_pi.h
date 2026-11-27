// =============================================================
// uart_pi.h  -  UART2 bridge between Coordinator and Pi
// UART2: GPIO16 (RX from Pi TX), GPIO17 (TX to Pi RX)
// Baud: 115200, 8N1 (matches open_serial_transport default)
// =============================================================
#pragma once
#include <stdint.h>
#include <stdbool.h>
#include "protocol.h"
#include "robot_registry.h"

// Chan UART toi Pi (qua USB-TTL).
// ESP32-CAM: GPIO16/17 la chan PSRAM -> KHONG dung. Dung GPIO13 (RX) / GPIO14 (TX): khong phai
// chan strapping, khong dung boi camera/PSRAM. Dau day: TX cua USB-TTL -> GPIO13, RX -> GPIO14, GND chung.
// DevKit 38 chan thuong: co the dung 16/17 (bo comment ben duoi).
#define UART_PI_PORT    2       // HardwareSerial port number
#define UART_PI_RX_PIN  13
#define UART_PI_TX_PIN  14
// #define UART_PI_RX_PIN  16
// #define UART_PI_TX_PIN  17
#define UART_PI_BAUD    115200

// Initialise UART2
void uart_pi_init(void);

// Read one newline-terminated line from UART2.
// Returns number of bytes written to buf (excluding '\n'), or 0 on timeout.
// Call from uart_rx_task only.
uint16_t uart_pi_readline(char *buf, uint16_t max_len, uint32_t timeout_ms);

// Parse a raw JSON line into a PiCommand.
// Returns true on success, false if malformed or version mismatch.
bool uart_pi_parse(const char *buf, uint16_t len, PiCommand *out_cmd);

// Enqueue a pre-formatted PiResponse for transmission by uart_tx_task.
bool uart_pi_enqueue_response(const PiResponse *resp);

// Low-level write of one pre-formatted response to UART2 (called by task_uart_tx).
void uart_pi_write_response(const PiResponse *resp);

// Build and enqueue an ACK response for a given sequence number.
void uart_pi_send_ack(uint16_t seq, const char *status_str);

// Build and enqueue an ACK response containing full roster details (online_ids & missing_ids).
void uart_pi_send_ping_ack(uint16_t seq, const char *status_str,
                           uint8_t target_robot_id, const RosterSummary *roster);

// Build and enqueue a robot_status event to Pi (with battery & RSSI).
void uart_pi_send_robot_status(uint8_t robot_id, const char *status_str,
                               const char *position, uint8_t battery, int8_t rssi_dbm = 0);

// Build and enqueue a fault event to Pi.
void uart_pi_send_fault(const char *message, int robot_id);  // robot_id=-1 if system

// Build and enqueue a system_info / telemetry event to Pi (with online_ids & missing_ids).
void uart_pi_send_system_info(const RosterSummary *roster, uint32_t free_heap);
