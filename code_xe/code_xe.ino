// =============================================================
// code_xe.ino - Firmware xe tu hanh Three Men's Morris (ESP32-WROOM-32D)
//
// Luong: Pi -> Coordinator (ESP32-CAM) -> ESP-NOW -> XE
//   ROBOT_CMD_WAYPOINT : di toi diem (x_mm,y_mm) trong khung ban co
//   ROBOT_CMD_SET_LED  : doi mau 5 LED
//   ROBOT_CMD_EMERGENCY_STOP / ROBOT_CMD_PING
// Xe -> Coordinator: RobotStatusPacket (REACHED/ARRIVED moi waypoint, IDLE/MOVING heartbeat)
//
// Dinh vi: encoder+gyro (dead-reckoning) duoc hieu chinh boi 5 cam bien TCRT5000L:
//   bat giao diem (snap ve nut gan nhat) + giu vach khi chay doc canh ban co (xem localize.cpp).
// Chuyen dong: quay tai cho huong ve diem dich -> chay thang (giu huong bang gyro+encoder)
// -> dung. Waypoint index 0 chi cap nhat vi tri (x,y) bat dau, khong chay.
// Thu vien can: "Adafruit NeoPixel". Board: ESP32 Dev Module.
// =============================================================
#include <Arduino.h>
#include <math.h>
#include "config.h"
#include "espnow_protocol.h"
#include "drive.h"
#include "led.h"
#include "comms.h"
#include "line.h"
#include "localize.h"

enum NavState { NAV_IDLE, NAV_TURN, NAV_DRIVE };

static NavState s_nav = NAV_IDLE;
static float    s_goalX = 0, s_goalY = 0;
static uint8_t  s_moveId = 0, s_wpIndex = 0, s_wpCount = 1, s_speed = 120;
static uint32_t s_phaseStart = 0, s_lastHeartbeat = 0, s_settleUntil = 0;
static bool     s_settling = false;

static float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

static void finish_waypoint(void) {
    drive_stop();
    loc_end_segment();
    s_nav = NAV_IDLE;
    bool last = (s_wpIndex + 1 >= s_wpCount);
    comms_send_status(last ? ROBOT_STATUS_ARRIVED : ROBOT_STATUS_REACHED, s_moveId, s_wpIndex, 0);
    Serial.printf("[NAV] %s wp=%u/%u pose=(%.0f,%.0f,%.1fdeg)\n", last ? "ARRIVED" : "REACHED",
                  s_wpIndex + 1, s_wpCount, g_pose.x_mm, g_pose.y_mm, g_pose.theta * 57.2958f);
}

static void fail(uint8_t code) {
    drive_stop();
    loc_end_segment();
    s_nav = NAV_IDLE;
    comms_send_status(ROBOT_STATUS_ERROR, s_moveId, s_wpIndex, code);
    Serial.printf("[NAV] LOI code=%u\n", code);
    led_flash_error();
}

static void start_phase(NavState st) { s_nav = st; s_phaseStart = millis(); }

static void handle_waypoint(const RobotCmdPacket *p) {
    s_moveId  = p->move_id;
    s_wpIndex = p->wp_index;
    s_wpCount = p->wp_count ? p->wp_count : 1;
    s_speed   = p->speed;
    s_goalX   = p->x_mm;
    s_goalY   = p->y_mm;
    Serial.printf("[CMD] WP move=%u %u/%u -> (%.0f,%.0f) speed=%u\n", s_moveId, s_wpIndex + 1, s_wpCount,
                  s_goalX, s_goalY, s_speed);
    if (s_wpIndex == 0) {                // diem xuat phat: dong bo vi tri, khong chay
        drive_set_position(s_goalX, s_goalY);
        finish_waypoint();
        return;
    }
    float dx = s_goalX - g_pose.x_mm, dy = s_goalY - g_pose.y_mm;
    if (sqrtf(dx * dx + dy * dy) < DRIVE_TOL_MM) { finish_waypoint(); return; }
    loc_begin_segment(s_goalX, s_goalY);   // xac dinh doan co chay doc vach khong
    start_phase(NAV_TURN);
}

