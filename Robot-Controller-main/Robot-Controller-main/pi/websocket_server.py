"""WebSocket adapter for the Raspberry Pi Morris backend.

Install the small optional dependency with ``python -m pip install websockets``.
The game and protocol remain usable without it for unit tests and serial-only
deployments.
"""

import asyncio
import argparse
import json
import logging
from typing import Any, Dict, Optional, Set

from .backend import MorrisBackend, SimulationTransport
from .morris_game import IllegalMove

log = logging.getLogger(__name__)


class MorrisWebSocketServer:
    def __init__(self, backend: Optional[MorrisBackend] = None) -> None:
        self.backend = backend or MorrisBackend()
        self.clients: Set[asyncio.Queue[Dict[str, Any]]] = set()
        self.backend.subscribe(self._publish)

    def _publish(self, event: Dict[str, Any]) -> None:
        for queue in tuple(self.clients):
            queue.put_nowait(event)

    async def _send_error(self, queue: asyncio.Queue[Dict[str, Any]], message: str) -> None:
        await queue.put({"type": "fault", "message": message})

    def _handle_action(self, action: Dict[str, Any]) -> None:
        action_type = action.get("type")
        if action_type == "join_game":
            self.backend.join_game(
                action.get("mode", "pva"),
                int(action.get("player_team", 1)),
                int(action.get("first_player", 1)),
            )
            if self.backend.mode == "pva" and self.backend.state.current_player != self.backend.player_team:
                self.backend.ai_move()
            return
        if action_type in ("select_move", "move_request"):
            source = action.get("from_node", action.get("from"))
            self.backend.request_move(
                int(action.get("player", self.backend.state.current_player)),
                None if source is None else int(source),
                int(action["to_node"] if "to_node" in action else action["to"]),
                None if action.get("robot_id") is None else int(action["robot_id"]),
            )
            if self.backend.mode == "pva" and self.backend.state.current_player != self.backend.player_team:
                self.backend.ai_move()
            return
        if action_type == "reset_game":
            self.backend.reset()
            return
        if action_type == "emergency_stop":
            self.backend.emergency_stop()
            return
        if action_type == "calibrate_camera":
            self.backend._emit("camera_state", status="calibrating")
            return
        if action_type == "ping":
            self.backend._emit("pong")
            return
        if action_type == "set_team_color":
            # Lấy màu từ gói tin WebSocket và gửi lệnh LED tới các xe theo phe
            team = int(action.get("team", 1))
            r = int(action.get("r", 0))
            g = int(action.get("g", 0))
            b = int(action.get("b", 0))
            brightness = int(action.get("brightness", 200))
            # Danh sách robot theo phe
            robot_ids = [1, 2, 3] if team == 1 else [4, 5, 6]
            applied = []
            for robot_id in robot_ids:
                try:
                    self.backend.set_robot_led(robot_id, r, g, b, brightness)
                    applied.append(robot_id)
                except Exception as exc:
                    log.warning("set_led robot %d failed: %s", robot_id, exc)
            self.backend._emit(
                "team_color_applied",
                team=team,
                r=r,
                g=g,
                b=b,
                brightness=brightness,
                applied_robots=applied,
            )
            return
        raise ValueError("unsupported action type: %s" % action_type)

    async def handler(self, websocket: Any) -> None:
        queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue()
        self.clients.add(queue)
        peer = getattr(websocket, "remote_address", "unknown")
        log.info("Client connected: %s  (total: %d)", peer, len(self.clients))
        try:
            await queue.put({"type": "hello_ack", "mode": self.backend.mode})
            self.backend.snapshot()
            sender = asyncio.create_task(self._sender(websocket, queue))
            try:
                async for raw_message in websocket:
                    try:
                        action = json.loads(raw_message)
                        if not isinstance(action, dict):
                            raise ValueError("message must be a JSON object")
                        self._handle_action(action)
                    except (KeyError, TypeError, ValueError, IllegalMove, RuntimeError) as error:
                        log.warning("Bad action from %s: %s", peer, error)
                        await self._send_error(queue, str(error))
            finally:
                sender.cancel()
                await asyncio.gather(sender, return_exceptions=True)
        finally:
            self.clients.discard(queue)
            log.info("Client disconnected: %s  (total: %d)", peer, len(self.clients))

    async def _sender(self, websocket: Any, queue: asyncio.Queue[Dict[str, Any]]) -> None:
        while True:
            await websocket.send(json.dumps(await queue.get(), separators=(",", ":")))

    async def serve(self, host: str = "0.0.0.0", port: int = 8765) -> None:
        try:
            import websockets
        except ImportError as error:
            raise RuntimeError("install the optional 'websockets' package to run the server") from error

        async with websockets.serve(self.handler, host, port):
            await asyncio.Future()


def build_backend(transport_mode: str = "simulation", serial_device: str = "/dev/ttyUSB0") -> MorrisBackend:
    """Build a backend for either an offline VM demo or Raspberry Pi hardware."""
    if transport_mode == "simulation":
        return MorrisBackend(transport=SimulationTransport())
    if transport_mode == "serial":
        from .serial_coordinator import open_serial_transport

        return MorrisBackend(transport=open_serial_transport(serial_device))
    raise ValueError("transport must be simulation or serial")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Three Men's Morris WebSocket backend")
    parser.add_argument("--host", default="0.0.0.0", help="listen address (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8765, help="listen port (default: 8765)")
    parser.add_argument(
        "--transport",
        choices=("simulation", "serial"),
        default="simulation",
        help="robot transport (default: simulation; no hardware required)",
    )
    parser.add_argument("--serial-device", default="/dev/ttyUSB0", help="serial device for --transport serial")
    return parser.parse_args()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    args = parse_args()
    backend = build_backend(args.transport, args.serial_device)
    log.info("Starting %s transport on ws://%s:%d", args.transport, args.host, args.port)
    asyncio.run(MorrisWebSocketServer(backend).serve(args.host, args.port))


if __name__ == "__main__":
    main()
