# BAO CAO DE XUAT KIEN TRUC VA KE HOACH TRIEN KHAI

## He thong co nguoi tu hanh Three Mens Morris

**Phien ban:** 1.1 (Cap nhat 25/09/2026)  
**Ngay:** 25/09/2026  
**Pham vi:** Tai su dung nen tang `Robot-Controller` hien co, ket hop Raspberry Pi, Camera va ESP32 Coordinator.

---

## 1. Muc dich bao cao

Bao cao nay xac dinh cac thay doi can thuc hien de chuyen codebase `Robot-Controller` hien tai, von duoc xay dung cho bai toan van chuyen pallet, thanh he thong Three Mens Morris tu hanh theo ke hoach do an.

Muc tieu trien khai la:

- Raspberry Pi xu ly camera, nhan dang ban co, game state, WebSocket Dashboard va tuy chon AI Minimax khi choi voi may.
- ESP32 Coordinator lam cau truyen thong giua Raspberry Pi va cac robot qua USB Serial va ESP-NOW.
- Moi robot nhan lenh, chay dieu khien chuyen dong/PID, do line hoac bam waypoint va gui trang thai ve Coordinator.
- Dashboard hien thi trang thai thuc te, khong tu quyet dinh ban co hay gia lap chuyen dong khi da ket noi phan cung.

Day la thay doi kien truc phan cung co kiem soat. Cac thuat toan dieu khien va xu ly anh da co trong `Robot-Controller` duoc giu lai, con phan pallet-specific duoc thay bang domain Three Mens Morris.

---

## 2. Ket luan hien trang codebase

Workspace hien co hai he thong doc lap.

### 2.1. Robot-Controller

Thu muc: `Robot-Controller-main/Robot-Controller-main`

Day la nen tang co gia tri nhat de tai su dung. No da co:

- Camera capture bang OpenCV.
- Perspective transform de dua anh sa ban ve he toa do phang.
- Nhan dang ArUco.
- Xac dinh pose robot `(x, y, theta)`.
- Bo dieu khien bam quy dao.
- Noi suy cubic Hermite/B-spline.
- Tinh van toc tuyen tinh va van toc goc.
- Chuyen doi sang van toc banh trai/phai.
- Visualizer theo doi robot va path.
- C++ A* planner trong khong gian 4 chieu.
- Cau noi Python/C++ bang pybind11.

Luong cu:

```text
Camera -> ArUco -> Pallet/Goal Planner -> Controller -> HTTP -> Robot
```

### 2.2. Dashboard

Thu muc: `three-men's-morris-robot-dashboard`

Dashboard hien co gia tri o vai tro giao dien va prototype:

- Mo hinh ban co 9 node.
- Luat Three Mens Morris.
- Minimax phia trinh duyet (chi la prototype, khong authoritative).
- Planner graph ban co cho prototype; nuoc di hop le thuc te chi can trajectory tren mot canh ke.
- Hien thi 6 robot.
- Man hinh telemetry va log.
- Dinh nghia cac event WebSocket.

Tuy nhien day chua phai he thong dieu khien phan cung:

- Game state dang nam trong React.
- Minimax dang chay trong browser.
- A* dang chay trong browser.
- Chuyen dong robot chi la animation.
- WebSocket that chua duoc noi vao game flow.
- Chua co Raspberry Pi server.
- Chua co Serial protocol.
- Chua co ESP-NOW Coordinator va firmware robot.

### 2.3. File ke hoach

File ke hoach xac dinh cac nhom cong viec chinh:

1. He thong trung tam va xu ly anh.
2. AI Minimax va Web Dashboard.
3. Sau robot, phan cung va dieu khien chuyen dong.
4. ESP-NOW phia Coordinator va phia robot.
5. FreeRTOS, WebSocket, tich hop va kiem thu.

Kien truc moi van dap ung cac nhom nhiem vu do. Diem thay doi la xu ly nang duoc chuyen tu ESP32-S3-CAM sang Raspberry Pi, con ESP32 Coordinator dam nhiem truyen thong thoi gian thuc.

---

## 3. Lua chon kien truc: Pi + ESP32 Coordinator

### 3.1. Tai sao khong dat tat ca tren ESP32-S3

Cac li do ky thuat cu the (khong phai "so qua tai" chung chung):

**Xu ly anh la rang buoc chinh:**
- Nhan dang pose cua 6 xe bang ArUco, kem hieu chinh camera, phuong sai va perspective warp, can OpenCV day du. ESP32-S3 khong co thu vien nay va PSRAM (8 MB) khong du cho buffer anh + xu ly.
- Neu chi doc mau trong 9 vung co dinh thi nhe, nhung tracking xe se that bai neu xe bi che.

