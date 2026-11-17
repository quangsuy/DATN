"""Physical and logical board model for Three Men's Morris."""

from typing import Dict, List, Optional, Tuple

Player = int
Board = Tuple[Optional[Player], ...]
PointMm = Tuple[float, float]

BOARD_SIZE = 9
PLAYERS = (1, 2)
WINNING_LINES: Tuple[Tuple[int, int, int], ...] = (
    (0, 1, 2),
    (3, 4, 5),
    (6, 7, 8),
    (0, 3, 6),
    (1, 4, 7),
    (2, 5, 8),
    (0, 4, 8),
    (2, 4, 6),
)

# Logical adjacency used by the game rules. Physical coordinates are configured
# separately after measuring the real board and applying the camera transform.
BOARD_NEIGHBORS: Dict[int, Tuple[int, ...]] = {
    0: (1, 3, 4),
    1: (0, 2, 4),
    2: (1, 4, 5),
    3: (0, 4, 6),
    4: (0, 1, 2, 3, 5, 6, 7, 8),
    5: (2, 4, 8),
    6: (3, 4, 7),
    7: (4, 6, 8),
    8: (4, 5, 7),
}


def empty_board() -> Board:
    return (None,) * BOARD_SIZE


def validate_node(node_id: int) -> None:
    if node_id < 0 or node_id >= BOARD_SIZE:
        raise ValueError("board node must be between 0 and 8")


def validate_player(player: Player) -> None:
    if player not in PLAYERS:
        raise ValueError("player must be 1 or 2")


def count_pieces(board: Board, player: Player) -> int:
    validate_player(player)
    return sum(cell == player for cell in board)


def winner(board: Board) -> Tuple[Optional[Player], Optional[Tuple[int, int, int]]]:
    for line in WINNING_LINES:
        first, second, third = line
        if board[first] is not None and board[first] == board[second] == board[third]:
            return board[first], line
    return None, None


def legal_destinations(board: Board, source_node: int) -> List[int]:
    validate_node(source_node)
    return [node for node in BOARD_NEIGHBORS[source_node] if board[node] is None]


def board_from_mapping(mapping: Dict[int, PointMm]) -> Dict[int, PointMm]:
    """Validate and copy measured node coordinates in millimetres."""
    if set(mapping) != set(range(BOARD_SIZE)):
        raise ValueError("physical board mapping must contain nodes 0 through 8")
    return {node: (float(point[0]), float(point[1])) for node, point in mapping.items()}
