// ── ecosystem.config.js ────────────────────────────────────────────────────────
//
// WHAT THIS FILE IS:
// PM2's configuration file. PM2 is a Node.js process manager — it keeps your
// Node.js app alive, restarts it on crash, and in "cluster mode" it runs
// multiple copies of your app in parallel (one per CPU core).
//
// WHY THIS FILE EXISTS (Day 2 of training):
// Node.js is single-threaded. That means one Node.js process can only use
// ONE CPU core, no matter how many cores the server has.
// Example: A server with 4 cores running one Node.js process wastes 75% of CPU.
// PM2 cluster mode spawns 4 worker processes — all sharing port 3000 via the OS.
// Each request goes to a different worker. All 4 CPU cores are now used.
//
// WHY IS THIS IN THE REPO (not run ad-hoc):
// Running "pm2 start server.js" from the command line by hand is a bad practice.
// It's not reproducible — different people run different flags.
// This file is committed to git, so the exact same config runs everywhere:
// test server, production server, new onboarding intern.
//
// SCOPE: Dashboard application only.
// The signaling server (mediasoup) cannot use cluster mode because it holds
// native C++ handles (Router, Transport objects) in memory — those can't be
// shared between worker processes. The dashboard has no such constraint.

module.exports = {
  apps: [{
    // ── Identity ──────────────────────────────────────────────────────────────
    name: 'samvyo-dashboard',   // The name PM2 shows in "pm2 list" and "pm2 logs"
    script: './server.js',       // Which file to run (our Express app)

    // ── Cluster Mode ──────────────────────────────────────────────────────────
    exec_mode: 'cluster',
    // "cluster" = PM2 uses Node.js's built-in cluster module.
    // All workers share port 3000. The OS decides which worker gets each request.

    instances: 'max',
    // "max" = spawn one worker per available CPU core.
    // On the CEO's server (which has multiple cores), this uses all of them.
    // You can also write a number: instances: 2  (for a shared/smaller server)

    // ── Memory Safety ─────────────────────────────────────────────────────────
    max_memory_restart: '1G',
    // If a worker's memory grows past 1 GB, PM2 automatically restarts it.
    // WHY: Node.js apps can have memory leaks. Without this, a leaking worker
    // slowly eats RAM until the server crashes. This is a safety net.

    // ── Crash Recovery ────────────────────────────────────────────────────────
    exp_backoff_restart_delay: 100,
    // If a worker crashes, PM2 restarts it — but not instantly.
    // It waits 100ms, then 200ms, then 400ms, etc. (exponential backoff).
    // WHY: If a bad deploy causes every worker to crash immediately, without
    // backoff the workers restart in a tight loop consuming 100% CPU.
    // Backoff gives you time to fix and redeploy.

    // ── Readiness Signal ──────────────────────────────────────────────────────
    wait_ready: true,
    // PM2 does NOT route traffic to a worker until the worker signals it's ready.
    // The signal is: process.send('ready') — which is already in server.js.
    // WHY: Without this, PM2 sends requests to the worker BEFORE its database
    // connection pool is established → your first few requests get 500 errors.

    listen_timeout: 10000,
    // How long PM2 waits for the "ready" signal (10 seconds).
    // If the app doesn't call process.send('ready') within 10s, PM2 kills it
    // and tries again. This catches a hung startup.

    kill_timeout: 5000,
    // When PM2 needs to stop a worker (during a rolling restart or redeploy),
    // it sends SIGTERM first (graceful). The worker has 5 seconds to finish
    // in-flight requests and exit cleanly. After 5s, PM2 force-kills it.
    // server.js already handles SIGTERM — see the shutdown function there.

    // ── Environment Variables ─────────────────────────────────────────────────
    env_test: {
      // These values are injected when you run: pm2 start ecosystem.config.js --env test
      NODE_ENV: 'test',
      PORT: 3000,
    },
    env_production: {
      // These values are injected when you run: pm2 start ecosystem.config.js --env production
      // In production, the .env file on the server provides the DB and Redis passwords.
      NODE_ENV: 'production',
      PORT: 3000,
    },

    // ── Logging ───────────────────────────────────────────────────────────────
    merge_logs: true,
    // Combine logs from all workers into one stream instead of separate files.
    // Without this you'd have 4 separate log files (one per worker), harder to read.

    out_file: '/var/log/samvyo/dashboard-out.log',
    // Where stdout (console.log) from all workers goes.
    // NOTE: You must create this directory on the server: sudo mkdir -p /var/log/samvyo

    error_file: '/var/log/samvyo/dashboard-err.log',
    // Where stderr (console.error, uncaught exceptions) goes.
    // FIRST thing to check when a deploy breaks: tail -f /var/log/samvyo/dashboard-err.log

    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    // Add a timestamp to every log line.
    // Without this: "Server started on port 3000" — you don't know when.
    // With this: "2026-05-29 14:32:01 +0000 Server started on port 3000" — clear.
  }]
};

// ── PM2 Daily Commands (reference) ────────────────────────────────────────────
//
// Start the cluster (first time):
//   pm2 start ecosystem.config.js --env test
//
// Zero-downtime rolling restart (after a new deploy):
//   pm2 reload samvyo-dashboard
//   (PM2 restarts workers ONE at a time — traffic never drops)
//
// See all workers and their CPU/memory:
//   pm2 monit
//
// See live logs from all workers:
//   pm2 logs samvyo-dashboard --lines 200
//
// Save process list so it survives a server reboot:
//   pm2 save && pm2 startup
//
// Scale to a different number of workers (without restart):
//   pm2 scale samvyo-dashboard 2