static void handle_frame(const RxFrame *f) {
    switch (f->raw[0]) {
        case ROBOT_CMD_WAYPOINT: {
            RobotCmdPacket p; memcpy(&p, f->raw, sizeof(p));
            handle_waypoint(&p);
            break;
        }
        case ROBOT_CMD_SET_LED: {
            RobotLedPacket p; memcpy(&p, f->raw, sizeof(p));
            led_set(p.r, p.g, p.b, p.brightness);
            Serial.printf("[CMD] LED (%u,%u,%u) br=%u\n", p.r, p.g, p.b, p.brightness);
            break;
        }
        case ROBOT_CMD_EMERGENCY_STOP:
            drive_stop();
            comms_flush();
            loc_end_segment();
            s_nav = NAV_IDLE;
            comms_send_status(ROBOT_STATUS_IDLE, s_moveId, s_wpIndex, 0);
            Serial.println("[CMD] EMERGENCY STOP");
            break;
        case ROBOT_CMD_PING:
            comms_send_status(ROBOT_STATUS_PONG, s_moveId, s_wpIndex, 0);
            break;
        default:
            break;
    }
}

static void run_nav(void) {
    if (s_nav == NAV_IDLE) return;
    if (millis() - s_phaseStart > PHASE_TIMEOUT_MS) { fail(2); return; }   // 2 = timeout

    float dx = s_goalX - g_pose.x_mm, dy = s_goalY - g_pose.y_mm;
    float dist = sqrtf(dx * dx + dy * dy);
    float bearing = atan2f(dy, dx);
    float err = drive_wrap_pi(bearing - g_pose.theta);

    if (s_nav == NAV_TURN) {
        if (fabsf(err) < TURN_TOL_RAD) {
            drive_stop();
            if (!s_settling) { s_settling = true; s_settleUntil = millis() + SETTLE_MS; return; }
            if (millis() < s_settleUntil) return;
            s_settling = false;
            start_phase(NAV_DRIVE);
            return;
        }
        s_settling = false;
        float pwm = clampf(KP_TURN * fabsf(err), MIN_TURN_PWM, fmaxf((float)MIN_TURN_PWM, s_speed * 0.8f));
        float dir = err > 0 ? 1.0f : -1.0f;       // err>0: quay cung chieu kim dong ho = trai tien, phai lui
        drive_set(dir * pwm, -dir * pwm);
        return;
    }

    // NAV_DRIVE
    float along = dx * cosf(g_pose.theta) + dy * sinf(g_pose.theta);
    if (dist < DRIVE_TOL_MM || (along < 0 && dist < 20.0f)) {
        drive_stop();
        if (!s_settling) { s_settling = true; s_settleUntil = millis() + SETTLE_MS; return; }
        if (millis() < s_settleUntil) return;
        s_settling = false;
        finish_waypoint();
        return;
    }
    s_settling = false;
    float base = (float)s_speed;
    if (dist < SLOW_ZONE_MM) base = fmaxf((float)MIN_DRIVE_PWM, base * dist / SLOW_ZONE_MM);
    base = clampf(base, MIN_DRIVE_PWM, PWM_MAX);
    float steer = clampf(KP_STEER * err, -STEER_LIMIT_PWM, STEER_LIMIT_PWM);
    // err>0 (can xoay cung chieu kim dong ho): tang banh trai, giam banh phai
    drive_set(base + steer, base - steer);
}

void setup() {
    Serial.begin(115200);
    delay(200);
    Serial.printf("\n=== XE %d khoi dong ===\n", ROBOT_ID);
    led_init();
    line_init();
    drive_init();          // gom ca hieu chinh gyro (giu xe dung yen luc bat nguon!)
    comms_init();
    Serial.printf("[INIT] huong ban dau=%.0f deg, gyro=%s\n", INITIAL_HEADING_RAD * 57.2958f,
                  drive_gyro_ok() ? "OK" : "KHONG");
    comms_send_status(ROBOT_STATUS_IDLE, 0, 0, 0);
}

void loop() {
    drive_update();
    line_update();

    RxFrame f;
    while (comms_poll(&f)) {
        // Dang chay ma co waypoint moi -> thay the muc tieu hien tai
        handle_frame(&f);
    }
    run_nav();
    loc_update(s_nav == NAV_DRIVE && !s_settling);   // snap giao diem + giu vach

    if (millis() - s_lastHeartbeat > HEARTBEAT_MS) {
        s_lastHeartbeat = millis();
        comms_send_status(s_nav == NAV_IDLE ? ROBOT_STATUS_IDLE : ROBOT_STATUS_MOVING, s_moveId, s_wpIndex, 0);
    }
    delay(5);   // ~200Hz
}