**WiFi va ESP-NOW dung chung mot radio:**
- ESP-NOW phai cung kenh voi WiFi dang ket noi. Neu vua chay web dashboard, vua phat lenh cho 6 xe qua ESP-NOW cung mot radio, de gay mat goi, do tre va vuot bung khi co nhieu xe phan hoi dong thoi.
- Tach Coordinator khoi WiFi/web cho phep Coordinator giu kenh ESP-NOW on dinh, khong bi tranh kenh.

**Minimax va A* la li do phu:**
- Khong gian trang thai Three Mens Morris la 3^9 ap 20,000 ban co. ESP32-S3 (240 MHz, C++) giai xong cay trong vai mili giay. Day khong phai li do chinh de chuyen sang Pi.

**So sanh hai phuong an:**

| | All-in ESP32-S3 | Pi + ESP32 Coordinator |
|---|---|---|
| Xu ly anh (ArUco tracking) | Kho, RAM han che, khong co OpenCV | Tot, Python + OpenCV |
| WiFi web + ESP-NOW | Dung chung radio, nguy co mat goi | Tach biet, Coordinator co dinh kenh ESP-NOW |
| Minimax/A* | Duoc nhung khong phai ly do chinh | Duoc, phu phan logic game |
| FreeRTOS | Van dung duoc nhung phu tai | FreeRTOS chi cho Coordinator: task ro rang, nho gon, de watchdog |
| Phat trien don gian | Kho debug, kho test tung phan | Pi test doc lap, ESP32 test doc lap |

### 3.2. Kien truc chot

```text
                         +----------------------+
                         |  Overhead Camera     |
                         +----------+-----------+
                                    |
                                    v
                         +----------------------+
                         | Raspberry Pi         |
                         | - OpenCV/ArUco       |
                         | - Board Vision       |
                         | - Game State         |
                         | - Game State         |
                         | - Minimax (optional) |
                         | - Direct-edge motion |
                         | - Controller         |
                         | - WebSocket Server   |
                         +----------+-----------+
                                    |
                         USB Serial | JSON Lines
                                    v
                         +----------------------+
                         | ESP32 Coordinator    |
                         | - Serial RX/TX       |
                         | - Command validation |
                         | - ACK/retry          |
                         | - ESP-NOW            |
                         | - Heartbeat/E-stop   |
                         +----+-----+-----+-----+
                              |     |     |
                         ESP-NOW  ESP-NOW ESP-NOW
                              v     v     v
                         +------+------+------+
                         | Robot 1 ... Robot 6 |
                         | - Line/PID          |
                         | - Motor driver      |
                         | - Encoder           |
                         | - Battery           |
                         | - Local watchdog    |
                         +---------------------+
```

### 3.3. Quyen so huu trang thai

- **Raspberry Pi**: nguon trang thai chinh thuc (ban co, game state, vi tri robot qua camera); Minimax la tuy chon cho PVA.
- **ESP32 Coordinator**: xac thuc, chuyen tiep, bao ve he thong. Khong tu quyet dinh nuoc co.
- **Robot**: thuc thi lenh chuyen dong, phan hoi trang thai.
- **Dashboard**: gui yeu cau, hien thi event tu Pi.

### 3.4. An toan

Pi la diem loi duy nhat, nen:

- ESP32 Coordinator giu heartbeat timer. Neu khong nhan heartbeat tu Pi trong thoi gian gioi han, tu dong gui lenh STOP toi tat ca robot.
- Robot co local watchdog: tu dung neu khong nhan lenh trong N ms.

---

## 4. Phan loai code: giu lai, sua va viet moi

### 4.1. Giu lai va tai su dung

| File/module | Muc tai su dung | Viec can lam |
|---|---:|---|
| `cv_main.py` | Cao | Giu camera loop, them interface an toan va board observation |
| `cv_fiducial.py` | Trung binh-cao | Giu ArUco/perspective transform, bo logic pallet/goal |
| `controller_main.py` | Cao | Giu spline, PID, wheel velocity; sua cac loi an toan |
| `mainHelper.py` | Trung binh | Giu gioi han PWM va path preprocessing; thay HTTP transport |
| `constants.py` | Trung binh | Tach camera, robot, controller va Morris constants |
| `src/motion_planner.cc` | Trung binh | Co the dung sau khi chuan hoa input/output va don vi |
| Visualizer OpenCV | Cao | Dung debug pose, path, board node va trang thai robot |
| Dashboard components | Trung binh-cao | Giu UI, chuyen du lieu sang WebSocket that |

