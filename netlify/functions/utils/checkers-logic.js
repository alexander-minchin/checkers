// Server-side checkers logic. The single source of truth for move validation.

const EMPTY = 0;
const RED_PIECE = 1;
const BLACK_PIECE = 2;
const RED_KING = 3;
const BLACK_KING = 4;
const DRAW_MOVE_LIMIT = 80; // 40 moves per player

function getPieceOwner(piece) {
    if (piece === RED_PIECE || piece === RED_KING) return 1;
    if (piece === BLACK_PIECE || piece === BLACK_KING) return 2;
    return null;
}

function isKing(piece) {
    return piece === RED_KING || piece === BLACK_KING;
}

function isValidSquare(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function getJumpsFrom(board, row, col, playerPiece) {
    const piece = board[row][col];
    if (getPieceOwner(piece) !== playerPiece) return [];

    const jumps = [];
    const directions = [];
    const opponentOwner = playerPiece === 1 ? 2 : 1;

    if (playerPiece === 1 || isKing(piece)) { // Red or King
        directions.push({ r: -1, c: -1 }, { r: -1, c: 1 });
    }
    if (playerPiece === 2 || isKing(piece)) { // Black or King
        directions.push({ r: 1, c: -1 }, { r: 1, c: 1 });
    }

    for (const dir of directions) {
        const opponentRow = row + dir.r;
        const opponentCol = col + dir.c;
        const landRow = row + dir.r * 2;
        const landCol = col + dir.c * 2;

        if (isValidSquare(landRow, landCol) &&
            board[landRow][landCol] === EMPTY &&
            isValidSquare(opponentRow, opponentCol) &&
            getPieceOwner(board[opponentRow][opponentCol]) === opponentOwner) {
            jumps.push({ row: landRow, col: landCol });
        }
    }
    return jumps;
}

function findForcedJumps(board, playerPiece) {
    const forcedJumps = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (getPieceOwner(board[r][c]) === playerPiece) {
                const jumps = getJumpsFrom(board, r, c, playerPiece);
                if (jumps.length > 0) {
                    forcedJumps.push({ from: { row: r, col: c }, to: jumps });
                }
            }
        }
    }
    return forcedJumps;
}

export function isValidMove(board, move, playerPiece) {
    const { from, to } = move;
    const piece = board[from.row][from.col];

    // Basic checks
    if (getPieceOwner(piece) !== playerPiece) {
        return { valid: false, error: "Not your piece" };
    }

    const forcedJumps = findForcedJumps(board, playerPiece);

    const isJump = Math.abs(from.row - to.row) === 2;

    if (forcedJumps.length > 0) {
        if (!isJump) {
            return { valid: false, error: "You must make a jump" };
        }
        const canThisPieceJump = forcedJumps.find(j => j.from.row === from.row && j.from.col === from.col);
        if (!canThisPieceJump || !canThisPieceJump.to.some(j => j.row === to.row && j.col === to.col)) {
            return { valid: false, error: "Invalid jump move" };
        }
    }

    if (isJump) {
        const jumpedRow = (from.row + to.row) / 2;
        const jumpedCol = (from.col + to.col) / 2;
        const opponentOwner = playerPiece === 1 ? 2 : 1;
        if (getPieceOwner(board[jumpedRow][jumpedCol]) !== opponentOwner) {
            return { valid: false, error: "Invalid jump: no opponent piece to capture" };
        }
        // Check if a multi-jump is possible from the landing spot
        const tempBoard = JSON.parse(JSON.stringify(board));
        tempBoard[to.row][to.col] = tempBoard[from.row][from.col];
        tempBoard[from.row][from.col] = EMPTY;
        tempBoard[jumpedRow][jumpedCol] = EMPTY;
        const multiJumps = getJumpsFrom(tempBoard, to.row, to.col, playerPiece);
        return { valid: true, isJump: true, canMultiJump: multiJumps.length > 0 };
    } else { // Regular move
        const directions = [];
        if (playerPiece === 1 || isKing(piece)) { // Red or King
            directions.push({ r: -1, c: -1 }, { r: -1, c: 1 });
        }
        if (playerPiece === 2 || isKing(piece)) { // Black or King
            directions.push({ r: 1, c: -1 }, { r: 1, c: 1 });
        }
        const isValidDirection = directions.some(d => from.row + d.r === to.row && from.col + d.c === to.col);
        if (!isValidDirection || board[to.row][to.col] !== EMPTY) {
            return { valid: false, error: "Invalid regular move" };
        }
    }

    return { valid: true, isJump: false };
}

export function applyMove(gameState, move, isJump) {
    const { from, to } = move;
    let newBoard = JSON.parse(JSON.stringify(gameState.board));
    let newMovesWithoutCapture = gameState.movesWithoutCapture;

    const piece = newBoard[from.row][from.col];
    newBoard[to.row][to.col] = piece;
    newBoard[from.row][from.col] = EMPTY;

    if (isJump) {
        const jumpedRow = (from.row + to.row) / 2;
        const jumpedCol = (from.col + to.col) / 2;
        newBoard[jumpedRow][jumpedCol] = EMPTY;
        newMovesWithoutCapture = 0;
    } else {
        newMovesWithoutCapture++;
    }

    // Promote to king
    if (newBoard[to.row][to.col] === RED_PIECE && to.row === 0) {
        newBoard[to.row][to.col] = RED_KING;
    }
    if (newBoard[to.row][to.col] === BLACK_PIECE && to.row === 7) {
        newBoard[to.row][to.col] = BLACK_KING;
    }

    return {
        ...gameState,
        board: newBoard,
        movesWithoutCapture: newMovesWithoutCapture
    };
}

export function getWinner(board, nextPlayerPiece, movesWithoutCapture) {
    // Check for draw
    if (movesWithoutCapture >= DRAW_MOVE_LIMIT) {
        return { isGameOver: true, winnerPiece: null, reason: "Draw by move limit" };
    }

    let hasPieces = false;
    let hasMoves = false;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (getPieceOwner(board[r][c]) === nextPlayerPiece) {
                hasPieces = true;
                const forcedJumps = findForcedJumps(board, nextPlayerPiece);
                if (forcedJumps.length > 0) {
                    hasMoves = true;
                    break;
                }
                // Check for regular moves
                const directions = [];
                if (nextPlayerPiece === 1 || isKing(board[r][c])) directions.push({ r: -1, c: -1 }, { r: -1, c: 1 });
                if (nextPlayerPiece === 2 || isKing(board[r][c])) directions.push({ r: 1, c: -1 }, { r: 1, c: 1 });
                for(const dir of directions) {
                    if(isValidSquare(r + dir.r, c + dir.c) && board[r + dir.r][c + dir.c] === EMPTY) {
                        hasMoves = true;
                        break;
                    }
                }
            }
            if (hasMoves) break;
        }
        if (hasMoves) break;
    }

    if (!hasPieces || !hasMoves) {
        const winner = nextPlayerPiece === 1 ? 2 : 1; // The other player wins
        return { isGameOver: true, winnerPiece: winner, reason: !hasPieces ? "No pieces left" : "No valid moves" };
    }

    return { isGameOver: false };
}
