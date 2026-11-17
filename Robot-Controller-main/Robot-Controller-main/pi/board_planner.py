"""Board-level route planning and trajectory conversion for the Pi runtime."""

import heapq
import math
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from .board_model import BOARD_NEIGHBORS, PointMm, validate_node

Pose = Tuple[float, float, float]
TrajectoryPoint = Tuple[float, float, float, float, int]


@dataclass(frozen=True)
class MotionPath:
    node_ids: Tuple[int, ...]
    waypoints: Tuple[TrajectoryPoint, ...]
    cost_mm: float


def _distance(first: PointMm, second: PointMm) -> float:
    return math.hypot(first[0] - second[0], first[1] - second[1])


def plan_node_route(
    start_node: int,
    target_node: int,
    occupied_nodes: Iterable[int] = (),
    neighbors: Optional[Dict[int, Sequence[int]]] = None,
    board_nodes_mm: Optional[Dict[int, "PointMm"]] = None,
) -> Tuple[int, ...]:
    """Find a legal graph route without using occupied intermediate nodes.

    When ``board_nodes_mm`` is provided the heuristic uses Euclidean distance
    in millimetres so A* produces geometrically shorter paths.  Without it the
    heuristic falls back to the node-ID difference (admissible but weaker).
    """
    validate_node(start_node)
    validate_node(target_node)
    graph = neighbors or BOARD_NEIGHBORS
    blocked = set(occupied_nodes) - {start_node, target_node}
    queue: List[Tuple[float, int]] = [(0.0, start_node)]
    came_from: Dict[int, int] = {}
    cost_so_far: Dict[int, float] = {start_node: 0.0}

    def _heuristic(node: int) -> float:
        if board_nodes_mm and node in board_nodes_mm and target_node in board_nodes_mm:
            return _distance(board_nodes_mm[node], board_nodes_mm[target_node])
        return float(abs(target_node - node))

    while queue:
        _, current = heapq.heappop(queue)
        if current == target_node:
            route = [current]
            while current in came_from:
                current = came_from[current]
                route.append(current)
            route.reverse()
            return tuple(route)

        for neighbor in graph[current]:
            if neighbor in blocked:
                continue
            next_cost = cost_so_far[current] + 1
            if next_cost < cost_so_far.get(neighbor, math.inf):
                cost_so_far[neighbor] = next_cost
                priority = next_cost + _heuristic(neighbor)
                heapq.heappush(queue, (priority, neighbor))
                came_from[neighbor] = current

    raise ValueError("no route exists between the requested board nodes")


def route_to_trajectory(
    route: Sequence[int],
    board_nodes_mm: Dict[int, PointMm],
    start_pose: Optional[Pose] = None,
    speed_mm_s: float = 100.0,
    action_tag: int = 0,
) -> MotionPath:
    """Convert a node route into controller-compatible timed waypoints."""
    if len(route) < 2:
        raise ValueError("route must contain a start and target node")
    if speed_mm_s <= 0:
        raise ValueError("speed_mm_s must be positive")

    for node in route:
        validate_node(node)
        if node not in board_nodes_mm:
            raise ValueError("missing physical coordinate for board node %d" % node)

    points: List[TrajectoryPoint] = []
    elapsed = 0.0
    first_node = route[0]
    first_point = board_nodes_mm[first_node]
    if start_pose is None:
        start_x, start_y, start_theta = first_point[0], first_point[1], 0.0
    else:
        start_x, start_y, start_theta = start_pose

    points.append((start_x, start_y, start_theta, elapsed, action_tag))
    previous = (start_x, start_y)
    for node in route[1:]:
        point = board_nodes_mm[node]
        heading = math.atan2(point[1] - previous[1], point[0] - previous[0])
        elapsed += _distance(previous, point) / speed_mm_s
        points.append((point[0], point[1], heading, elapsed, action_tag))
        previous = point

    total_cost = sum(_distance(board_nodes_mm[first], board_nodes_mm[second]) for first, second in zip(route, route[1:]))
    return MotionPath(tuple(route), tuple(points), total_cost)


def direct_move_trajectory(
    start_node: int,
    target_node: int,
    board_nodes_mm: Dict[int, PointMm],
    speed_mm_s: float = 100.0,
    action_tag: int = 0,
) -> MotionPath:
    """Create a trajectory for one legal adjacent board move.

    Morris movement is constrained by the logical board graph, so a legal
    source-to-target move is already a direct graph edge. General graph search
    remains available through ``plan_node_route`` for deployment experiments.
    """
    validate_node(start_node)
    validate_node(target_node)
    if target_node not in BOARD_NEIGHBORS[start_node]:
        raise ValueError("target node is not adjacent to the source node")
    return route_to_trajectory(
        (start_node, target_node),
        board_nodes_mm,
        speed_mm_s=speed_mm_s,
        action_tag=action_tag,
    )


def pose_to_node_trajectory(
    start_pose: Pose,
    target_node: int,
    board_nodes_mm: Dict[int, PointMm],
    speed_mm_s: float = 100.0,
    action_tag: int = 0,
) -> MotionPath:
    """Create a direct physical trajectory from a staging pose to a board node."""
    validate_node(target_node)
    if target_node not in board_nodes_mm:
        raise ValueError("missing physical coordinate for board node %d" % target_node)
    if speed_mm_s <= 0:
        raise ValueError("speed_mm_s must be positive")

    target = board_nodes_mm[target_node]
    distance = _distance((start_pose[0], start_pose[1]), target)
    heading = math.atan2(target[1] - start_pose[1], target[0] - start_pose[0])
    duration = distance / speed_mm_s
    waypoints = (
        (start_pose[0], start_pose[1], start_pose[2], 0.0, action_tag),
        (target[0], target[1], heading, duration, action_tag),
    )
    return MotionPath((target_node,), waypoints, distance)