### 4.2. Khong nen dung nguyen trang

| Thanh phan | Ly do |
|---|---|
| `task_planner.cc` | Phu thuoc pallet assignment va goal |
| `cv_GetPalletPositions()` | Khong dai dien cho quan co Morris |
| HTTP robot requests | Phu thuoc firmware va mang cu |
| Browser-side authoritative game state | De sai lech so voi robot that |
| Dashboard A* fallback di thang | Co the tao duong di xuyen vat can |

### 4.3. Module can viet moi

```text
pi/
+-- morris_game.py          [Hoan thanh]
+-- minimax.py              [Hoan thanh]
+-- board_model.py          [Hoan thanh]
+-- board_planner.py        [Hoan thanh]
+-- coordinator_protocol.py [Hoan thanh]
+-- serial_coordinator.py   [Hoan thanh]
+-- backend.py              [Hoan thanh - simulation mode]
+-- websocket_server.py     [Hoan thanh - simulation mode]
+-- board_vision.py         [Chua viet]

coordinator-firmware/
+-- main/
|   +-- serial_protocol.cpp     [Chua viet]
|   +-- espnow_transport.cpp    [Chua viet]
|   +-- command_router.cpp      [Chua viet]
|   +-- safety_watchdog.cpp     [Chua viet]

robot-firmware/             [Phan cua Phuc]
+-- motor_control.cpp
+-- line_pid.cpp
+-- espnow_client.cpp
+-- telemetry.cpp
+-- safety_watchdog.cpp
```

---

## 5. Chuyen doi mo hinh du lieu

### 5.1. Pose robot

Giu chuan pose hien tai:

```python
robot_pose = (x_mm, y_mm, theta_rad)
```

Moi robot can co dinh danh on dinh:

```python
RobotObservation(
    robot_id=1,
    fiducial_id=23,
    x_mm=420.0,
    y_mm=315.0,
    theta_rad=1.57,
    confidence=0.94,
    timestamp_ms=...
)
```

Khong duoc dung vi tri trong danh sach detection lam robot ID.

### 5.2. Board node

Tao mot bang cau hinh vat ly cho 9 node:

```python
BOARD_NODES_MM = {
    0: (x0, y0),
    1: (x1, y1),
    ...
    8: (x8, y8),
}
```

Cac toa do nay phai duoc do tu sa ban that sau perspective transform.

### 5.3. Game state

```python
GameState(
    board=[None, 1, None, 2, 1, None, None, 2, None],
    current_player=1,
    phase="drop",
    turn_count=4,
    winner=None,
    winning_line=None,
)
```

Robot va quan co phai duoc lien ket rieng:

```python
PieceState(
    player=1,
    robot_id=2,
    node_id=4,
)
```

---

## 6. Luong xu ly mot nuoc di

### 6.1. Nuoc di cua nguoi choi

```text
Dashboard -> move_request
         -> Raspberry Pi kiem tra luat
         -> xac dinh robot tuong ung
         -> kiem tra canh ke va tao trajectory truc tiep
         -> controller tao trajectory
         -> serial_coordinator gui lenh
         -> ESP32 Coordinator gui ESP-NOW
         -> robot thuc hien
         -> robot bao waypoint_reached/completed
         -> Pi kiem tra camera xac nhan vi tri
         -> Pi cap nhat GameState
         -> Pi phat move_completed
         -> Dashboard render state moi
```

### 6.2. Nuoc di cua AI

```text
Camera observation -> GameState
                   -> (tuy chon) Minimax tren Raspberry Pi
                   -> move decision
                   -> direct-edge trajectory; A* chi dung neu phat sinh vat can vat ly
                   -> controller
                   -> serial -> Coordinator -> ESP-NOW -> robot
```

AI khong duoc chay trong React khi ket noi phan cung.

### 6.3. Xac nhan hoan thanh

Khong phat `move_completed` chi vi timer animation ket thuc. Can dong thoi co:

1. Robot bao da den waypoint cuoi.
2. Camera xac nhan robot nam trong sai so cho phep quanh node dich.
3. Robot khong bao fault.

---

## 7. Tai su dung `controller_main.py`

### 7.1. Interface can giu

Controller co the giu interface dang:

```python
Controller(robot_id, robot_path).get_robot_command(robot_pose)
```

Trong do `robot_path` la danh sach:

```python
(x_mm, y_mm, theta_rad, relative_time_s, action_tag)
```

