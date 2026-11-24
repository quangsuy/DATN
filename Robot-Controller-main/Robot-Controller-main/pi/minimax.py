"""Minimax decision engine for the Raspberry Pi game runtime."""

from dataclasses import dataclass
from time import monotonic
from typing import Dict, List, Optional, Tuple

from .board_model import BOARD_NEIGHBORS, Board, Player, WINNING_LINES, count_pieces
from .morris_game import GameState, Move, apply_move, valid_moves


_EXACT = 0
_LOWER = 1
_UPPER = 2


@dataclass(frozen=True)
class MinimaxDecision:
    move: Optional[Move]
    score: int
    depth: int
    nodes_searched: int
    elapsed_ms: int


def _evaluate(state: GameState, ai_player: Player) -> int:
    """Board heuristic with Mobility (Độ cơ động) & Fork detection.

    Features:
    - Terminal state win/loss (+/-1000)
    - Center control (node 4: +/-30) and Corner control (0, 2, 6, 8: +/-8)
    - Mobility score: +/-5 per empty adjacent neighbor, +/-12 penalty for trapped pieces
    - Two-in-a-row threats (+60 / -90) and Double-threat Fork bonus (+80 / -110)
    """
    b = state.board
    opponent = 3 - ai_player          # 1->2, 2->1, branchless
    if state.winner == ai_player:
        return 1000
    if state.winner == opponent:
        return -1000

    score = 0
    c = b[4]
    if c == ai_player:   score += 30
    elif c == opponent:  score -= 30

    for node in (0, 2, 6, 8):
        c = b[node]
        if c == ai_player:   score += 8
        elif c == opponent:  score -= 8

    # Mobility (Độ cơ động): count free connected neighbors for each piece
    for node in range(9):
        cell = b[node]
        if cell is None:
            continue
        free_edges = 0
        for nb in BOARD_NEIGHBORS[node]:
            if b[nb] is None:
                free_edges += 1
        if cell == ai_player:
            score += free_edges * 5
            if free_edges == 0:
                score -= 12
        else:
            score -= free_edges * 5
            if free_edges == 0:
                score += 12

    ai_threats = 0
    opp_threats = 0
    for a, mid, z in WINNING_LINES:
        t = (b[a], b[mid], b[z])          # tuple: count() calls C code
        ai_c  = t.count(ai_player)
        opp_c = t.count(opponent)
        if ai_c  == 2 and opp_c == 0:     # empty implied (no list needed)
            score += 60
            ai_threats += 1
        if opp_c == 2 and ai_c  == 0:
            score -= 90
            opp_threats += 1

    # Fork (Thế gọng kìm - đe dọa thắng 2 hướng cùng lúc)
    if ai_threats >= 2:
        score += 80
    if opp_threats >= 2:
        score -= 110

    # board.count() is a C-level method; avoids validate_player overhead
    score += (b.count(ai_player) - b.count(opponent)) * 4
    return score


def choose_move(state: GameState, ai_player: Player = 2, max_depth: int = 8) -> MinimaxDecision:
    """Return the best legal move for ``ai_player`` using alpha-beta pruning.

    Default ``max_depth = 8`` looks completely through the 6-ply drop phase into
    the movement phase so the AI anticipates forks and mobility traps early.

    Transposition table
    -------------------
    Each entry stores ``(value, cached_depth, flag)`` where ``flag`` is
    ``_EXACT``, ``_LOWER``, or ``_UPPER`` to preserve alpha-beta soundness.
    """
    if state.current_player != ai_player:
        raise ValueError("state current_player must match ai_player")
    if max_depth < 1:
        raise ValueError("max_depth must be at least 1")

    started = monotonic()
    nodes_searched = 0
    moves = valid_moves(state)
    if not moves:
        return MinimaxDecision(None, _evaluate(state, ai_player), 0, 0, 0)

    # key = (board, current_player); value = (score, cached_depth, flag)
    cache: Dict[Tuple[Board, Player], Tuple[int, int, int]] = {}

    def _order_moves(
        current: GameState, candidates: List[Move]
    ) -> List[Tuple[int, "Move", "GameState"]]:
        """Pre-compute next states once and sort by heuristic priority."""
        entries = []
        for move in candidates:
            next_state = apply_move(current, move)
            if next_state.winner == ai_player:
                priority = -2000
            elif next_state.winner is not None:
                priority = 2000
            else:
                priority = -_evaluate(next_state, ai_player)
            entries.append((priority, move, next_state))
        return sorted(entries, key=lambda e: e[0])

    def search(current: GameState, depth: int, maximizing: bool, alpha: int, beta: int) -> int:
        nonlocal nodes_searched
        nodes_searched += 1
        if current.winner == ai_player:
            return 1000 + depth
        if current.winner is not None:
            return -1000 - depth
        if depth == 0:
            return _evaluate(current, ai_player)

        key: Tuple[Board, Player] = (current.board, current.current_player)
        cached = cache.get(key)
        if cached is not None:
            cached_value, cached_depth, flag = cached
            if cached_depth >= depth:
                if flag == _EXACT:
                    return cached_value
                elif flag == _LOWER:
                    if cached_value > alpha:
                        alpha = cached_value
                elif flag == _UPPER:
                    if cached_value < beta:
                        beta = cached_value
                if alpha >= beta:
                    return cached_value

        child_moves = valid_moves(current)
        if not child_moves:
            result = _evaluate(current, ai_player)
            cache[key] = (result, depth, _EXACT)
            return result

        alpha_orig = alpha
        beta_orig = beta
        ordered = _order_moves(current, child_moves)
        if maximizing:
            value = -10**9
            for _, _move, next_state in ordered:
                score = search(next_state, depth - 1, False, alpha, beta)
                if score > value:
                    value = score
                if value > alpha:
                    alpha = value
                if alpha >= beta:
                    break
        else:
            value = 10**9
            for _, _move, next_state in ordered:
                score = search(next_state, depth - 1, True, alpha, beta)
                if score < value:
                    value = score
                if value < beta:
                    beta = value
                if alpha >= beta:
                    break

        if value <= alpha_orig:
            flag = _UPPER
        elif value >= beta_orig:
            flag = _LOWER
        else:
            flag = _EXACT
        cache[key] = (value, depth, flag)
        return value

    # Apply move ordering at the root so the best move surfaces early.
    root_ordered = _order_moves(state, moves)
    best_move = root_ordered[0][1]
    best_score = -10**9
    alpha = -10**9
    beta = 10**9
    for _, move, next_state in root_ordered:
        score = search(next_state, max_depth - 1, False, alpha, beta)
        if score > best_score:
            best_move = move
            best_score = score
        if best_score > alpha:
            alpha = best_score

    elapsed_ms = int((monotonic() - started) * 1000)
    return MinimaxDecision(best_move, best_score, max_depth, nodes_searched, elapsed_ms)
