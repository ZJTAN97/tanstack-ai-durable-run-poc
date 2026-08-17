-- Custom migration: what PowerSync needs from Postgres that drizzle-kit will
-- never generate, because none of it is table structure.
--
-- The publication is named `powersync` because the service looks for exactly
-- that name. It lists two tables rather than FOR ALL TABLES so the replication
-- slot never carries the transcript or the delivery log — one row per token
-- would swamp it, and no client is meant to read either (docs/adr/0001).

CREATE PUBLICATION powersync FOR TABLE "chat_threads", "chat_runs";
--> statement-breakpoint
-- Postgres' default replica identity puts only the primary key in the WAL for
-- an UPDATE or DELETE. FULL puts the whole old row there, which is what lets
-- the service work out which buckets a changed row is leaving as well as which
-- it is joining.
ALTER TABLE "chat_threads" REPLICA IDENTITY FULL;
--> statement-breakpoint
ALTER TABLE "chat_runs" REPLICA IDENTITY FULL;
