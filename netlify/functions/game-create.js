import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin, getSupabaseUser } from './utils/supabase.js';

export default async (req, context) => {
  const { user } = await getSupabaseUser(context);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  // 1. Create a new game
  const { data: newGame, error: gameError } = await supabaseAdmin
    .from('games')
    .insert({ status: 'waiting' })
    .select()
    .single();

  if (gameError) {
    console.error('Error creating game:', gameError);
    return new Response(JSON.stringify({ error: 'Could not create game' }), { status: 500 });
  }

  // 2. Add the creator as the first player
  const { error: playerError } = await supabaseAdmin
    .from('game_players')
    .insert({
      game_id: newGame.id,
      player_id: user.id,
      player_symbol: 'black' // Creator is always black
    });

  if (playerError) {
    console.error('Error adding player to game:', playerError);
    // Clean up the created game if player insert fails
    await supabaseAdmin.from('games').delete().eq('id', newGame.id);
    return new Response(JSON.stringify({ error: 'Could not add player to game' }), { status: 500 });
  }

  return new Response(JSON.stringify({ gameId: newGame.id }));
};
