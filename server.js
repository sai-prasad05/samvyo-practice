const express = require("express");
const { Pool } = require("pg");
const Redis = require("ioredis");

const app = express();
const PORT = process.env.PORT || 3000;

// Parse incoming JSON request bodies (needed for POST /api/rooms)
// Without this, req.body is undefined when the frontend sends JSON
app.use(express.json());

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Redis connection
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  lazyConnect: true,
  retryStrategy: () => 2000,
});

// ── Routes ────────────────────────────────────────────────────────────────────

// GET / — interactive rooms dashboard
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Samvyo — Rooms Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0f1117;
      color: #e2e8f0;
      min-height: 100vh;
      padding: 40px 20px;
    }

    .container { max-width: 640px; margin: 0 auto; }

    /* ── Header ── */
    .header { margin-bottom: 32px; }
    .badge {
      display: inline-block;
      background: #1a3a2a;
      color: #4ade80;
      border: 1px solid #4ade80;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 1px;
      padding: 3px 10px;
      border-radius: 99px;
      margin-bottom: 12px;
      text-transform: uppercase;
    }
    h1 { font-size: 28px; font-weight: 700; color: #f8fafc; }
    .subtitle { color: #64748b; font-size: 14px; margin-top: 4px; }

    /* ── Create Room Form ── */
    .create-box {
      background: #1a1d27;
      border: 1px solid #2d3148;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
    }
    .create-box h2 { font-size: 14px; color: #94a3b8; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .input-row { display: flex; gap: 10px; }
    input[type="text"] {
      flex: 1;
      background: #0f1117;
      border: 1px solid #2d3148;
      border-radius: 8px;
      padding: 10px 14px;
      color: #f1f5f9;
      font-size: 14px;
      outline: none;
    }
    input[type="text"]:focus { border-color: #6366f1; }
    input[type="text"]::placeholder { color: #475569; }
    button {
      background: #6366f1;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #4f46e5; }
    button:disabled { background: #334155; cursor: not-allowed; }

    /* ── Rooms List ── */
    .rooms-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .rooms-header h2 { font-size: 14px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
    .source-badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 99px;
      font-weight: 600;
    }
    .source-postgres { background: #1e3a5f; color: #60a5fa; border: 1px solid #2563eb; }
    .source-redis    { background: #3a1a1a; color: #f87171; border: 1px solid #dc2626; }

    .room-card {
      background: #1a1d27;
      border: 1px solid #2d3148;
      border-radius: 10px;
      padding: 16px 18px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .room-left { display: flex; align-items: center; gap: 12px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; flex-shrink: 0; }
    .room-id { font-family: monospace; font-size: 15px; color: #a5b4fc; }
    .room-time { font-size: 12px; color: #475569; margin-top: 2px; }
    .end-btn {
      background: transparent;
      color: #f87171;
      border: 1px solid #f87171;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .end-btn:hover { background: #3a1a1a; }

    .empty { text-align: center; color: #475569; padding: 32px; font-size: 14px; }

    /* ── Footer ── */
    .footer { margin-top: 32px; font-size: 12px; color: #334155; text-align: center; }
    .footer span { color: #4ade80; }

    /* ── Toast notification ── */
    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1a1d27;
      border: 1px solid #4ade80;
      color: #4ade80;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.3s;
      pointer-events: none;
    }
    .toast.show { opacity: 1; transform: translateY(0); }
    .toast.error { border-color: #f87171; color: #f87171; }
  </style>
</head>
<body>
  <div class="container">

    <div class="header">
      <div class="badge">● Live — v3-test.samvyo.com</div>
      <h1>Samvyo Rooms</h1>
      <p class="subtitle">Create and manage video meeting rooms in real time</p>
    </div>

    <!-- Create Room -->
    <div class="create-box">
      <h2>Start a new room</h2>
      <div class="input-row">
        <input type="text" id="roomInput" placeholder="e.g. team-standup, client-demo" maxlength="50" />
        <button id="createBtn" onclick="createRoom()">Create Room</button>
      </div>
    </div>

    <!-- Active Rooms -->
    <div class="rooms-header">
      <h2>Active Rooms</h2>
      <span id="sourceBadge" class="source-badge" style="display:none"></span>
    </div>
    <div id="roomsList">
      <div class="empty">Loading rooms...</div>
    </div>

    <div class="footer">
      Node.js <span>${process.version}</span> ·
      Uptime <span>${Math.floor(process.uptime() / 60)}m</span> ·
      PID <span>${process.pid}</span>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    // ── Fetch and render rooms ────────────────────────────────────────────────
    async function loadRooms() {
      try {
        const res  = await fetch("/api/rooms");
        const data = await res.json();

        // Show whether data came from postgres or redis cache
        const badge = document.getElementById("sourceBadge");
        badge.style.display = "inline-block";
        if (data.source === "redis-cache") {
          badge.textContent  = "⚡ Redis Cache";
          badge.className    = "source-badge source-redis";
        } else {
          badge.textContent  = "🐘 PostgreSQL";
          badge.className    = "source-badge source-postgres";
        }

        const list = document.getElementById("roomsList");
        // Filter: only show rooms that are still active (no ended_at)
        const active = data.rooms.filter(r => !r.ended_at);

        if (active.length === 0) {
          list.innerHTML = '<div class="empty">No active rooms. Create one above.</div>';
          return;
        }

        // Render each active room as a card
        list.innerHTML = active.map(room => \`
          <div class="room-card" id="card-\${room.id}">
            <div class="room-left">
              <div class="dot"></div>
              <div>
                <div class="room-id">\${room.room_id}</div>
                <div class="room-time">Started \${timeAgo(room.created_at)}</div>
              </div>
            </div>
            <button class="end-btn" onclick="endRoom(\${room.id}, '\${room.room_id}')">
              End Meeting
            </button>
          </div>
        \`).join("");
      } catch (e) {
        document.getElementById("roomsList").innerHTML =
          '<div class="empty">Could not load rooms. Check server logs.</div>';
      }
    }

    // ── Create a new room ─────────────────────────────────────────────────────
    async function createRoom() {
      const input = document.getElementById("roomInput");
      const name  = input.value.trim();

      // Basic validation — room name must not be empty
      if (!name) { showToast("Enter a room name first", true); return; }

      // Replace spaces with dashes, lowercase (e.g. "Team Standup" → "team-standup")
      const roomId = name.toLowerCase().replace(/\\s+/g, "-");

      document.getElementById("createBtn").disabled = true;

      try {
        const res = await fetch("/api/rooms", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ room_id: roomId }),
        });

        if (res.status === 409) {
          showToast("Room '" + roomId + "' already exists", true);
          return;
        }
        if (!res.ok) throw new Error("Server error");

        input.value = "";
        showToast("Room created: " + roomId);
        loadRooms(); // Refresh the list
      } catch (e) {
        showToast("Failed to create room", true);
      } finally {
        document.getElementById("createBtn").disabled = false;
      }
    }

    // ── End a room ────────────────────────────────────────────────────────────
    async function endRoom(id, roomId) {
      try {
        const res = await fetch("/api/rooms/" + id + "/end", { method: "PATCH" });
        if (!res.ok) throw new Error("Server error");
        showToast("Ended: " + roomId);
        loadRooms(); // Refresh the list
      } catch (e) {
        showToast("Failed to end room", true);
      }
    }

    // ── Helper: human-readable time ───────────────────────────────────────────
    function timeAgo(dateStr) {
      const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000);
      if (seconds < 60)  return seconds + "s ago";
      if (seconds < 3600) return Math.floor(seconds / 60) + "m ago";
      return Math.floor(seconds / 3600) + "h ago";
    }

    // ── Helper: show toast notification ──────────────────────────────────────
    function showToast(msg, isError = false) {
      const t = document.getElementById("toast");
      t.textContent = msg;
      t.className   = "toast show" + (isError ? " error" : "");
      setTimeout(() => { t.className = "toast"; }, 3000);
    }

    // Allow pressing Enter in the input to create a room
    document.getElementById("roomInput").addEventListener("keydown", e => {
      if (e.key === "Enter") createRoom();
    });

    // Load rooms on page open, then refresh every 10 seconds
    // (so if another user creates a room, you see it without refreshing)
    loadRooms();
    setInterval(loadRooms, 10000);
  </script>
</body>
</html>`);
});

// ── API Routes ────────────────────────────────────────────────────────────────

// GET /api/rooms — list all active rooms (ended_at IS NULL)
// Checks Redis cache first. If miss, queries PostgreSQL and caches the result.
app.get("/api/rooms", async (req, res) => {
  try {
    const cached = await redis.get("rooms:list");
    if (cached) {
      return res.json({ source: "redis-cache", rooms: JSON.parse(cached) });
    }

    // Cache miss — fetch from PostgreSQL
    // Only return active rooms (ended_at IS NULL means still running)
    const { rows } = await pool.query(
      "SELECT * FROM rooms WHERE ended_at IS NULL ORDER BY created_at DESC"
    );

    // Cache for 30 seconds — short TTL so new rooms appear quickly
    await redis.setex("rooms:list", 30, JSON.stringify(rows));
    res.json({ source: "postgres", rooms: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/rooms — create a new room
// Body: { "room_id": "team-standup" }
// Saves to PostgreSQL, then clears the Redis cache so the new room appears immediately
app.post("/api/rooms", async (req, res) => {
  const { room_id } = req.body;

  // Validate — room_id must be provided
  if (!room_id || !room_id.trim()) {
    return res.status(400).json({ error: "room_id is required" });
  }

  try {
    const { rows } = await pool.query(
      "INSERT INTO rooms (room_id) VALUES ($1) RETURNING *",
      [room_id.trim()]
    );

    // Clear the cache — if we don't, the old list (without the new room)
    // would be served for up to 30 seconds
    await redis.del("rooms:list");

    res.status(201).json({ room: rows[0] });
  } catch (e) {
    // PostgreSQL error code 23505 = unique_violation (room_id already exists)
    if (e.code === "23505") {
      return res.status(409).json({ error: "Room already exists" });
    }
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/rooms/:id/end — end a room by setting ended_at to now
// The room stays in the DB (for history) but disappears from the active list
app.patch("/api/rooms/:id/end", async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      "UPDATE rooms SET ended_at = NOW() WHERE id = $1 RETURNING *",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Clear cache so the ended room disappears immediately from the list
    await redis.del("rooms:list");

    res.json({ room: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Health Routes ─────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "samvyo-api",
    pid: process.pid,
    uptime_s: Math.floor(process.uptime()),
    time: new Date().toISOString(),
  });
});

app.get("/health/db", async (req, res) => {
  const t = Date.now();
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", latency_ms: Date.now() - t });
  } catch (e) {
    res.status(503).json({ status: "error", error: e.message });
  }
});

app.get("/health/redis", async (req, res) => {
  const t = Date.now();
  try {
    const pong = await redis.ping();
    res.json({ status: "ok", latency_ms: Date.now() - t, reply: pong });
  } catch (e) {
    res.status(503).json({ status: "error", error: e.message });
  }
});

// GET /health/full — checks all services at once
// Used by Nginx upstream health checks in Day 6
app.get("/health/full", async (req, res) => {
  const results = { app: "ok", db: null, redis: null };

  // Check PostgreSQL
  const dbStart = Date.now();
  try {
    await pool.query("SELECT 1");
    results.db = { status: "ok", latency_ms: Date.now() - dbStart };
  } catch (e) {
    results.db = { status: "error", error: e.message };
  }

  // Check Redis
  const redisStart = Date.now();
  try {
    await redis.ping();
    results.redis = { status: "ok", latency_ms: Date.now() - redisStart };
  } catch (e) {
    results.redis = { status: "error", error: e.message };
  }

  // If any service is down, return 503 so Nginx knows this instance is unhealthy
  const allHealthy = results.db.status === "ok" && results.redis.status === "ok";
  res.status(allHealthy ? 200 : 503).json(results);
});

// ── Start ─────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`samvyo-api worker ${process.pid} → port ${PORT}`);
  if (process.send) process.send("ready");
});

const shutdown = () =>
  server.close(() => {
    pool.end();
    redis.quit();
    process.exit(0);
  });
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
