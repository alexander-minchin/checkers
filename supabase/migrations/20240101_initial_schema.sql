-- Create PROFILES table to store public user data
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE,
  updated_at timestamptz DEFAULT now(),
  
  CONSTRAINT username_length CHECK (char_length(username) >= 3)
);

-- Create GAMES table for game instances
CREATE TABLE games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'waiting', -- 'waiting', 'active', 'finished', 'abandoned'
  game_state jsonb,
  current_turn_player_id uuid REFERENCES profiles(id),
  winner_player_id uuid REFERENCES profiles(id)
);

-- Create GAME_PLAYERS join table
CREATE TABLE game_players (
  id bigserial PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  player_symbol text, -- 'red', 'black'
  
  UNIQUE(game_id, player_id)
);

-- Enable Row Level Security (RLS) for all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;

-- RLS Policies for PROFILES
CREATE POLICY "Public profiles are viewable by everyone." ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile." ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile." ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for GAMES
CREATE POLICY "Users can view games they are a player in." ON games
  FOR SELECT USING (
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM game_players
      WHERE game_players.game_id = games.id AND game_players.player_id = auth.uid()
    )
  );
-- No INSERT, UPDATE, DELETE policies for users on GAMES. This must be done by serverless functions.

-- RLS Policies for GAME_PLAYERS
CREATE POLICY "Users can view their own game player entries." ON game_players
  FOR SELECT USING (auth.uid() = player_id);
-- No INSERT, UPDATE, DELETE policies for users on GAME_PLAYERS.

-- Function to create a profile for a new user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (new.id, new.raw_user_meta_data->>'username');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function when a new user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
