CREATE TABLE IF NOT EXISTS "embroidery_designs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"image_path" text NOT NULL,
	"preview_path" text NOT NULL,
	"pes_path" text NOT NULL,
	"settings" jsonb NOT NULL,
	"threads" jsonb NOT NULL,
	"width_mm" real NOT NULL,
	"height_mm" real NOT NULL,
	"stitch_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "embroidery_designs" ADD CONSTRAINT "embroidery_designs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embroidery_designs_owner_idx" ON "embroidery_designs" USING btree ("owner_id","updated_at");