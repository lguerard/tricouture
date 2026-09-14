CREATE TYPE "public"."piece_status" AS ENUM('a_couper', 'coupe', 'cousu', 'fini');--> statement-breakpoint
ALTER TABLE "project_piece_progress" ADD COLUMN "status" "piece_status";--> statement-breakpoint
ALTER TABLE "project_piece_progress" ADD COLUMN "current_row" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_piece_progress" ADD COLUMN "total_rows" integer;