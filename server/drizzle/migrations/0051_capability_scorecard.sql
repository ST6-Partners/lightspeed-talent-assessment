-- Capability scorecard section: teachability enum + capability_items + candidate_capability_scores.
-- Idempotent so migrate-on-boot is safe to re-run.

DO $$ BEGIN
  CREATE TYPE "public"."teachability" AS ENUM('hard_to_teach', 'compound', 'learnable');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "capability_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"teachability" "teachability" DEFAULT 'compound' NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_capability_item_name" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidate_capability_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"capability_item_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_review_capability_item" UNIQUE("review_id","capability_item_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "candidate_capability_scores" ADD CONSTRAINT "candidate_capability_scores_review_id_value_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."value_reviews"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "candidate_capability_scores" ADD CONSTRAINT "candidate_capability_scores_capability_item_id_capability_items_id_fk" FOREIGN KEY ("capability_item_id") REFERENCES "public"."capability_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_capability_scores_review" ON "candidate_capability_scores" USING btree ("review_id");
--> statement-breakpoint
-- Seed the four Capability items (idempotent). Values stays its own section; these are the rolled-up non-Values categories.
INSERT INTO "capability_items" ("name","teachability","description","sort_order") VALUES
  ('Leadership experience','hard_to_teach','Track record of leading people and work.',1),
  ('Behavioral competencies','compound','How they work and behave — the soft skills.',2),
  ('Functional competencies','learnable','The actual job skills for the role.',3),
  ('Outcomes','compound','Whether they can deliver the results this role needs.',4)
ON CONFLICT ("name") DO NOTHING;
