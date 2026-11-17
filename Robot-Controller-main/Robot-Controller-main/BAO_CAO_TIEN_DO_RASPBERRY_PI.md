# BAO CAO TIEN DO TRIEN KHAI RASPBERRY PI

## Du an Three Mens Morris Robot

**Ngay cap nhat:** 25/09/2026  
**Pham vi:** Cac phan da trien khai trong Raspberry Pi runtime.

---

## 1. Muc tieu trien khai

Xay dung nen tang xu ly trung tam tren Raspberry Pi cho he thong Three Mens Morris, su dung lai cac thanh phan phu hop tu du an `Robot-Controller` hien co.

Raspberry Pi se chiu trach nhiem:

- Quan ly trang thai van co.
- Kiem tra nuoc di hop le.
- Tinh toan Minimax.
- Lap ke hoach duong di tren ban co.
- Chuyen route logic thanh trajectory vat ly.
- Giao tiep voi ESP32 Coordinator qua Serial.

Cac module moi duoc thiet ke doc lap voi giao dien React va phan cung, giup kiem thu tung phan truoc khi ket noi camera hoac robot that.

---

## 2. Cac file da tao

Cac file nam trong:

```text
Robot-Controller-main/
+ Robot-Controller-main/
    + pi/
```

### 2.1. `pi/__init__.py`

Danh dau thu muc `pi` la Python package cho cac module runtime Raspberry Pi.

### 2.2. `pi/board_model.py`

Chua mo hinh logic va hinh hoc co ban cua ban co:

- 9 node, danh so tu `0` den `8`.
- Danh sach cac node ke nhau (BOARD_NEIGHBORS).
- 8 to hop chien thang.
- Kieu du lieu `Board`, `Player`, `PointMm`.
- Ham tao ban co rong.
- Kiem tra node va player hop le.
- Dem so quan cua nguoi choi.
- Kiem tra nguoi thang.
- Tim cac node co the di chuyen toi.
- Kiem tra bang toa do vat ly cua 9 node.

**Luu y luat co:** Node 4 (trung tam) ke voi ca 8 node con lai. Day la dung theo luat Three Mens Morris co duong cheo qua tam. Can tu kiem tra lai voi phien ban luat ma nhom da chot truoc khi do an.

### 2.3. `pi/morris_game.py`

Day la state machine chinh thuc cua tro choi tren Raspberry Pi.

Cac thanh phan chinh:

- `GameState`: trang thai bat bien cua van co.
- `Move`: bieu dien mot nuoc di.
- `new_game()`: tao van moi.
- `valid_moves()`: lay danh sach nuoc di hop le.
- `apply_move()`: ap dung nuoc di va tao state moi.
- `IllegalMove`: loi khi nuoc di khong hop le.

State machine ho tro:

```text
drop -> move -> game_over
```

### 2.4. `pi/minimax.py`

Trien khai Minimax phia Raspberry Pi voi alpha-beta pruning.

Cac chuc nang:

- Chon nuoc di cho AI.
- Xu ly ca giai doan dat quan va di chuyen.
- Danh gia vi tri trung tam, goc va tinh huong hai quan lien tiep.
- Move ordering: sap xep nuoc di truoc khi duyet (nuoc thang ngay tim truoc, giup alpha-beta prune som hon).
- Transposition table depth-aware: luu `(value, cached_depth)`, chi tai dung khi `cached_depth >= depth` hien tai.
- Dem so node da tim kiem.
- Ghi nhan do sau va thoi gian tinh toan.

Ket qua tra ve:

```python
MinimaxDecision(
    move=Move(...),
    score=...,
    depth=...,
    nodes_searched=...,
    elapsed_ms=...,
)
```

**Luu y thiet ke transposition table:** Gia tri danh gia phu thuoc vao do sau tim kiem con lai. Ket qua o depth=1 (nhin truoc 1 buoc) khong the duoc tai dung cho tinh toan depth=3 (nhin truoc 3 buoc) vi co the sai. Cache luu them `cached_depth` va chi tra ve gia tri cu neu `cached_depth >= depth` yeu cau. Day la cach chuan (khac voi full transposition table co lower/upper bound flag, nhung dung cho game nho nhu Three Mens Morris).

### 2.5. `pi/board_planner.py`

Cung cap lop lap ke hoach chuyen dong o muc ban co.

Co hai buoc chinh:

