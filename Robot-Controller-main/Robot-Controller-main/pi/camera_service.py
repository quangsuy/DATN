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
CORNER_PAD = 80          # Chừa lề 80px quanh 4 tâm mã góc để thấy trọn 6 xe ở bãi đỗ ngoài bàn cờ
CALIB_SAMPLES = 8        # Số mẫu trung vị cho mỗi góc (gom độc lập từng góc chống chập chờn)
ROBOT_IDS = range(1, 7)  # marker gan tren 6 xe
ARROW_SCALE = 3.0        # keo dai mui ten = 3 lan tu tam toi canh tren
HOLD_TTL_S = 1.5         # Giữ dấu vị trí xe 1.5 giây nếu 1-2 frame bị lóa/mờ tạm thời
EMA_ALPHA = 0.60         # Hệ số làm mượt tọa độ & góc quay
DEFAULT_CALIB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "camera_calibration.json")

FrameSource = Callable[[], Optional[np.ndarray]]


def _build_aruco_detector() -> cv2.aruco.ArucoDetector:
    """Cấu hình bộ lọc ArUco tối ưu cho bạt bóng có lóa đèn và góc nhìn nghiêng từ điện thoại."""
    params = cv2.aruco.DetectorParameters()
    # 1. Quét dải cửa sổ ngưỡng thích nghi rộng để chống bóng lóa trên mặt bạt
    params.adaptiveThreshWinSizeMin = 3
    params.adaptiveThreshWinSizeMax = 35
    params.adaptiveThreshWinSizeStep = 4
    params.adaptiveThreshConstant = 7
    # 2. Chấp nhận thẻ ở góc xa (như Goc 91) hoặc sát mép ảnh và bị méo phối cảnh
    params.minMarkerPerimeterRate = 0.012
    params.maxMarkerPerimeterRate = 4.0
    params.polygonalApproxAccuracyRate = 0.055
    params.minCornerDistanceRate = 0.02
    params.minDistanceToBorder = 1
    # 3. Tăng khả năng sửa lỗi bit & làm mịn tọa độ góc sub-pixel
    params.errorCorrectionRate = 0.80
    params.cornerRefinementMethod = cv2.aruco.CORNER_REFINE_SUBPIX
    params.cornerRefinementWinSize = 5
    params.cornerRefinementMaxIterations = 30
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_5X5_100)
    return cv2.aruco.ArucoDetector(dictionary, params)