Doi voi Morris, `action_tag` mac dinh la `NO_ACTION`.

### 7.2. Cac loi can sua truoc khi dung that

- Khong mutate pose dau vao khi doi dau truc Y.
- Thay `scipy.misc.derivative`, vi API nay da deprecated.
- Tinh dao ham theo khoang thoi gian thuc giua cac frame.
- Chuan hoa sai so goc bang `atan2(sin(error), cos(error))` o moi noi.
- Them gioi han tich phan va anti-windup.
- Co timeout khi camera khong cap nhat.
- Co dieu kien hoan thanh dua tren sai so vi tri, sai so goc va van toc.
- Tach logic electromagnet khoi motion controller.
- Dung transport adapter thay cho HTTP request truc tiep.

### 7.3. Transport adapter

Controller chi tra ve lenh vat ly:

```python
VelocityCommand(
    robot_id=1,
    left_mm_s=32.0,
    right_mm_s=35.0,
    magnet=0,
    sequence=42,
)
```

Viec gui lenh do `SerialCoordinator` dam nhiem.

---

## 8. Tai su dung Computer Vision

### 8.1. Giu lai

- Capture camera.
- ArUco dictionary va detection.
- Tinh pose marker.
- Perspective transform.
- Don vi millimet.
- Visualizer.

### 8.2. Viet them

`board_vision.py` can cung cap interface nho:

```python
def observe(frame) -> BoardObservation: ...
```

Ket qua nen chua:

```python
BoardObservation(
    board_detected=True,
    confidence=0.95,
    robots=[...],
    occupied_nodes={1: 1, 4: 2},
    timestamp_ms=...
)
```

### 8.3. Cach nhan dang quan co

Co the chon mot trong hai phuong an:

1. Nhan dang mau quan co sau khi warp anh.
2. Gan ArUco/AprilTag rieng len quan co.

Phuong an mau don gian hon nhung can xu ly anh sang. Phuong an marker on dinh hon nhung lam phan cung phuc tap hon. Nen dung mau cho prototype va marker neu can do tin cay cao khi bao ve.

### 8.4. Sua loi can thiet trong CV cu

- Xoa marker khoi cache khi khong con nhin thay hoac gan timestamp het han.
- Kiem tra `ret` sau `cap.read()`.
- Dung lock khi chia se frame giua camera thread va xu ly anh.
- Khong de camera init cho vo han; co timeout va thong bao loi.
- Do chinh xac kich thuoc ArUco thay vi dung gia tri doan.
- Chuan hoa thu tu `width/height` trong perspective transform.
- Them kiem tra du bon goc sa ban.

---

## 9. Planner cho ban co

### 9.1. Phan biet hai loai planner

1. **Game planner:** quyet dinh node nguon va node dich theo luat Morris.
2. **Motion planner:** tao duong di vat ly tu pose robot den node dich.

Minimax chi lam viec voi board state. No khong biet PWM, camera hay ESP-NOW.

### 9.2. Board planner

Interface de xuat:

```python
plan_robot_to_node(
    robot_pose,
    target_node,
    occupied_robot_poses,
) -> MotionPath
```

`MotionPath` phai chua cac waypoint vat ly co don vi mm va heading radian.

### 9.3. C++ planner cu

C++ planner co the duoc tai su dung o giai doan sau, nhung truoc tien can xu ly:

- Kiem tra bien khi inflate obstacle.
- Chuan hoa chuyen doi don vi.
- Sua heading tuong doi/thuc te trong neighbor generation.
- Xu ly wrap-around goc.
- Tranh so sanh double bang equality tuyet doi.
- Quan ly bo nho node.
- Reset trang thai planner giua cac lan lap ke hoach.
- Kiem tra kich thuoc vector dau vao.

Doi voi prototype Three Mens Morris, nen bat dau bang graph 9 node va waypoint vat ly. Chi chuyen sang C++ 4D A* sau khi duong di don robot da on dinh.

---

## 10. Giao thuc Serial va ESP-NOW

### 10.1. Raspberry Pi -> ESP32 Coordinator

Giai doan dau dung JSON Lines de de debug:

```json
{"version":1,"seq":42,"type":"waypoint","robot_id":1,"move_id":17,"index":2,"count":4,"x_mm":185,"y_mm":240,"heading_mrad":1570,"speed":120}
```

Moi dong ket thuc bang `\n`.

ESP32 phai tra ACK:

```json
{"version":1,"seq":42,"type":"ack","robot_id":1,"move_id":17,"status":"accepted"}
```