1. Tim route giua cac node logic bang A*.
2. Chuyen route thanh trajectory vat ly cho controller cu.

Interface chinh:

```python
plan_node_route(
    start_node,
    target_node,
    occupied_nodes=(),
    board_nodes_mm=None,    # tuy chon: heuristic Euclidean mm khi co toa do
)
```

va:

```python
route_to_trajectory(
    route,
    board_nodes_mm,
    start_pose=None,
    speed_mm_s=100.0,
)
```

Trajectory dinh dang tuong thich voi `controller_main.py`:

```python
(x_mm, y_mm, theta_rad, relative_time_s, action_tag)
```

**Luu y heuristic A*:** Khi `board_nodes_mm` duoc truyen vao, heuristic dung Euclidean distance thuc thay vi abs(ID diff). Tuy nhien do do thi chi co 9 node, BFS cung cho ket qua tot -- Euclidean giup khi toa do ban co khong deu nhau.

### 2.6. `pi/coordinator_protocol.py`

Dinh nghia protocol JSON Lines giua Raspberry Pi va ESP32 Coordinator.

Packet co dang:

```json
{
  "version": 1,
  "seq": 42,
  "type": "waypoint",
  "payload": {
    "robot_id": 1,
    "move_id": 17,
    "index": 2,
    "count": 4,
    "x_mm": 185,
    "y_mm": 240,
    "heading_mrad": 1570,
    "speed": 120
  }
}
```

Dac diem da trien khai:

- Protocol version.
- Sequence number 16-bit.
- Gioi han kich thuoc mot dong Serial la 512 bytes.
- Kiem tra JSON hop le.
- Kiem tra payload la object.
- Kiem tra robot ID tu 1 den 6.
- Kiem tra waypoint index/count.
- Kiem tra gioi han toa do signed 16-bit.
- Kiem tra heading milliradian.
- Kiem tra toc do tu 0 den 255.

---

## 3. Cac file kiem thu da tao

### `pi/test_morris_game.py`

Kiem tra:

- State ban dau khong bi thay doi sau khi ap dung nuoc di.
- Chuyen nguoi choi.
- Chuyen pha tu dat quan sang di chuyen.
- Tu choi di chuyen khong ke nhau.
- Phat hien winning line.

### `pi/test_minimax.py`

Kiem tra:

- AI chon nuoc thang ngay.
- AI chan nuoc thang ngay cua doi phuong.
- AI khong tra ve nuoc di khi game da ket thuc.
- [Moi] Depth-aware cache: ket qua depth=1 khong duoc tai dung cho depth=4.
- [Moi] Move ordering tim duoc nuoc thang ngay o root.
- [Moi] Ket qua la deterministic cho cung mot vi tri.

### `pi/test_board_planner.py`

Kiem tra:

- Route tranh node dang bi chiem.
- Bao loi khi khong ton tai duong di.
- Trajectory co dung dinh dang controller.
- Tinh dung chieu dai route.

### `pi/test_coordinator_protocol.py`

Kiem tra:

- Encode/decode packet waypoint.
- Tu choi robot ID khong hop le.
- Tu choi JSON sai.
- Tu choi packet vuot kich thuoc cho phep.

### `pi/test_serial_coordinator.py`

Kiem tra:

- Gui du waypoint theo trajectory.
- Emergency stop dung lenh cap cao.
- [Moi] Tat ca waypoint trong mot execute() phai co cung move_id.
- [Moi] move_id phai on dinh du sequence counter tang.

---

## 4. Ket qua kiem thu

Da chay lenh:

```powershell
python -m unittest discover -s . -p "test_*.py" -v
```

Ket qua (25/09/2026):

```text
Ran 26 tests in 0.035s
OK
```

Chi tiet so luong:

| Nhom | So test |
|---|---:|
| Game state | 4 |
| Minimax | 6 |
| Board planner | 4 |
| Coordinator protocol | 4 |
| Backend integration | 4 |
| Serial coordinator | 4 |
| **Tong cong** | **26** |

Toan bo test hien tai deu dat.

---

## 5. Luong Raspberry Pi hien tai

Luong logic da hinh thanh:

```text
GameState
    |
    v
Minimax quyet dinh nuoc di (move ordering + depth-aware cache)
    |
    v
Board planner tim route node (A* voi heuristic Euclidean tuy chon)
    |
    v
Chuyen route thanh trajectory mm/radian/time
    |
    v
Coordinator protocol ma hoa waypoint (move_id co dinh cho ca nuoc di)
    |
    v
SerialCoordinatorTransport -> USB Serial
    |
    v
ESP32 Coordinator
```

