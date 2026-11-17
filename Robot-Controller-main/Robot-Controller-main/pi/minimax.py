"""Minimax decision engine for the Raspberry Pi game runtime."""

from dataclasses import dataclass
from time import monotonic
from typing import Dict, List, Optional, Tuple

from .board_model import Board, Player, WINNING_LINES, count_pieces
from .morris_game import GameState, Move, apply_move, valid_moves


@dataclass(frozen=True)
class MinimaxDecision:
    move: Optional[Move]
    score: int
    depth: int
    nodes_searched: int
    elapsed_ms: int


def _evaluate(state: GameState, ai_player: Player) -> int:
    """Board heuristic — optimised for minimal Python overhead.

    Key changes vs original:
    - ``opponent = 3 - ai_player`` (branchless, avoids conditional)
    - ``board.count(p)`` replaces ``count_pieces()`` (skips validate_player)
    - Winning-line check uses tuple unpacking + ``tuple.count()`` (C speed)
      instead of a list comprehension + list.count(); also short-circuits
      the empty-count branch so both sides share one tuple creation
    - No intermediate list is allocated for each line
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

    for a, mid, z in WINNING_LINES:
        t = (b[a], b[mid], b[z])          # tuple: count() calls C code
        ai_c  = t.count(ai_player)
        opp_c = t.count(opponent)
        if ai_c  == 2 and opp_c == 0:     # empty implied (no list needed)
            score += 60
        if opp_c == 2 and ai_c  == 0:
            score -= 90

    # board.count() is a C-level method; avoids validate_player overhead
    score += (b.count(ai_player) - b.count(opponent)) * 4
    return score


def choose_move(state: GameState, ai_player: Player = 2, max_depth: int = 4) -> MinimaxDecision:
    """Return the best legal move for ``ai_player`` using alpha-beta pruning.

    Transposition table
    -------------------
    Each entry stores ``(value, cached_depth)``.  An entry is only reused when
    ``cached_depth >= depth`` of the current call; otherwise the stored value
    was computed with less lookahead and may be inaccurate.  This is the
    standard approach: storing depth *inside* the entry (not in the key) and
    guarding on lookup.

    Terminal-state evaluations (depth == 0) are exact and are always reusable
    at shallower calls, so the guard naturally handles them too.
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

    # key = (board, current_player); value = (score, cached_depth)
    cache: Dict[Tuple[Board, Player], Tuple[int, int]] = {}

    def _order_moves(
        current: GameState, candidates: List[Move]
    ) -> List[Tuple[int, "Move", "GameState"]]:
        """Pre-compute next states once and sort by heuristic priority.

        Each entry is ``(priority, move, next_state)`` so search() can reuse
        the pre-computed state directly — eliminating the duplicate apply_move
        call that sorting alone would cause.  In the drop phase (branching
        factor 9) this roughly halves total apply_move invocations.

        Priority ordering (lowest first):
          -200  winning move for ai_player  → always explore first
          +200  opponent-winning move       → defer (but keep in list)
          else  negated heuristic score     → higher score first
        """
        entries = []
        for move in candidates:
            next_state = apply_move(current, move)
            if next_state.winner == ai_player:
                priority = -200
            elif next_state.winner is not None:
                priority = 200
            else:
                priority = -_evaluate(next_state, ai_player)
            entries.append((priority, move, next_state))
        return sorted(entries, key=lambda e: e[0])

    def search(current: GameState, depth: int, maximizing: bool, alpha: int, beta: int) -> int:
        nonlocal nodes_searched
        nodes_searched += 1
        if current.winner is not None or depth == 0:
            return _evaluate(current, ai_player)

        key: Tuple[Board, Player] = (current.board, current.current_player)
        cached = cache.get(key)
        if cached is not None:
            cached_value, cached_depth = cached
            # Only reuse when the stored search was at least as deep as ours.
            # A result computed at depth=1 must NOT be reused for depth=3.
            if cached_depth >= depth:
                return cached_value

        child_moves = valid_moves(current)
        if not child_moves:
            result = _evaluate(current, ai_player)
            cache[key] = (result, depth)
            return result

        # _order_moves returns (priority, move, next_state): reuse next_state
        # directly to avoid calling apply_move a second time in search().
        ordered = _order_moves(current, child_moves)
        cutoff = False
        if maximizing:
            value = -10**9
            for _, _move, next_state in ordered:
                value = max(value, search(next_state, depth - 1, False, alpha, beta))
                alpha = max(alpha, value)
                if alpha >= beta:
                    cutoff = True
                    break
        else:
            value = 10**9
            for _, _move, next_state in ordered:
                value = min(value, search(next_state, depth - 1, True, alpha, beta))
                beta = min(beta, value)
                if alpha >= beta:
                    cutoff = True
                    break

        if not cutoff:
            cache[key] = (value, depth)
        return value

    # Apply move ordering at the root so the best move surfaces early.
    root_ordered = _order_moves(state, moves)
    best_move = root_ordered[0][1]
    best_score = -10**9
    for _, move, next_state in root_ordered:
        score = search(next_state, max_depth - 1, False, -10**9, 10**9)
        if score > best_score:
            best_move = move
            best_score = score

    elapsed_ms = int((monotonic() - started) * 1000)
    return MinimaxDecision(best_move, best_score, max_depth, nodes_searched, elapsed_ms)
