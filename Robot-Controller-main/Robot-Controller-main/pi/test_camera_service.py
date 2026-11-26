import json
import os
import tempfile
import time
import unittest
import urllib.request

import cv2
import numpy as np

from .camera_service import CORNER_IDS, CameraService, serve


def synthetic_board(width: int = 640, height: int = 480) -> np.ndarray:
    frame = np.full((height, width, 3), 255, np.uint8)
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_5X5_100)
    size = 70
    spots = [(60, 40), (width - 60 - size, 40), (width - 60 - size, height - 40 - size), (60, height - 40 - size)]
    for marker_id, (x, y) in zip(CORNER_IDS, spots):
        marker = cv2.aruco.generateImageMarker(dictionary, marker_id, size)
        frame[y : y + size, x : x + size] = cv2.cvtColor(marker, cv2.COLOR_GRAY2BGR)
    return frame


class CameraServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.calib = os.path.join(self.tmp, "calib.json")
        self.frame = synthetic_board()
        self.service = CameraService(source=lambda: self.frame.copy(), calib_path=self.calib, detect_every=1, stream_fps=30)

    def tearDown(self) -> None:
        self.service.stop()

    def _wait(self, predicate, timeout: float = 5.0) -> None:
        end = time.monotonic() + timeout
        while time.monotonic() < end and not predicate():
            time.sleep(0.05)
        self.assertTrue(predicate())

    def test_calibration_converges_and_persists(self) -> None:
        self.service.start_calibration()
        self.service.start()
        self._wait(lambda: self.service.calibrated)
        self.assertTrue(os.path.exists(self.calib))
        with open(self.calib) as handle:
            self.assertEqual(len(json.load(handle)["matrix"]), 3)
        reloaded = CameraService(source=lambda: self.frame, calib_path=self.calib)
        self.assertTrue(reloaded.calibrated)

    def test_missing_marker_keeps_uncalibrated(self) -> None:
        self.frame[:120, :200] = 255  # che marker góc trên-trái
        self.service.start_calibration()
        self.service.start()
        self._wait(lambda: self.service.online and len(self.service.markers_seen) > 0)
        time.sleep(0.5)
        self.assertFalse(self.service.calibrated)
        self.assertIn(CORNER_IDS[0], self.service.status()["missing_markers"])

    def test_http_endpoints(self) -> None:
        self.service.start()
        server = serve(self.service, "127.0.0.1", 0)
        import threading

        threading.Thread(target=server.serve_forever, daemon=True).start()
        port = server.server_address[1]
        try:
            self._wait(lambda: self.service.online)
            status = json.load(urllib.request.urlopen("http://127.0.0.1:%d/status" % port, timeout=3))
            self.assertTrue(status["online"])
            jpeg = urllib.request.urlopen("http://127.0.0.1:%d/snapshot.jpg" % port, timeout=3).read()
            self.assertTrue(jpeg.startswith(b"\xff\xd8"))
            stream = urllib.request.urlopen("http://127.0.0.1:%d/video" % port, timeout=3)
            self.assertIn("multipart/x-mixed-replace", stream.headers["Content-Type"])
            self.assertIn(b"--frame", stream.read(200))
            stream.close()
        finally:
            server.shutdown()

    def test_parse_device_arg_accepts_int_and_http_url(self) -> None:
        from .camera_service import parse_device_arg

        self.assertEqual(parse_device_arg("0"), 0)
        self.assertEqual(parse_device_arg(2), 2)
        self.assertEqual(parse_device_arg("http://192.168.150.1:8085/video"), "http://192.168.150.1:8085/video")
        self.assertEqual(parse_device_arg("/dev/video0"), "/dev/video0")
        self.assertIsNone(parse_device_arg(None))


if __name__ == "__main__":
    unittest.main()
