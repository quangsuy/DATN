// led.h - 5 LED RGB WS2812B tren than xe (mau theo phe, doi qua ESP-NOW)
#pragma once
#include <stdint.h>

void led_init(void);
// Dat mau cho ca 5 LED. brightness 0-255. Co hieu chinh gamma 2.2 de mau trung thuc hon.
void led_set(uint8_t r, uint8_t g, uint8_t b, uint8_t brightness);
// Chop do bao loi (blocking ngan ~600ms), roi khoi phuc mau cu.
void led_flash_error(void);
