// line.h - 5 cam bien TCRT5000L (ADC1) -> do "do vach" tung cam bien
//
// Mach (schematic): +5V - R5.1k - [nut Sensor_n] - R9.1k - GND, collector phototransistor noi vao nut,
// emitter xuong GND. Be mat PHAN XA (trang) -> transistor dan -> dien ap nut THAP.
// Be mat toi (vach den) -> dien ap nut CAO (toi da ~3.2V, an toan cho ESP32).
// Cam bien 1 la ngoai cung (xem SENSOR1_IS_RIGHT), cam bien 3 o giua.
#pragma once
#include <stdint.h>
#include <stdbool.h>

#define LINE_N 5

typedef struct {
    uint16_t raw[LINE_N];     // ADC 12-bit tho
    float    w[LINE_N];       // 0..1: muc "thay vach" sau chuan hoa
    uint8_t  count_on;        // so cam bien dang tren vach (w > 0.5)
    bool     contrast_ok;     // da hoc duoc do tuong phan vach/nen
    bool     line_visible;    // dung 1 vach hep duoi mang (1..3 cam bien)
    float    lateral_mm;      // vach lech so voi tam mang: duong = vach o BEN PHAI xe
} LineState;

extern LineState g_line;

void line_init(void);
void line_update(void);       // goi moi vong loop
