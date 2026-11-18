-- At most one OPEN incident per monitor.
--
-- Prisma cannot express partial indexes, so this is hand-written. It is the
-- database-level backstop for the incident state machine: if a bug or a race
-- between two engine ticks ever tries to open a second incident for a monitor
-- that is already down, the INSERT fails instead of silently duplicating.
CREATE UNIQUE INDEX "Incident_monitorId_open_key"
  ON "Incident" ("monitorId")
  WHERE "endedAt" IS NULL;
