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

// ----- 5 cam bien do vach TCRT5000L (theo schematic + PCB) -------
#define PIN_SENSOR_1   36      // SENSOR_VP (ngoai cung)
#define PIN_SENSOR_2   39      // SENSOR_VN
#define PIN_SENSOR_3   34      // giua
#define PIN_SENSOR_4   35
#define PIN_SENSOR_5   32      // ngoai cung doi dien (tat ca la ADC1, chay duoc cung WiFi)

#define SENSOR_PITCH_MM    17.78f  // PCB: 700 mil giua 2 cam bien lien tiep
#define SENSOR1_IS_RIGHT   1       // cam bien 1 o BEN PHAI xe (nhin tu tren xuong, dau xe ve phia cam bien). Doi neu nguoc
#define SENSOR_FORWARD_MM  40.0f   // khoang cach tu TRUC BANH toi mang cam bien (uoc luong tu PCB: DO LAI bang thuoc!)
#define LINE_IS_DARK       1       // 1 = vach TOI tren nen SANG; 0 = vach SANG tren nen toi
#define SENSOR_MIN_CONTRAST 300    // chenh lech ADC toi thieu giua vach va nen de tin cay
#define SENSOR_ADAPT_RATE  0.0002f // toc do tu thich nghi min/max (moi vong ~200Hz)
#define SENSOR_FIXED_CAL   0       // 1 = dung nguong co dinh ben duoi thay vi tu thich nghi
#define SENSOR_FIXED_LO    500
#define SENSOR_FIXED_HI    2800
#define SENSOR_DEBUG       0       // 1 = in gia tri cam bien ra Serial (de hieu chinh)

// ----- Hieu chinh vi tri bang vach -------------------------------
#define BOARD_NODE_SPACING_MM 100.0f  // khop DEFAULT_BOARD_NODES_MM trong pi/backend.py
#define LINE_NODE_RADIUS_MM   30.0f   // diem xuat phat phai nam trong ban kinh nay cua mot nut moi coi la "tren vach"
#define SNAP_RADIUS_MM        35.0f   // giao diem chi duoc chap nhan neu gan nut <= gia tri nay
#define SNAP_MAX_MM           40.0f   // gioi han dich toi da moi lan snap
#define SNAP_GAIN             0.8f
#define CROSS_MIN_SENSORS     3       // so cam bien toi thieu cung thay vach = giao diem (bien ban co chi co vach 1 phia -> ~3/5)
#define CROSS_MAX_LEN_MM      45.0f   // be rong vach toi da (loai su kien dai bat thuong)
#define LINE_POS_BLEND        0.03f   // keo vi tri ngang ve vach moi chu ky
#define LINE_HEADING_GAIN     0.0001f // rad / mm sai lech ngang moi chu ky
#define LINE_DEADBAND_MM      4.0f    // bo qua sai lech nho hon (do phan giai mang cam bien ~ pitch)
#define LINE_MAX_CORR_MM      3.0f    // gioi han buoc chinh moi chu ky
#define LINE_NODE_GUARD_MM    24.0f   // khong giu vach khi tam mang cach nut < gia tri nay
