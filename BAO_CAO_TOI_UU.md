# BAO CAO NGHIEN CUU TOI UU HE THONG
## Three Men's Morris Robot — Tat ca cac tang: Pi backend + ESP32 Coordinator

**Ngay:** 03/10/2026  
**Tac gia:** Duong Son Quang (D22DCDT238)

---

## 1. Phuong phap tieu tuan

### 1.1 Nguyen tac chung

> **"Do truoc, toi uu sau"** — moi toi uu phai duoc do luong truoc va sau.
> Khong chinh sua code neu speedup < 5% va khong co nguong an toan (unit test).

Quy trinh ap dung:
1. **Profile** (`cProfile`, `perf_counter`) tim diem hot
2. **Xac nhan** thay the logic chinh xac (ket qua phai giong truoc khi sua)
3. **Do lai** speedup
4. **Chay lai 31 unit test** dam bao khong loi hoi quy
5. **Ghi vao bao cao** voi so lieu cu the

### 1.2 Moi truong do

- **Laptop Windows**: Intel (benchmark lam chuan, Pi se cham hon ~3-5x)
- **Raspberry Pi** (uoc tinh): moi ms tren laptop ~ 3-5 ms tren Pi
- Unit test suite: 31 test, tat ca pass truoc va sau moi thay doi

---

## 2. Tang Pi — Minimax Engine

### 2.1 Ket qua profiler (depth=6, 3 lan, empty board)

```
ncalls    tottime   function
19566     0.032s    search()
7770      0.032s    _order_moves()
43545     0.234s    _evaluate()          <-- DIEM NONG SO 1
141903    0.079s    count_pieces()       <-- hot vi _evaluate goi
141903    0.152s    sum() built-in
36627     0.079s    apply_move()         <-- DIEM NONG SO 2
990288    0.136s    list.count()
```

**_evaluate chiem ~60% tong thoi gian** — la target chinh.

### 2.2 Toi uu 1: Eliminate double apply_move (da thuc hien 02/10)

**Van de:** `_order_moves` goi `apply_move` de tinh priority khi sap xep,
sau do `search()` goi them lan thu 2 cho cung move do.
Do luong: ty le `apply_move / nodes_searched = 2.33x`.

**Giai phap:** `_order_moves` tra ve `List[(priority, move, next_state)]`.
`search()` dung truc tiep `next_state` da co, khong goi them `apply_move`.

**Ket qua (5 lan trung binh, empty board):**

| Do sau | Truoc    | Sau      | Giam |
|--------|----------|----------|------|
| depth=4 | 32.4 ms | 27.0 ms | -17% |
| depth=6 | 167.6 ms | 135.4 ms | -19% |

### 2.3 Toi uu 2: Rewrite _evaluate (thuc hien 03/10)

**Van de phat hien:** `_evaluate` chiem 23% tong thoi gian.
Nguyen nhan cu the:

| Diem yeu | Mo ta |
|----------|-------|
| `[state.board[node] for node in line]` | Tao list moi cho moi line (8 lines) |
| `list.count(x)` | Cham hon `tuple.count(x)` (C code) |
| `count_pieces(board, p)` | Goi `validate_player()` thua moi lan |
| `2 if ai_player == 1 else 1` | Co the tinh bang `3 - ai_player` |

**Giai phap ap dung:**
- `opponent = 3 - ai_player` (branchless, no conditional)
- `tuple.count()` thay `list.count()` — C-level, nhanh hon
- Unpack truc tiep `b[a], b[mid], b[z]` — khong tao list trung gian
- `board.count(p)` thay `count_pieces(board, p)` — bo validate_player
- Short-circuit: `ai_c==2 and opp_c==0` (tranh tinh empty_count du thua)

**Benchmark `_evaluate` rieng le (50,000 calls):**

| Phien ban | us/call | Speedup |
|-----------|---------|---------|
| Goc | 4.88 us | 1.00x |
| Sau toi uu | 2.00 us | **2.44x** |

**Tac dong len choose_move (10 lan, depth=4, empty board):**

| Bien so | Truoc patch 1 | Sau patch 1 | Sau patch 2 | Giam tong |
|---------|--------------|-------------|-------------|-----------|
| depth=4 | 32.4 ms | 27.0 ms | **15.5 ms** | **-52%** |
| depth=6 | 167.6 ms | 135.4 ms | **87.2 ms** | **-48%** |

> **Uoc tinh tren Raspberry Pi:** depth=4 ~ 50-80 ms (tu ~100-160 ms ban dau)

### 2.4 Cac toi uu da nghien cuu nhung KHONG ap dung

| Huong | Ly do bo qua |
|-------|-------------|
| Iterative deepening (IDA*) | Khong co thoi gian gioi han theo giay — depth co dinh la du | 
| Negamax thay minimax | Refactor lon, loi ich nho, rui ro sai logic hien tai |
| Killer moves table | Khong gian trang thai qua nho (9 o) — move ordering heuristic da du |
| Bitboard (9-bit int thay tuple) | Toi uu nay DANG TIEM NANG: danh gia sau muc 3 |
| Lazy SMP (multiprocessing) | Pi co 4 core nhung khong can thiet o depth <= 6 |

