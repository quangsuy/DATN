#include "line.h"
#include "config.h"
#include <Arduino.h>

LineState g_line = {};

static const uint8_t SENSOR_PINS[LINE_N] = {PIN_SENSOR_1, PIN_SENSOR_2, PIN_SENSOR_3, PIN_SENSOR_4, PIN_SENSOR_5};
static float s_filt[LINE_N];
static float s_lo[LINE_N], s_hi[LINE_N];
static bool  s_first = true;

// Vi tri ngang cua tung cam bien so voi tam mang (mm), duong = ben phai xe
static float lateral_of(int i) {
    float off = (2 - i) * SENSOR_PITCH_MM;       // cam bien 1 (i=0) = +2*pitch
    return SENSOR1_IS_RIGHT ? off : -off;
}

void line_init(void) {
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);              // 0..~3.3V
    for (int i = 0; i < LINE_N; i++) pinMode(SENSOR_PINS[i], INPUT);
}

void line_update(void) {
    for (int i = 0; i < LINE_N; i++) g_line.raw[i] = analogRead(SENSOR_PINS[i]);

    float wsum = 0, wy = 0, wsig = 0;
    uint8_t on = 0, lit = 0, firstLit = 255, lastLit = 0;
    bool contrast = true;
    for (int i = 0; i < LINE_N; i++) {
        float sig = LINE_IS_DARK ? (float)g_line.raw[i] : (float)(4095 - g_line.raw[i]);  // lon = giong vach
        if (s_first) { s_filt[i] = sig; s_lo[i] = sig; s_hi[i] = sig; }
        s_filt[i] += 0.5f * (sig - s_filt[i]);   // loc nhieu
        float v = s_filt[i];
#if SENSOR_FIXED_CAL
        s_lo[i] = SENSOR_FIXED_LO; s_hi[i] = SENSOR_FIXED_HI;
#else
        // Min/max tu thich nghi: bam nhanh khi vuot, tru dan ve gia tri hien tai
        if (v < s_lo[i]) s_lo[i] = v; else s_lo[i] += (v - s_lo[i]) * SENSOR_ADAPT_RATE;
        if (v > s_hi[i]) s_hi[i] = v; else s_hi[i] -= (s_hi[i] - v) * SENSOR_ADAPT_RATE;
#endif
        float span = s_hi[i] - s_lo[i];
        if (span < SENSOR_MIN_CONTRAST) { contrast = false; g_line.w[i] = 0; continue; }
        float w = (v - s_lo[i]) / span;
        w = w < 0 ? 0 : (w > 1 ? 1 : w);
        g_line.w[i] = w;
        if (w > 0.5f) on++;
        if (w > 0.3f) { lit++; if (firstLit == 255) firstLit = i; lastLit = i; }
        wsum += w;
        if (w > 0.15f) { wy += w * lateral_of(i); wsig += w; }   // chi tinh cam bien co tin hieu that
    }
    s_first = false;
    g_line.contrast_ok = contrast;
    g_line.count_on = contrast ? on : 0;
    // Mot vach hep duoi mang: 1..2 cam bien lien tiep sang, tong tin hieu vua phai
    // (>=3 cam bien sang = giao diem / vung rong -> khong dung de giu vach)
    bool contiguous = contrast && lit >= 1 && lit <= 2 && (lastLit - firstLit + 1) == lit;
    g_line.line_visible = contiguous && wsum > 0.35f && wsum < 1.8f;
    g_line.lateral_mm = (wsig > 0.05f) ? (wy / wsig) : 0.0f;

#if SENSOR_DEBUG
    static uint32_t t = 0;
    if (millis() - t > 250) {
        t = millis();
        Serial.printf("[LINE] raw=%4u %4u %4u %4u %4u  on=%u lat=%.1f cont=%d\n", g_line.raw[0], g_line.raw[1],
                      g_line.raw[2], g_line.raw[3], g_line.raw[4], g_line.count_on, g_line.lateral_mm, contrast);
    }
#endif
}
