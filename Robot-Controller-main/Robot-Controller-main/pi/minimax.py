"""Minimax decision engine for the Raspberry Pi game runtime."""

from dataclasses import dataclass
import json
import os
from time import monotonic
from typing import Dict, List, Optional, Sequence, Tuple

from .board_model import BOARD_NEIGHBORS, Board, Player, WINNING_LINES, count_pieces
from .morris_game import GameState, Move, apply_move, valid_moves


_EXACT = 0
_LOWER = 1
_UPPER = 2

DEFAULT_EXPERIENCE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ai_experience.json")

# 8 phép biến đổi đối xứng nhóm D4 trên bàn cờ 3x3 (4 phép quay, 4 phép lật gương)
_SYMMETRIES: Tuple[Tuple[int, ...], ...] = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8),  # 0 deg (Identity)
    (6, 3, 0, 7, 4, 1, 8, 5, 2),  # 90 deg CW
    (8, 7, 6, 5, 4, 3, 2, 1, 0),  # 180 deg
    (2, 5, 8, 1, 4, 7, 0, 3, 6),  # 270 deg CW
    (2, 1, 0, 5, 4, 3, 8, 7, 6),  # Lật ngang
    (6, 7, 8, 3, 4, 5, 0, 1, 2),  # Lật dọc
    (0, 3, 6, 1, 4, 7, 2, 5, 8),  # Lật chéo chính
    (8, 5, 2, 7, 4, 1, 6, 3, 0),  # Lật chéo phụ
)


def _board_to_str(board: Board) -> str:
    return "".join("0" if cell is None else str(cell) for cell in board)


def _move_to_str(source_node: Optional[int], target_node: int) -> str:
    return f"{'d' if source_node is None else source_node}->{target_node}"


def _transform_board(board: Board, perm: Tuple[int, ...]) -> Board:
    out = [None] * 9
    for idx, val in enumerate(board):
        out[perm[idx]] = val
    return tuple(out)


