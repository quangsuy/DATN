#include "drive.h"
#include "config.h"
#include <Arduino.h>
#include <Wire.h>
#include <math.h>

Pose g_pose = {0, 0, 0};
float g_path_mm = 0.0f;

// ---------- PWM (khac nhau giua core 2.x va 3.x) ----------
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
static void pwm_attach(int pin, int ch) { (void)ch; ledcAttach(pin, PWM_FREQ_HZ, 8); }
static void pwm_write(int pin, int ch, int duty) { (void)ch; ledcWrite(pin, duty); }
#else
static void pwm_attach(int pin, int ch) { ledcSetup(ch, PWM_FREQ_HZ, 8); ledcAttachPin(pin, ch); }
static void pwm_write(int pin, int ch, int duty) { (void)pin; ledcWrite(ch, duty); }
#endif

// ---------- Encoder (x2: ngat tren canh kenh A) ----------
static volatile int32_t s_ticksA = 0, s_ticksB = 0;

static void IRAM_ATTR isr_enc_a() {
    bool a = digitalRead(PIN_ENC_A_A), b = digitalRead(PIN_ENC_A_B);
    s_ticksA += (a != b) ? 1 : -1;
}
static void IRAM_ATTR isr_enc_b() {
    bool a = digitalRead(PIN_ENC_B_A), b = digitalRead(PIN_ENC_B_B);
    s_ticksB += (a != b) ? 1 : -1;
}

// ---------- MPU6050 (doc thanh ghi truc tiep, khong can thu vien) ----------
#define MPU_ADDR 0x68
static bool s_gyroOk = false;
static float s_gyroBias = 0.0f;   // deg/s
bool drive_gyro_ok(void) { return s_gyroOk; }

static bool mpu_read_gz(float *dps) {
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(0x47);                       // GYRO_ZOUT_H
    if (Wire.endTransmission(false) != 0) return false;
    if (Wire.requestFrom((uint8_t)MPU_ADDR, (size_t)2) != 2) return false;
    int16_t raw = (int16_t)((Wire.read() << 8) | Wire.read());
    *dps = raw / 65.5f;                     // +-500 dps
    return true;
}

static void gyro_init(void) {
#if USE_GYRO
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    Wire.setClock(400000);
    Wire.beginTransmission(MPU_ADDR); Wire.write(0x6B); Wire.write(0x00);          // danh thuc
    if (Wire.endTransmission() != 0) { Serial.println("[IMU] MPU6050 khong phan hoi -> dung encoder"); return; }
    Wire.beginTransmission(MPU_ADDR); Wire.write(0x1B); Wire.write(0x08); Wire.endTransmission(); // +-500dps
    Wire.beginTransmission(MPU_ADDR); Wire.write(0x1A); Wire.write(0x03); Wire.endTransmission(); // DLPF 44Hz
    delay(100);
    // Hieu chinh offset luc dung yen
    float sum = 0, v; int n = 0;
    for (int i = 0; i < 300; i++) { if (mpu_read_gz(&v)) { sum += v; n++; } delay(3); }
    if (n < 100) { Serial.println("[IMU] doc loi -> dung encoder"); return; }
    s_gyroBias = sum / n;
    s_gyroOk = true;
    Serial.printf("[IMU] OK, bias=%.3f dps\n", s_gyroBias);
#endif
}

// ---------- API ----------
void drive_init(void) {
    pinMode(PIN_DRV_EEP, OUTPUT);
    digitalWrite(PIN_DRV_EEP, HIGH);        // bat driver
    pwm_attach(PIN_A_IN1, 0); pwm_attach(PIN_A_IN2, 1);
    pwm_attach(PIN_B_IN1, 2); pwm_attach(PIN_B_IN2, 3);
    drive_stop();

    pinMode(PIN_ENC_A_A, INPUT_PULLUP); pinMode(PIN_ENC_A_B, INPUT_PULLUP);
    pinMode(PIN_ENC_B_A, INPUT_PULLUP); pinMode(PIN_ENC_B_B, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(PIN_ENC_A_A), isr_enc_a, CHANGE);
    attachInterrupt(digitalPinToInterrupt(PIN_ENC_B_A), isr_enc_b, CHANGE);

    gyro_init();
    g_pose.theta = INITIAL_HEADING_RAD;
}

