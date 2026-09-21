CREATE TABLE IF NOT EXISTS "tag_color_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tag" varchar(160) NOT NULL,
	"bg" varchar(7) NOT NULL,
	"fg" varchar(7) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tag_color_overrides" ADD CONSTRAINT "tag_color_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tag_color_overrides_user_tag_idx" ON "tag_color_overrides" USING btree ("user_id","tag");