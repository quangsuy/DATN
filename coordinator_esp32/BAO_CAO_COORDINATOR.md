# BAO CAO TIEN DO XAY DUNG ESP32 COORDINATOR
## Three Men's Morris - He thong co nguoi tu hanh

**Ngay:** 02/10/2026  
**Phien ban firmware:** v1.0  
**Board:** ESP32-WROOM-32 (38-pin DevKit)  
**IDE:** Arduino IDE 2.x + ESP32 Arduino Core >= 2.0

---

## 1. Tong quan

Coordinator la bo dieu phoi trung gian giua Raspberry Pi (nao xu ly game) va 6 robot tu hanh.

**Nhiem vu chinh:**
- Nhan lenh waypoint tu Pi qua UART2 (JSON Lines, khop `coordinator_protocol.py`)
- Chuyen tiep lenh den tung robot qua ESP-NOW (binary packed struct)
- Cho robot xac nhan (REACHED/ARRIVED), gui ACK ve Pi dung seq so tuong ung
- Xu ly emergency_stop tuc thi (broadcast tat ca robot)
- Theo doi trang thai 6 robot, push robot_status event ve Pi cho Dashboard
- Gui telemetry dinh ky 5 giay (system_info: active_peers, free_heap)

---

## 2. Kien truc phan cung

### 2.1 Ket noi Pi <-> Coordinator

| Signal   | Pi (GPIO)    | Coordinator (GPIO) | Ghi chu            |
|----------|-------------|-------------------|--------------------|
| UART TX  | GPIO14 (TX) | GPIO16 (RX2)      | Pi gui, ESP32 nhan |
| UART RX  | GPIO15 (RX) | GPIO17 (TX2)      | Pi nhan, ESP32 gui |
| GND      | GND         | GND               | Dat chung bat buoc |

- Baud rate: **115200 bps, 8N1** (khop `open_serial_transport` mac dinh)
- Khong dung flow control

### 2.2 Ket noi Coordinator <-> 6 Robot

- Giao thuc: **ESP-NOW** (802.11 unicast, khong can WiFi AP)
- Che do WiFi: STA (chi cho ESP-NOW, khong ket noi AP)
- Moi robot la 1 peer, dang ky bang MAC address
- MAC hien tai la placeholder, can cap nhat theo phan cung that:
  - Robot 1-3: Team 1 (24:DC:C3:00:00:01 - 03)
  - Robot 4-6: Team 2 (24:DC:C3:00:00:04 - 06)

### 2.3 Pin ESP32 38-pin

| Pin    | Chuc nang           |
|--------|---------------------|
| GPIO16 | UART2 RX (tu Pi TX) |
| GPIO17 | UART2 TX (den Pi RX)|
| GPIO2  | LED trang thai      |
| GND    | Dat chung           |

---

## 3. Kien truc phan mem

### 3.1 Cac file va chuc nang

| File | Chuc nang | Bytes |
|------|-----------|-------|
| `coordinator_esp32.ino` | Main, task setup, RTOS primitives | 9057 |
| `protocol.h` | Kieu du lieu Pi<->Coordinator | 2399 |
| `espnow_protocol.h` | Binary struct Coordinator<->Robot | 2239 |
| `uart_pi.h/.cpp` | UART2, JSON parse/serialize, TX queue | 9100 |
| `espnow_robot.h/.cpp` | Dang ky peer, send/recv callback | 4556 |
| `robot_registry.h/.cpp` | Trang thai 6 robot, thread-safe | 3510 |
| `cmd_handler.h/.cpp` | Waypoint dispatch, e-stop, ACK wait | 4590 |

**Tong: ~35 KB C++ source (11 files)**

### 3.2 So do FreeRTOS (dual-core)

```
Core 0                              Core 1
────────────────────────            ────────────────────────
task_uart_rx   (prio 4)             task_cmd_handler  (prio 3)
  |                                   |
  | xCmdQueue (PiCommand)             | blocks on xRobotAckEvent
  v                                   ^
task_uart_tx   (prio 5)             task_robot_status (prio 2)
  ^                                   |
  | xTxQueue (PiResponse)             | xRobotRxQueue
  |                                   ^
task_heartbeat (prio 1)             ESP-NOW recv callback
```

### 3.3 Cac nguyen thuy dong bo

| Primitive      | Kieu      | Muc dich                     |
|---------------|-----------|------------------------------|
| xCmdQueue      | Queue(8)  | uart_rx -> cmd_handler       |
| xTxQueue       | Queue(32) | any task -> uart_tx          |
| xRobotRxQueue  | Queue(32) | ESP-NOW cb -> robot_status   |
| xRobotAckEvent | EventGroup| bits 0-5 = robot 1-6 ACK    |

---

## 4. Giao thuc chi tiet

### 4.1 Pi -> Coordinator (JSON Lines, UART2)

**Waypoint:**
```json
{"payload":{"count":2,"heading_mrad":785,"index":0,"move_id":3,
 "robot_id":1,"speed":120,"x_mm":100,"y_mm":0},
 "seq":42,"type":"waypoint","version":1}
```

**Emergency stop:**
```json
{"payload":{"scope":"all"},"seq":43,"type":"emergency_stop","version":1}
```

### 4.2 Coordinator -> Pi (JSON Lines, UART2)

