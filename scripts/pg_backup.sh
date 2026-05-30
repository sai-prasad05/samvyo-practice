#!/bin/bash
# ── pg_backup.sh — Automated PostgreSQL backup script ─────────────────────────
#
# WHAT THIS DOES:
# 1. Dumps the entire samvyo database into a SQL file
# 2. Compresses it with gzip (reduces size by ~90%)
# 3. Saves it to /opt/samvyo/backups/ on the server
# 4. Deletes backups older than 7 days (prevents disk from filling up)
#
# HOW TO RUN MANUALLY (test it):
#   sudo /opt/samvyo/scripts/pg_backup.sh
#
# HOW IT RUNS AUTOMATICALLY:
#   A cron job calls this script every day at 2:00 AM (Step 5)
#
# set -euo pipefail means:
#   -e = stop immediately if any command fails
#   -u = treat unset variables as errors
#   -o pipefail = if any command in a pipe fails, the whole pipe fails
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
TIMESTAMP=$(date +%Y%m%d_%H%M%S)        # e.g. 20260530_020000
BACKUP_FILE="samvyo_${TIMESTAMP}.sql.gz" # e.g. samvyo_20260530_020000.sql.gz
BACKUP_DIR="/opt/samvyo/backups"         # where backups are stored on the server
RETENTION_DAYS=7                         # delete local backups older than 7 days
DB_CONTAINER="samvyo-postgres-1"         # must match: docker compose ps

# ── Create backup directory if it doesn't exist ───────────────────────────────
mkdir -p "$BACKUP_DIR"

echo "==> [$(date)] Starting backup: ${BACKUP_FILE}"

# ── Run pg_dump inside the postgres container ─────────────────────────────────
# "docker exec" runs a command inside a running container.
# "pg_dump" exports the entire database as SQL statements.
# "| gzip" pipes the output directly into gzip compression.
# ">" writes the compressed output to our backup file.
#
# --no-owner       = don't include ownership commands (cleaner restore)
# --no-privileges  = don't include GRANT/REVOKE (simpler to restore on any server)
docker exec "$DB_CONTAINER" pg_dump \
  -U samvyo \
  -d samvyo \
  --no-owner \
  --no-privileges \
  | gzip > "${BACKUP_DIR}/${BACKUP_FILE}"

# ── Verify backup was created and is not empty ────────────────────────────────
if [ ! -s "${BACKUP_DIR}/${BACKUP_FILE}" ]; then
  echo "ERROR: Backup file is empty or missing. Something went wrong."
  exit 1
fi

BACKUP_SIZE=$(du -sh "${BACKUP_DIR}/${BACKUP_FILE}" | cut -f1)
echo "==> Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})"

# ── Delete old local backups ──────────────────────────────────────────────────
# "find" looks for .sql.gz files older than RETENTION_DAYS days and deletes them.
# Without this, every daily backup accumulates → disk fills up in weeks.
DELETED=$(find "$BACKUP_DIR" -name "*.sql.gz" -mtime +${RETENTION_DAYS} -print -delete | wc -l)
echo "==> Deleted ${DELETED} backup(s) older than ${RETENTION_DAYS} days"

# ── List current backups ───────────────────────────────────────────────────────
echo "==> Current backups in ${BACKUP_DIR}:"
ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "   (none)"

echo "==> [$(date)] Backup complete."

# ── NOTE: Production upgrade (Day 6-7) ────────────────────────────────────────
# In production, add these lines after the backup to upload to S3:
#
#   aws s3 cp "${BACKUP_DIR}/${BACKUP_FILE}" \
#     "s3://samvyo-backups/postgres/${BACKUP_FILE}" \
#     --storage-class STANDARD_IA
#
# STANDARD_IA = Infrequent Access storage class (~40% cheaper than standard).
# Backups are rarely read — this is the right storage class for them.
