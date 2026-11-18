import ctypes
import re
import unittest

from .coordinator_protocol import decode_message, hex_to_rgb
from .serial_coordinator import SerialCoordinatorTransport
from .test_serial_coordinator import FakeSerial

HEADER = r"c:\Users\Quang\Downloads\DATN\coordinator_esp32\espnow_protocol.h"

C_TYPES = {"uint8_t": ctypes.c_uint8, "int8_t": ctypes.c_int8, "int16_t": ctypes.c_int16, "uint16_t": ctypes.c_uint16}


def struct_size(source: str, name: str) -> int:
    """Tinh sizeof packed struct tu header ESP32 (khong can bien dich C)."""
    body = re.search(r"typedef struct __attribute__\(\(packed\)\) \{((?:(?!typedef).)*?)\} %s;" % name, source, re.S).group(1)
    total = 0
    for line in body.splitlines():
        m = re.match(r"\s*(u?int(?:8|16)_t)\s+([^;]+);", line)
        if not m:
            continue
        for decl in m.group(2).split(","):
            arr = re.search(r"\[(\d+)\]", decl)
            total += ctypes.sizeof(C_TYPES[m.group(1)]) * (int(arr.group(1)) if arr else 1)
    return total


class SetLedAndFirmwareLayoutTests(unittest.TestCase):
    def test_set_led_sends_validated_packet(self):
        port = FakeSerial()
        self.assertTrue(SerialCoordinatorTransport(port, ack_timeout_s=0.01).set_led(4, 255, 0, 128, 200))
        message = decode_message(port.writes[0])
        self.assertEqual(message.message_type, "set_led")
        self.assertEqual(message.payload, {"robot_id": 4, "r": 255, "g": 0, "b": 128, "brightness": 200})

    def test_hex_to_rgb(self):
        self.assertEqual(hex_to_rgb("#FF0080"), (255, 0, 128))

    def test_firmware_packet_sizes_match_static_asserts(self):
        source = open(HEADER, encoding="utf-8").read()
        self.assertEqual(struct_size(source, "RobotCmdPacket"), 18)
        self.assertEqual(struct_size(source, "RobotLedPacket"), 18)
        self.assertEqual(struct_size(source, "RobotStatusPacket"), 8)
        self.assertIn("static_assert(sizeof(RobotCmdPacket)    == 18", source)
        self.assertNotIn("_Static_assert", source)


if __name__ == "__main__":
    unittest.main()
