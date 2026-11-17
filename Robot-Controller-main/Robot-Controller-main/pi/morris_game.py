"""Authoritative Three Men's Morris game state for the Raspberry Pi."""

from dataclasses import dataclass
from typing import List, Optional, Tuple

from .board_model import (
    BOARD_SIZE,
    Board,
    Player,
    count_pieces,
    empty_board,
    legal_destinations,
    validate_node,
    validate_player,
    winner,
)

Phase = str


@dataclass(frozen=True)
class Move:
    player: Player
    source_node: Optional[int]
    target_node: int
    robot_id: Optional[int] = None


@dataclass(frozen=True)
class GameState:
    board: Board
    current_player: Player = 1
    phase: Phase = "drop"
    turn_count: int = 1
    winner: Optional[Player] = None
    winning_line: Optional[Tuple[int, int, int]] = None


class IllegalMove(ValueError):
    """Raised when a requested move violates the game state."""


def new_game(first_player: Player = 1) -> GameState:
    validate_player(first_player)
    return GameState(board=empty_board(), current_player=first_player)


def valid_moves(state: GameState) -> List[Move]:
    if state.winner is not None:
        return []

    player = state.current_player
    if state.phase == "drop":
        return [Move(player, None, node) for node, cell in enumerate(state.board) if cell is None]

    moves: List[Move] = []
    for source_node, cell in enumerate(state.board):
        if cell == player:
            moves.extend(Move(player, source_node, target) for target in legal_destinations(state.board, source_node))
    return moves


def apply_move(state: GameState, move: Move) -> GameState:
    """Apply one legal move and return the next immutable state."""
    if state.winner is not None:
        raise IllegalMove("game is already over")
    validate_player(move.player)
    validate_node(move.target_node)
    if move.player != state.current_player:
        raise IllegalMove("move belongs to the other player")

    board = list(state.board)
    if state.phase == "drop":
        if move.source_node is not None:
            raise IllegalMove("drop moves cannot have a source node")
        if board[move.target_node] is not None:
            raise IllegalMove("target node is occupied")
        board[move.target_node] = move.player
    else:
        if move.source_node is None:
            raise IllegalMove("movement moves require a source node")
        validate_node(move.source_node)
        if board[move.source_node] != move.player:
            raise IllegalMove("source node does not contain the current player's piece")
        if move.target_node not in legal_destinations(tuple(board), move.source_node):
            raise IllegalMove("target node is not an empty adjacent node")
        board[move.source_node] = None
        board[move.target_node] = move.player

    next_board = tuple(board)
    winning_player, winning_line = winner(next_board)
    if winning_player is not None:
        return GameState(
            board=next_board,
            current_player=move.player,
            phase="game_over",
            turn_count=state.turn_count,
            winner=winning_player,
            winning_line=winning_line,
        )

    next_phase = "move" if count_pieces(next_board, 1) == 3 and count_pieces(next_board, 2) == 3 else "drop"
    next_player = 2 if move.player == 1 else 1
    return GameState(
        board=next_board,
        current_player=next_player,
        phase=next_phase,
        turn_count=state.turn_count + 1,
    )
