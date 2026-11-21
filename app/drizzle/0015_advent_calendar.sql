CREATE TABLE IF NOT EXISTS "advent_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"title" varchar(160) NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "advent_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calendar_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"title" varchar(160),
	"is_main" boolean DEFAULT false NOT NULL,
	"hint" text,
	"hint_photo_path" text,
	"code" varchar(80),
	"pattern_id" uuid,
	"yarns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"message" text,
	"opened_at" timestamp with time zone,
	"opened_pattern_id" uuid,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "advent_calendars" ADD CONSTRAINT "advent_calendars_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "advent_calendars" ADD CONSTRAINT "advent_calendars_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "advent_days" ADD CONSTRAINT "advent_days_calendar_id_advent_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."advent_calendars"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "advent_days" ADD CONSTRAINT "advent_days_pattern_id_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."patterns"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "advent_days" ADD CONSTRAINT "advent_days_opened_pattern_id_patterns_id_fk" FOREIGN KEY ("opened_pattern_id") REFERENCES "public"."patterns"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "advent_calendars_recipient_year_idx" ON "advent_calendars" USING btree ("recipient_id","year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advent_calendars_owner_idx" ON "advent_calendars" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "advent_days_calendar_day_idx" ON "advent_days" USING btree ("calendar_id","day");