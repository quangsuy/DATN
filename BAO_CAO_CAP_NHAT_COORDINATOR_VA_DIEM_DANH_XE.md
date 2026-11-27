# BÁO CÁO NÂNG CẤP FIRMWARE COORDINATOR ESP32 & CƠ CHẾ PHẢN HỒI 2 CHIỀU, ĐIỂM DANH ĐỊNH DANH XE THIẾU
## ĐỀ TÀI: HỆ THỐNG AGV TỰ HÀNH CHƠI CỜ THREE MEN'S MORRIS
**Sinh viên thực hiện:** Dương Sơn Quang (B22DCDT238) - Trương Hoàng Phúc (B22DCDT234)  
**Học viện Công nghệ Bưu chính Viễn thông (PTIT)**

---

## 1. TỔNG QUAN NGUYÊN NHÂN LỖI CŨ ĐÃ PHÁT HIỆN

Qua đối chiếu trực tiếp giữa chương trình test mẫu ESP-NOW và firmware `coordinator_esp32` cũ, có **3 lỗi kiến trúc cốt lõi** khiến chiều phản hồi ngược `Xe -> Coordinator -> Pi 3` bị đứt và tính năng điểm danh không biết chính xác xe nào đang thiếu:

1. **Đứt chiều `Xe -> Coordinator` do thiếu gán địa chỉ MAC `esp_wifi_set_mac`:**
   - Toàn bộ 6 xe đều đăng ký cứng `COORDINATOR_MAC` (`38:18:2B:B1:BC:E4`) làm peer duy nhất để gửi gói `RobotStatusPacket` về.
   - Bản `espnow_robot.cpp` cũ chỉ gọi `WiFi.mode(WIFI_STA)` và đọc MAC vật lý của mạch mà không gọi `esp_wifi_set_mac(WIFI_IF_STA, COORDINATOR_MAC)`. Do MAC giao diện STA không khớp với `38:18:2B:B1:BC:E4`, tầng phần cứng Wi-Fi của Coordinator đã loại bỏ toàn bộ gói tin trạng thái/PONG từ 6 xe gửi về.
2. **Chiều `Coordinator -> Pi 3` thiếu tách bit lỗi (`ROBOT_STATUS_ERROR`) và chưa chuyển tiếp đầy đủ:**
   - Trong `cmd_handler.cpp` cũ, `handle_waypoint()` chỉ chờ duy nhất 1 bit sự kiện `xRobotAckEvent`. Nếu xe gặp sự cố kẹt bánh/mất line và gửi `ROBOT_STATUS_ERROR` về, Coordinator không đánh thức `handle_waypoint()` bằng cờ lỗi riêng mà chờ hết 15 giây timeout (hoặc nhầm lẫn với cờ ACK).
   - Phía Pi 3 (`pi/serial_coordinator.py` cũ), vòng lặp `_wait_for_ack()` đã bỏ qua mọi gói tin bất đồng bộ (`robot_status`, `system_info`, `fault`) mà Coordinator gửi lên trong lúc chờ lệnh.
3. **Điểm danh (`ping` & `system_info`) chỉ báo con số sĩ số `active_peers`, không định danh `online_ids` và `missing_ids`:**
   - Gói `system_info` và `ack` của lệnh `ping` chỉ trả về tổng số xe mà không có mảng danh sách xe có mặt (`online_ids`) và xe vắng mặt (`missing_ids`).
   - Ngoài ra, `robot_registry.cpp` chưa có hàm quét timeout `last_seen_ms` để tự động chuyển xe bị tắt nguồn sang trạng thái `RSTATE_OFFLINE`.

---

## 2. CHI TIẾT CÁC THAY ĐỔI THEO 4 GIAI ĐOẠN

### Giai đoạn 1: Khôi phục liên kết ESP-NOW 2 chiều (`coordinator_esp32/espnow_robot.cpp`)
* **Gán cứng và xác thực MAC Coordinator khi khởi tạo (`espnow_robot_init`):**
  - Ngay sau `WiFi.mode(WIFI_STA)` và `WiFi.disconnect()`, gọi:
    ```cpp
    esp_wifi_set_mac(WIFI_IF_STA, COORDINATOR_MAC);
    ```
  - Đọc ngược lại bằng `esp_wifi_get_mac(WIFI_IF_STA, sta_mac)` và kiểm chứng `memcmp(sta_mac, COORDINATOR_MAC, 6) == 0`, in rõ trạng thái `MATCHED` trên Serial Monitor trước khi khóa kênh vô tuyến `ESPNOW_CHANNEL = 1`.
