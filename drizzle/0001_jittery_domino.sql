CREATE TABLE "chat_interrupts" (
	"interrupt_id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"status" text NOT NULL,
	"requested_at" bigint NOT NULL,
	"resolved_at" bigint,
	"payload" jsonb NOT NULL,
	"response" jsonb
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"position" integer NOT NULL,
	"role" text NOT NULL,
	"message_id" text,
	"message" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_thread_position_uq" UNIQUE("thread_id","position")
);
--> statement-breakpoint
CREATE TABLE "chat_metadata" (
	"namespace" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	CONSTRAINT "chat_metadata_namespace_key_pk" PRIMARY KEY("namespace","key")
);
--> statement-breakpoint
CREATE TABLE "chat_runs" (
	"run_id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"status" text NOT NULL,
	"started_at" bigint NOT NULL,
	"finished_at" bigint,
	"error" text,
	"error_code" text,
	"usage" jsonb,
	"sandbox_key" text,
	"detached_since" bigint,
	"cancel_requested" boolean,
	"driver_epoch" integer
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"thread_id" text PRIMARY KEY NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("thread_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_runs_status_detached_idx" ON "chat_runs" USING btree ("status","detached_since");--> statement-breakpoint
CREATE INDEX "chat_runs_thread_started_idx" ON "chat_runs" USING btree ("thread_id","started_at");