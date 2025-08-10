import { getSupabaseAdmin, getSupabaseUser } from './utils/supabase.js';
import { isValidMove, applyMove, getWinner } from './utils/checkers-logic.js';

export default async (req, context) => {
    const { user } = await getSupabaseUser(context);
    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { gameId, move } = await req.json();
    if (!gameId || !move) {
        return new Response(JSON.stringify({ error: 'Game ID and move are required' }), { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Fetch current game state
    const { data: game, error: gameError } = await supabaseAdmin
        .from('games')
        .select('*, game_players(*)')
        .eq('id', gameId)
        .single();

    if (gameError || !game) {
        return new Response(JSON.stringify({ error: 'Game not found' }), { status: 404 });
    }

    // 2. Authorize action
    if (game.status !== 'active') {
        return new Response(JSON.stringify({ error: 'Game is not active' }), { status: 400 });
    }
    if (game.current_turn_player_id !== user.id) {
        return new Response(JSON.stringify({ error: "It's not your turn" }), { status: 403 });
    }

    // 3. Validate move using server-side logic
    const { board, currentPlayerPiece } = game.game_state;
    const validationResult = isValidMove(board, move, currentPlayerPiece);
    if (!validationResult.valid) {
        return new Response(JSON.stringify({ error: validationResult.error }), { status: 400 });
    }

    // 4. Execute game logic: apply the move
    const nextGameState = applyMove(game.game_state, move, validationResult.isJump);
    
    // 5. Determine next player and check for win/loss/draw
    let nextPlayerId = game.game_players.find(p => p.player_id !== user.id).player_id;
    let newStatus = 'active';
    let winnerId = null;

    // If it was a multi-jump, the turn does not change
    if (validationResult.isJump && validationResult.canMultiJump) {
       nextPlayerId = user.id;
    } else {
       // Switch player piece type for the next turn state
       nextGameState.currentPlayerPiece = nextGameState.currentPlayerPiece === 1 ? 2 : 1;
    }
    
    const winnerInfo = getWinner(nextGameState.board, nextGameState.currentPlayerPiece, nextGameState.movesWithoutCapture);
    if(winnerInfo.isGameOver) {
        newStatus = 'finished';
        if (winnerInfo.winnerPiece) {
            const winnerSymbol = winnerInfo.winnerPiece === 1 ? 'red' : 'black';
            winnerId = game.game_players.find(p => p.player_symbol === winnerSymbol).player_id;
        }
    }

    // 6. Commit new state to database
    const { error: updateError } = await supabaseAdmin
        .from('games')
        .update({
            game_state: nextGameState,
            current_turn_player_id: nextPlayerId,
            status: newStatus,
            winner_player_id: winnerId
        })
        .eq('id', gameId);

    if (updateError) {
        console.error("Error updating game state:", updateError);
        return new Response(JSON.stringify({ error: 'Failed to update game state' }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }));
};