Cac message chinh:

```text
hello | heartbeat | waypoint | stop | hold | clear_fault | emergency_stop
```

### 10.2. ESP32 Coordinator -> Robot

ESP-NOW dung packet binary co dinh duoi 32 bytes. Khong truyen JSON hoac toan bo route.

Packet waypoint de xuat:

| Truong | Bytes |
|---|---:|
| Magic | 1 |
| Version | 1 |
| Message type | 1 |
| Flags | 1 |
| Sequence | 2 |
| Robot ID | 1 |
| Waypoint index/count | 2 |
| X mm fixed-point | 2 |
| Y mm fixed-point | 2 |
| Heading mrad | 2 |
| Speed/PWM | 1 |
| Action | 1 |
| Deadline | 2 |
| Reserved | 2 |
| CRC-16 | 2 |
| **Tong** | **23** |

### 10.3. Co che tin cay

- Sequence number de chong packet cu.
- CRC-16 de phat hien loi du lieu.
- ACK cho lenh quan trong.
- Retry gioi han, khong retry vo han.
- Timeout khi robot khong phan hoi.
- Heartbeat dinh ky.
- Robot tu dung khi heartbeat het han.
- Emergency stop co do uu tien cao hon moi waypoint.
- Coordinator khong phat waypoint tiep theo truoc khi xu ly trang thai waypoint hien tai.

**Day la thiet ke chinh cua Coordinator**: giao thuc ACK/retry/heartbeat/emergency-stop la thu co the trinh bay va do duoc.

---

## 11. Thay doi Dashboard

### 11.1. Giu lai

- Board UI.
- Man hinh game mode.
- Robot status card.
- System telemetry.
- A* visualization.
- Event log.

### 11.2. Thay doi bat buoc

- `move_request` phai gui qua WebSocket that.
- Khong cap nhat board truoc khi Pi xac nhan `move_completed`.
- Khong tu chay animation nhu bang chung robot da den noi.
- Hien thi trang thai `commanded`, `moving`, `verified`, `fault`.
- Dong bo `game_state` tu Pi khi mo trang hoac reconnect.
- Hien thi mat ket noi va che do simulation ro rang.
- Bo sung nut emergency stop gui lenh thuc te.

### 11.3. WebSocket messages

Client gui:

```text
hello | join_game | move_request | reset_game | emergency_stop | camera_calibrate | ping
```

Server gui:

```text
hello_ack | game_state | move_accepted | move_rejected | move_started
waypoint_reached | move_completed | robot_status | ai_thinking | ai_decision
camera_state | telemetry | fault | pong
```

Moi command phai co `message_id`, `sequence`, timestamp va ACK tuong ung.

---

## 12. To chuc FreeRTOS tren ESP32 Coordinator

Coordinator chi dam nhiem cong viec phu hop voi vi dieu khien:

| Task | Trach nhiem |
|---|---|
| Serial RX | Nhan va parse JSON Lines tu Raspberry Pi |
| Command Router | Kiem tra sequence, robot ID, gioi han gia tri |
| ESP-NOW TX | Gui packet toi robot tuong ung |
| ESP-NOW RX | Nhan ACK/telemetry tu robot |
| Heartbeat | Theo doi Pi va robot (dung ca khi mat Pi) |
| Safety Monitor | Stop khi timeout, fault hoac emergency stop |
| Telemetry | Tong hop RSSI, battery, state |

Khong dat OpenCV, Minimax hoac xu ly anh vao Coordinator. FreeRTOS chi ho tro phan chia cac task truyen thong va an toan -- day la phan van duoc giu trong ke hoach do an.

---

## 13. Cac thay doi cu the theo file

### Robot-Controller

1. `constants.py`: Tach constants camera, board, robot va transport. Them 6 robot ID/fiducial mapping. Them nguong sai so node. Them timeout camera/heartbeat.
2. `cv_fiducial.py`: Tach robot detection khoi pallet/goal detection. Them cache expiration. Them confidence va timestamp.
3. `cv_main.py`: Them camera lock. Them kiem tra frame hop le. Them board observation.
4. `controller_main.py`: Sua input mutation, dao ham, PID va wrap angle. Tach electromagnet. Tra ve `VelocityCommand`.
5. `mainHelper.py`: Giu safety filter. Xoa hoac co lap HTTP sender. Them adapter goi `SerialCoordinator`.
6. `mainProgram.py`: Thay bang runtime Morris moi.

### Dashboard

