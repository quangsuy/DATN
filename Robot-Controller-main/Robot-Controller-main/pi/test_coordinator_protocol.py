"""Focused tests for the Pi-to-Coordinator protocol."""

import unittest

from .coordinator_protocol import ProtocolError, decode_message, waypoint_message


class CoordinatorProtocolTests(unittest.TestCase):
    def test_waypoint_round_trip(self):
        encoded = waypoint_message(42, 1, 17, 2, 4, 185, 240, 1570, 120)
        message = decode_message(encoded)

        self.assertEqual(message.sequence, 42)
        self.assertEqual(message.message_type, "waypoint")
        self.assertEqual(message.payload["robot_id"], 1)
        self.assertEqual(message.payload["heading_mrad"], 1570)

    def test_invalid_robot_is_rejected(self):
        with self.assertRaises(ProtocolError):
            waypoint_message(1, 7, 1, 0, 1, 0, 0, 0, 100)

    def test_invalid_json_is_rejected(self):
        with self.assertRaises(ProtocolError):
            decode_message(b"not-json\n")

    def test_oversized_packet_is_rejected(self):
        with self.assertRaises(ProtocolError):
            decode_message(b"x" * 513)


if __name__ == "__main__":
    unittest.main()