* **Xác thực MAC nguồn trong callback nhận (`handle_rx`):**
  - Đối chiếu địa chỉ MAC người gửi từ `on_espnow_recv` với bảng `ROBOT_MACS[pkt.robot_id - 1]` bằng `memcmp(mac_addr, expected_mac, 6) == 0` trước khi đẩy gói `RobotStatusPacket` (8 byte) vào `xRobotRxQueue`.
* **Giám sát giao nhận tầng Radio (`handle_send_status`):**
  - Cảnh báo ngay lập tức qua Serial (`[ESPNOW_TX] Radio delivery FAILED`) khi `status != ESP_NOW_SEND_SUCCESS`.

---

### Giai đoạn 2: Tách luồng phản hồi `Xe -> Coordinator -> Pi 3` (`coordinator_esp32.ino`, `cmd_handler.cpp`)
* **Tách rõ bit ACK thành công và bit LỖI trên `xRobotAckEvent` (`robot_registry.h`):**
  - `ROBOT_ACK_BIT(rid)` (`1UL << (rid - 1)`, bits `0..5`): Dùng cho `ROBOT_STATUS_REACHED`, `ROBOT_STATUS_ARRIVED`, `ROBOT_STATUS_PONG`.
  - `ROBOT_ERR_BIT(rid)` (`1UL << (rid - 1 + 8)`, bits `8..13`): Dùng riêng cho `ROBOT_STATUS_ERROR`.
* **Xử lý tức thời trong `task_robot_status` (`coordinator_esp32.ino`):**
  - Khi nhận `ROBOT_STATUS_ERROR`: Bật ngay `ROBOT_ERR_BIT(pkt.robot_id)` để `handle_waypoint()` thoát vòng chờ tức khắc (không phải đợi hết 15 giây timeout), đồng thời gửi cả `uart_pi_send_fault("robot_X_error_code_Y", rid)` lẫn `uart_pi_send_robot_status(rid, "error", ...)` lên Pi 3.
  - Với mọi gói trạng thái hợp lệ từ xe (`IDLE`, `MOVING`, `REACHED`, `ARRIVED`, `ERROR`, `PONG`), Coordinator đều đẩy bản tin `robot_status` (kèm `battery` và `rssi_dbm`) vào `xTxQueue` để truyền thẳng lên Pi 3.

---

### Giai đoạn 3: Cơ chế phát hiện Offline tự động & Bảng điểm danh `RosterSummary` (`robot_registry.h/.cpp`)
* **Bổ sung cấu trúc `RosterSummary` và hàm `robot_registry_get_roster()`:**
  ```cpp
  typedef struct {
      uint8_t active_count;
      uint8_t online_ids[MAX_ROBOTS];
      uint8_t online_len;
      uint8_t missing_ids[MAX_ROBOTS];
      uint8_t missing_len;
  } RosterSummary;
  ```
* **Tự động phát hiện xe rớt mạng (`robot_registry_check_timeouts`):**
  - Trong `task_heartbeat` (`coordinator_esp32.ino` chạy mỗi 5 giây):
    - Nếu xe nào im lặng quá `5000 ms`, Coordinator tự động phát gói `espnow_ping(i)` để thăm dò.
    - Gọi `robot_registry_check_timeouts(10000, newly_offline)`: mọi xe không phản hồi quá `10.000 ms` sẽ tự động bị chuyển sang `RSTATE_OFFLINE` và gửi ngay sự kiện `robot_status: "offline"` lên Pi 3.

---

### Giai đoạn 4: Lệnh Ping điểm danh toàn đội (`robot_id = 0`) & Đồng bộ lên Pi 3 / Web Dashboard
* **Trên Coordinator (`protocol.h`, `uart_pi.h/.cpp`, `cmd_handler.cpp`):**
  - Mở rộng lệnh `ping` nhận `robot_id = 0` (điểm danh đồng loạt cả 6 xe) bên cạnh `robot_id = 1..6` (ping lẻ từng xe).
  - Khi nhận `{"version":1,"seq":N,"type":"ping","payload":{"robot_id":0}}`:
    - Xóa toàn bộ 6 bit `ROBOT_ALL_ACK_BITS` (`0x3F`).
    - Phát liên tiếp `espnow_ping(1..6)` tới cả 6 xe và chờ đồng thời trong một cửa sổ duy nhất `400 ms` (`xEventGroupWaitBits(..., 0x3F, pdTRUE, pdTRUE, pdMS_TO_TICKS(400))`).
    - Trả về gói JSON `ack` chứa đầy đủ sĩ số và danh sách định danh từng xe có mặt / vắng mặt:
      ```json
      {
        "version": 1,
        "seq": 15,
        "type": "ack",
        "payload": {
          "status": "completed",
          "robot_id": 0,
          "total_robots": 6,
          "active_peers": 5,
          "online_ids": [1, 2, 3, 4, 5],
          "missing_ids": [6]
        }
      }
      ```
  - Gói Heartbeat `system_info` mỗi 5 giây cũng nhúng sẵn hai mảng `online_ids` và `missing_ids`.