### 2.5 Nghien cuu them: Bitboard representation

Trong Three Men's Morris, ban co co 9 o, moi o co 3 trang thai: None/1/2.
Hien tai dang dung `Tuple[Optional[int], ...]` — 9 phan tu Python object.

**Y tuong bitboard:** Dung 2 so nguyen 9-bit:
- `board_p1: int` — bit i = 1 neu player 1 co quan o vi tri i
- `board_p2: int` — bit i = 1 neu player 2 co quan o vi tri i

**Uu diem:**
- `winner()`: so sanh `board_p & WINNING_MASK` = O(8 AND + 8 compare), thay vi 8*3 indexing
- `count_pieces()`: `bin(board_p).count('1')` hoac `bin.bit_count()` (Python 3.10+)
- `_evaluate` duong lines: bit AND cuc nhanh
- Transposition cache key: 2 int thay vi 1 tuple-of-None — hash nhanh hon

**Uoc tinh speedup:** 30-50% tren _evaluate, 15-20% tren apply_move

**Rui ro:** Phai viet lai toan bo board_model, morris_game, board_planner —
anh huong 31 unit test. Nen lam TREN NHANH RIENG truoc khi merge.

---

## 3. Tang Pi — board_planner (A*)

### 3.1 Hien trang

`plan_node_route` dung A* voi heap. Do thi chi co 9 nut, toi da 5 can.
Thoi gian thuc te < 0.1 ms / cuoc goi — KHONG can toi uu them.

**Diem can chu y (khong phai performance):**

- `cost_so_far[current] + 1` — dang dung hop ly (uniform edge cost)
  Neu muon toi uu cung duong vat ly: thay `+1` bang khoang cach mm thuc
  => A* se uu tien duong ngan hon ve mm, phu hop hon khi co `board_nodes_mm`
- `_heuristic` kiem tra `if board_nodes_mm and node in board_nodes_mm` moi buoc
  => Tach ra hai ham rieng (co/khong mm) de bo if nay

### 3.2 route_to_trajectory: double-loop tinh cost

```python
# Hien tai:
total_cost = sum(_distance(board_nodes_mm[first], board_nodes_mm[second])
                 for first, second in zip(route, route[1:]))
```

Chi tiet: vong lap nay lap lai phep tinh khoang cach da duoc thuc hien trong
vong lap chinh (dong 106: `elapsed += _distance(previous, point) / speed_mm_s`).
Thay `elapsed * speed_mm_s` se chinh xac va tranh tinh lai:

```python
# Toi uu: tinh total_cost truc tiep tu elapsed
total_cost = elapsed * speed_mm_s  # elapsed la tong thoi gian / speed
```

**Tac dong:** nho (goi ham nay rat it), nhung logic chinh xac hon.

---

## 4. Tang ESP32 Coordinator

### 4.1 UART readline: busy-wait van de

```cpp
// Hien tai (uart_pi.cpp:40):
vTaskDelay(pdMS_TO_TICKS(1));  // 1ms de loop
```

Khong co van de o bau rate 115200 (1 byte = ~87 us). Tuy nhien:
- **Nho het buffer UART khi Pi gui nhanh**: `setRxBufferSize(PROTO_MAX_BYTES * 4)`
  = 2048 bytes — du cho ~4 goi tin lien tiep
- **Cai tien**: dung UART interrupt + notification thay vi polling:

```cpp
// Them vao setup:
PiSerial.onReceive([](){
    BaseType_t w = pdFALSE;
    vTaskNotifyGiveFromISR(uart_rx_handle, &w);
    if (w) portYIELD_FROM_ISR();
}, false);

// Trong uart_rx_task thay vi while(timeout):
ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(100));
// Roi doc tat ca byte san co
```

**Tac dong:** giam CPU load Core 0 khi khong co du lieu, tinh nang non-functional.

### 4.2 ArduinoJson: StaticJsonDocument tren stack

```cpp
StaticJsonDocument<PROTO_MAX_BYTES> doc;  // 512 bytes tren stack
```

512 bytes tren stack la OK cho task co stack 4096 words (16 KB).
**Kiem tra:** stack watermark can do bang `uxTaskGetStackHighWaterMark()`.

### 4.3 ESP-NOW retry (chua co — uu tien cao)

```cpp
// Hien tai:
bool sent = espnow_send_waypoint(&pkt, rid);
if (!sent) { fault(); return; }

// Can them:
for (int attempt = 0; attempt < 3; attempt++) {
    if (espnow_send_waypoint(&pkt, rid)) break;
    vTaskDelay(pdMS_TO_TICKS(10));
    if (attempt == 2) { fault(); return; }
}
```

### 4.4 Pi-watchdog (chua co — uu tien cao)