1. `src/network/protocol.ts`: Chuan hoa envelope co version/message_id/sequence. Doi ten event theo giao thuc that.
2. `src/network/websocket.ts`: Them reconnect co gioi han. Them ACK timeout. Phan biet simulation va hardware mode.
3. `src/screens/GameScreen.tsx`: Gui `move_request` thay vi tu chay movement. Nhan `game_state` va `move_completed` tu Pi.

---

## 14. Ke hoach trien khai de xuat

### Giai doan 1: Chuan hoa nen tang [DA HOAN THANH]

- [x] Tao `pi/` package.
- [x] Board model va game state.
- [x] Minimax voi alpha-beta pruning.
- [x] Board planner A*.
- [x] Serial coordinator protocol.
- [x] WebSocket backend (simulation mode).
- [x] 26 unit tests.

**Ket qua:** Co the chay game va controller bang du lieu gia lap.

### Giai doan 2: Camera va dinh vi

- Hieu chinh camera that.
- Do kich thuoc marker.
- Xac dinh 9 node vat ly.
- Nhan dang 1 robot truoc.
- Kiem tra pose on dinh o nhieu vi tri.

**Ket qua:** Camera tra ve pose robot va board state dang tin cay.

### Giai doan 3: Dieu khien mot robot

- Tao path tu robot toi mot node.
- Chay `controller_main.py` voi fake transport.
- Ket noi mot robot that qua Coordinator.
- Kiem tra dung dung node.

**Ket qua:** Mot robot chay dung chuoi waypoint va dung trong sai so cho phep.

### Giai doan 4: Coordinator va ESP-NOW

- Hoan thien JSON Lines Serial.
- Gui waypoint tu Pi toi ESP32.
- Gui binary packet tu Coordinator toi mot robot.
- Them ACK, retry va watchdog.

**Ket qua:** Lenh di xuyen suot Pi -> Serial -> ESP-NOW -> robot.

### Giai doan 5: Sau robot

- Dang ky peer ESP-NOW.
- Mapping robot ID on dinh.
- Kiem tra xung dot duong di.
- Bo sung trang thai battery/RSSI/fault.

**Ket qua:** Sau robot co the duoc dieu phoi va giam sat rieng.

### Giai doan 6: Tich hop game

- Pi lam authoritative game server.
- Minimax dua ra nuoc di.
- Board planner chon robot tuong ung.
- Robot di chuyen va camera xac nhan.
- Dashboard nhan state that.

**Ket qua:** Hoan thanh mot van co tu dong.

### Giai doan 7: On dinh va bao ve

- Test mat camera, Serial, ESP-NOW, robot bi ket, emergency stop.
- Ghi log va do do tre.
- Hoan thien so do khoi, protocol va so lieu thuc nghiem.

---

## 15. Tieu chi nghiem thu

### Camera

- Nhan dang du bon goc ban.
- Sai so node sau calibration duoc do bang mm.
- Nhan dang robot on dinh trong nhieu frame lien tiep.
- Co trang thai loi khi mat marker.

### Game

- Luat dat quan dung.
- Luat di chuyen dung.
- Minimax khong dua ra nuoc di bat hop le.
- Pi la nguon game state duy nhat.

### Motion

- Robot nhan dung waypoint.
- Robot dung trong vung sai so dinh truoc.
- Robot tu dung khi mat heartbeat.
- Khong di xuyen node dang bi chiem.

### Communication

- Packet co sequence va CRC.
- Co ACK/retry/timeout.
- Coordinator dinh tuyen dung robot.
- Emergency stop den duoc tat ca robot.

### Dashboard

- Hien thi state that tu Pi.
- Khong bao hoan thanh truoc khi robot va camera xac nhan.
- Reconnect khong lam mat game state.
- Simulation mode duoc tach ro khoi hardware mode.

---

## 16. Rui ro va bien phap giam thieu

| Rui ro | Muc do | Bien phap |
|---|---:|---|
| Camera khong on dinh | Cao | Calibration, confidence, cache expiration, timeout |
| Robot nhan nham ID | Cao | Mapping fiducial/MAC co dinh |
| Robot dung lech node | Cao | Camera verification va PID tuning |
| Mat packet ESP-NOW | Cao | Sequence, CRC, ACK, retry |
| Pi mat ket noi | Cao | Coordinator heartbeat va stop all |
| Dashboard lech state | Cao | Pi authoritative, snapshot khi reconnect |
| Path xung dot | Cao | Reservation/occupancy va stop an toan |
| Controller cu phu thuoc pallet | Trung binh | Tach action tag va transport |
| C++ planner loi bien/bo nho | Trung binh | Chua dua vao MVP, sua sau khi co test |
| Sau robot gay nhieu | Trung binh | Test tang dan 1 -> 2 -> 6 robot |