**ACK waypoint trung gian (reached):**
```json
{"payload":{"status":"reached"},"seq":42,"type":"ack","version":1}
```

**ACK waypoint cuoi (completed):**
```json
{"payload":{"status":"completed"},"seq":42,"type":"ack","version":1}
```

> [!IMPORTANT]
> `seq` trong ACK phai giong `seq` cua lenh Pi gui. Pi dang dung `_wait_for_ack(sequence)` loc theo seq. Sai seq = Pi timeout.

**Robot status (push unsolicited):**
```json
{"payload":{"battery":87,"position":"3","robot_id":1,"status":"arrived"},
 "seq":32769,"type":"robot_status","version":1}
```

**Heartbeat (moi 5 giay):**
```json
{"payload":{"active_peers":6,"free_heap_bytes":198000,"uptime_s":120},
 "seq":57345,"type":"system_info","version":1}
```

### 4.3 Coordinator <-> Robot (ESP-NOW binary)

**RobotCmdPacket (18 bytes, Coordinator -> Robot):**
```
Offset  Size  Field
0       1     cmd_type: 0x01=WAYPOINT, 0x02=ESTOP, 0x03=PING
1       1     robot_id (1-6)
2       1     move_id (low byte)
3       1     wp_index
4       1     wp_count
5       2     x_mm  (int16_t, little-endian)
7       2     y_mm  (int16_t)
9       2     heading_mrad (int16_t)
11      1     speed (0-255)
12      5     reserved
```

**RobotStatusPacket (8 bytes, Robot -> Coordinator):**
```
Offset  Size  Field
0       1     robot_id
1       1     status: 0=idle 1=moving 2=reached 3=arrived 4=error 5=pong
2       1     move_id (echo)
3       1     wp_index (echo)
4       1     battery_pct
5       1     rssi_dbm (int8_t)
6       1     error_code
7       1     reserved
```

---

## 5. Luong xu ly waypoint

```
Pi                  Coordinator                Robot N
|                   |                          |
|-- waypoint -----> |                          |
|   (seq=42)        |-- RobotCmdPacket ------> |
|                   |   (ESP-NOW unicast)       |
|                   |                          | [xu ly]
|                   |<-- RobotStatus(REACHED) --|
|<-- ack(reached,42)|                          |
|                   |                          |
|-- waypoint -----> |   [waypoint cuoi]        |
|   (seq=43)        |-- RobotCmdPacket ------> |
|                   |<-- RobotStatus(ARRIVED)--|
|<-- ack(completed,43) --|                     |
|<-- robot_status(arrived,robot_id=N) --|      |
```

---

## 6. Thu vien can cai dat

| Thu vien | Phien ban | Cach cai |
|----------|-----------|----------|
| ArduinoJson | >= 6.21 | Arduino Library Manager |
| ESP32 Arduino Core | >= 2.0 | Tools > Board Manager |

**Board settings Arduino IDE:**
- Board: `ESP32 Dev Module`
- CPU Freq: 240 MHz
- Flash Size: 4MB
- Partition: Default 4MB with spiffs
- Upload Speed: 921600

---

## 7. Huong dan test nhanh (khong can robot)

```python
# test_coordinator.py - chay tren Pi hoac laptop co UART adapter
import serial, time
from pi.coordinator_protocol import waypoint_message, decode_message

ser = serial.Serial('/dev/ttyUSB0', 115200, timeout=1)
time.sleep(2)  # doi ESP32 boot

# Gui waypoint dau tien (seq=42, robot 1, move 3, wp 0/2)
pkt = waypoint_message(42, robot_id=1, move_id=3,
      waypoint_index=0, waypoint_count=2,
      x_mm=100, y_mm=0, heading_mrad=0, speed=120)
ser.write(pkt)

# Doi ACK (ESP32 se timeout sau 3 giay vi khong co robot that)
line = ser.readline()
msg = decode_message(line)
print(msg)  # type=fault (timeout expected)
```

> [!NOTE]
> Khi chua co robot that, coordinator se gui `fault` sau 3 giay (ROBOT_ACK_TIMEOUT_MS).
> Day la hanh vi dung. Khi co robot, se nhan `ack` voi status=reached/completed.

---

## 8. Viec phai lam truoc khi test phan cung

| # | Viec | File can sua | Uu tien |
|---|------|-------------|---------|
| 1 | Cap nhat MAC robot that | `robot_registry.h` `ROBOT_MACS[]` | **Cao** |
| 2 | Xac nhan WiFi channel khop | `espnow_robot.cpp` `peer.channel` | **Cao** |
| 3 | Viet firmware robot (nhan RobotCmdPacket, gui RobotStatusPacket) | Robot firmware | **Cao** |
| 4 | Dieu chinh ROBOT_ACK_TIMEOUT_MS neu robot cham | `cmd_handler.cpp` | Trung binh |
| 5 | Them retry ESP-NOW khi send failed | `espnow_robot.cpp` | Trung binh |

---

## 9. Lich su thay doi

| Ngay | Phien ban | Noi dung |
|------|-----------|----------|
| 02/10/2026 | v1.0 | Xay dung tu dau: 11 file C++, dual-core FreeRTOS, UART2 JSON Lines, ESP-NOW binary. ACK flow khop chinh xac voi serial_coordinator.py (_wait_for_ack echo seq). |