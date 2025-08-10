import { getSupabaseAdmin, getSupabaseUser } from './utils/supabase.js';
import { isValidMove, applyMove, getWinner } from './utils/checkers-logic.js';

export default async (req, context) => {
    const { user } = await getSupabaseUser(context);
    if (!user) { return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }); }

    const { gameId, move } = await req.json();
    if (!gameId || !move) { return new Response(JSON.stringify({ error: 'Game ID and move are required' }), { status: 400 }); }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: game, error: gameError } = await supabaseAdmin.from('games').select('*, game_players(*)').eq('id', gameId).single();
    if (gameError || !game) { return new Response(JSON.stringify({ error: 'Game not found' }), { status: 404 }); }
    if (game.status !== 'active') { return new Response(JSON.stringify({ error: 'Game is not active' }), { status: 400 }); }
    if (game.current_turn_player_id !== user.id) { return new Response(JSON.stringify({ error: "It's not your turn" }), { status: 403 }); }

    const validationResult = isValidMove(game.game_state.board, move, game.game_state.currentPlayerPiece);
    if (!validationResult.valid) { return new Response(JSON.stringify({ error: validationResult.error }), { status: 400 }); }

    const nextGameState = applyMove(game.game_state, move, validationResult.isJump);
    let nextPlayerId = game.game_players.find(p => p.player_id !== user.id).player_id;
    let newStatus = 'active', winnerId = null;

    if (validationResult.isJump && validationResult.canMultiJump) {
       nextPlayerId = user.id;
    } else {
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

    const { error: updateError } = await supabaseAdmin.from('games').update({ game_state: nextGameState, current_turn_player_id: nextPlayerId, status: newStatus, winner_player_id: winnerId }).eq('id', gameId);
    if (updateError) { return new Response(JSON.stringify({ error: 'Failed to update game state' }), { status: 500 }); }

    return new Response(JSON.stringify({ success: true }));
};
