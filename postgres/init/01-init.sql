-- Samvyo test database schema
-- Runs automatically on first container start (empty volume)

CREATE TABLE IF NOT EXISTS rooms (
    id          SERIAL PRIMARY KEY,
    room_id     VARCHAR(100) UNIQUE NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW(),
    ended_at    TIMESTAMP
);

CREATE TABLE IF NOT EXISTS participants (
    id          SERIAL PRIMARY KEY,
    room_id     VARCHAR(100) REFERENCES rooms(room_id),
    display_name VARCHAR(100),
    joined_at   TIMESTAMP DEFAULT NOW()
);

-- Seed one test room so /api/rooms returns real data
INSERT INTO rooms (room_id) VALUES ('test-room-001') ON CONFLICT DO NOTHING;
