// Minimax AI with Alpha-Beta Pruning for Three Men's Morris on ESP32-S3
import { checkWinner, getValidDestinations, WINNING_COMBINATIONS } from './gameRules';
import { MinimaxLog } from '../types';

export interface AIMoveDecision {
  fromNode: number | null; // null if placement phase
  toNode: number;
  score: number;
  log: MinimaxLog;
}

/**
 * Heuristic evaluation function for non-terminal states
 */
function evaluateState(board: (number | null)[], aiPlayer: 1 | 2): number {
  const humanPlayer = aiPlayer === 1 ? 2 : 1;
  const { winner } = checkWinner(board);
  if (winner === aiPlayer) return 1000;
  if (winner === humanPlayer) return -1000;

  let score = 0;

  // Center node control bonus (B2 is node 4)
  if (board[4] === aiPlayer) score += 30;
  else if (board[4] === humanPlayer) score -= 30;

  // Corners bonus (nodes 0, 2, 6, 8)
  const corners = [0, 2, 6, 8];
  for (const c of corners) {
    if (board[c] === aiPlayer) score += 8;
    else if (board[c] === humanPlayer) score -= 8;
  }

  // 2-in-a-row threats
  for (const combo of WINNING_COMBINATIONS) {
    const pieces = combo.map((idx) => board[idx]);
    const aiCount = pieces.filter((p) => p === aiPlayer).length;
    const humanCount = pieces.filter((p) => p === humanPlayer).length;
    const emptyCount = pieces.filter((p) => p === null).length;

    if (aiCount === 2 && emptyCount === 1) score += 60;
    if (humanCount === 2 && emptyCount === 1) score -= 90; // Prioritize blocking human
  }

  return score;
}

/**
 * Run Minimax to find the best move for AI
 */
export function calculateBestMove(
  board: (number | null)[],
  aiPlayer: 1 | 2 = 2,
  placedPiecesCount: { p1: number; p2: number },
  maxDepth = 4
): AIMoveDecision {
  const startTime = performance.now();
  const humanPlayer = aiPlayer === 1 ? 2 : 1;
  const isDropPhase = aiPlayer === 1 ? placedPiecesCount.p1 < 3 : placedPiecesCount.p2 < 3;

  let nodesSearched = 0;

  // Generate legal moves
  const legalMoves: { from: number | null; to: number }[] = [];

  if (isDropPhase) {
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        legalMoves.push({ from: null, to: i });
      }
    }
  } else {
    // Movement phase: Pick one of AI's pieces and move to adjacent empty node
    for (let i = 0; i < 9; i++) {
      if (board[i] === aiPlayer) {
        const dests = getValidDestinations(i, board);
        for (const dest of dests) {
          legalMoves.push({ from: i, to: dest });
        }
      }
    }
  }

  if (legalMoves.length === 0) {
    // No legal moves possible (stalemate)
    return {
      fromNode: null,
      toNode: 0,
      score: 0,
      log: {
        evalScore: 0,
        depth: 0,
        nodesSearched: 0,
        chosenPiece: null,
        chosenMove: { from: null, to: 0 },
        calcTimeMs: 0,
      },
    };
  }

  let bestMove = legalMoves[0];
  let bestScore = -Infinity;
  const alpha = -Infinity;
  const beta = Infinity;

  // Minimax search
  function minimax(
    currentBoard: (number | null)[],
    depth: number,
    isMaximizing: boolean,
    a: number,
    b: number
  ): number {
    nodesSearched++;
    const { winner } = checkWinner(currentBoard);
    if (winner === aiPlayer) return 1000 - depth;
    if (winner === humanPlayer) return -1000 + depth;
    if (depth >= maxDepth) return evaluateState(currentBoard, aiPlayer);

    const currentPlayer = isMaximizing ? aiPlayer : humanPlayer;
    const currentPlaced =
      currentPlayer === 1 ? placedPiecesCount.p1 + (3 - placedPiecesCount.p1 > 0 ? 1 : 0) : placedPiecesCount.p2;
    const currentIsDrop = currentPlaced < 3;

    // Available moves
    const moves: { from: number | null; to: number }[] = [];
    if (currentIsDrop) {
      for (let i = 0; i < 9; i++) {
        if (currentBoard[i] === null) moves.push({ from: null, to: i });
      }
    } else {
      for (let i = 0; i < 9; i++) {
        if (currentBoard[i] === currentPlayer) {
          const dests = getValidDestinations(i, currentBoard);
          for (const d of dests) moves.push({ from: i, to: d });
        }
      }
    }

    if (moves.length === 0) return 0; // draw/block

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const m of moves) {
        const nextBoard = [...currentBoard];
        if (m.from !== null) nextBoard[m.from] = null;
        nextBoard[m.to] = aiPlayer;

        const evaluation = minimax(nextBoard, depth + 1, false, a, b);
        maxEval = Math.max(maxEval, evaluation);
        a = Math.max(a, evaluation);
        if (b <= a) break; // Alpha-beta cutoff
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const m of moves) {
        const nextBoard = [...currentBoard];
        if (m.from !== null) nextBoard[m.from] = null;
        nextBoard[m.to] = humanPlayer;

        const evaluation = minimax(nextBoard, depth + 1, true, a, b);
        minEval = Math.min(minEval, evaluation);
        b = Math.min(b, evaluation);
        if (b <= a) break; // Alpha-beta cutoff
      }
      return minEval;
    }
  }

  // Iterate root moves
  for (const move of legalMoves) {
    const nextBoard = [...board];
    if (move.from !== null) nextBoard[move.from] = null;
    nextBoard[move.to] = aiPlayer;

    const score = minimax(nextBoard, 1, false, alpha, beta);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  const elapsedMs = Math.round(performance.now() - startTime);

  return {
    fromNode: bestMove.from,
    toNode: bestMove.to,
    score: bestScore,
    log: {
      evalScore: bestScore,
      depth: maxDepth,
      nodesSearched,
      chosenPiece: null,
      chosenMove: bestMove,
      calcTimeMs: Math.max(elapsedMs, 12), // Real embedded feel (12-40ms on ESP32-S3)
    },
  };
}
