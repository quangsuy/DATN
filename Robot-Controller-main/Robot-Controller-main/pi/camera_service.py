"""Camera service cho Raspberry Pi 3: stream MJPEG + hiệu chỉnh bàn cờ bằng ArUco.

Chạy độc lập:  python -m pi.camera_service --port 8080
Endpoint:
    /video          MJPEG trực tiếp (có overlay marker + trạng thái hiệu chỉnh)  <- web dashboard dùng
    /warped         MJPEG góc nhìn từ trên xuống (bird's-eye) sau khi nắn phẳng
    /snapshot.jpg   1 ảnh JPEG
    /status         JSON {online, fps, calibrated, markers_seen, device, ...}
    /calibrate      Bắt đầu hiệu chỉnh lại (GET/POST)

Cải tiến so với script thử nghiệm:
  * Thread capture riêng, luôn giữ frame mới nhất (không trễ hàng đợi V4L2).
  * Ép MJPG (YUYV 1080p chỉ 5 fps) + độ phân giải thấp cho Pi 3.
  * Tự dò thiết bị video có khả năng capture (bỏ qua node metadata /dev/video1, codec/ISP).
  * ArUco chạy mỗi N frame; hiệu chỉnh lấy trung vị nhiều mẫu -> ma trận homography
    ổn định, lưu JSON, nạp lại khi khởi động; che mất marker vẫn nắn phẳng được.
  * Một lần encode JPEG dùng chung cho mọi client.
  * Không có cửa sổ imshow -> chạy headless qua SSH.
"""

import argparse
import json
import logging
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable, Dict, List, Optional, Sequence, Tuple, Union

import cv2
import numpy as np

log = logging.getLogger(__name__)

CORNER_IDS: Tuple[int, ...] = (90, 91, 92, 93)  # TL, TR, BR, BL
BOARD_SIZE = 800
CALIB_SAMPLES = 15
ROBOT_IDS = range(1, 7)  # marker gan tren 6 xe
ARROW_SCALE = 3.0        # keo dai mui ten = 3 lan tu tam toi canh tren
DEFAULT_CALIB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "camera_calibration.json")

FrameSource = Callable[[], Optional[np.ndarray]]


def parse_device_arg(value: Optional[object]) -> Optional[Union[int, str]]:
    """Chuyển đổi tham số --device / --camera-device thành số nguyên hoặc đường dẫn/URL."""
    if value is None:
        return None
    if isinstance(value, int):
        return value
    text = str(value).strip()
    if not text:
        return None
    return int(text) if text.isdigit() else text


def find_capture_device(
    candidates: Optional[Sequence[Union[int, str]]] = None,
) -> Optional[Tuple[cv2.VideoCapture, str]]:
    """Mở thiết bị V4L2 (/dev/videoN) hoặc luồng IP Webcam (http/https/rtsp) đầu tiên trả về frame."""
    items: Sequence[Union[int, str]] = candidates if candidates is not None else tuple(range(0, 8))
    for item in items:
        if isinstance(item, str) and not item.isdigit():
            path = item.strip()
            is_url = path.startswith(("http://", "https://", "rtsp://"))
            if is_url or os.name == "nt":
                cap = cv2.VideoCapture(path)
            else:
                cap = cv2.VideoCapture(path, cv2.CAP_V4L2)
        else:
            index = int(item)
            path = "/dev/video%d" % index
            cap = cv2.VideoCapture(path, cv2.CAP_V4L2) if os.name != "nt" else cv2.VideoCapture(index)
        if cap.isOpened():
            ok, frame = cap.read()
            if ok and frame is not None:
                return cap, path
        cap.release()
    return None


