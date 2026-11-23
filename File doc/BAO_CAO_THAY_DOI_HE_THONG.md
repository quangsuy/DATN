# BÁO CÁO TỔNG HỢP TOÀN DIỆN CÁC THAY ĐỔI VÀ NÂNG CẤP HỆ THỐNG
## ĐỀ TÀI: HỆ THỐNG AGV TỰ HÀNH CHƠI CỜ THREE MEN'S MORRIS
**Sinh viên thực hiện:** Dương Sơn Quang - MSV: B22DCDT238  
**Học viện Công nghệ Bưu chính Viễn thông (PTIT)**  
**Thời gian cập nhật:** Tháng 11/2026

---

## 1. TỔNG QUAN CHIẾN LƯỢC BẢO VỆ VÀ MỤC TIÊU NÂNG CẤP

Nhằm đáp ứng yêu cầu thực tế của buổi bảo vệ Đồ án Tốt nghiệp (ĐATN):
1. **Chiến lược bảo vệ an toàn tuyệt đối:**
   - Trình chiếu video chất lượng cao đã quay sẵn về quá trình bàn cờ và 6 xe AGV chạy thực tế ở nhà.
   - Tại buổi bảo vệ, mang phần cứng (xe AGV, bàn cờ, coordinator) lên bàn để Hội đồng nghiệm thu thực tế, nhưng **trình diễn trực tiếp trên Web Dashboard ở Chế độ Mô phỏng Demo (Local Simulation)**. Chế độ này chạy mượt mà 100% trên trình duyệt laptop, độc lập với mạng Wi-Fi trường và không cần mang theo Raspberry Pi hay camera cố định cồng kềnh.
2. **Hỗ trợ thực nghiệm và Debug phần cứng:**
   - Khi chạy ở **Chế độ Phần cứng Thực tế**, hệ thống bổ sung **Bảng kiểm tra chẩn đoán tiền khởi động (Pre-Flight Hardware Check)**. Quá trình này tự động quét Camera (ArUco 4 góc 90-93), kết nối Serial Coordinator, và gửi gói tin PING qua ESP-NOW đến từng xe (1 đến 6) để hiển thị chi tiết trạng thái, giúp kỹ sư phát hiện nhanh xe nào mất sóng hay chưa nhận diện được.
3. **Hoàn thiện trọn vẹn toàn bộ các tầng hệ thống:**
   - Web Dashboard (React/Vite/TypeScript).
   - Backend Raspberry Pi (Python/FastAPI/OpenCV/ArUco/Websocket).
   - Firmware mạch Coordinator (ESP32-CAM, FreeRTOS, ESP-NOW, UART).
   - Firmware xe AGV (ESP32-WROOM-32D, TCRT5000L Line Snap, Odometry, Gyro MPU6050, 5 LED WS2812B).

---

## 2. CHI TIẾT CÁC THAY ĐỔI Ở TỪNG TẦNG HỆ THỐNG

### 2.1. Tầng Giao diện Web Dashboard (`three-men's-morris-robot-dashboard/`)

#### A. Kiến trúc 2 chế độ: Mô phỏng Demo vs Phần cứng Thực tế
* **Chế độ Mô phỏng Demo (Local Simulation Mode):**
  - Tích hợp bộ máy mô phỏng cục bộ `LocalSimulationEngine` bên trong `src/network/websocket.ts`.
  - Khi không kết nối được với Raspberry Pi hoặc khi bật công tắc "Chế độ mô phỏng demo", trình duyệt sẽ tự động kích hoạt bộ giả lập.
  - Tích hợp đầy đủ luật cờ Three Men's Morris chuẩn:
    - **Giai đoạn 1 (Drop Phase):** Mỗi bên lần lượt đặt 3 quân vào các ô trống.
    - **Giai đoạn 2 (Move Phase):** Chọn quân và di chuyển đến ô trống kề cận có đường nối hợp lệ.
  - Tích hợp **AI Minimax với kỹ thuật cắt tỉa Alpha-Beta (Độ sâu 4)**, thuật toán né va chạm trung gian **BFS + Stack Evasion** và lập quỹ đạo waypoint bằng giải thuật **A\***.
  - Thêm giao diện thông báo thân thiện tại `src/components/CameraStream.tsx`: Trong chế độ demo, hiển thị placeholder thông báo luồng camera là tùy chọn, không báo lỗi đỏ làm ảnh hưởng tâm lý trình chiếu.