static void motor_write(int pin1, int ch1, int pin2, int ch2, float cmd, bool invert) {
    if (invert) cmd = -cmd;
    int duty = (int)fminf(fabsf(cmd), (float)PWM_MAX);
    if (cmd > 0)      { pwm_write(pin1, ch1, duty); pwm_write(pin2, ch2, 0); }
    else if (cmd < 0) { pwm_write(pin1, ch1, 0);    pwm_write(pin2, ch2, duty); }
    else              { pwm_write(pin1, ch1, 0);    pwm_write(pin2, ch2, 0); }
}

void drive_set(float left, float right) {
    float a = MOTOR_A_IS_LEFT ? left : right;
    float b = MOTOR_A_IS_LEFT ? right : left;
    motor_write(PIN_A_IN1, 0, PIN_A_IN2, 1, a, MOTOR_A_INVERT);
    motor_write(PIN_B_IN1, 2, PIN_B_IN2, 3, b, MOTOR_B_INVERT);
}

void drive_stop(void) { drive_set(0, 0); }

float drive_wrap_pi(float a) {
    while (a > (float)M_PI)  a -= 2.0f * (float)M_PI;
    while (a < -(float)M_PI) a += 2.0f * (float)M_PI;
    return a;
}

void drive_set_position(float x_mm, float y_mm) { g_pose.x_mm = x_mm; g_pose.y_mm = y_mm; }
void drive_set_heading(float theta) { g_pose.theta = drive_wrap_pi(theta); }

void drive_update(void) {
    static int32_t lastA = 0, lastB = 0;
    static uint32_t lastUs = 0;
    uint32_t now = micros();
    float dt = lastUs ? (now - lastUs) * 1e-6f : 0.0f;
    lastUs = now;

    noInterrupts();
    int32_t ta = s_ticksA, tb = s_ticksB;
    interrupts();
    const float mm_per_tick = (2.0f * (float)M_PI * WHEEL_RADIUS_MM) / ENC_TICKS_PER_REV;
    float dA = (ta - lastA) * mm_per_tick * (ENC_A_INVERT ? -1.0f : 1.0f);
    float dB = (tb - lastB) * mm_per_tick * (ENC_B_INVERT ? -1.0f : 1.0f);
    lastA = ta; lastB = tb;
    float dL = MOTOR_A_IS_LEFT ? dA : dB;
    float dR = MOTOR_A_IS_LEFT ? dB : dA;

    float ds = 0.5f * (dL + dR);
    float dth_enc = (dL - dR) / WHEEL_BASE_MM;      // khung y xuong: trai nhanh hon -> xoay cung chieu kim dong ho (+)
    float dth = dth_enc;
#if USE_GYRO
    if (s_gyroOk && dt > 0.0f && dt < 0.1f) {
        float gz;
        if (mpu_read_gz(&gz)) {
            // gz>0 = nguoc chieu kim dong ho (truc Z len); khung y xuong -> doi dau qua GYRO_SIGN
            float dth_gyro = GYRO_SIGN * (gz - s_gyroBias) * (float)M_PI / 180.0f * dt;
            dth = GYRO_WEIGHT * dth_gyro + (1.0f - GYRO_WEIGHT) * dth_enc;
        }
    }
#endif
    g_path_mm += ds;
    float mid = g_pose.theta + 0.5f * dth;
    g_pose.x_mm += ds * cosf(mid);
    g_pose.y_mm += ds * sinf(mid);
    g_pose.theta = drive_wrap_pi(g_pose.theta + dth);
}
