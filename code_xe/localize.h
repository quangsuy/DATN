// localize.h - Hieu chinh vi tri (g_pose) bang vach ke ban co + giao diem
//
// 1) BAT GIAO DIEM: khi mang cam bien quet qua mot nut (>=4 cam bien cung thay vach), keo
//    g_pose doc huong chay sao cho TAM MANG TRUNG TAM O CO gan nhat -> xoa sai so tich luy.
// 2) GIU VACH: khi chay doc mot canh ban co (nut-nut ke nhau), keo vi tri ngang va huong
//    ve phia vach -> xe khong troi sang ben.
#pragma once
#include <stdbool.h>

// Goi khi bat dau chay doan tu vi tri hien tai (g_pose) toi (gx, gy).
void loc_begin_segment(float gx, float gy);
void loc_end_segment(void);
// Goi moi vong loop. moving = dang chay thang (khong tinh luc quay tai cho).
void loc_update(bool moving);