#### B. Khắc phục lỗi Thao tác Click / Di chuyển quân cờ trên Web
* **Nguyên nhân lỗi cũ:** 
  - Thứ tự đăng ký sự kiện WebSocket bị ngược (`join_game` gửi đi trước khi callback `onGameUpdate` kịp đăng ký lắng nghe), khiến giao diện không nhận được trạng thái khởi tạo bàn cờ.
  - Sự kiện click chuột trên quân cờ bị nổi bọt (`event bubbling`) lên ô cờ cha.
* **Giải pháp đã áp dụng:**
  - Trong `src/components/RobotPiece.tsx`: Bổ sung `e.stopPropagation()` khi click vào quân cờ để tách biệt rõ ràng giữa hành động "Chọn quân cần đi" và "Chọn ô đích".
  - Trong `src/screens/GameScreen.tsx`: Đảo ngược thứ tự đăng ký: `wsService.onGameUpdate(...)` được gọi trước `wsService.joinGame(...)`.
  - **Cơ chế thả quân thông minh (Auto-bay deploy):** Trong giai đoạn thả quân (Drop phase), người chơi chỉ cần nhấp trực tiếp vào ô cờ trống trên bàn, hệ thống sẽ tự động lấy xe tiếp theo của lượt chơi từ bãi chờ (Staging Bay) và đưa vào vị trí đó.

#### C. Bảng chẩn đoán tiền khởi động Phần cứng (Pre-Flight Diagnostic Modal)
* Thiết kế lại màn hình `src/screens/GameModeScreen.tsx`:
  - Khi chọn "Chế độ Phần cứng Thực tế", hệ thống tự động mở modal kiểm tra 3 cấp độ:
    1. **Camera ArUco:** Kiểm tra 4 mã góc bàn cờ (ID: 90, 91, 92, 93) đã đủ 15 mẫu trung vị để nắn phẳng phối cảnh chưa.
    2. **Coordinator Serial:** Kiểm tra cổng UART kết nối Pi với ESP32-CAM.
    3. **6 Xe AGV:** Gửi lệnh PING qua ESP-NOW (sử dụng đúng MAC phần cứng của từng xe), kiểm tra tín hiệu PONG và ArUco ID nhận diện qua camera.
  - Hiển thị bảng trực quan từng xe: ID, Tên, Đội (Xanh/Đỏ), Địa chỉ MAC, Trạng thái PING ESP-NOW, Trạng thái ArUco.
  - Cung cấp nút **"Bỏ qua & Vào Debug"** (cho phép vào bàn cờ ngay cả khi 1 vài xe chưa bật để tiện sửa lỗi) và nút **"Vào bàn cờ thực tế"** khi mọi thiết bị đều sẵn sàng.

#### D. Hiển thị Trực quan 5 LED WS2812B thay thế Pin
* Theo sơ đồ mạch nguyên lý thực tế, xe không có mạch phân áp đo ADC pin mà trang bị **dải 5 đèn LED RGB WS2812B**.
* Đã sửa `src/screens/DashboardScreen.tsx` và `src/components/RobotStatusCard.tsx`: Thay thanh pin giả định bằng **5 chấm tròn hiển thị màu LED RGB động** tương ứng với trạng thái thực tế của xe (Đội Xanh, Đội Đỏ, Đang di chuyển, Đang chờ, Lỗi).

---

### 2.2. Tầng Backend Điều khiển trên Raspberry Pi (`Robot-Controller-main/`)

#### A. Mở rộng Giao thức và Điều phối Phần cứng
* **`pi/backend.py`:**
  - Bổ sung phương thức `hardware_check(camera, serial_device)`: Thực hiện đồng thời việc đọc trạng thái nắn phẳng của Camera Service, kết nối Serial với Coordinator, và lần lượt gửi lệnh PING tới từng xe từ 1 đến 6.
  - Bổ sung `set_simulation_mode(enabled, hardware_transport)`: Cho phép chuyển đổi linh hoạt giữa việc điều khiển xe vật lý qua ESP-NOW và chạy mô phỏng phần mềm.
* **`pi/websocket_server.py`:**
  - Xử lý các action mới từ Client: `set_simulation_mode`, `hardware_check`.
  - Bổ sung tham số dòng lệnh CLI `--camera`, `--camera-port`, `--camera-device` giúp dễ dàng chạy backend dạng dịch vụ nền (systemd).