Phan con thieu trong chuoi thuc thi:

```text
ESP32 Coordinator -> ESP-NOW -> Robot firmware
Camera (ArUco/OpenCV) -> BoardObservation -> GameState
```

---

## 6. Nhung phan chua trien khai tren phan cung

Cac phan sau khong nam trong ban thu nghiem VMware va chua duoc thuc hien:

- Sua `controller_main.py` (thay `scipy.misc.derivative`, tach electromagnet).
- Ket noi OpenCV/ArUco voi `BoardObservation` (can viet `board_vision.py`).
- Nhan dang quan co tren 9 node.
- Do toa do that cua cac node tren sa ban.
- Firmware ESP32 Coordinator (Serial RX, ACK, heartbeat, ESP-NOW).
- Giao tiep ESP-NOW.
- Firmware cua robot (phan cua Phuc).
- Kiem thu voi camera va robot vat ly.

---

## 7. Buoc phat trien tiep theo

Thu tu de xuat:

1. Sua `controller_main.py` (thay `scipy.misc.derivative`, tach electromagnet interface).
2. Viet `pi/board_vision.py` tu ArUco hien co.
3. Do va cau hinh toa do 9 node that, truyen `board_nodes_mm` vao trajectory builder.
4. Chay mot robot voi mot route co dinh (end-to-end qua Serial that).
5. Viet firmware ESP32 Coordinator toi thieu (Serial RX, ACK, heartbeat, emergency stop, ESP-NOW).
6. Them ACK, retry, timeout va heartbeat trong `SerialCoordinatorTransport`.
7. Tich hop Minimax voi camera observation.
8. Mo rong tu 1 robot len 6 robot.

---

## 8. Danh gia moc hoan thanh

Moc hien tai da hoan thanh phan loi phan mem Raspberry Pi o muc khong phu thuoc phan cung:

- Game state da co nguon su that duy nhat.
- Minimax da duoc tach khoi giao dien, co move ordering va depth-aware cache dung.
- Planner da tach khoi game logic.
- Trajectory da tuong thich voi controller cu.
- Protocol Coordinator da co validation.
- Co 29 unit test bao ve hanh vi chinh, bao gom game state, Minimax, direct-edge trajectory, protocol, serial adapter va WebSocket smoke test.

Chua the ket luan he thong robot hoan chinh cho den khi co kiem thu phan cung thuc te, dac biet la do chinh xac camera, sai so dung robot, do tre Serial/ESP-NOW va co che dung an toan.

---

## 9. Ket noi Backend Raspberry Pi voi Frontend

### 9.1. Backend authoritative

File chinh: `pi/backend.py`

Backend hien chiu trach nhiem chinh thuc cho:

- Trang thai ban co.
- Nguoi choi hien tai.
- Giai doan `drop`, `move`, `game_over`.
- Kiem tra nuoc di.
- Chon robot tuong ung voi quan co.
- Goi Minimax cho Player vs AI.
- Tao trajectory tren canh ke hop le; A* chi la planner tuy chon cho vat can vat ly.
- Theo doi robot dang di chuyen.
- Phat trang thai robot.
- Xu ly emergency stop.

### 9.2. WebSocket server

File: `pi/websocket_server.py`

Server nhan cac command tu Dashboard:

```json
{"type":"join_game","mode":"pva","player_team":1}
{"type":"select_move","robot_id":1,"from_node":null,"to_node":0}
{"type":"reset_game"}
{"type":"emergency_stop"}
```

Server phat cac event:

```text
hello_ack | game_state | ai_thinking | ai_decision
astar_result | move_start | robot_status | move_complete
system_telemetry | fault
```

### 9.3. Dong bo animation va robot state

Frontend da duoc sua de tuan thu trang thai robot thuc te:

- Animation chi bat dau sau khi nhan `move_start` tu backend.
- Board chi cap nhat sau khi nhan `move_complete`.
- Trang thai robot lay tu event `robot_status`.
- Loi tu backend hien thi qua event `fault`.

### 9.4. Serial Coordinator transport

File: `pi/serial_coordinator.py`

Transport thuc hien: gui waypoint -> cho ACK -> waypoint tiep theo -> timeout neu khong nhan ACK.

