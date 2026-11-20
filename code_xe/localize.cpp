#include "localize.h"
#include "config.h"
#include "drive.h"
#include "line.h"
#include <Arduino.h>
#include <math.h>

// ---- Bang 9 nut (khung ban co, mm) va ke nhau (khop pi/board_model.py) ----
static void node_xy(int n, float *x, float *y) {
    *x = (n % 3) * BOARD_NODE_SPACING_MM;
    *y = (n / 3) * BOARD_NODE_SPACING_MM;
}
static bool nodes_adjacent(int a, int b) {
    if (a == b) return false;
    if (a == 4 || b == 4) return true;                   // tam noi voi tat ca
    int dx = abs(a % 3 - b % 3), dy = abs(a / 3 - b / 3);
    return dx + dy == 1;                                 // chi ke ngang/doc
}
static int nearest_node(float x, float y, float maxDist) {
    int best = -1; float bd = maxDist;
    for (int n = 0; n < 9; n++) {
        float nx, ny; node_xy(n, &nx, &ny);
        float d = hypotf(x - nx, y - ny);
        if (d < bd) { bd = d; best = n; }
    }
    return best;
}

static bool  s_onLine = false;
static float s_x0 = 0, s_y0 = 0, s_x1 = 0, s_y1 = 0, s_ux = 1, s_uy = 0, s_lineHeading = 0;
static bool  s_inCross = false;
static uint8_t s_crossDebounce = 0;
static float s_pathAtRise = 0;

void loc_end_segment(void) { s_onLine = false; s_inCross = false; s_crossDebounce = 0; }

void loc_begin_segment(float gx, float gy) {
    loc_end_segment();
    int n0 = nearest_node(g_pose.x_mm, g_pose.y_mm, LINE_NODE_RADIUS_MM);
    int n1 = nearest_node(gx, gy, 12.0f);
    if (n0 < 0 || n1 < 0 || !nodes_adjacent(n0, n1)) {
        Serial.println("[LOC] doan khong nam tren vach (bai do/ne duong): chi dung encoder+gyro");
        return;
    }
    node_xy(n1, &s_x1, &s_y1);
    node_xy(n0, &s_x0, &s_y0);
    float len = hypotf(s_x1 - s_x0, s_y1 - s_y0);
    s_ux = (s_x1 - s_x0) / len; s_uy = (s_y1 - s_y0) / len;
    s_lineHeading = atan2f(s_uy, s_ux);
    s_onLine = true;
    Serial.printf("[LOC] doan tren vach: nut %d -> %d\n", n0, n1);
}

static void shift_pose(float dx, float dy) { drive_set_position(g_pose.x_mm + dx, g_pose.y_mm + dy); }

void loc_update(bool moving) {
    if (!moving) { s_inCross = false; s_crossDebounce = 0; return; }
    const float c = cosf(g_pose.theta), s = sinf(g_pose.theta);
    bool crossing = g_line.contrast_ok && g_line.count_on >= CROSS_MIN_SENSORS;

    // ---------- 1) Bat giao diem ----------
    if (crossing) {
        if (s_crossDebounce == 0) s_pathAtRise = g_path_mm;
        if (s_crossDebounce < 255) s_crossDebounce++;
        if (s_crossDebounce >= 2) s_inCross = true;
    } else {
        if (s_inCross) {
            float len = g_path_mm - s_pathAtRise;                 // be rong vach da quet qua
            if (len > 0 && len <= CROSS_MAX_LEN_MM) {
                float px = g_pose.x_mm + SENSOR_FORWARD_MM * c - 0.5f * len * c;   // tam mang tai giua vach
                float py = g_pose.y_mm + SENSOR_FORWARD_MM * s - 0.5f * len * s;
                int n = nearest_node(px, py, SNAP_RADIUS_MM);
                if (n >= 0) {
                    float nx, ny; node_xy(n, &nx, &ny);
                    float along = (nx - px) * c + (ny - py) * s;           // sai lech doc huong chay
                    if (fabsf(along) <= SNAP_MAX_MM) {
                        shift_pose(SNAP_GAIN * along * c, SNAP_GAIN * along * s);
                        Serial.printf("[LOC] SNAP nut %d: doc=%.1fmm (be rong vach %.0fmm)\n", n, along, len);
                    }
                }
            }
        }
        s_inCross = false;
        s_crossDebounce = 0;
    }

    // ---------- 2) Giu vach (chi khi chay doc canh ban co) ----------
    if (!s_onLine || crossing || !g_line.line_visible) return;
    if (fabsf(drive_wrap_pi(g_pose.theta - s_lineHeading)) > 0.5f) return;   // dang khong huong theo vach
    float e = g_line.lateral_mm;                                            // vach lech ben phai (+) so voi tam mang
    if (fabsf(e) > 26.0f) return;
    float nrx = -s_uy, nry = s_ux;                                          // vector "ben phai" cua huong vach
    float psx = g_pose.x_mm + SENSOR_FORWARD_MM * c, psy = g_pose.y_mm + SENSOR_FORWARD_MM * s;
    // Gan nut: cac vach vuong goc lam lech tam vach -> tam dung giu vach
    if (hypotf(psx - s_x0, psy - s_y0) < LINE_NODE_GUARD_MM || hypotf(psx - s_x1, psy - s_y1) < LINE_NODE_GUARD_MM) return;
    // Khoang cach co dau cua tam mang toi vach theo pose: duong = tam mang o BEN PHAI vach
    float d_pose = (psx - s_x0) * nrx + (psy - s_y0) * nry;
    float d_meas = -e;                                                      // vach o ben phai => tam mang o ben trai vach
    float corr = d_meas - d_pose;                                           // mm can dich vi tri sang phai
    if (fabsf(corr) < LINE_DEADBAND_MM) return;                             // trong sai so luong tu hoa cua mang cam bien
    corr = corr > LINE_MAX_CORR_MM ? LINE_MAX_CORR_MM : (corr < -LINE_MAX_CORR_MM ? -LINE_MAX_CORR_MM : corr);
    shift_pose(LINE_POS_BLEND * corr * nrx, LINE_POS_BLEND * corr * nry);
    drive_set_heading(g_pose.theta + LINE_HEADING_GAIN * corr);             // troi sang ben -> chinh huong uoc luong
}