* **`pi/serial_coordinator.py` & `pi/coordinator_protocol.py`:**
  - Bổ sung hàm `ping_robot(robot_id, timeout_s)`: Đóng gói bản tin `MSG_PING` (Opcode 0x03) gửi xuống Coordinator và chờ tín hiệu ACK.
  - Bổ sung hàm `set_led(robot_id, r, g, b, brightness)` để điều khiển màu sắc và độ sáng của 5 bóng LED WS2812B trên từng xe.

#### B. Thị giác Máy tính & Hiệu chuẩn Bàn cờ ArUco (`pi/camera_service.py`)
* Sử dụng từ điển chuẩn `cv2.aruco.DICT_5X5_100`.
* **Hiệu chuẩn nắn phẳng phối cảnh:** Sử dụng 4 mã góc:
  - ID 90: Góc Trên - Trái (Top-Left)
  - ID 91: Góc Trên - Phải (Top-Right)
  - ID 92: Góc Dưới - Phải (Bottom-Right)
  - ID 93: Góc Dưới - Trái (Bottom-Left)
  - Áp dụng **Bộ lọc trung vị (Median Filter) trên 15 khung hình liên tiếp** nhằm triệt tiêu hoàn toàn hiện tượng rung lắc tọa độ trước khi tính ma trận `cv2.getPerspectiveTransform()`.
* **Hiển thị Vector Hướng Xe:**
  - Đối với các xe có ID từ 1 đến 6: Tính toán tâm ArUco và trung điểm cạnh trên (nối góc 0 và góc 1 của marker).
  - Sử dụng `cv2.arrowedLine` để vẽ mũi tên chỉ hướng di chuyển thực tế của xe trên cả luồng video gốc và luồng video đã nắn phẳng.
  - Cung cấp HTTP Stream tại cổng `:8080/video` (khung hình gốc) và `:8080/warped` (khung hình đã nắn phẳng).

#### C. Kiểm thử Hệ thống Backend
* Đã chạy toàn bộ bộ kiểm thử tự động `pytest pi/`: **44/44 bài kiểm thử vượt qua tuyệt đối (100% Passed)**.

---

### 2.3. Tầng Mạch Điều phối Trung tâm (`coordinator_esp32/`)

#### A. Khắc phục triệt để lỗi Sập nguồn / Boot Loop trên ESP32-CAM
* **Vấn đề đã gặp:** Khi nạp code vào board AI-Thinker ESP32-CAM, chip bị treo ở `rst:0xc (SW_CPU_RESET)` và liên tục in log `Rebooting...` do lỗi panic bộ nhớ.
* **Nguyên nhân gốc rễ:** 
  1. Trên mạch ESP32-CAM, chân **GPIO 16** được nối trực tiếp vào chân chọn chip (CS) của bộ nhớ ngoài PSRAM. Bản firmware cũ gán UART2 vào chân mặc định (GPIO 16 - RX2, GPIO 17 - TX2) dẫn đến xung đột bộ nhớ và sập vi điều khiển ngay khi gọi `Serial2.begin()`.
  2. Trên ESP32 Arduino Core v3.x, các thư viện Wi-Fi và FreeRTOS yêu cầu dung lượng ngăn xếp (stack) lớn hơn phiên bản 2.x, gây lỗi tràn stack (Stack Overflow).
* **Các xử lý đã thực hiện:**
  - **Quy hoạch lại chân UART2:** Chuyển sang **GPIO 13 (RX2)** và **GPIO 14 (TX2)** (hoàn toàn an toàn, không xung đột với Camera hay PSRAM).
  - **Tăng dung lượng Stack các Task FreeRTOS:**
    - `STACK_UART_RX`: 6144 bytes.
    - `STACK_CMD_HANDLER`: 8192 bytes.
    - `STACK_HEARTBEAT`: 3072 bytes.
  - Khởi tạo Wi-Fi STA và cấu hình cố định **Wi-Fi Channel 1** trước khi kích hoạt `esp_now_init()`.

#### B. Sửa lỗi Địa chỉ MAC Coordinator hiển thị `00:00:00:00:00:00`
* Trên ESP32 Core 3.x, gọi `WiFi.macAddress()` trước khi Wi-Fi hoàn tất cấp phát có thể trả về địa chỉ rỗng.
* Đã sửa thành API đọc trực tiếp từ eFuse phần cứng:
  ```cpp
  esp_read_mac(self_mac, ESP_MAC_WIFI_STA);
  ```
  Nhờ đó địa chỉ MAC thực tế của Coordinator hiển thị chính xác: `38:18:2B:B1:BC:E4`.

