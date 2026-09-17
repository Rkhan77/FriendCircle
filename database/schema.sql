CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE IF NOT EXISTS app_state (id integer PRIMARY KEY CHECK(id=1), document jsonb NOT NULL);
INSERT INTO app_state VALUES (1,'{"people":[],"friendships":[],"requests":[],"messages":[],"blocks":[],"reports":[]}') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS locations (user_id text PRIMARY KEY, position geography(Point,4326) NOT NULL, sharing boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS locations_position_idx ON locations USING gist(position);
-- Geospatial query for scaling the nearby endpoint beyond the MVP document store:
-- SELECT user_id FROM locations WHERE sharing AND ST_DWithin(position,
-- ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,$3);
-- app_state is private to the application server. Never expose it via a public DB API.
REVOKE ALL ON app_state, locations FROM PUBLIC;
