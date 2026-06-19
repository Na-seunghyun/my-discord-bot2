CREATE TABLE IF NOT EXISTS intel_players (
  id TEXT PRIMARY KEY,
  username TEXT,
  username_lc TEXT,
  state INTEGER,
  alliance_name TEXT,
  alliance_abbr TEXT,
  power INTEGER,
  town_hall_level INTEGER,
  avatar_url TEXT,
  last_refreshed_at TEXT,
  updated_at INTEGER,
  summary_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_intel_players_name ON intel_players(username_lc);
CREATE INDEX IF NOT EXISTS idx_intel_players_state ON intel_players(state);

CREATE TABLE IF NOT EXISTS intel_cache (
  cache_key TEXT PRIMARY KEY,
  api_path TEXT,
  response_json TEXT,
  updated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_intel_cache_path ON intel_cache(api_path);
