import unittest

import cv2
import numpy as np

from .camera_service import CORNER_IDS, CameraService
from .test_camera_service import synthetic_board


def board_with_robot(robot_id: int, rotate_code=None, with_corners: bool = True) -> np.ndarray:
    frame = synthetic_board() if with_corners else np.full((480, 640, 3), 255, np.uint8)
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_5X5_100)
    marker = cv2.aruco.generateImageMarker(dictionary, robot_id, 70)
    if rotate_code is not None:
        marker = cv2.rotate(marker, rotate_code)
    frame[200:270, 285:355] = cv2.cvtColor(marker, cv2.COLOR_GRAY2BGR)  # giua anh, giua 4 marker goc
    return frame


def heading_of(frame: np.ndarray, robot_id: int = 3) -> dict:
    svc = CameraService(source=lambda: frame, calib_path="nonexistent.json")
    corners, ids = svc._detect(frame)
    return svc.robots[robot_id]


class RobotHeadingTests(unittest.TestCase):
    def assertAngle(self, actual: float, expected: float, tol: float = 5.0) -> None:
        diff = abs((actual - expected + 180) % 360 - 180)
        self.assertLess(diff, tol, "%s != %s" % (actual, expected))

    def test_image_heading_follows_marker_rotation(self):
        self.assertAngle(heading_of(board_with_robot(3))["image_heading_deg"], 0)
        self.assertAngle(heading_of(board_with_robot(3, cv2.ROTATE_90_CLOCKWISE))["image_heading_deg"], 90)
        self.assertAngle(heading_of(board_with_robot(3, cv2.ROTATE_180))["image_heading_deg"], 180)
        self.assertAngle(heading_of(board_with_robot(3, cv2.ROTATE_90_COUNTERCLOCKWISE))["image_heading_deg"], 270)

    def test_only_robot_ids_are_tracked(self):
        svc = CameraService(source=lambda: None, calib_path="nonexistent.json")
        svc._detect(board_with_robot(3))
        self.assertEqual(list(svc.robots), [3])  # marker 90-93 khong phai xe

    def test_board_pose_available_after_calibration(self):
        frame = board_with_robot(2, cv2.ROTATE_90_CLOCKWISE)
        svc = CameraService(source=lambda: frame, calib_path="nonexistent.json", detect_every=1)
        svc.start_calibration()
        for _ in range(20):
            svc._detect(frame)
        self.assertTrue(svc.calibrated)
        svc._detect(frame)
        pose = svc.robots[2]
        self.assertAngle(pose["heading_deg"], 90)
        self.assertTrue(0 < pose["board_x"] < 800 and 0 < pose["board_y"] < 800)
        self.assertIn("2", svc.status()["robots"])
        import os
        os.path.exists("nonexistent.json") or None


if __name__ == "__main__":
    unittest.main()