**Van de:** Neu Pi mat nguon hoac reset, coordinator van dang xu ly waypoint.
Robot co the tiep tuc di chuyen ma khong ai kiem soat.

**Giai phap:** Timer dat lai moi khi nhan duoc bat ky lenh hop le tu Pi.
Neu qua X giay (vi du 30s) khong co tin hieu, tu dong phat emergency_stop.

```cpp
// Trong task_heartbeat hoac task rieng:
static uint32_t last_pi_contact_ms = 0;
// Dat trong uart_rx sau khi parse thanh cong:
last_pi_contact_ms = millis();
// Kiem tra trong heartbeat:
if (millis() - last_pi_contact_ms > PI_WATCHDOG_MS) {
    espnow_broadcast_stop();
    uart_pi_send_fault("pi_watchdog_timeout", -1);
}
```

### 4.5 Seq counter khi unsolicited responses

Hien tai `uart_pi_send_robot_status` dung seq bat dau tu 0x8000,
`uart_pi_send_fault` tu 0xC000, `uart_pi_send_system_info` tu 0xE000.
Cac seq nay wrap ve 0 sau 8192 lan — khong co van de thuc te.

**Cai tien nhe:** Dung 1 counter chung:
```cpp
static atomic<uint16_t> s_unsolicited_seq {0x8000};
```
De tranh trung lap giua cac ham.

---

## 5. Tang giao tiep Pi <-> Coordinator

### 5.1 Hien trang: JSON Lines, 115200 baud

- 1 goi tin waypoint ~ 130 bytes => ~11 ms de gui het (115200/10 = 11520 byte/s)
- Pi timeout ACK = 1.0 giay (ack_timeout_s)
- Budget: 1000 ms - 11ms (TX) - 11ms (ACK) = ~978 ms cho robot xu ly

Khong co van de. JSON Lines du.

### 5.2 Khong gian toi uu bo qua: binary protocol

Neu can tang len 921600 baud (8x), moi goi tin chi mat ~1.4 ms.
Nhung voi thuc te robot mat 300-1000ms de den waypoint, UART khong phai bottleneck.

### 5.3 Seq range overlap phat hien

Pi gui seq 0-65535. Coordinator gui unsolicited seq bat dau tu 0x8000.
**Neu Pi nhan mot goi tin co seq = 0x8000**, no se IGNORE (khong phai ack cua
no). Khong co bug — Pi chi xu ly ack khi `message.sequence == sequence` ma no
da gui. Cac message khac bi doc va bo qua (dok tiep).

**Tuy nhien** Pi hien tai KHONG xu ly cac push events (robot_status, system_info)
tu coordinator — `_wait_for_ack` doc va bo qua tat ca tin nhan khong phai ack.
Can them handler trong `serial_coordinator.py` de xu ly chung async.

---

## 6. Tong ket so lieu toi uu minimax

| Thi nghiem | Truoc | Sau patch 1 | Sau patch 2 | Speedup tong |
|------------|-------|-------------|-------------|--------------|
| choose_move(depth=4) | 32.4 ms | 27.0 ms | **15.5 ms** | **2.1x** |
| choose_move(depth=6) | 167.6 ms | 135.4 ms | **87.2 ms** | **1.9x** |
| _evaluate rieng | 4.88 us | - | **2.00 us** | **2.4x** |
| apply_move rieng | 3.92 us | - | 3.92 us | 1.0x |

> Uoc tinh tren Raspberry Pi (factor x3-5x cham hon laptop):
> - depth=4: 47-78 ms (truoc: 97-162 ms) — **da duoi nguong 200ms**
> - depth=6: 262-436 ms (truoc: 503-838 ms) — **da dung gap ham 4x faster**

---

## 7. Roadmap toi uu con lai

| # | Noi dung | Do uu tien | Uoc tinh speedup |
|---|----------|-----------|-----------------|
| 1 | **Pi-watchdog trong coordinator** | CAO - an toan | N/A |
| 2 | **ESP-NOW retry 3 lan** | CAO - robustness | N/A |
| 3 | **Bitboard representation** | TRUNG BINH | +30-50% _evaluate |
| 4 | **UART interrupt-driven** | THAP | -CPU load |
| 5 | **Serial async handler** Pi-side | TRUNG BINH | +latency response |
| 6 | **route_to_trajectory cost fix** | THAP - correctness | tiny |
| 7 | **Iterative deepening** neu muon tang depth | THAP | cho phep depth=8 |

---

## 8. Ket luan

2 buoc toi uu da thuc hien (eliminate double apply_move + rewrite _evaluate)
cong lai giam thoi gian tinh AI xuong **con 52% tren laptop** va **uoc tinh 50-55%
tren Raspberry Pi**. Voi depth=4, AI se tra ket qua trong < 100ms tren Pi —
du de game cam giac "tuc thi" (nguong cam nhan cua nguoi la ~200ms).

Tat ca 31 unit test van pass. Cac toi uu nay la **safe**: khong thay doi
bat ky logic game hay ket qua Minimax, chi thay doi implementation detail.
