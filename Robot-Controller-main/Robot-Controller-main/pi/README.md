# Raspberry Pi Backend

Backend authoritative cho hệ thống Three Men's Morris.

## Chức năng

- Quản lý game state và luật Three Men's Morris.
- Minimax alpha-beta tùy chọn cho chế độ chơi với máy.
- Trajectory cạnh trực tiếp cho nước đi hợp lệ; A* giữ lại cho thử nghiệm tránh vật cản vật lý.
- Chuyển route thành trajectory `(x_mm, y_mm, theta_rad, time_s, tag)`.
- Simulation transport để demo không cần phần cứng.
- JSON Lines protocol và Serial transport tới ESP32 Coordinator.
- WebSocket adapter phát event cho frontend.

## Chạy test

Từ thư mục `Robot-Controller-main/Robot-Controller-main` trên Ubuntu:

```bash
python3 -m pip install -r pi/requirements.txt
python3 -m unittest discover -s . -p "test_*.py" -v
python3 -m compileall -q pi
```

## Chạy WebSocket backend ở simulation mode

Cài dependency và khởi động bản mô phỏng, không cần GPIO, camera, ESP32 hay cổng Serial:

```bash
python3 -m pip install -r pi/requirements.txt
python3 -m pi.websocket_server --transport simulation
```

Frontend vẫn phải kết nối tới WebSocket này khi dùng simulation mode. Chế độ
simulation chỉ thay transport robot bằng `SimulationTransport`; game state,
đổi lượt và Minimax vẫn chạy tập trung trên Pi:

```bash
python3 -m pi.websocket_server --transport simulation --host 0.0.0.0 --port 8765
```

Dashboard dùng địa chỉ `ws://<pi-ip>:8765`. Không dùng `127.0.0.1` nếu trình
duyệt đang chạy trên máy tính khác với Raspberry Pi.

Server lắng nghe mặc định tại:

```text
ws://0.0.0.0:8765
```

Chạy dashboard ở terminal thứ hai:

```bash
cd ../../three-men's-morris-robot-dashboard
npm install
npm run dev -- --host 0.0.0.0
```

Mở `http://127.0.0.1:3000`, vào màn chơi. Nếu mở dashboard từ máy khác,
dùng địa chỉ IP của Pi trong cấu hình WebSocket, ví dụ
`ws://192.168.66.107:8765`.

Backend sẽ gửi các event như `game_state`, `move_start`, `robot_status`,
`move_complete`, `evasion_step`, `ai_thinking`, `ai_decision`,
`system_telemetry` và `fault`.

Trong giai đoạn đặt quân, nếu cửa bay bị một xe đang ở trên bàn chắn, backend
phát chuỗi chuyển động né: dời xe chắn sang ô kề trống, đưa xe mới vào, rồi
đưa xe chắn về vị trí ban đầu. Chuyển động né chỉ thay đổi vị trí vật lý tạm
thời; trạng thái logic bàn cờ chỉ được cập nhật bởi nước đặt quân chính.

## Chế độ phần cứng

Cài thêm pyserial:

```bash
python3 -m pip install pyserial
```

Khởi động server với Serial transport:

```bash
python3 -m pi.websocket_server --transport serial --serial-device /dev/ttyUSB0
```

Chỉ dùng chế độ này sau khi đã nối ESP32 Coordinator và xác nhận thiết bị xuất hiện trong `/dev/ttyUSB*`.

ESP32 Coordinator cần trả JSON Lines ACK có cùng `seq` sau khi robot đã tới waypoint (`completed` hoặc `reached`), ví dụ:

```json
{"version":1,"seq":42,"type":"ack","payload":{"status":"completed"}}
```

## Ghi chú tích hợp frontend

Frontend cần gửi action thật qua WebSocket:

```json
{"type":"join_game","mode":"pva","player_team":1,"first_player":1}
{"type":"select_move","player":1,"robot_id":1,"from_node":null,"to_node":0}
{"type":"emergency_stop"}
```

Trong hardware mode, frontend không được tự cập nhật bàn cờ hoặc tự kết thúc animation trước khi nhận `move_complete` từ backend.