class CameraService:
    def __init__(
        self,
        source: Optional[FrameSource] = None,
        width: int = 640,
        height: int = 480,
        fps: int = 30,
        jpeg_quality: int = 70,
        stream_fps: int = 15,
        detect_every: int = 3,
        calib_path: str = DEFAULT_CALIB_PATH,
        device_index: Optional[Union[int, str]] = None,
    ) -> None:
        self.width, self.height, self.fps = width, height, fps
        self.jpeg_quality = jpeg_quality
        self.stream_interval = 1.0 / max(1, stream_fps)
        self.detect_every = max(1, detect_every)
        self.calib_path = calib_path
        self.device_index = device_index
        self._source = source
        self._cap: Optional[cv2.VideoCapture] = None
        self.device = "custom-source" if source else None

        detector_params = cv2.aruco.DetectorParameters()
        self._detector = cv2.aruco.ArucoDetector(cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_5X5_100), detector_params)
        self._dst = np.float32([[0, 0], [BOARD_SIZE, 0], [BOARD_SIZE, BOARD_SIZE], [0, BOARD_SIZE]])

        self._lock = threading.Condition()
        self._frame_jpeg: Optional[bytes] = None
        self._warped_jpeg: Optional[bytes] = None
        self._frame_seq = 0
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

        self.online = False
        self.measured_fps = 0.0
        self.markers_seen: List[int] = []
        self.robots: Dict[int, Dict[str, float]] = {}
        self._matrix: Optional[np.ndarray] = None
        self._samples: List[np.ndarray] = []
        self._calibrating = False
        self.load_calibration()

    # ---- hiệu chỉnh -------------------------------------------------
    @property
    def calibrated(self) -> bool:
        return self._matrix is not None

    @property
    def calibrating(self) -> bool:
        return self._calibrating

    def load_calibration(self) -> bool:
        try:
            with open(self.calib_path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
            matrix = np.array(data["matrix"], dtype=np.float64)
            if matrix.shape == (3, 3) and data.get("board_size") == BOARD_SIZE:
                self._matrix = matrix
                return True
        except (OSError, ValueError, KeyError):
            pass
        return False

    def start_calibration(self) -> None:
        """Xóa ma trận cũ và thu thập CALIB_SAMPLES mẫu có đủ 4 marker."""
        with self._lock:
            self._samples = []
            self._matrix = None
            self._calibrating = True
        log.info("Bắt đầu hiệu chỉnh camera")

    def _finish_calibration(self) -> None:
        points = np.median(np.stack(self._samples), axis=0).astype(np.float32)
        self._matrix = cv2.getPerspectiveTransform(points, self._dst)
        self._calibrating = False
        self._samples = []
        try:
            with open(self.calib_path, "w", encoding="utf-8") as handle:
                json.dump({"board_size": BOARD_SIZE, "corner_ids": list(CORNER_IDS), "matrix": self._matrix.tolist()}, handle)
        except OSError as error:
            log.warning("Không lưu được hiệu chỉnh: %s", error)
        log.info("Hiệu chỉnh xong")

    @staticmethod
    def _heading_deg(dx: float, dy: float) -> float:
        """Goc theo chieu kim dong ho, 0 deg = huong len tren (truc y am cua anh)."""
        return float(np.degrees(np.arctan2(dx, -dy)) % 360.0)

    def _robot_poses(self, corners: list, ids: Optional[np.ndarray]) -> Dict[int, Dict[str, float]]:
        """Vi tri + huong tung xe. Huong = tu tam marker huong ve canh tren (TL-TR) cua marker.

        Marker phai dan sao cho canh tren huong ve phia dau xe.
        Neu da hieu chuan, them toa do/huong tren mat phang ban co (px 0..BOARD_SIZE).
        """
        poses: Dict[int, Dict[str, float]] = {}
        if ids is None:
            return poses
        matrix = self._matrix
        for quad, marker_id in zip(corners, ids.flatten()):
            marker_id = int(marker_id)
            if marker_id not in ROBOT_IDS:
                continue
            pts = quad[0]
            center = pts.mean(axis=0)
            top = (pts[0] + pts[1]) / 2.0
            pose = {
                "px": float(center[0]),
                "py": float(center[1]),
                "image_heading_deg": self._heading_deg(top[0] - center[0], top[1] - center[1]),
            }
            if matrix is not None:
                warped = cv2.perspectiveTransform(np.float32([[center, top]]), matrix)[0]
                pose["board_x"] = float(warped[0][0])
                pose["board_y"] = float(warped[0][1])
                pose["heading_deg"] = self._heading_deg(warped[1][0] - warped[0][0], warped[1][1] - warped[0][1])
            poses[marker_id] = pose
        return poses

    def _detect(self, frame: np.ndarray) -> Tuple[list, Optional[np.ndarray]]:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        corners, ids, _ = self._detector.detectMarkers(gray)
        self.markers_seen = sorted(int(i) for i in ids.flatten()) if ids is not None else []
        self.robots = self._robot_poses(corners, ids)
        if ids is not None and self._calibrating:
            flat = ids.flatten().tolist()
            if all(cid in flat for cid in CORNER_IDS):
                pts = [np.mean(corners[flat.index(cid)][0], axis=0) for cid in CORNER_IDS]
                self._samples.append(np.float32(pts))
                if len(self._samples) >= CALIB_SAMPLES:
                    self._finish_calibration()
        return corners, ids

    # ---- vòng capture -----------------------------------------------
    def _open(self) -> bool:
        if self._source is not None:
            return True
        if self.device_index is not None:
            found = find_capture_device([self.device_index])
        else:
            found = find_capture_device()
        if not found:
            return False
        cap, self.device = found
        is_url = isinstance(self.device, str) and self.device.startswith(("http://", "https://", "rtsp://"))
        if not is_url:
            cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
            cap.set(cv2.CAP_PROP_FPS, self.fps)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self._cap = cap
        log.info("Camera mở tại %s", self.device)
        return True

    def _read(self) -> Optional[np.ndarray]:
        if self._source is not None:
            return self._source()
        if self._cap is None:
            return None
        ok, frame = self._cap.read()
        if not ok or frame is None:
            return None
        h, w = frame.shape[:2]
        if w > self.width or h > self.height:
            frame = cv2.resize(frame, (self.width, self.height), interpolation=cv2.INTER_AREA)
        return frame

    def _render(self, frame: np.ndarray, corners: list, ids: Optional[np.ndarray]) -> Tuple[bytes, Optional[bytes]]:
        view = frame.copy()
        if ids is not None and len(ids):
            cv2.aruco.drawDetectedMarkers(view, corners, ids)
            for quad, marker_id in zip(corners, ids.flatten()):
                marker_id = int(marker_id)
                pts = quad[0]
                center = pts.mean(axis=0)
                if marker_id in ROBOT_IDS:
                    top = (pts[0] + pts[1]) / 2.0
                    tip = center + (top - center) * ARROW_SCALE
                    cv2.arrowedLine(view, (int(center[0]), int(center[1])), (int(tip[0]), int(tip[1])), (0, 0, 255), 2, tipLength=0.2)
                    pose = self.robots.get(marker_id)
                    label = "Xe %d" % marker_id
                    if pose and "heading_deg" in pose:
                        label += " %d\u00b0" % round(pose["heading_deg"])
                    cv2.putText(view, label.replace("\u00b0", "d"), (int(center[0]) - 25, int(tip[1]) - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 2)
                elif marker_id in CORNER_IDS:
                    cv2.putText(view, "Goc:%d" % marker_id, (int(center[0]) - 30, int(center[1])), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2)
        if self.calibrating:
            text, color = "HIEU CHUAN %d/%d" % (len(self._samples), CALIB_SAMPLES), (0, 215, 255)
        elif self.calibrated:
            text, color = "DA HIEU CHUAN", (0, 220, 0)
        else:
            text, color = "CHUA HIEU CHUAN - can du ma 90-93", (0, 0, 255)
        cv2.putText(view, text, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        params = [cv2.IMWRITE_JPEG_QUALITY, self.jpeg_quality]
        ok, raw = cv2.imencode(".jpg", view, params)
        warped = None
        if self._matrix is not None:
            flat = cv2.warpPerspective(frame, self._matrix, (BOARD_SIZE, BOARD_SIZE))
            ok2, buf = cv2.imencode(".jpg", cv2.resize(flat, (480, 480)), params)
            warped = buf.tobytes() if ok2 else None
        return raw.tobytes(), warped

    def _run(self) -> None:
        count, last_publish, fps_mark, fps_count = 0, 0.0, time.monotonic(), 0
        corners, ids = [], None
        while not self._stop.is_set():
            if not self.online:
                if not self._open():
                    time.sleep(2.0)
                    continue
                self.online = True
            frame = self._read()
            if frame is None:
                log.warning("Mất frame, thử mở lại camera")
                self.online = False
                if self._cap is not None:
                    self._cap.release()
                    self._cap = None
                time.sleep(1.0)
                continue
            count += 1
            fps_count += 1
            if count % self.detect_every == 0:
                corners, ids = self._detect(frame)
            now = time.monotonic()
            if now - fps_mark >= 2.0:
                self.measured_fps = fps_count / (now - fps_mark)
                fps_mark, fps_count = now, 0
            if now - last_publish >= self.stream_interval:
                last_publish = now
                raw, warped = self._render(frame, corners, ids)
                with self._lock:
                    self._frame_jpeg, self._warped_jpeg = raw, warped
                    self._frame_seq += 1
                    self._lock.notify_all()
        if self._cap is not None:
            self._cap.release()

    # ---- API -------------------------------------------------------
    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, name="camera-capture", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=3)

    def wait_frame(self, last_seq: int, warped: bool = False, timeout: float = 3.0) -> Tuple[int, Optional[bytes]]:
        with self._lock:
            self._lock.wait_for(lambda: self._frame_seq != last_seq, timeout)
            return self._frame_seq, (self._warped_jpeg if warped else self._frame_jpeg)

    def status(self) -> Dict[str, object]:
        return {
            "online": self.online,
            "device": self.device,
            "fps": round(self.measured_fps, 1),
            "resolution": [self.width, self.height],
            "calibrated": self.calibrated,
            "calibrating": self.calibrating,
            "calibration_progress": len(self._samples),
            "markers_seen": self.markers_seen,
            "robots": {str(k): v for k, v in self.robots.items()},
            "missing_markers": [c for c in CORNER_IDS if c not in self.markers_seen],
        }


def make_handler(service: CameraService):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args) -> None:  # tắt log mỗi request
            return

        def _json(self, payload: object, code: int = 200) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _mjpeg(self, warped: bool) -> None:
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-cache, private")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            seq = -1
            try:
                while True:
                    seq, jpeg = service.wait_frame(seq, warped)
                    if jpeg is None:
                        continue
                    self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n" % len(jpeg))
                    self.wfile.write(jpeg)
                    self.wfile.write(b"\r\n")
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                return

        def do_GET(self) -> None:
            route = self.path.split("?")[0]
            if route in ("/video", "/stream"):
                self._mjpeg(False)
            elif route == "/warped":
                self._mjpeg(True)
            elif route == "/snapshot.jpg":
                _, jpeg = service.wait_frame(-1)
                if jpeg is None:
                    self._json({"error": "no frame"}, 503)
                    return
                self.send_response(200)
                self.send_header("Content-Type", "image/jpeg")
                self.send_header("Content-Length", str(len(jpeg)))
                self.end_headers()
                self.wfile.write(jpeg)
            elif route == "/status":
                self._json(service.status())
            elif route == "/calibrate":
                service.start_calibration()
                self._json({"ok": True})
            else:
                self._json({"error": "not found"}, 404)

        do_POST = do_GET

    return Handler


def serve(service: CameraService, host: str = "0.0.0.0", port: int = 8080) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((host, port), make_handler(service))
    server.daemon_threads = True
    return server


def main() -> None:
    parser = argparse.ArgumentParser(description="MJPEG camera + ArUco calibration service")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument(
        "--device",
        type=parse_device_arg,
        default=None,
        help="chỉ số /dev/videoN hoặc URL luồng IP Webcam http://... (mặc định: tự dò)",
    )
    parser.add_argument("--width", type=int, default=640)
    parser.add_argument("--height", type=int, default=480)
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--calibrate", action="store_true", help="hiệu chỉnh lại ngay khi khởi động")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    service = CameraService(width=args.width, height=args.height, fps=args.fps, device_index=args.device)
    if args.calibrate or not service.calibrated:
        service.start_calibration()
    service.start()
    log.info("MJPEG: http://%s:%d/video", args.host, args.port)
    try:
        serve(service, args.host, args.port).serve_forever()
    except KeyboardInterrupt:
        service.stop()


if __name__ == "__main__":
    main()
