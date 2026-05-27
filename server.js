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
