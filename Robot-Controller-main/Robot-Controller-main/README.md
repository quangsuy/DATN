# Robot-Controller (Three Men Morris Robot - Cap nhat do an tot nghiep)

Day la repo phan mem chinh cho du an Three Men Morris Robot - Do an tot nghiep 2026.

Repo goc: CMU ECE Capstone 2022 cua Saral Tayal, Prithu Pareek, va Omkar Savkur.
Du an hien tai tai su dung cac thanh phan CV va controller, dong thoi xay dung them module pi/ rieng cho Raspberry Pi.

---

## Muc luc

1. [Tong quan he thong](#tong-quan-he-thong)
2. [Cau truc thu muc](#cau-truc-thu-muc)
3. [Module Raspberry Pi (pi/)](#module-raspberry-pi-pi)
4. [Computer Vision](#computer-vision)
5. [Controller](#controller)
6. [Cach chay](#cach-chay)
7. [Tien do va ke hoach](#tien-do-va-ke-hoach)

---

## Tong quan he thong

He thong Three Men Morris Robot bao gom:

- **Raspberry Pi**: xu ly trung tam -- quan ly trang thai van co, Minimax, A*, WebSocket server, giao tiep Serial voi ESP32.
- **ESP32 Coordinator**: nhan lenh waypoint tu Pi qua Serial, phat lenh ESP-NOW toi cac robot.
- **Robot (x6)**: di chuyen theo lenh, mang quan co tren ban co.
- **Camera**: nhan dang ArUco marker de xac dinh vi tri robot va quan co.
- **Dashboard (React)**: giao dien web dieu khien va theo doi trang thai.

Luong chinh:

```text
Camera -> Pi (ArUco detect) -> GameState
Dashboard -> WebSocket -> Pi Backend -> Minimax/A* -> Serial -> ESP32 -> ESP-NOW -> Robot
```

---

## Cau truc thu muc

```text
Robot-Controller-main/
+-- pi/                        # Module Raspberry Pi (moi)
|   +-- board_model.py         # Mo hinh logic ban co
|   +-- morris_game.py         # State machine Three Men Morris
|   +-- minimax.py             # AI Minimax voi alpha-beta pruning
|   +-- board_planner.py       # A* route planning
|   +-- coordinator_protocol.py# JSON Lines protocol -> ESP32
|   +-- serial_coordinator.py  # Serial transport adapter
|   +-- backend.py             # Backend authoritative
|   +-- websocket_server.py    # WebSocket server
|   +-- requirements.txt       # websockets, pyserial
|   +-- test_*.py              # 33 unit tests
+-- cv_main.py                 # Computer vision chu yeu (ArUco)
+-- cv_fiducial.py             # Fiducial marker detection
+-- controller_main.py         # Robot trajectory controller
+-- mainProgram.py             # Diem vao chinh he thong cu
+-- constants.py               # Hang so toan cuc
+-- BAO_CAO_TIEN_DO_RASPBERRY_PI.md  # Bao cao tien do chi tiet
```

---

## Module Raspberry Pi (pi/)

Day la phan moi duoc phat trien cho do an tot nghiep.

### Cai dat dependency

```bash
python3 -m pip install -r pi/requirements.txt
```

### Chay tat ca unit tests

```bash
python3 -m unittest discover -s . -p "test_*.py" -v
# Ket qua hien tai: Ran 33 tests OK
```

### Khoi dong backend WebSocket

```bash
python3 -m pi.websocket_server --transport simulation
# Server lang nghe tai ws://0.0.0.0:8765
```

### Cac module chinh

| Module | Chuc nang |
|---|---|
| `board_model.py` | Mo hinh ban co: node, hang xom, dieu kien thang |
| `morris_game.py` | State machine: drop -> move -> game_over |
| `minimax.py` | AI: alpha-beta pruning, move ordering, transposition table |
| `board_planner.py` | A* route, chuyen sang trajectory vat ly mm |
| `coordinator_protocol.py` | Dong goi/giai ma JSON Lines packet cho ESP32 |
| `serial_coordinator.py` | Gui waypoint qua Serial, cho ACK |
| `backend.py` | Dieu phoi toan bo: game, AI, transport, event |
| `websocket_server.py` | Nhan command tu Dashboard, phat event |

Xem chi tiet tai: `BAO_CAO_TIEN_DO_RASPBERRY_PI.md`

---

## Computer Vision

Su dung OpenCV contrib + ArUco marker de:

- Xac dinh vi tri robot qua marker dan tren robot.
- Phat hien vi tri quan co tren ban co.
- Ho tro calibration camera.

Cai dat yeu cau:

```bash
pip install opencv-contrib-python
```

Bat co debug CV trong `constants.py`:

```python
CV_DEBUG = True
```

---

## Controller

`controller_main.py`: noi suy trajectory roi rac -> lenh dieu khien lien tuc bang cubic Hermite spline. Co the ket hop voi PID de chong sai so.

**Luu y hien tai:** File nay con phu thuoc `scipy.misc.derivative` da bi xoa khoi scipy moi. Can thay the bang finite difference thu cong truoc khi chay tren Pi.

---

## Cach chay

### Che do simulation (khong can phan cung)

```bash
 # Terminal 1: Backend
cd Robot-Controller-main/Robot-Controller-main
python3 -m pi.websocket_server --transport simulation

# Terminal 2: Frontend Dashboard
cd three-men's-morris-robot-dashboard
npm install
npm run dev -- --host 0.0.0.0
```

Mo `http://127.0.0.1:3000`, vao man choi va tat `Simulation Mode` de dashboard ket noi backend Python. Neu dashboard chay tren may host, dung IP cua Ubuntu VM thay cho `127.0.0.1`.

### Che do phan cung (Raspberry Pi that)

```bash
# Chay server voi ESP32 Coordinator da noi vao /dev/ttyUSB0
python3 -m pi.websocket_server --transport serial --serial-device /dev/ttyUSB0
```

---

## Tien do va ke hoach

| Hang muc | Trang thai |
|---|---|
| Game state / Luat co | Hoan thanh va co test |
| Minimax AI | Hoan thanh va co test |
| A* board planner | Hoan thanh va co test |
| JSON Lines protocol | Hoan thanh va co test |
| WebSocket backend | Hoan thanh - simulation mode |
| Serial transport adapter | Hoan thanh - chua noi ESP32 that |
| Camera integration | Chua tich hop |
| ESP32 firmware | Chua trien khai |
| Robot firmware / ESP-NOW | Chua trien khai |
| Kiem thu vat ly | Chua thuc hien |

**Buoc tiep theo:**
1. Sua `controller_main.py` (thay `scipy.misc.derivative`)
2. Ket noi camera ArUco voi backend
3. Do toa do 9 node that, truyen `board_nodes_mm` vao planner
4. Chay end-to-end voi 1 robot qua Serial that
5. Viet firmware ESP32 Coordinator

---

*Du an goc: CMU ECE Capstone 2022 | Tai su dung va mo rong: Do an tot nghiep 2026*
