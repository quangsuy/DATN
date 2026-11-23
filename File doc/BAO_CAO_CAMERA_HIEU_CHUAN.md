# Báo cáo: Tích hợp Camera USB & Hiệu chỉnh bàn cờ (Raspberry Pi 3)

## 1. Kết quả kiểm tra phần cứng

| Mục | Kết quả | Kết luận |
|---|---|---|
| Camera | `AX1080P` tại `usb-3f980000.usb-1.2` | Nhận đúng trên bus USB của Pi 3 |
| Node dùng được | `/dev/video0` (capture), `/dev/video1` (metadata) | Chỉ `video0` đọc được frame |
| `/dev/video10–31` | Thuộc `bcm2835-codec` / `bcm2835-isp` | **Không phải webcam**, phải bỏ qua |
| MJPG | 1080p/720p/480p đều **30 fps** | Dùng MJPG |
| YUYV | 1080p **5 fps**, 720p 10 fps, 480p 30 fps | Không dùng ở độ phân giải cao (nghẽn USB 2.0) |

> Script mẫu ưu tiên quét `video2, 3, 0, 1` – trên máy này webcam là `video0`, còn `video2/3` không tồn tại. Cần dò theo khả năng capture thay vì thứ tự cố định.

## 2. Vấn đề của script mẫu khi đưa vào đồ án

| # | Vấn đề | Hậu quả |
|---|---|---|
| 1 | Dùng `cv2.imshow` | Pi chạy headless/SSH → crash; web không xem được |
| 2 | Không ép MJPG, mặc định YUYV | FPS rất thấp, CPU cao |
| 3 | Đọc + xử lý ArUco trong cùng vòng lặp, buffer V4L2 mặc định | Hình **trễ** so với thực tế |
| 4 | Homography tính lại **mỗi frame**, chỉ khi thấy đủ 4 marker | Ảnh rung; xe/tay che 1 marker là mất nắn phẳng |
| 5 | Không lưu hiệu chỉnh | Mỗi lần khởi động phải hiệu chỉnh lại |
| 6 | Dò thiết bị cố định `2,3,0,1`, không xử lý mất camera | Rút cáp là chết tiến trình |
| 7 | Không có đầu ra cho web, không báo trạng thái | Dashboard không biết camera/hiệu chỉnh ra sao |

## 3. Những gì đã thay đổi

### 3.1 File mới: `pi/camera_service.py`
- **Thread capture riêng**, `BUFFERSIZE=1` → luôn lấy frame mới nhất, không trễ.
- **Ép MJPG 640×480 @30fps** (tham số `--width/--height/--fps`), phù hợp CPU Pi 3. Stream web mặc định 15 fps.
- **Tự dò thiết bị** `/dev/video0..7`: chỉ nhận node trả được frame (loại metadata, codec, ISP). Có thể chỉ định `--device N`.
- **Tự kết nối lại** khi mất frame/rút cáp.
- **ArUco `DICT_5X5_100`, 4 góc ID 90–93** (TL, TR, BR, BL), phát hiện mỗi 3 frame để giảm tải CPU.
- **Hiệu chỉnh ổn định:** thu 15 mẫu đủ 4 marker → lấy **trung vị** tọa độ tâm → `getPerspectiveTransform` một lần → **lưu `pi/camera_calibration.json`**, nạp lại khi khởi động. Sau đó che marker vẫn nắn phẳng đúng.
- **Một lần encode JPEG dùng chung** cho mọi client (`Condition` đánh thức luồng stream).
- Overlay trên video: khung marker + trạng thái `HIEU CHUAN x/15` / `DA HIEU CHUAN` / `CHUA HIEU CHUAN`.

HTTP endpoint (stdlib, không thêm phụ thuộc web):

| Endpoint | Chức năng |
|---|---|
| `GET /video` | MJPEG trực tiếp – **đúng URL dashboard đã dùng** (`:8080/video`) |
| `GET /warped` | MJPEG góc nhìn chim bay đã nắn phẳng |
| `GET /snapshot.jpg` | Ảnh tĩnh |
| `GET /status` | JSON: `online, fps, calibrated, calibrating, markers_seen, missing_markers` |
| `GET/POST /calibrate` | Hiệu chỉnh lại |

### 3.2 Sửa `pi/websocket_server.py`
- `MorrisWebSocketServer(backend, camera)` nhận camera tùy chọn.
- Action `calibrate_camera` từ web giờ **kích hoạt hiệu chỉnh thật** (trước đây chỉ phát sự kiện giả).
- Tham số mới: `--camera`, `--camera-port 8080`, `--camera-device N` – chạy cùng backend một lệnh.

### 3.3 Sửa `src/components/CameraStream.tsx` (web)
- Tự **thử lại mỗi 3 s** khi stream lỗi (trước đây OFFLINE vĩnh viễn đến khi F5).
- Hiển thị: `ĐÃ HIỆU CHUẨN • FPS`, tiến độ hiệu chỉnh, **danh sách marker còn thiếu**.
- Nút **HIỆU CHỈNH** gọi `/calibrate`.

### 3.4 Khác
- `pi/requirements.txt`: thêm `opencv-python-headless`, `numpy`.
- `pi/test_camera_service.py`: 3 test mới (hiệu chỉnh hội tụ + lưu/nạp, thiếu marker không hiệu chỉnh, HTTP `/status` `/snapshot.jpg` `/video`) dùng ảnh ArUco giả lập.

## 4. Cách chạy trên Pi 3

```bash
cd ~/Robot-Controller-main
source .venv/bin/activate
sudo apt install -y python3-opencv   # hoặc: pip install opencv-python-headless
sudo usermod -aG video $USER          # nếu không chạy root

# Chạy backend + camera
python -m pi.websocket_server --transport serial --serial-device /dev/ttyUSB0 --camera

# Chỉ test camera
python -m pi.camera_service --port 8080 --calibrate
```

Kiểm tra nhanh từ laptop:
- `http://192.168.66.107:8080/video` – xem trực tiếp
- `http://192.168.66.107:8080/status` – trạng thái JSON
- `http://192.168.66.107:8080/warped` – bàn cờ nắn phẳng

> [!NOTE]
> Dùng `opencv-python-headless` (bản `apt` hoặc `pip`) – API `cv2.aruco.ArucoDetector` cần OpenCV ≥ 4.7. Nếu `apt` cài bản cũ hơn, dùng `pip` trong `.venv`.

## 5. Kết quả kiểm thử (trên máy dev)
- `pytest pi/`: **38/38 PASS** (35 cũ + 3 camera).
- TypeScript / Vite build: xem phần tóm tắt cuối.
- **Chưa kiểm thử trên webcam thật và Pi 3** – cần chạy thực tế để xác nhận FPS và độ ổn định hiệu chỉnh.

## 6. Hướng phát triển tiếp theo
1. Ánh xạ ảnh nắn phẳng → 9 ô cờ (ROI), nhận diện xe theo ArUco gắn trên xe → đối chiếu với `board` của backend (resync vị trí khi lệch, dùng `resync_positions`).
2. Đưa `markers_seen`/`fps` vào sự kiện `camera_frame_metadata` và `system_telemetry` để dashboard thay số liệu giả.
3. Hiệu chuẩn méo ống kính (`calibrateCamera`) nếu viền bàn cờ bị cong ở 1080p.
4. Nếu CPU Pi 3 quá tải: giảm `detect_every`, giữ 640×480, hoặc passthrough MJPEG thô khi không cần overlay.
