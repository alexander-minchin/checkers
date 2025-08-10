import { getSupabaseAdmin, getSupabaseUser } from './utils/supabase.js';

export default async (req, context) => {
    const { user } = await getSupabaseUser(context);
    if (!user) { return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }); }

    const { gameId } = await req.json();
    if (!gameId) { return new Response(JSON.stringify({ error: 'Game ID is required' }), { status: 400 }); }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: game, error: gameError } = await supabaseAdmin.from('games').select('*, game_players(*)').eq('id', gameId).single();
    if (gameError || !game) { return new Response(JSON.stringify({ error: 'Game not found' }), { status: 404 }); }
    
    const player = game.game_players.find(p => p.player_id === user.id);
    if (!player) { return new Response(JSON.stringify({ error: 'You are not a player in this game' }), { status: 403 }); }
    if (game.status !== 'active') { return new Response(JSON.stringify({ error: 'Game is not active' }), { status: 400 }); }

    const winner = game.game_players.find(p => p.player_id !== user.id);
    const { error: updateError } = await supabaseAdmin.from('games').update({ status: 'finished', winner_player_id: winner.player_id }).eq('id', gameId);
    if (updateError) { return new Response(JSON.stringify({ error: 'Failed to forfeit game' }), { status: 500 }); }

    return new Response(JSON.stringify({ success: true }));
};
