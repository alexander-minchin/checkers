import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin, getSupabaseUser } from './utils/supabase.js';

export default async (req, context) => {
  const { user } = await getSupabaseUser(context);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: newGame, error: gameError } = await supabaseAdmin.from('games').insert({ status: 'waiting' }).select().single();
  if (gameError) { return new Response(JSON.stringify({ error: 'Could not create game' }), { status: 500 }); }

  const { error: playerError } = await supabaseAdmin.from('game_players').insert({ game_id: newGame.id, player_id: user.id, player_symbol: 'black' });
  if (playerError) {
    await supabaseAdmin.from('games').delete().eq('id', newGame.id);
    return new Response(JSON.stringify({ error: 'Could not add player to game' }), { status: 500 });
  }
  return new Response(JSON.stringify({ gameId: newGame.id }));
};
