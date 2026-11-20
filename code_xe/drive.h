// drive.h - Dong co (DRV8833) + encoder + MPU6050 -> odometry (x, y, theta)
#pragma once
#include <stdint.h>
#include <stdbool.h>

typedef struct {
    float x_mm;
    float y_mm;
    float theta;   // rad, khung ban co (y xuong): 0 = +x, duong = xoay cung chieu kim dong ho
} Pose;

extern Pose g_pose;

void drive_init(void);
// left/right: -255..255 (am = lui). Ap dung dao chieu theo config.
void drive_set(float left, float right);
void drive_stop(void);
// Goi thuong xuyen (>=100Hz): doc encoder + gyro, cap nhat g_pose.
void drive_update(void);
void drive_set_position(float x_mm, float y_mm);
void drive_set_heading(float theta);
bool drive_gyro_ok(void);
float drive_wrap_pi(float a);