def _classify_board_zone(board_x: float, board_y: float) -> Tuple[str, float, float]:
    """Quy đổi tọa độ trên bản đồ cắt phẳng (0..800) sang tọa độ (mm_x, mm_y) và tên Ô/Bãi đỗ.

    Khung bàn cờ 3x3 (A1..C3) nằm trong vùng trung tâm của 4 thẻ góc 90..93:
      - A1=(0,0)mm, B1=(100,0)mm, C1=(200,0)mm
      - A2=(0,100)mm, B2=(100,100)mm, C2=(200,100)mm
      - A3=(0,200)mm, B3=(100,200)mm, C3=(200,200)mm
      - Bãi đỗ trái (BAY-1..3): x < 0 mm; Bãi đỗ phải (BAY-4..6): x > 200 mm
    """
    # Tâm bàn cờ B2 tại (400, 400); khoảng cách từ tâm B2 tới các trục A/C là ~210px, hàng 1/3 là ~250px
    mm_x = 100.0 + ((board_x - 400.0) / 210.0) * 100.0
    mm_y = 100.0 + ((board_y - 400.0) / 250.0) * 100.0

    row_idx = 1 if mm_y < 50.0 else (2 if mm_y <= 150.0 else 3)
    if mm_x < -22.0:
        zone = f"BAY-{row_idx}"
    elif mm_x > 222.0:
        zone = f"BAY-{row_idx + 3}"
    else:
        col_char = "A" if mm_x < 50.0 else ("B" if mm_x <= 150.0 else "C")
        zone = f"{col_char}{row_idx}"
    return zone, round(mm_x, 1), round(mm_y, 1)


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
        width: int = 960,
        height: int = 540,
        fps: int = 30,
        jpeg_quality: int = 75,
        stream_fps: int = 15,
        detect_every: int = 2,
        calib_path: str = DEFAULT_CALIB_PATH,
        device_index: Optional[Union[int, str]] = None,
        allow_three_corner_fallback: bool = False,
    ) -> None:
        self.width, self.height, self.fps = width, height, fps
        self.jpeg_quality = jpeg_quality
        self.stream_interval = 1.0 / max(1, stream_fps)
        self.detect_every = max(1, detect_every)
        self.calib_path = calib_path
        self.device_index = device_index
        self.allow_three_corner_fallback = allow_three_corner_fallback
        self._source = source
        self._cap: Optional[cv2.VideoCapture] = None
        self.device = "custom-source" if source else None

        self._detector = _build_aruco_detector()
        self._clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
        self._dst = np.float32([
            [CORNER_PAD, CORNER_PAD],
            [BOARD_SIZE - CORNER_PAD, CORNER_PAD],
            [BOARD_SIZE - CORNER_PAD, BOARD_SIZE - CORNER_PAD],
            [CORNER_PAD, BOARD_SIZE - CORNER_PAD],
        ])

        self._lock = threading.Condition()
        self._frame_jpeg: Optional[bytes] = None
        self._warped_jpeg: Optional[bytes] = None
        self._frame_seq = 0
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

        self.online = False
        self.measured_fps = 0.0
        self.markers_seen: List[int] = []
        self.robots: Dict[int, Dict[str, object]] = {}
        self.corners_info: Dict[int, Dict[str, float]] = {}
        self._tracked_robots: Dict[int, Dict[str, object]] = {}
        self._tracked_corners: Dict[int, Dict[str, float]] = {}
        self._matrix: Optional[np.ndarray] = None
        self._samples: List[np.ndarray] = []
        self._corner_samples: Dict[int, List[np.ndarray]] = {cid: [] for cid in CORNER_IDS}
        self._calib_attempts = 0
        self._using_three_corner_est = False
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
        """Xóa ma trận cũ và thu thập mẫu cho 4 marker góc (90..93)."""
        with self._lock:
            self._samples = []
            self._corner_samples = {cid: [] for cid in CORNER_IDS}
            self._calib_attempts = 0
            self._using_three_corner_est = False
            self._matrix = None
            self._calibrating = True
        log.info("Bắt đầu hiệu chỉnh camera (gom mẫu độc lập cho 4 góc 90..93)")

    def _finish_calibration(self, custom_points: Optional[np.ndarray] = None, is_estimated: bool = False) -> None:
        if custom_points is not None:
            points = custom_points.astype(np.float32)
        elif self._samples:
            points = np.median(np.stack(self._samples), axis=0).astype(np.float32)
        else:
            pts_list = [np.median(np.stack(self._corner_samples[cid]), axis=0) for cid in CORNER_IDS]
            points = np.float32(pts_list)
        self._matrix = cv2.getPerspectiveTransform(points, self._dst)
        self._using_three_corner_est = is_estimated
        if not is_estimated:
            self._calibrating = False
            self._samples = []
            self._corner_samples = {cid: [] for cid in CORNER_IDS}
        try:
            with open(self.calib_path, "w", encoding="utf-8") as handle:
                json.dump(
                    {
                        "board_size": BOARD_SIZE,
                        "corner_pad": CORNER_PAD,
                        "corner_ids": list(CORNER_IDS),
                        "estimated_fourth_corner": is_estimated,
                        "matrix": self._matrix.tolist(),
                    },
                    handle,
                )
        except OSError as error:
            log.warning("Không lưu được hiệu chỉnh: %s", error)
        log.info("Hiệu chỉnh xong (estimated=%s)", is_estimated)

    @staticmethod
    def _estimate_missing_corner(known: Dict[int, np.ndarray]) -> Optional[np.ndarray]:
        """Nếu camera bị khuất hoặc cắt sát mép 1 trong 4 góc (ví dụ thiếu góc 91),
        ước lượng góc thứ 4 theo hình học phối cảnh từ 3 góc còn lại để vẫn cắt phẳng được map."""
        if len(known) != 3:
            return None
        # Thứ tự: 90 (TL), 91 (TR), 92 (BR), 93 (BL)
        p90 = known.get(90)
        p91 = known.get(91)
        p92 = known.get(92)
        p93 = known.get(93)
        # Hệ số thu hẹp phối cảnh cạnh trên so với cạnh dưới (~0.92 khi camera nhìn nghiêng)
        shrink = 0.92
        if p91 is None and p90 is not None and p92 is not None and p93 is not None:
            p91 = p90 + (p92 - p93) * shrink
        elif p90 is None and p91 is not None and p92 is not None and p93 is not None:
            p90 = p91 - (p92 - p93) * shrink
        elif p92 is None and p90 is not None and p91 is not None and p93 is not None:
            p92 = p93 + (p91 - p90) / shrink
        elif p93 is None and p90 is not None and p91 is not None and p92 is not None:
            p93 = p92 - (p91 - p90) / shrink
        if p90 is None or p91 is None or p92 is None or p93 is None:
            return None
        return np.float32([p90, p91, p92, p93])

    @staticmethod
    def _heading_deg(dx: float, dy: float) -> float:
        """Goc theo chieu kim dong ho, 0 deg = huong len tren (truc y am cua anh)."""
        return float(np.degrees(np.arctan2(dx, -dy)) % 360.0)

    @staticmethod
    def _smooth_angle(old_deg: float, new_deg: float, alpha: float = EMA_ALPHA) -> float:
        old_rad = np.radians(old_deg)
        new_rad = np.radians(new_deg)
        sin_v = alpha * np.sin(new_rad) + (1.0 - alpha) * np.sin(old_rad)
        cos_v = alpha * np.cos(new_rad) + (1.0 - alpha) * np.cos(old_rad)
        return float(np.degrees(np.arctan2(sin_v, cos_v)) % 360.0)

    def _robot_poses(self, corners: list, ids: Optional[np.ndarray], already_warped: bool = False) -> Dict[int, Dict[str, object]]:
        """Vi tri + huong + thong tin QR day du cua tung xe."""
        poses: Dict[int, Dict[str, object]] = {}
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
            img_heading = self._heading_deg(top[0] - center[0], top[1] - center[1])
            pose: Dict[str, object] = {
                "id": marker_id,
                "team": 1 if marker_id <= 3 else 2,
                "px": float(center[0]),
                "py": float(center[1]),
                "image_heading_deg": float(img_heading),
                "stale": False,
            }
            if already_warped:
                bx, by = float(center[0]), float(center[1])
                b_heading = float(img_heading)
                zone, mm_x, mm_y = _classify_board_zone(bx, by)
                pose["board_x"] = bx
                pose["board_y"] = by
                pose["heading_deg"] = b_heading
                pose["zone"] = zone
                pose["mm_x"] = mm_x
                pose["mm_y"] = mm_y
            elif matrix is not None:
                warped = cv2.perspectiveTransform(np.float32([[center, top]]), matrix)[0]
                bx = float(warped[0][0])
                by = float(warped[0][1])
                b_heading = self._heading_deg(warped[1][0] - warped[0][0], warped[1][1] - warped[0][1])
                zone, mm_x, mm_y = _classify_board_zone(bx, by)
                pose["board_x"] = bx
                pose["board_y"] = by
                pose["heading_deg"] = b_heading
                pose["zone"] = zone
                pose["mm_x"] = mm_x
                pose["mm_y"] = mm_y
            poses[marker_id] = pose
        return poses

    def _detect_markers_multi_pass(self, gray: np.ndarray) -> Tuple[list, Optional[np.ndarray]]:
        """Quét ArUco 2 lớp (ảnh xám gốc + ảnh tăng tương phản cục bộ CLAHE chống lóa đèn)."""
        corners, ids, _ = self._detector.detectMarkers(gray)
        seen_set = set(int(i) for i in ids.flatten()) if ids is not None else set()
        # Nếu chưa thấy đủ 4 góc và 6 xe, quét thêm trên ảnh CLAHE khử bóng lóa để gom nốt các mã bị mờ
        if len(seen_set) < 10:
            enhanced = self._clahe.apply(gray)
            c2, ids2, _ = self._detector.detectMarkers(enhanced)
            if ids2 is not None:
                corners_list = list(corners) if corners is not None else []
                ids_list = [int(i) for i in ids.flatten()] if ids is not None else []
                for quad, mid in zip(c2, ids2.flatten()):
                    mid_int = int(mid)
                    if mid_int not in seen_set:
                        seen_set.add(mid_int)
                        corners_list.append(quad)
                        ids_list.append(mid_int)
                if ids_list:
                    corners = corners_list
                    ids = np.array([[i] for i in ids_list], dtype=np.int32)
        return corners, ids

    def _update_tracked_state(self, raw_poses: Dict[int, Dict[str, object]], raw_corners: Dict[int, Dict[str, float]]) -> None:
        """Bộ lọc giữ dấu Anti-Flicker (TTL 1.5s) và làm mượt EMA cho 6 xe & 4 góc."""
        now = time.monotonic()
        use_hold = self._thread is not None and self._thread.is_alive()

        for cid, cinfo in raw_corners.items():
            self._tracked_corners[cid] = {**cinfo, "last_seen": now}
        if use_hold:
            expired_c = [cid for cid, info in self._tracked_corners.items() if now - info.get("last_seen", 0.0) > HOLD_TTL_S * 2]
            for cid in expired_c:
                del self._tracked_corners[cid]
            self.corners_info = {cid: dict(info) for cid, info in self._tracked_corners.items()}
        else:
            self.corners_info = dict(raw_corners)

        for rid, pose in raw_poses.items():
            prev = self._tracked_robots.get(rid)
            if prev is not None and use_hold:
                pose["px"] = EMA_ALPHA * float(pose["px"]) + (1.0 - EMA_ALPHA) * float(prev["px"])
                pose["py"] = EMA_ALPHA * float(pose["py"]) + (1.0 - EMA_ALPHA) * float(prev["py"])
                pose["image_heading_deg"] = self._smooth_angle(float(prev["image_heading_deg"]), float(pose["image_heading_deg"]))
                if "board_x" in pose and "board_x" in prev:
                    bx = EMA_ALPHA * float(pose["board_x"]) + (1.0 - EMA_ALPHA) * float(prev["board_x"])
                    by = EMA_ALPHA * float(pose["board_y"]) + (1.0 - EMA_ALPHA) * float(prev["board_y"])
                    bh = self._smooth_angle(float(prev["heading_deg"]), float(pose["heading_deg"]))
                    zone, mm_x, mm_y = _classify_board_zone(bx, by)
                    pose["board_x"] = bx
                    pose["board_y"] = by
                    pose["heading_deg"] = bh
                    pose["zone"] = zone
                    pose["mm_x"] = mm_x
                    pose["mm_y"] = mm_y
            self._tracked_robots[rid] = {**pose, "last_seen": now, "stale": False}

        if use_hold:
            active_robots: Dict[int, Dict[str, object]] = {}
            for rid, info in list(self._tracked_robots.items()):
                age = now - float(info.get("last_seen", 0.0))
                if age <= HOLD_TTL_S:
                    entry = dict(info)
                    entry["stale"] = rid not in raw_poses
                    entry["age_ms"] = int(age * 1000)
                    active_robots[rid] = entry
                else:
                    del self._tracked_robots[rid]
            self.robots = active_robots
        else:
            self.robots = dict(raw_poses)

    def _detect(self, frame: np.ndarray) -> Tuple[list, Optional[np.ndarray]]:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        corners, ids = self._detect_markers_multi_pass(gray)

        raw_seen = set(int(i) for i in ids.flatten()) if ids is not None else set()
        raw_poses = self._robot_poses(corners, ids, already_warped=False)
        raw_corners: Dict[int, Dict[str, float]] = {}

        if ids is not None:
            flat = ids.flatten().tolist()
            for cid in CORNER_IDS:
                if cid in flat:
                    pt = np.mean(corners[flat.index(cid)][0], axis=0).astype(np.float32)
                    raw_corners[cid] = {"id": float(cid), "px": float(pt[0]), "py": float(pt[1])}
                    if self._calibrating or self._using_three_corner_est:
                        bucket = self._corner_samples.setdefault(cid, [])
                        if len(bucket) < CALIB_SAMPLES:
                            bucket.append(pt)

        # Kiểm tra hoàn tất hiệu chuẩn khi gom đủ mẫu cho cả 4 góc (không bắt buộc cùng 1 frame)
        if self._calibrating or self._using_three_corner_est:
            self._calib_attempts += 1
            if ids is not None:
                flat = ids.flatten().tolist()
                if all(cid in flat for cid in CORNER_IDS):
                    pts = [np.mean(corners[flat.index(cid)][0], axis=0) for cid in CORNER_IDS]
                    self._samples.append(np.float32(pts))
            if len(self._samples) >= CALIB_SAMPLES:
                self._finish_calibration(is_estimated=False)
            elif all(len(self._corner_samples.get(cid, [])) >= CALIB_SAMPLES for cid in CORNER_IDS):
                self._finish_calibration(is_estimated=False)
            elif (
                self.allow_three_corner_fallback
                and self._matrix is None
                and self._calib_attempts >= 20
                and sum(1 for cid in CORNER_IDS if len(self._corner_samples.get(cid, [])) >= 3) == 3
            ):
                known = {
                    cid: np.median(np.stack(pts), axis=0)
                    for cid, pts in self._corner_samples.items()
                    if len(pts) >= 3
                }
                est_points = self._estimate_missing_corner(known)
                if est_points is not None:
                    self._finish_calibration(custom_points=est_points, is_estimated=True)

        # Nếu đã có ma trận cắt phẳng H, quét bổ sung lần 2 trực tiếp trên ảnh đã cắt phẳng
        # để bắt dính các xe ở xa bị nghiêng phối cảnh mà Pass 1 bỏ sót.
        if self._matrix is not None and len(raw_poses) < 6:
            warped_gray = cv2.warpPerspective(gray, self._matrix, (BOARD_SIZE, BOARD_SIZE))
            w_corners, w_ids, _ = self._detector.detectMarkers(warped_gray)
            if w_ids is not None:
                warped_poses = self._robot_poses(w_corners, w_ids, already_warped=True)
                for rid, wpose in warped_poses.items():
                    if rid not in raw_poses:
                        raw_poses[rid] = wpose
                        raw_seen.add(rid)

        self._update_tracked_state(raw_poses, raw_corners)
        combined_seen = sorted(raw_seen | set(self.robots.keys()) | set(self.corners_info.keys()))
        self.markers_seen = combined_seen
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
        # Giữ nguyên tỷ lệ khung hình (aspect ratio) để thẻ ArUco vuông không bị bẹp thành hình chữ nhật
        if w > self.width:
            scale = self.width / float(w)
            new_h = max(240, int(round(h * scale)))
            frame = cv2.resize(frame, (self.width, new_h), interpolation=cv2.INTER_AREA)
        return frame

    def _draw_warped_overlay(self, flat: np.ndarray) -> np.ndarray:
        """Vẽ đầy đủ thông tin QR (ID, Góc hướng vector, Tọa độ mm, Vị trí Ô/Bãi) lên bản đồ đã cắt phẳng."""
        canvas = flat.copy()
        h, w = canvas.shape[:2]

        # 1. Vẽ 4 mốc góc bàn cờ (90..93) gọn ở mép ngoài để không đè lên chữ của 6 xe
        corner_coords = [
            (90, CORNER_PAD, CORNER_PAD, (10, CORNER_PAD - 24)),
            (91, w - CORNER_PAD, CORNER_PAD, (w - CORNER_PAD - 10, CORNER_PAD - 24)),
            (92, w - CORNER_PAD, h - CORNER_PAD, (w - CORNER_PAD - 10, h - CORNER_PAD + 34)),
            (93, CORNER_PAD, h - CORNER_PAD, (10, h - CORNER_PAD + 34)),
        ]
        for cid, cx, cy, (tx, ty) in corner_coords:
            seen_now = cid in self.corners_info
            c_color = (0, 230, 118) if seen_now else (0, 200, 255)
            cv2.circle(canvas, (cx, cy), 7, c_color, 2)
            cv2.line(canvas, (cx - 11, cy), (cx + 11, cy), c_color, 1)
            cv2.line(canvas, (cx, cy - 11), (cx, cy + 11), c_color, 1)
            cv2.putText(canvas, f"G{cid}", (tx, ty), cv2.FONT_HERSHEY_SIMPLEX, 0.48, c_color, 2)

        # Khung viền vùng bàn cờ giữa 4 mã góc
        cv2.rectangle(
            canvas,
            (CORNER_PAD, CORNER_PAD),
            (w - CORNER_PAD, h - CORNER_PAD),
            (0, 180, 120),
            1,
        )

        # 2. Vẽ từng xe AGV (ID 1..6) cùng vector mũi tên hướng và bảng thông số QR không chồng lấn
        placed_boxes: List[Tuple[int, int, int, int]] = []
        for rid in sorted(self.robots.keys()):
            pose = self.robots[rid]
            if "board_x" not in pose or "board_y" not in pose:
                continue
            bx = int(round(float(pose["board_x"])))
            by = int(round(float(pose["board_y"])))
            heading = float(pose.get("heading_deg", pose.get("image_heading_deg", 0.0)))
            zone = str(pose.get("zone", "--"))
            mm_x = int(round(float(pose.get("mm_x", 0.0))))
            mm_y = int(round(float(pose.get("mm_y", 0.0))))
            is_stale = bool(pose.get("stale", False))

            # Màu theo đội: Đội 1 (Xe 1-3) Cyan, Đội 2 (Xe 4-6) Cam
            team_color = (255, 215, 0) if rid <= 3 else (0, 155, 255)
            box_half = 24
            cv2.rectangle(
                canvas,
                (bx - box_half, by - box_half),
                (bx + box_half, by + box_half),
                team_color if not is_stale else (160, 160, 160),
                2,
            )
            cv2.circle(canvas, (bx, by), 4, (0, 255, 0), -1)

            # Vector mũi tên chỉ hướng đầu xe (0 deg = hướng lên trên)
            rad = np.radians(heading)
            arrow_len = 52
            tip_x = int(round(bx + np.sin(rad) * arrow_len))
            tip_y = int(round(by - np.cos(rad) * arrow_len))
            cv2.arrowedLine(canvas, (bx, by), (tip_x, tip_y), (0, 0, 255), 3, tipLength=0.28)

            # Nhãn thông tin QR 2 dòng: Dòng 1 (#ID [Vị trí] Góc), Dòng 2 (Tọa độ mm)
            line1 = f"#{rid} [{zone}] {int(round(heading))}d"
            line2 = f"({mm_x},{mm_y})mm"
            box_w, box_h = 148, 38
            # Đặt nhãn lệch vào trong bàn cờ để không bị cắt mất ở mép trái/phải
            lx = bx + 28 if bx < w // 2 else bx - 28 - box_w
            ly = by - 18
            lx = max(6, min(w - box_w - 6, lx))
            ly = max(38, min(h - 44 - box_h, ly))

            # Chống đè nhãn nếu 2 xe đứng gần nhau
            for ox1, oy1, ox2, oy2 in placed_boxes:
                if not (lx + box_w < ox1 or lx > ox2 or ly + box_h < oy1 or ly > oy2):
                    ly = min(h - 44 - box_h, oy2 + 4)
            placed_boxes.append((lx, ly, lx + box_w, ly + box_h))

            sub = canvas[ly : ly + box_h, lx : lx + box_w]
            if sub.shape[0] == box_h and sub.shape[1] == box_w:
                dark = np.zeros_like(sub)
                canvas[ly : ly + box_h, lx : lx + box_w] = cv2.addWeighted(sub, 0.25, dark, 0.75, 0)
            cv2.rectangle(canvas, (lx, ly), (lx + box_w, ly + box_h), team_color, 1)
            cv2.putText(canvas, line1, (lx + 6, ly + 16), cv2.FONT_HERSHEY_SIMPLEX, 0.47, team_color, 2)
            cv2.putText(canvas, line2, (lx + 6, ly + 32), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (235, 235, 235), 1)

        # 3. Thanh Header trạng thái bản đồ trên cùng
        cv2.rectangle(canvas, (0, 0), (w, 32), (20, 25, 35), -1)
        mode_tag = "3-GOC UOC LUONG" if self._using_three_corner_est else "4-GOC LOCKED"
        hdr = f"MAP DA CAT PHANG ({mode_tag}) | XE NHAN DIEN: {len(self.robots)}/6 | FPS: {self.measured_fps:.1f}"
        cv2.putText(canvas, hdr, (12, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (0, 240, 140), 2)

        # 4. Thanh Footer tổng hợp nhanh 6 xe dưới cùng
        cv2.rectangle(canvas, (0, h - 34), (w, h), (20, 25, 35), -1)
        slot_w = w // 6
        for rid in range(1, 7):
            sx = (rid - 1) * slot_w + 8
            p = self.robots.get(rid)
            if p and "heading_deg" in p:
                txt = f"#{rid}:{p.get('zone','--')} {int(round(float(p['heading_deg'])))}d"
                col = (255, 220, 50) if rid <= 3 else (50, 180, 255)
            else:
                txt = f"#{rid}: --"
                col = (110, 115, 125)
            cv2.putText(canvas, txt, (sx, h - 11), cv2.FONT_HERSHEY_SIMPLEX, 0.44, col, 1)

        return canvas

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
                    cv2.arrowedLine(view, (int(center[0]), int(center[1])), (int(tip[0]), int(tip[1])), (0, 0, 255), 2, tipLength=0.25)
                    pose = self.robots.get(marker_id)
                    deg = round(float(pose.get("heading_deg", pose.get("image_heading_deg", 0.0)))) if pose else 0
                    zone = f" [{pose['zone']}]" if pose and "zone" in pose else ""
                    label = f"#{marker_id}{zone} {deg}d"
                    cv2.putText(view, label, (int(center[0]) - 35, max(20, int(center[1]) - 22)), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 220, 0), 2)
                elif marker_id in CORNER_IDS:
                    cv2.circle(view, (int(center[0]), int(center[1])), 5, (0, 255, 255), -1)
                    cv2.putText(view, f"G{marker_id}", (int(center[0]) - 18, int(center[1]) - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2)

        c_prog = " ".join(f"{cid}:{len(self._corner_samples.get(cid, []))}/{CALIB_SAMPLES}" for cid in CORNER_IDS)
        if self.calibrating:
            text, color = f"DANG GOM 4 GOC [{c_prog}]", (0, 215, 255)
        elif self.calibrated:
            text, color = f"DA CAT MAP | XE: {len(self.robots)}/6", (0, 220, 0)
        else:
            text, color = f"CHUA HIEU CHUAN [{c_prog}]", (0, 0, 255)
        cv2.putText(view, text, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)

        params = [cv2.IMWRITE_JPEG_QUALITY, self.jpeg_quality]
        ok, raw = cv2.imencode(".jpg", view, params)
        warped = None
        if self._matrix is not None:
            flat = cv2.warpPerspective(frame, self._matrix, (BOARD_SIZE, BOARD_SIZE))
            annotated_flat = self._draw_warped_overlay(flat)
            ok2, buf = cv2.imencode(".jpg", annotated_flat, params)
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
            if warped and self._warped_jpeg is not None:
                return self._frame_seq, self._warped_jpeg
            return self._frame_seq, self._frame_jpeg

    def status(self) -> Dict[str, object]:
        per_corner_min = min((len(self._corner_samples.get(cid, [])) for cid in CORNER_IDS), default=0)
        prog = max(len(self._samples), per_corner_min)
        return {
            "online": self.online,
            "device": self.device,
            "fps": round(self.measured_fps, 1),
            "resolution": [self.width, self.height],
            "calibrated": self.calibrated,
            "calibrating": self.calibrating,
            "estimated_fourth_corner": self._using_three_corner_est,
            "calibration_progress": prog,
            "corner_samples": {str(cid): len(self._corner_samples.get(cid, [])) for cid in CORNER_IDS},
            "corners": {str(k): v for k, v in self.corners_info.items()},
            "markers_seen": self.markers_seen,
            "robots": {str(k): v for k, v in self.robots.items()},
            "missing_markers": [
                c
                for c in CORNER_IDS
                if c not in self.markers_seen and len(self._corner_samples.get(c, [])) < 3
            ],
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
            parts = self.path.split("?", 1)
            route = parts[0]
            query = parts[1] if len(parts) > 1 else ""
            if route in ("/video", "/stream"):
                # Mặc định khi đã hiệu chuẩn xong, trả về bản đồ đã cắt phẳng (top-down warped)
                # trừ khi client yêu cầu ?view=raw
                want_raw = "view=raw" in query
                self._mjpeg(warped=(service.calibrated and not want_raw))
            elif route == "/warped":
                self._mjpeg(True)
            elif route == "/raw":
                self._mjpeg(False)
            elif route == "/snapshot.jpg":
                _, jpeg = service.wait_frame(-1, warped=service.calibrated)
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
    parser.add_argument("--width", type=int, default=960)
    parser.add_argument("--height", type=int, default=540)
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--calibrate", action="store_true", help="hiệu chỉnh lại ngay khi khởi động")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    service = CameraService(
        width=args.width,
        height=args.height,
        fps=args.fps,
        device_index=args.device,
        allow_three_corner_fallback=True,
    )
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
