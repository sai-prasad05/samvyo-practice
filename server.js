const express = require("express");
const { Pool } = require("pg");
const Redis = require("ioredis");

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Redis connection
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  lazyConnect: true,
  retryStrategy: () => 2000,
});

// ── Routes ───────────────────────────────────────────────────

// / — demo homepage shown when someone visits the domain in a browser
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Samvyo API — Test Environment</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0f1117;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .card {
      background: #1a1d27;
      border: 1px solid #2d3148;
      border-radius: 16px;
      padding: 48px;
      max-width: 560px;
      width: 90%;
      text-align: center;
    }

    .badge {
      display: inline-block;
      background: #1a3a2a;
      color: #4ade80;
      border: 1px solid #4ade80;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 1px;
      padding: 4px 12px;
      border-radius: 99px;
      margin-bottom: 24px;
      text-transform: uppercase;
    }

    h1 {
      font-size: 32px;
      font-weight: 700;
      color: #f8fafc;
      margin-bottom: 8px;
    }

    .subtitle {
      color: #64748b;
      font-size: 15px;
      margin-bottom: 40px;
    }

    .endpoints {
      display: flex;
      flex-direction: column;
      gap: 12px;
      text-align: left;
    }

    .endpoint {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #0f1117;
      border: 1px solid #2d3148;
      border-radius: 10px;
      padding: 14px 18px;
      text-decoration: none;
      transition: border-color 0.2s;
    }

    .endpoint:hover { border-color: #6366f1; }

    .endpoint-left { display: flex; align-items: center; gap: 12px; }

    .dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: #4ade80;
      flex-shrink: 0;
    }

    .endpoint-path {
      font-family: "SF Mono", "Fira Code", monospace;
      font-size: 14px;
      color: #a5b4fc;
    }

    .endpoint-desc {
      font-size: 13px;
      color: #475569;
    }

    .arrow { color: #334155; font-size: 16px; }

    .footer {
      margin-top: 36px;
      font-size: 12px;
      color: #334155;
    }

    .footer span { color: #4ade80; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">● Live — Test Environment</div>
    <h1>Samvyo API</h1>
    <p class="subtitle">Real-time communications platform — v3 test server</p>

    <div class="endpoints">
      <a href="/health" class="endpoint">
        <div class="endpoint-left">
          <div class="dot"></div>
          <div>
            <div class="endpoint-path">GET /health</div>
            <div class="endpoint-desc">App status, uptime, process ID</div>
          </div>
        </div>
        <span class="arrow">→</span>
      </a>

      <a href="/health/db" class="endpoint">
        <div class="endpoint-left">
          <div class="dot"></div>
          <div>
            <div class="endpoint-path">GET /health/db</div>
            <div class="endpoint-desc">PostgreSQL connection latency</div>
          </div>
        </div>
        <span class="arrow">→</span>
      </a>

      <a href="/health/redis" class="endpoint">
        <div class="endpoint-left">
          <div class="dot"></div>
          <div>
            <div class="endpoint-path">GET /health/redis</div>
            <div class="endpoint-desc">Redis connection latency</div>
          </div>
        </div>
        <span class="arrow">→</span>
      </a>

      <a href="/api/rooms" class="endpoint">
        <div class="endpoint-left">
          <div class="dot"></div>
          <div>
            <div class="endpoint-path">GET /api/rooms</div>
            <div class="endpoint-desc">Active rooms — cached via Redis</div>
          </div>
        </div>
        <span class="arrow">→</span>
      </a>
    </div>

    <div class="footer">
      Running on <span>Node.js ${process.version}</span> ·
      Uptime <span>${Math.floor(process.uptime() / 60)}m</span> ·
      PID <span>${process.pid}</span>
    </div>
  </div>
</body>
</html>`);
});

// /health — is the app alive?
app.get("/health", (req, res) => {
   
  res.json({
    status: "ok",
    service: "samvyo-api",
    pid: process.pid,
    uptime_s: Math.floor(process.uptime()),
    time: new Date().toISOString(),
  });
});

// /health/db — can we reach postgres?
app.get("/health/db", async (req, res) => {
  const t = Date.now();
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", latency_ms: Date.now() - t });
  } catch (e) {
    res.status(503).json({ status: "error", error: e.message });
  }
});

// /health/redis — can we reach redis?
app.get("/health/redis", async (req, res) => {
  const t = Date.now();
  try {
    const pong = await redis.ping();
    res.json({ status: "ok", latency_ms: Date.now() - t, reply: pong });
  } catch (e) {
    res.status(503).json({ status: "error", error: e.message });
  }
});

// /api/rooms — real query + redis cache
app.get("/api/rooms", async (req, res) => {
  try {
    const cached = await redis.get("rooms:list");
    if (cached) {
      return res.json({ source: "redis-cache", rooms: JSON.parse(cached) });
    }
    const { rows } = await pool.query(
      "SELECT * FROM rooms ORDER BY created_at DESC",
    );
    await redis.setex("rooms:list", 30, JSON.stringify(rows));
    res.json({ source: "postgres", rooms: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Start ────────────────────────────────────────────────────
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