---

## 17. Kien nghi chot cho bao cao do an

Khong nen mo ta rang Raspberry Pi la thay doi lam sai de tai. Nen mo ta:

> He thong duoc trien khai theo kien truc xu ly tap trung ket hop chap hanh phan tan. Raspberry Pi dam nhiem cac tac vu co yeu cau tai nguyen cao gom xu ly anh (OpenCV/ArUco), mo hinh trang thai tro choi, thuat toan Minimax, lap ke hoach duong di va may chu giam sat. ESP32 Coordinator dam nhiem giao tiep thoi gian thuc voi cac robot thong qua ESP-NOW, dong thoi thuc hien xac nhan goi tin, giam sat heartbeat va xu ly trang thai an toan voi FreeRTOS. Cac robot thuc hien dieu khien dong co, bam quy dao va phan hoi telemetry.

Lap luan ky thuat:

- Raspberry Pi phu hop voi OpenCV va xu ly anh lien tuc (ESP32 khong co full OpenCV, PSRAM gioi han).
- WiFi/web va ESP-NOW dung chung radio tren ESP32 de gay mat goi; tach Coordinator ra giu kenh ESP-NOW on dinh.
- Minimax va A* khong chiem tai nguyen cua lop truyen thong thoi gian thuc.
- ESP32 Coordinator co nhiem vu nho, on dinh va de watchdog (FreeRTOS voi task phan ro: Serial RX, ESP-NOW TX/RX, Heartbeat, Safety).
- Kien truc phan lop giup kiem thu tung phan doc lap.

Khong nen tuyen bo rang toan bo he thong da hoan thien truoc khi co kiem thu phan cung.

---

## 18. Thu tu uu tien thuc hien

1. Sua `controller_main.py` khoi electromagnet va HTTP (thay `scipy.misc.derivative`).
2. Xay dung `board_vision.py` tu ArUco hien co.
3. Do va cau hinh toa do 9 node that.
4. Chay controller voi mot robot gia lap.
5. Viet firmware ESP32 Coordinator toi thieu (Serial RX, ACK, heartbeat, emergency stop).
6. Dieu khien mot robot that end-to-end.
7. Them xac nhan camera sau khi robot den node.
8. Mo rong len sau robot.
9. Viet test, do dac va hoan thien bao cao.

---

## 19. Code Review Dashboard (25/09/2026)

### 19.1 Ket luan danh gia

Ban cap nhat types.ts **tot hon ve to chuc code**. Viec tap trung domain types vao mot file giup component de doc va giam lap. TypeScript compile khong bao loi.

### 19.2 Van de da xac dinh

| # | Van de | Vi tri | Muc do |
|---|--------|--------|--------|
| 1 | Regex sai /^\\d+$/ khong match so nguyen | GameScreen.tsx:181 | Loi runtime |
| 2 | isDropPhase tu dem quan thay vi dung phase tu backend | GameScreen.tsx:86 | Bat nhat logic |
| 3 | protocol.ts lap lai inline pvp/pva, drop/move/..., idle/moving/... | protocol.ts:6,18,37 | Nguy co lech type |
| 4 | payload?: any trong GameEventLog mat type-safety | 	ypes.ts:95 | Chat luong kien truc |

### 19.3 Cac fix da ap dung (25/09/2026)

- **types.ts**: Them EventPayload = Record<string, unknown>, doi payload?: any -> payload?: EventPayload.
- **protocol.ts**: Import GameMode, GamePhase, RobotStatusType tu types.ts, thay the cac inline literal.
- **websocket.ts**: Dung EventPayload trong ddLog(...) thay cho ny.
- **GameScreen.tsx**: Sua regex /^\\d+$/ -> /^\d+$/; doi isDropPhase = p1Placed < 3 || p2Placed < 3 -> isDropPhase = phase === 'drop'.

Ket qua: 
px tsc --noEmit khong bao loi sau khi ap dung tat ca fix.

### 19.4 Van de con lai chua xu ly

| Van de | Ly do | Huong xu ly |
|--------|-------|-------------|
| JSON.parse ep cast khong co runtime validation trong websocket.ts:96 | Can zod/type guard, tang phu thuoc | Viet parseWSServerEvent() truoc khi ket noi phan cung that |
| Minimax/A* chay trong browser | Thiet ke demo offline hien tai | Chuyen ve Pi khi server san sang (buoc 7-8) |

