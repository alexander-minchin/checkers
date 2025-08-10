import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin, getSupabaseUser } from './utils/supabase.js';

// The initial state of the checkers board
const initialBoardState = [
    [0, 2, 0, 2, 0, 2, 0, 2],
    [2, 0, 2, 0, 2, 0, 2, 0],
    [0, 2, 0, 2, 0, 2, 0, 2],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [1, 0, 1, 0, 1, 0, 1, 0],
    [0, 1, 0, 1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 0]
];

export default async (req, context) => {
  const { user } = await getSupabaseUser(context);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { gameId } = await req.json();
  if (!gameId) {
    return new Response(JSON.stringify({ error: 'Game ID is required' }), { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  // 1. Find the specified game, ensure it's waiting
  const { data: game, error: gameError } = await supabaseAdmin
    .from('games')
    .select('*, game_players(*)')
    .eq('id', gameId)
    .eq('status', 'waiting')
    .single();

  if (gameError || !game) {
    return new Response(JSON.stringify({ error: 'Game not found or not available to join' }), { status: 404 });
  }

  // 2. Check if the user is already in the game
  if (game.game_players.some(p => p.player_id === user.id)) {
     return new Response(JSON.stringify({ error: 'You are already in this game' }), { status: 400 });
  }

  // 3. Add the joining user as the second player
  const { error: playerError } = await supabaseAdmin
    .from('game_players')
    .insert({
      game_id: game.id,
      player_id: user.id,
      player_symbol: 'red' // Joiner is always red
    });

  if (playerError) {
    console.error('Error joining game:', playerError);
    return new Response(JSON.stringify({ error: 'Could not join game' }), { status: 500 });
  }

  // 4. Update the game to 'active' and set the initial state
  const creator = game.game_players.find(p => p.player_symbol === 'black');
  const { error: updateError } = await supabaseAdmin
    .from('games')
    .update({
      status: 'active',
      current_turn_player_id: creator.player_id, // Black moves first
      game_state: {
        board: initialBoardState,
        movesWithoutCapture: 0,
        // 1=red, 2=black
        // We store the *piece type* of the current player, not the symbol
        currentPlayerPiece: 2 
      }
    })
    .eq('id', game.id);

  if (updateError) {
    console.error('Error starting game:', updateError);
    return new Response(JSON.stringify({ error: 'Could not start game' }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true, gameId: game.id }));
};
