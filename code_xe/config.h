// =============================================================
// config.h - Cau hinh phan cung + thong so xe (ESP32-WROOM-32D)
// Chan GPIO lay tu schematic "Sheet2 (1).SchDoc".
// *** MOI XE CHI DOI ROBOT_ID (1..6) truoc khi nap ***
// =============================================================
#pragma once
#include <stdint.h>

// ----- Nhan dang -----------------------------------------------
#define ROBOT_ID        1      // <<< DOI THEO TUNG XE: xe N <-> marker ArUco ID N
#define ESPNOW_CHANNEL  1      // phai trung Coordinator

// MAC Coordinator (ESP32-CAM) - peer duy nhat cua xe
static const uint8_t COORDINATOR_MAC[6] = {0x38, 0x18, 0x2B, 0xB1, 0xBC, 0xE4};

// ----- Chan GPIO (theo schematic) --------------------------------
#define PIN_A_IN1      33      // Dong co A (driver kieu DRV8833: PWM tren IN1/IN2)
#define PIN_A_IN2      25
#define PIN_B_IN1      26      // Dong co B
#define PIN_B_IN2      27
#define PIN_DRV_EEP    15      // nSLEEP/enable driver: HIGH = chay
#define PIN_ENC_A_A    16      // Encoder dong co A: kenh A (C1A)
#define PIN_ENC_A_B    18      //                    kenh B (C1B)
#define PIN_ENC_B_A    17      // Encoder dong co B: kenh A (C2A)
#define PIN_ENC_B_B    19      //                    kenh B (C2B)
#define PIN_NEOPIXEL   23      // 5 LED WS2812B
#define PIN_I2C_SDA    21      // MPU6050
#define PIN_I2C_SCL    22
#define NEO_COUNT      5

// ----- Hinh hoc / encoder (HIEU CHINH THUC TE) ------------------
#define WHEEL_RADIUS_MM    30.0f   // constants.py cua du an
#define WHEEL_BASE_MM      100.0f
#define ENC_TICKS_PER_REV  1000.0f // <<< so xung (x2 tren kenh A) / 1 vong banh: DO VA SUA
// Quy uoc: A = banh TRAI, B = banh PHAI (doi neu lap nguoc)
#define MOTOR_A_IS_LEFT    1
// Doi dau neu banh quay "lui" khi lenh tien (motor) / encoder dem am khi tien
#define MOTOR_A_INVERT     0
#define MOTOR_B_INVERT     0
#define ENC_A_INVERT       0
#define ENC_B_INVERT       0

// ----- Huong ban dau khi bat nguon -------------------------------
// Dat xe trong bai do, DAU XE HUONG VAO BAN CO. Khung ban co: x sang phai, y xuong,
// goc 0 = +x. Bai trai (xe 1-3) huong +x (0); bai phai (xe 4-6) huong -x (pi).
#define INITIAL_HEADING_RAD ((ROBOT_ID <= 3) ? 0.0f : 3.14159265f)

// ----- Dieu khien chuyen dong -----------------------------------
#define PWM_FREQ_HZ        20000
#define PWM_MAX            255
#define MIN_DRIVE_PWM      70      // PWM toi thieu de banh bat dau quay
#define MIN_TURN_PWM       80
#define TURN_TOL_RAD       0.06f   // ~3.4 do
#define DRIVE_TOL_MM       4.0f
#define SLOW_ZONE_MM       35.0f   // giam toc khi con < 35mm
#define KP_TURN            180.0f  // PWM / rad
#define KP_STEER           120.0f  // PWM / rad (giu huong luc chay thang)
#define STEER_LIMIT_PWM    45.0f
#define PHASE_TIMEOUT_MS   12000   // qua han -> bao loi
#define SETTLE_MS          120

// ----- Con quay MPU6050 ------------------------------------------
#define USE_GYRO           1       // 0 = chi dung encoder
#define GYRO_SIGN          (-1.0f) // doi dau neu do goc xoay nguoc (truc Z huong len -> CCW duong)
#define GYRO_WEIGHT        0.85f   // ti trong gyro khi ket hop voi encoder (0..1)

// ----- Khac -----------------------------------------------------
#define HEARTBEAT_MS       3000
#define CMD_QUEUE_LEN      8