---

## 20. Kiem tra va Toi uu Tong the (02/10/2026)

### 20.1 Tong quan he thong sau cap nhat

Sau kiem tra toan bo codebase Pi backend, 31/31 unit test deu pass.

**Cac file da co:**

| File | Chuc nang | So dong |
|------|-----------|---------|
| oard_model.py | Trang thai ban co, luat, gia tri hang xom | 74 |
| morris_game.py | GameState bat bien, apply_move, valid_moves | 110 |
| minimax.py | Minimax + alpha-beta + transposition table + move ordering | 152 |
| oard_planner.py | A* tren do thi ban co, sinh waypoint mm | 162 |
| ackend.py | Dieu phoi game state + transport + event sink | 347 |
| coordinator_protocol.py | JSON Lines protocol Pi <-> ESP32 | 100 |
| serial_coordinator.py | USB serial transport voi ACK va timeout | 83 |
| websocket_server.py | WebSocket server, async handler, CLI | 147 |

### 20.2 Cac diem tot da duoc xac nhan

- **Bat bien (immutable)**: GameState, Move, MotionPath, Envelope deu la rozen=True. Khong co side effect giua cac luong.
- **Transport injection**: MorrisBackend nhan 	ransport tu ngoai. De test offline (SimulationTransport) va de thay the serial sau khi co phan cung.
- **Protocol co validation**: coordinator_protocol.py kiem tra version, seq, range toa do, speed truoc khi gui.
- **move_id on dinh**: Moi waypoint trong cung mot nuoc di dung cung move_id (khong phai sequence counter). ESP32 co the nhom cac waypoint thanh mot nuoc.
- **A* tren ban co**: plan_node_route su dung heap-based A* voi Euclidean heuristic, tranh cac node dang chiem dong.

### 20.3 Toi uu da ap dung

#### Minimax: Xoa double apply_move trong _order_moves

**Van de:** _order_moves goi pply_move(current, move) de lay 
ext_state cho muc dich sap xep, nhung sau do vong lap search() lai goi pply_move lan thu hai cho cung move do. Do luong apply_move do duoc: **2.33x so voi nodes_searched**.

**Giai phap:** Doi _order_moves tra ve List[(priority, move, next_state)]. search() va vong lap root dung truc tiep 
ext_state da co san, bo qua hoan toan pply_move lan thu hai.

**Ket qua thuc do (trung binh 5 lan):**

| Do sau | Truoc | Sau | Giam |
|--------|-------|-----|------|
| depth=4 | 32.4ms | 27.0ms | -17% |
| depth=6 | 167.6ms | 135.4ms | -19% |

nodes_searched giu nguyen (1554 / 6522), khong anh huong logic.

Tat ca 31 unit test van PASS sau toi uu.

### 20.4 Cac van de con lai (khong an toan de sua tu dong)

| Van de | Vi tri | Mo ta | Khuyen nghi |
|--------|--------|-------|-------------|
| _wait_for_ack busy-loop bang 
eadline() | serial_coordinator.py:27 | Quay vong lien tuc doc serial, khong co 	ime.sleep(). Tren Pi voi CPU 1 core, se chiem nhieu tai nguyen hon can thiet khi ack co the mat 50-500ms | Them 	ime.sleep(0.002) trong vong lap; chi anh huong khi co phan cung that |
| execute_move goi pply_move truoc roi goi 	ransport.execute (sync-blocking) | ackend.py:211-252 | Trong che do serial that, 	ransport.execute co the block hang giay (moi waypoint 1 RTT). WebSocket handler bi block trong thoi gian nay | Khi co phan cung: chuyen execute_move thanh sync hoac dung thread pool executor |
| _emit trong ackend.py:97 goi 	uple(self.event_sinks) moi lan | ackend.py:97 | Tao tuple moi moi emit, phu phi nho. Co the cache hoac dung list truc tiep | Nho, chi quan tam o load cao |
| Waypoint label trong move_start dung nested generator kho doc | ackend.py:226-229 | Generator long nhau 2 cap, kho debug | Tach ra ham rieng khi refactor |

### 20.5 Ke hoach tiep theo

1. Them 	ime.sleep(0.002) vao _wait_for_ack khi bat dau test phan cung.
2. Chuyen execute_move thanh async (asyncio.to_thread) khi tich hop WebSocket server voi serial transport that.
3. Do toa do 9 node that bang camera roi cap nhat DEFAULT_BOARD_NODES_MM.
4. Test end-to-end voi 1 robot that theo buoc 6 trong ke hoach.