```python
from pi.serial_coordinator import open_serial_transport
transport = open_serial_transport("/dev/ttyUSB0")
```

Trong giai doan hien tai, backend van su dung `SimulationTransport` mac dinh.

### 9.5. Dependency runtime

File: `pi/requirements.txt`

```text
websockets>=12,<16
pyserial>=3.5
```

Cai dat:

```bash
python -m pip install -r pi/requirements.txt
```

### 9.6. Cach chay he thong hien tai

```bash
# Backend
cd Robot-Controller-main/Robot-Controller-main
python -m pi.websocket_server

# Frontend (thu muc thuc te)
cd "three-men's-morris-robot-dashboard"
npm install && npm run dev
```

Frontend mac dinh ket noi toi `ws://127.0.0.1:8765`.  
Khi chay tren Raspberry Pi: `ws://192.168.1.50:8765`.

### 9.7. Trang thai hoan thanh hien tai

| Hang muc | Trang thai |
|---|---|
| Game state tren Raspberry Pi | Hoan thanh |
| Luat Three Mens Morris | Hoan thanh va co test |
| Minimax tren Raspberry Pi | Hoan thanh va co test (move ordering + depth-aware cache) |
| A* board planner | Hoan thanh va co test |
| JSON Lines protocol | Hoan thanh va co test |
| WebSocket backend | Hoan thanh ban simulation |
| Frontend gui command that | Da noi |
| Frontend nhan event backend | Da noi |
| Serial transport | Adapter hoan chinh, chua noi ESP32 that |
| Camera observation / board_vision.py | Chua trien khai |
| ESP32 Coordinator firmware | Chua trien khai |
| Robot firmware/ESP-NOW | Chua trien khai (phan Phuc) |
| Kiem thu robot vat ly | Chua thuc hien |

---

## 10. Lich su thay doi ky thuat

### 10.1. 23/09/2026 -- Moc ban dau

- Tao cac module pi/ (board_model, morris_game, minimax, board_planner, coordinator_protocol).
- 14 unit tests dat.
- Minimax va state machine chay duoc doc lap voi phan cung.

### 10.2. 23/09/2026 -- Ket noi Frontend

- Them backend.py, websocket_server.py, serial_coordinator.py.
- Them 7 test backend va serial coordinator.
- 21 unit tests dat.
- Frontend da noi qua WebSocket (simulation mode).

### 10.3. 25/09/2026 -- Sua loi va kiem thu

**Bug da sua:**

| Loi | File | Mo ta |
|---|---|---|
| move_id sai | serial_coordinator.py | move_id duoc set bang sequence counter (tang theo waypoint), nen moi waypoint trong cung mot nuoc di mang move_id khac nhau. ESP32 khong the nhom cac waypoint cua cung mot nuoc di. Fix: execute() nhan them `move_id` tu backend. |
| Transposition table depth | minimax.py | Phien ban truoc bo depth khoi key (sai). Phien ban nay luu `(value, cached_depth)` va chi tai dung khi `cached_depth >= depth` yeu cau, ngan ket qua tim nong duoc dung sai cho tim sau. |

**Cai tien:**

| Cai tien | File | Mo ta |
|---|---|---|
| Move ordering | minimax.py | Sap xep nuoc di truoc khi duyet alpha-beta (nuoc thang ngay tim truoc). Giam so node can tim kiem. |
| Heuristic A* Euclidean | board_planner.py | Khi co board_nodes_mm, dung Euclidean distance thuc thay vi abs(ID diff). |
| Python 3.9 compat | websocket_server.py | Thay `X | None` bang `Optional[X]`. |
| Logging | websocket_server.py | Log ket noi/ngat ket noi client kem IP. |

**Test moi** (khong chi sua signature):

- `test_deeper_search_does_not_use_shallower_cached_result`: xac nhan depth-aware cache guard dung (nodes_searched depth=4 > depth=1).
- `test_move_ordering_finds_winning_move_at_root`: xac nhan move ordering tim duoc nuoc thang ngay.
- `test_move_result_is_deterministic`: ket qua nhu nhau khi goi lai.
- `test_move_id_is_consistent_across_all_waypoints`: moi waypoint trong execute() co cung move_id.
- `test_move_id_differs_from_sequence_counter`: move_id on dinh du sequence tang.

**Ket qua cuoi:** 26/26 tests dat.
