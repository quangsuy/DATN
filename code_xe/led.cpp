#include "led.h"
#include "config.h"
#include <Arduino.h>
#include <Adafruit_NeoPixel.h>   // Thu vien: "Adafruit NeoPixel"
#include <math.h>

static Adafruit_NeoPixel s_strip(NEO_COUNT, PIN_NEOPIXEL, NEO_GRB + NEO_KHZ800);
static uint8_t s_gamma[256];
static uint8_t s_r = 0, s_g = 0, s_b = 0, s_br = 200;

static void apply(uint8_t r, uint8_t g, uint8_t b, uint8_t br) {
    uint32_t color = s_strip.Color(
        (uint8_t)((uint16_t)s_gamma[r] * br / 255),
        (uint8_t)((uint16_t)s_gamma[g] * br / 255),
        (uint8_t)((uint16_t)s_gamma[b] * br / 255));
    for (int i = 0; i < NEO_COUNT; i++) s_strip.setPixelColor(i, color);
    s_strip.show();
}

void led_init(void) {
    for (int i = 0; i < 256; i++) s_gamma[i] = (uint8_t)(powf(i / 255.0f, 2.2f) * 255.0f + 0.5f);
    s_strip.begin();
    // Mau mac dinh theo phe cho den khi Pi gui lenh: phe 1 cyan, phe 2 cam
    if (ROBOT_ID <= 3) led_set(0, 255, 255, 200); else led_set(249, 115, 22, 200);
}

void led_set(uint8_t r, uint8_t g, uint8_t b, uint8_t brightness) {
    s_r = r; s_g = g; s_b = b; s_br = brightness;
    apply(r, g, b, brightness);
}

void led_flash_error(void) {
    for (int i = 0; i < 3; i++) {
        apply(255, 0, 0, 255); delay(120);
        apply(0, 0, 0, 0);     delay(80);
    }
    apply(s_r, s_g, s_b, s_br);
}
