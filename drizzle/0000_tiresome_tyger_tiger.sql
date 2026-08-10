CREATE TABLE "delivery_log_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"chunk" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_logs" (
	"run_id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "delivery_log_events" ADD CONSTRAINT "delivery_log_events_run_id_delivery_logs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."delivery_logs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_log_events_run_id_id_idx" ON "delivery_log_events" USING btree ("run_id","id");