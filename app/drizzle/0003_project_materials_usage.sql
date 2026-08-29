CREATE TABLE "project_fabrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"fabric_id" uuid,
	"length_used_cm" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_fabrics" ADD CONSTRAINT "project_fabrics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_fabrics" ADD CONSTRAINT "project_fabrics_fabric_id_fabrics_id_fk" FOREIGN KEY ("fabric_id") REFERENCES "public"."fabrics"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "project_fabrics_project_idx" ON "project_fabrics" USING btree ("project_id");
