"""Validated JSON Lines protocol between Raspberry Pi and ESP32 Coordinator."""

import json
from dataclasses import dataclass
from typing import Any, Dict, Mapping


PROTOCOL_VERSION = 1
MAX_LINE_BYTES = 512


class ProtocolError(ValueError):
    """Raised when a Coordinator packet is malformed or unsafe."""


@dataclass(frozen=True)
class Envelope:
    version: int
    sequence: int
    message_type: str
    payload: Dict[str, Any]


def encode_message(sequence: int, message_type: str, payload: Mapping[str, Any]) -> bytes:
    if sequence < 0 or sequence > 65535:
        raise ProtocolError("sequence must fit in an unsigned 16-bit integer")
    if not message_type or any(character.isspace() for character in message_type):
        raise ProtocolError("message_type must be a non-empty token")

    message = {
        "version": PROTOCOL_VERSION,
        "seq": sequence,
        "type": message_type,
        "payload": dict(payload),
    }
    encoded = (json.dumps(message, separators=(",", ":"), sort_keys=True) + "\n").encode("utf-8")
    if len(encoded) > MAX_LINE_BYTES:
        raise ProtocolError("encoded message exceeds the serial line limit")
    return encoded


def decode_message(line: bytes) -> Envelope:
    if len(line) > MAX_LINE_BYTES:
        raise ProtocolError("serial line exceeds the protocol limit")
    try:
        message = json.loads(line.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ProtocolError("invalid JSON Lines packet") from error

    if not isinstance(message, dict):
        raise ProtocolError("packet must be a JSON object")
    if message.get("version") != PROTOCOL_VERSION:
        raise ProtocolError("unsupported protocol version")
    if not isinstance(message.get("seq"), int) or not 0 <= message["seq"] <= 65535:
        raise ProtocolError("seq must be an unsigned 16-bit integer")
    if not isinstance(message.get("type"), str) or not message["type"]:
        raise ProtocolError("type must be a non-empty string")
    if not isinstance(message.get("payload"), dict):
        raise ProtocolError("payload must be a JSON object")

    return Envelope(message["version"], message["seq"], message["type"], message["payload"])


def waypoint_message(
    sequence: int,
    robot_id: int,
    move_id: int,
    waypoint_index: int,
    waypoint_count: int,
    x_mm: int,
    y_mm: int,
    heading_mrad: int,
    speed: int,
) -> bytes:
    if not 1 <= robot_id <= 6:
        raise ProtocolError("robot_id must be between 1 and 6")
    if move_id < 0 or waypoint_index < 0 or waypoint_count <= 0 or waypoint_index >= waypoint_count:
        raise ProtocolError("invalid move or waypoint indexes")
    if not -32768 <= x_mm <= 32767 or not -32768 <= y_mm <= 32767:
        raise ProtocolError("waypoint coordinates must fit signed 16-bit millimetres")
    if not -32768 <= heading_mrad <= 32767:
        raise ProtocolError("heading must fit a signed 16-bit milliradian value")
    if not 0 <= speed <= 255:
        raise ProtocolError("speed must be between 0 and 255")

    return encode_message(
        sequence,
        "waypoint",
        {
            "robot_id": robot_id,
            "move_id": move_id,
            "index": waypoint_index,
            "count": waypoint_count,
            "x_mm": x_mm,
            "y_mm": y_mm,
            "heading_mrad": heading_mrad,
            "speed": speed,
        },
    )

def led_color_message(
    sequence: int,
    robot_id: int,
    r: int,
    g: int,
    b: int,
    brightness: int = 200,
) -> bytes:
    """Build a JSON Lines packet to set the LED colour of a specific robot.

    The coordinator forwards this as a ROBOT_CMD_SET_LED (0x04) ESP-NOW frame.

    Args:
        sequence: Monotonically increasing packet sequence number (0-65535).
        robot_id: Target robot identifier (1-6).
        r: Red channel value (0-255).
        g: Green channel value (0-255).
        b: Blue channel value (0-255).
        brightness: Global LED brightness (0-255, default 200).

    Returns:
        UTF-8 encoded JSON Lines bytes ready to write to the serial port.
    """
    if not 1 <= robot_id <= 6:
        raise ProtocolError("robot_id must be between 1 and 6")
    for name, val in (("r", r), ("g", g), ("b", b), ("brightness", brightness)):
        if not 0 <= val <= 255:
            raise ProtocolError(f"{name} must be between 0 and 255")

    return encode_message(
        sequence,
        "set_led",
        {
            "robot_id": robot_id,
            "r": r,
            "g": g,
            "b": b,
            "brightness": brightness,
        },
    )


def hex_to_rgb(hex_color: str) -> tuple:
    """Chuyển mã màu hex '#RRGGBB' sang tuple (r, g, b) nguyên 0-255."""
    h = hex_color.lstrip("#")
    if len(h) != 6:
        raise ProtocolError(f"hex_color phải có dạng #RRGGBB, nhận được: {hex_color!r}")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

