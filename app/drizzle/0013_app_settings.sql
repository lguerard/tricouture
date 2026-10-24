CREATE TABLE IF NOT EXISTS "app_settings" (
	"key" varchar(80) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