class ExperienceMemory:
    """Bộ nhớ học tăng cường giúp AI rút kinh nghiệm sau mỗi ván thua.

    Cơ chế hoạt động:
    1. Lưu vết toàn bộ các cặp (trạng thái, nước đi) trong ván đấu.
    2. Khi AI thua:
       - Lan truyền ngược hình phạt (Backward Penalty Propagation) cho các nước đi
         của AI dẫn tới thất bại (nước cuối bị phạt nặng nhất, giảm dần về đầu ván).
       - Ghi nhận ô đích mà đối thủ đã đi ngay sau đó để tạo bẫy (Trap Target),
         tặng điểm thưởng chủ động chặn trước ô bẫy đó ở ván sau.
       - Áp dụng đối xứng bàn cờ D4 cho các thế cờ trung/tàn cuộc để học 1 lần
         nhưng phòng chống được cả 8 hướng xoay/lật của bẫy.
       - Đánh dấu các trạng thái từng thua để tự động tăng độ sâu tìm kiếm (+2..+4 ply)
         khi gặp lại thế cờ đó.
    """

    def __init__(self, path: Optional[str] = DEFAULT_EXPERIENCE_PATH, auto_load: bool = True) -> None:
        self.path = path
        self.move_Action_scores: Dict[str, int] = {}
        self.trap_targets: Dict[str, Dict[str, int]] = {}
        self.danger_states: Dict[str, int] = {}
        self.games_learned: int = 0
        self.losses_learned: int = 0
        if auto_load and self.path:
            self.load()

    def load(self) -> bool:
        if not self.path or not os.path.exists(self.path):
            return False
        try:
            with open(self.path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
            self.move_Action_scores = {str(k): int(v) for k, v in data.get("move_scores", {}).items()}
            self.trap_targets = {
                str(k): {str(tk): int(tv) for tk, tv in v.items()}
                for k, v in data.get("trap_targets", {}).items()
                if isinstance(v, dict)
            }
            self.danger_states = {str(k): int(v) for k, v in data.get("danger_states", {}).items()}
            self.games_learned = int(data.get("games_learned", 0))
            self.losses_learned = int(data.get("losses_learned", 0))
            return True
        except (OSError, ValueError, TypeError):
            return False

    def save(self) -> None:
        if not self.path:
            return
        try:
            payload = {
                "games_learned": self.games_learned,
                "losses_learned": self.losses_learned,
                "move_scores": self.move_Action_scores,
                "trap_targets": self.trap_targets,
                "danger_states": self.danger_states,
            }
            with open(self.path, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, indent=2)
        except OSError:
            pass

    def clear(self) -> None:
        self.move_Action_scores.clear()
        self.trap_targets.clear()
        self.danger_states.clear()
        self.games_learned = 0
        self.losses_learned = 0

    def has_danger_state(self, board: Board, player: Player) -> bool:
        state_key = f"{_board_to_str(board)}:{player}"
        return self.danger_states.get(state_key, 0) > 0

    def get_move_bias(
        self,
        board: Board,
        player: Player,
        source_node: Optional[int],
        target_node: int,
    ) -> int:
        state_key = f"{_board_to_str(board)}:{player}"
        move_key = f"{state_key}:{_move_to_str(source_node, target_node)}"
        bias = self.move_Action_scores.get(move_key, 0)
        # Cộng điểm thưởng nếu nước đi này chặn trực tiếp ô bẫy mà đối thủ từng dùng để thắng
        traps = self.trap_targets.get(state_key)
        if traps:
            bias += traps.get(str(target_node), 0)
        # Giới hạn biên độ [-380, +260] để không bao giờ vượt qua ngưỡng 1-ply mate (500 điểm/ply)
        if bias < -380:
            return -380
        if bias > 260:
            return 260
        return bias

    def record_game(
        self,
        history_steps: Sequence[Tuple[Board, Player, Optional[int], int]],
        winner: Optional[Player],
        ai_player: Player,
    ) -> Dict[str, int]:
        """Rút kinh nghiệm từ lịch sử các bước đi (board_before, player, source, target)."""
        if not history_steps or winner is None:
            return {"games_learned": self.games_learned, "losses_learned": self.losses_learned}

        opponent = 3 - ai_player
        self.games_learned += 1

        if winner == opponent:
            self.losses_learned += 1
            # Tìm danh sách các chỉ số bước đi của AI trong ván thua
            ai_indices = [idx for idx, step in enumerate(history_steps) if step[1] == ai_player]
            total_ai_steps = len(ai_indices)
            for rank_from_end, idx in enumerate(reversed(ai_indices)):
                board_before, _, src, dst = history_steps[idx]
                decay = 0.72 ** rank_from_end
                penalty = -max(35, int(round(220 * decay)))
                trap_bonus = max(25, int(round(135 * decay)))

                # Kiểm tra nước đi bẫy kế tiếp của đối thủ ngay sau bước của AI
                opp_target: Optional[int] = None
                if idx + 1 < len(history_steps) and history_steps[idx + 1][1] == opponent:
                    opp_target = history_steps[idx + 1][3]

                # Nếu là nước mở màn đầu tiên của AI (chỉ mới có <=1 quân trên bàn),
                # chỉ phạt hướng chính xác để AI xoay sang góc đối xứng khác phá bài tủ của người chơi.
                # Từ nước thứ 2 trở đi, lan truyền sang cả 8 phép biến đổi đối xứng D4.
                pieces_on_board = sum(1 for c in board_before if c is not None)
                symmetries_to_apply = (_SYMMETRIES[0],) if pieces_on_board <= 1 else _SYMMETRIES

                for sym_idx, perm in enumerate(symmetries_to_apply):
                    sym_board = _transform_board(board_before, perm)
                    sym_src = None if src is None else perm[src]
                    sym_dst = perm[dst]
                    s_key = f"{_board_to_str(sym_board)}:{ai_player}"
                    m_key = f"{s_key}:{_move_to_str(sym_src, sym_dst)}"

                    weight = penalty if sym_idx == 0 else (penalty * 2) // 3
                    self.move_Action_scores[m_key] = max(-380, self.move_Action_scores.get(m_key, 0) + weight)
                    self.danger_states[s_key] = self.danger_states.get(s_key, 0) + 1

                    if opp_target is not None and pieces_on_board >= 2:
                        sym_opp_target = str(perm[opp_target])
                        t_map = self.trap_targets.setdefault(s_key, {})
                        b_weight = trap_bonus if sym_idx == 0 else (trap_bonus * 2) // 3
                        t_map[sym_opp_target] = min(220, t_map.get(sym_opp_target, 0) + b_weight)

        elif winner == ai_player:
            # Củng cố nhẹ các nước đi chiến thắng
            ai_indices = [idx for idx, step in enumerate(history_steps) if step[1] == ai_player]
            for rank_from_end, idx in enumerate(reversed(ai_indices)):
                board_before, _, src, dst = history_steps[idx]
                reward = max(10, int(round(45 * (0.7 ** rank_from_end))))
                s_key = f"{_board_to_str(board_before)}:{ai_player}"
                m_key = f"{s_key}:{_move_to_str(src, dst)}"
                self.move_Action_scores[m_key] = min(220, self.move_Action_scores.get(m_key, 0) + reward)

        self.save()
        return {"games_learned": self.games_learned, "losses_learned": self.losses_learned}


DEFAULT_EXPERIENCE = ExperienceMemory()


@dataclass(frozen=True)
class MinimaxDecision:
    move: Optional[Move]
    score: int
    depth: int
    nodes_searched: int
    elapsed_ms: int
    used_experience: bool = False


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
    if state.is_draw:
        return 0

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


def choose_move(
    state: GameState,
    ai_player: Player = 2,
    max_depth: int = 8,
    experience: Optional[ExperienceMemory] = None,
) -> MinimaxDecision:
    """Return the best legal move for ``ai_player`` using alpha-beta pruning
    and adaptive experience memory from previous matches.
    """
    if state.current_player != ai_player:
        raise ValueError("state current_player must match ai_player")
    if max_depth < 1:
        raise ValueError("max_depth must be at least 1")

    started = monotonic()
    nodes_searched = 0
    moves = valid_moves(state)
    if not moves:
        return MinimaxDecision(None, _evaluate(state, ai_player), 0, 0, 0, False)

    # Nếu thế cờ hiện tại nằm trong danh sách từng bị sập bẫy của Bộ nhớ Kinh nghiệm,
    # tự động kích hoạt Adaptive Deepening (tăng độ sâu lên tới 10 ply) để nhìn thấu toàn bộ bẫy.
    effective_depth = max_depth
    used_experience = False
    if experience is not None and experience.has_danger_state(state.board, ai_player):
        effective_depth = max(max_depth, min(10, max_depth + 4))
        used_experience = True

    # key = (board, current_player); value = (score, cached_depth, flag)
    cache: Dict[Tuple[Board, Player], Tuple[int, int, int]] = {}

    def _order_moves(
        current: GameState, candidates: List[Move]
    ) -> List[Tuple[int, "Move", "GameState"]]:
        """Pre-compute next states once and sort by heuristic + learned experience priority."""
        entries = []
        for move in candidates:
            next_state = apply_move(current, move)
            exp_bias = (
                experience.get_move_bias(current.board, current.current_player, move.source_node, move.target_node)
                if experience is not None and current.current_player == ai_player
                else 0
            )
            if next_state.winner == ai_player:
                priority = -20000
            elif next_state.winner is not None:
                priority = 20000
            elif next_state.is_draw:
                priority = -exp_bias
            else:
                priority = -(_evaluate(next_state, ai_player) + exp_bias)
            entries.append((priority, move, next_state))
        return sorted(entries, key=lambda e: e[0])

    def search(current: GameState, depth: int, maximizing: bool, alpha: int, beta: int) -> int:
        nonlocal nodes_searched
        nodes_searched += 1
        if current.winner == ai_player:
            return 1000 + depth * 500
        if current.winner is not None:
            return -1000 - depth * 500
        if current.is_draw:
            return 0
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

    # Apply move ordering at the root and combine search value with learned experience bias.
    root_ordered = _order_moves(state, moves)
    best_move = root_ordered[0][1]
    best_score = -10**9
    for _, move, next_state in root_ordered:
        base_score = search(next_state, effective_depth - 1, False, -10**9, 10**9)
        exp_bias = (
            experience.get_move_bias(state.board, ai_player, move.source_node, move.target_node)
            if experience is not None
            else 0
        )
        if exp_bias != 0:
            used_experience = True
        tie_break = _evaluate(next_state, ai_player) // 4 if abs(base_score) >= 1000 else 0
        total_score = base_score + exp_bias + tie_break
        if total_score > best_score:
            best_move = move
            best_score = total_score

    elapsed_ms = int((monotonic() - started) * 1000)
    return MinimaxDecision(best_move, best_score, effective_depth, nodes_searched, elapsed_ms, used_experience)