* **Trên Raspberry Pi 3 (`pi/coordinator_protocol.py`, `pi/serial_coordinator.py`, `pi/backend.py`):**
  - `ping_message(sequence, robot_id=0)` hỗ trợ `robot_id = 0`.
  - `SerialCoordinatorTransport` bổ sung hàm `ping_roster()` và bộ thu thập bản tin bất đồng bộ `_handle_async_message()` giúp giữ lại toàn bộ các gói `robot_status`, `system_info`, `fault` từ xe gửi lên.
  - `MorrisBackend.hardware_check()` gọi `ping_roster()` để quét cả 6 xe trong 1 lệnh duy nhất và trả về `online_ids`, `missing_ids` trong sự kiện `hardware_check_result`.
* **Trên Giao diện Web (`src/network/protocol.ts`, `src/screens/GameModeScreen.tsx`):**
  - Trong hộp thoại **Pre-Flight Hardware Diagnostics**, hiển thị thanh trạng thái chỉ đích danh danh sách xe có mặt và cảnh báo đỏ tên từng xe đang thiếu (ví dụ: `⚠️ Thiếu xe: Xe #6`).

---

## 3. DANH SÁCH CÁC FILE ĐÃ CẬP NHẬT & KẾT QUẢ KIỂM THỬ

| Tầng hệ thống | File cập nhật | Nội dung thay đổi chính |
| :--- | :--- | :--- |
| **Coordinator ESP32** | `coordinator_esp32/espnow_robot.cpp` | Gán `esp_wifi_set_mac(WIFI_IF_STA, COORDINATOR_MAC)`, lọc MAC nguồn trong `handle_rx`, log lỗi TX radio. |
| **Coordinator ESP32** | `coordinator_esp32/robot_registry.h` | Định nghĩa `ROBOT_ACK_BIT`, `ROBOT_ERR_BIT`, `RosterSummary`, `robot_registry_check_timeouts`, `robot_registry_get_roster`. |
| **Coordinator ESP32** | `coordinator_esp32/robot_registry.cpp` | Cài đặt quét timeout 10s chuyển xe sang `RSTATE_OFFLINE` và tổng hợp mảng `online_ids` / `missing_ids`. |
| **Coordinator ESP32** | `coordinator_esp32/protocol.h` | Hỗ trợ `PingCmd.robot_id` từ `0..6` (`0` = điểm danh toàn đội). |
| **Coordinator ESP32** | `coordinator_esp32/uart_pi.h` & `.cpp` | Thêm `uart_pi_send_ping_ack()`, mở rộng `uart_pi_send_system_info()` và `uart_pi_send_robot_status()` kèm `rssi_dbm`, `online_ids`, `missing_ids`. |
| **Coordinator ESP32** | `coordinator_esp32/cmd_handler.cpp` | Bắt cờ `ROBOT_ERR_BIT` thoát sớm khi xe báo lỗi; cài đặt điểm danh đồng loạt 6 xe trong 400ms khi `robot_id == 0`. |
| **Coordinator ESP32** | `coordinator_esp32/coordinator_esp32.ino` | Chuyển tiếp tức thời mọi gói `RobotStatusPacket` lên Pi 3; tự động ping nhắc sau 5s và đánh dấu Offline sau 10s trong `task_heartbeat`. |
| **Raspberry Pi 3** | `pi/coordinator_protocol.py` | Cho phép `ping_message(seq, robot_id=0)` nhận `robot_id = 0..6`. |
| **Raspberry Pi 3** | `pi/serial_coordinator.py` | Thêm `ping_roster()`, `_handle_async_message()` lưu trạng thái ngược từ xe và bảng điểm danh `last_roster`. |
| **Raspberry Pi 3** | `pi/backend.py` | Tích hợp `ping_roster()` vào `hardware_check()`, phát `online_ids` và `missing_ids` lên Web. |
| **Web Dashboard** | `src/network/protocol.ts` & `GameModeScreen.tsx` | Hiển thị rõ danh sách xe có mặt (`Xe #1..`) và cảnh báo đích danh xe thiếu (`⚠️ Thiếu xe: Xe #...`). |

* **Kết quả kiểm thử tự động:** Vượt qua **52/52 bài kiểm thử Python (`pytest pi/`)** và **0 lỗi biên dịch TypeScript (`tsc --noEmit`)**.