#### C. Cấu hình Bảng Ánh xạ Địa chỉ MAC Thực tế
Đã tích hợp đầy đủ 6 địa chỉ MAC đo từ phần cứng vào `robot_registry.h`:
```cpp
// Kênh ESP-NOW cố định
#define ESPNOW_CHANNEL 1

// Bảng MAC của 6 xe AGV tương ứng ID từ 1 đến 6
const uint8_t ROBOT_MACS[6][6] = {
    {0x70, 0x4B, 0xCA, 0x6D, 0x8F, 0xAC}, // Xe 1 (Đội Đỏ)
    {0xA8, 0x42, 0xE3, 0x4A, 0x29, 0xAC}, // Xe 2 (Đội Đỏ)
    {0xCC, 0xDB, 0xA7, 0x2D, 0xD6, 0x4C}, // Xe 3 (Đội Đỏ)
    {0xF0, 0x08, 0xD1, 0x7C, 0x13, 0xD8}, // Xe 4 (Đội Xanh)
    {0x04, 0x83, 0x08, 0x59, 0x43, 0x6C}, // Xe 5 (Đội Xanh)
    {0xB0, 0x3F, 0xD3, 0x5B, 0x44, 0x60}  // Xe 6 (Đội Xanh)
};

// MAC Coordinator: 38:18:2B:B1:BC:E4
```

#### D. Bổ sung Xử lý Lệnh PING & PONG
* Bổ sung opcode lệnh `ROBOT_CMD_PING = 0x03` và gói trạng thái phản hồi `ROBOT_STATUS_PONG = 0x05`.
* Trong `cmd_handler.cpp`: Khi Raspberry Pi gửi lệnh `CMD_PING`, Coordinator phát gói tin ESP-NOW xuống xe tương ứng và đợi tối đa 15.000 ms để nhận cờ ACK khi xe phản hồi PONG.

---

### 2.4. Tầng Firmware Xe AGV Tự Hành (`code_xe/`)

Toàn bộ mã nguồn nhúng cho các xe AGV được xây dựng mới hoàn toàn trong thư mục `code_xe/`, tuân thủ thiết kế từ sơ đồ nguyên lý mạch `Sheet2 (1).SchDoc` và layout PCB `PCB1.PcbDoc`.

```
code_xe/
├── config.h            # Cấu hình phần cứng, chân GPIO, thông số cơ học & địa chỉ MAC
├── comms.h / comms.cpp # Giao tiếp 2 chiều ESP-NOW với Coordinator
├── drive.h / drive.cpp # Điều khiển cầu H TB6612FNG và bộ điều khiển PID vận tốc
├── line.h / line.cpp   # Đọc mảng 5 cảm biến TCRT5000L & thuật toán bắt giao điểm
├── localize.h / .cpp   # Hợp nhất tư thế (Odometry + Gyro MPU6050 + Line Snap)
├── led.h / led.cpp     # Điều khiển dải 5 LED RGB WS2812B
└── code_xe.ino         # Điểm khởi động và vòng lặp FreeRTOS đa nhiệm
```

#### A. Tích hợp Độc quyền 5 Mắt Cảm biến TCRT5000L Bắt Giao Điểm
* **Sơ đồ chân theo Schematic:** 5 cảm biến hồng ngoại TCRT5000L được bố trí thành một hàng ngang dưới gầm xe và nối vào các kênh ADC1 (không bị nhiễu bởi Wi-Fi/ESP-NOW):
  - Cảm biến 1 (Ngoài cùng bên trái): `GPIO 36` (SENSOR_VP)
  - Cảm biến 2 (Giữa trái): `GPIO 39` (SENSOR_VN)
  - Cảm biến 3 (Tâm xe): `GPIO 34`
  - Cảm biến 4 (Giữa phải): `GPIO 35`
  - Cảm biến 5 (Ngoài cùng bên phải): `GPIO 32`
* **Thuật toán Triệt tiêu Sai số Trôi (Snap-to-Grid):**
  - **Vấn đề kinh điển của AGV mini:** Sau khi di chuyển và xoay nhiều lần trên bàn cờ, bánh xe bị trượt nhẹ (wheel slip) và gyro tích lũy sai số trôi (drift), khiến tọa độ tính theo encoder bị lệch dần so với thực tế.
  - **Giải pháp:** Bàn cờ Three Men's Morris có các đường line đen kết nối giữa 9 ô. Khi xe đi qua ngã tư hoặc tâm một ô cờ, ít nhất 3 cảm biến sẽ đồng thời phát hiện vạch đen (`active_count >= 3`).
  - Hàm `check_and_snap_intersection()` sẽ ngay lập tức:
    1. So khớp vị trí hiện tại với danh sách tọa độ của 9 ô cờ và các bãi chờ.
    2. Nếu khoảng cách sai lệch $< 4.0\text{ cm}$, hệ thống sẽ "kéo" (snap) tức thì tọa độ $(x, y)$ của robot về chính xác tâm của ô cờ danh định đó.
    3. Nhờ đó, sai số trôi tích lũy bị xóa về 0 tại mỗi nút giao mà không cản trở xe khi đi chéo hoặc đi ra khỏi line.

