import { getSupabaseAdmin, getSupabaseUser } from './utils/supabase.js';
const initialBoardState = [[0,2,0,2,0,2,0,2],[2,0,2,0,2,0,2,0],[0,2,0,2,0,2,0,2],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[1,0,1,0,1,0,1,0],[0,1,0,1,0,1,0,1],[1,0,1,0,1,0,1,0]];

export default async (req, context) => {
  const { user } = await getSupabaseUser(context);
  if (!user) { return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }); }

  const { gameId } = await req.json();
  if (!gameId) { return new Response(JSON.stringify({ error: 'Game ID is required' }), { status: 400 }); }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: game, error: gameError } = await supabaseAdmin.from('games').select('*, game_players(*)').eq('id', gameId).eq('status', 'waiting').single();
  if (gameError || !game) { return new Response(JSON.stringify({ error: 'Game not found or not available to join' }), { status: 404 }); }
  if (game.game_players.some(p => p.player_id === user.id)) { return new Response(JSON.stringify({ error: 'You are already in this game' }), { status: 400 }); }

  const { error: playerError } = await supabaseAdmin.from('game_players').insert({ game_id: game.id, player_id: user.id, player_symbol: 'red' });
  if (playerError) { return new Response(JSON.stringify({ error: 'Could not join game' }), { status: 500 }); }

  const creator = game.game_players.find(p => p.player_symbol === 'black');
  const { error: updateError } = await supabaseAdmin.from('games').update({ status: 'active', current_turn_player_id: creator.player_id, game_state: { board: initialBoardState, movesWithoutCapture: 0, currentPlayerPiece: 2 }}).eq('id', game.id);
  if (updateError) { return new Response(JSON.stringify({ error: 'Could not start game' }), { status: 500 }); }

  return new Response(JSON.stringify({ success: true, gameId: game.id }));
};