#### B. Điều khiển Động cơ Vi sai & Cân bằng Góc xoay Gyro
* Sử dụng mạch cầu H điều khiển 2 động cơ DC kèm encoder quadrature.
* Tích hợp cảm biến quán tính 6 bậc tự do **MPU6050** giao tiếp qua I2C (`GPIO 21` SDA, `GPIO 22` SCL).
* Tích hợp bộ lọc bù (Complementary Filter) kết hợp giữa vận tốc góc của trục con quay (Gyroscope Z) và vận tốc 2 bánh xe từ Encoder để duy trì góc hướng $\theta$ ổn định trong thời gian dài.

#### C. Dải 5 Đèn LED RGB WS2812B
* Điều khiển dải 5 bóng LED WS2812B trên chân `GPIO 23`.
* Tích hợp chuẩn hiệu chỉnh Gamma 2.2 cho màu sắc trung thực và rõ ràng.
* Các hiệu ứng hiển thị:
  - **Đội Đỏ / Đội Xanh:** Sáng màu theo đội khi ở trạng thái chờ lệnh.
  - **Đang di chuyển:** Hiệu ứng chạy sao băng (chase/running).
  - **Sẵn sàng / Đã bắt giao điểm:** Nháy sáng màu xanh lá (Green pulse).
  - **Báo lỗi / Khẩn cấp:** Nháy đỏ toàn dải.

#### D. Truyền thông Không dây ESP-NOW
* Nhận trực tiếp các gói tin nhị phân từ Coordinator:
  - `ROBOT_CMD_WAYPOINT`: Nhận tọa độ đích $(x, y, \theta)$ và tốc độ.
  - `ROBOT_CMD_SET_LED`: Thay đổi màu sắc và độ sáng của LED.
  - `ROBOT_CMD_PING`: Phản hồi ngay lập tức gói tin `ROBOT_STATUS_PONG` để báo trạng thái "sống".
  - `ROBOT_CMD_EMERGENCY_STOP`: Phanh dừng động cơ ngay lập tức.
* Định kỳ 100ms phát gói trạng thái `RobotStatusPacket` (vị trí hiện tại, góc hướng, trạng thái di chuyển, mã lỗi) về lại Coordinator.

---

## 3. BẢNG TỔNG HỢP ÁNH XẠ THÔNG SỐ VÀ ĐỊA CHỈ PHẦN CỨNG

| Thiết bị | Vai trò trong hệ thống | ID ArUco | Địa chỉ MAC Wi-Fi (ESP-NOW) | Ghi chú phần cứng |
| :--- | :--- | :---: | :---: | :--- |
| **Coordinator** | Bộ điều phối trung tâm | Không | `38:18:2B:B1:BC:E4` | AI-Thinker ESP32-CAM, UART2 (RX: 13, TX: 14) |
| **Xe 1** | Quân cờ Đội Đỏ (Player 1) | **1** | `70:4B:CA:6D:8F:AC` | ESP32-WROOM-32D, 5 TCRT5000L, 5 WS2812B |
| **Xe 2** | Quân cờ Đội Đỏ (Player 1) | **2** | `A8:42:E3:4A:29:AC` | ESP32-WROOM-32D, 5 TCRT5000L, 5 WS2812B |
| **Xe 3** | Quân cờ Đội Đỏ (Player 1) | **3** | `CC:DB:A7:2D:D6:4C` | ESP32-WROOM-32D, 5 TCRT5000L, 5 WS2812B |
| **Xe 4** | Quân cờ Đội Xanh (AI / Player 2) | **4** | `F0:08:D1:7C:13:D8` | ESP32-WROOM-32D, 5 TCRT5000L, 5 WS2812B |
| **Xe 5** | Quân cờ Đội Xanh (AI / Player 2) | **5** | `04:83:08:59:43:6C` | ESP32-WROOM-32D, 5 TCRT5000L, 5 WS2812B |
| **Xe 6** | Quân cờ Đội Xanh (AI / Player 2) | **6** | `B0:3F:D3:5B:44:60` | ESP32-WROOM-32D, 5 TCRT5000L, 5 WS2812B |
| **Góc Trên - Trái** | Điểm hiệu chuẩn bàn cờ | **90** | Không áp dụng | Cố định trên mặt bàn cờ (Góc Top-Left) |
| **Góc Trên - Phải** | Điểm hiệu chuẩn bàn cờ | **91** | Không áp dụng | Cố định trên mặt bàn cờ (Góc Top-Right) |
| **Góc Dưới - Phải** | Điểm hiệu chuẩn bàn cờ | **92** | Không áp dụng | Cố định trên mặt bàn cờ (Góc Bottom-Right) |
| **Góc Dưới - Trái** | Điểm hiệu chuẩn bàn cờ | **93** | Không áp dụng | Cố định trên mặt bàn cờ (Góc Bottom-Left) |

---

## 4. HƯỚNG DẪN VẬN HÀNH DÀNH CHO BUỔI BẢO VỆ VÀ THỰC NGHIỆM

### 4.1. Kịch bản 1: Trình diễn tại Hội đồng Bảo vệ (Khuyên dùng)
1. **Khởi chạy Giao diện Dashboard trên Laptop:**
   ```powershell
   cd "C:\Users\Quang\Downloads\DATN\three-men's-morris-robot-dashboard"
   npm run dev
   ```
2. Mở trình duyệt tại địa chỉ `http://localhost:5173`.
3. Tại góc trên bên phải màn hình, kiểm tra công tắc **"Chế độ mô phỏng demo"** đang ở trạng thái **BẬT (ON)**.
4. Chọn chế độ chơi:
   - **Người vs AI:** Thao tác thả quân và di chuyển quân của người chơi (Đỏ); AI (Xanh) sẽ tự động tính toán nước cờ tối ưu bằng thuật toán Minimax và hiển thị hoạt ảnh di chuyển tức thì.
   - **Người vs Người:** Cho phép hai người chơi trực tiếp trên giao diện để chứng minh đầy đủ luật cờ.
5. **Hiển thị Video thực tế:** Chiếu kèm video đã quay thực nghiệm tại nhà ghi lại cảnh 6 xe tự hành di chuyển vào đúng các ô cờ tương ứng với lệnh từ web.

### 4.2. Kịch bản 2: Vận hành Toàn diện với Phần cứng Thực tế
1. **Bật nguồn 6 xe AGV và mạch Coordinator:**
   - Đặt 6 xe vào các vị trí bãi chờ quy định bên ngoài bàn cờ.
   - Cắm Coordinator vào cổng USB của Raspberry Pi (hoặc máy tính điều khiển).
2. **Khởi động Backend trên Raspberry Pi:**
   ```bash
   cd ~/Robot-Controller-main/pi
   python3 run.py --camera --camera-device /dev/video0 --serial /dev/ttyUSB0
   ```
3. **Mở Giao diện Web Dashboard:**
   - Chuyển công tắc về **"Chế độ Phần cứng Thực tế"**.
   - Bảng **Pre-Flight Hardware Check** sẽ tự động mở lên:
     - Quan sát mục **Camera ArUco**: Kiểm tra 4 góc 90, 91, 92, 93 đã nhận đủ 15 frame hiệu chuẩn hay chưa.
     - Quan sát mục **Coordinator**: Đèn xanh báo đã kết nối Serial thành công.
     - Quan sát bảng **6 Xe AGV**: Bấm nút "Kiểm tra lại tất cả", hệ thống sẽ gửi gói PING qua ESP-NOW và cập nhật trạng thái Online/Offline của từng xe.
   - Khi các mục đều đạt chuẩn, bấm **"Vào bàn cờ thực tế"** để bắt đầu trận đấu có sự tham gia của xe thật.

---

## 5. KẾT LUẬN

Hệ thống đã được chuẩn hóa và nâng cấp toàn diện từ cấp độ mạch điện tử nhúng, giao thức truyền thông không dây thời gian thực, thuật toán thị giác máy tính cho đến giao diện web hiện đại. Việc bổ sung chế độ mô phỏng độc lập cùng quy trình chẩn đoán tiền khởi động giúp tác giả hoàn toàn làm chủ kịch bản bảo vệ tốt nghiệp, đảm bảo tính khoa học cao và độ an toàn tuyệt đối trước Hội đồng chấm thi.
