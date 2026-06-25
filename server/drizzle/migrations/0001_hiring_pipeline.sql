CREATE TYPE "public"."candidate_stage" AS ENUM('Applied', 'Assessment', 'Work Sample', 'Values Review', 'Interview Scheduled', 'Interviewed', 'Offered', 'Hired', 'Rejected');
--> statement-breakpoint
CREATE TYPE "public"."requisition_status" AS ENUM('Draft', 'Pending Approval', 'Approved', 'Open', 'On Hold', 'Closed');
--> statement-breakpoint
CREATE TYPE "public"."jd_status" AS ENUM('Draft', 'Published', 'Closed');
--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
CREATE TABLE "job_requisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department" varchar(200) NOT NULL,
	"hiring_manager" varchar(200) NOT NULL,
	"num_openings" integer DEFAULT 1 NOT NULL,
	"employment_type" varchar(50) DEFAULT 'Full-Time' NOT NULL,
	"location" varchar(200),
	"remote" boolean DEFAULT false NOT NULL,
	"target_start_date" timestamp with time zone,
	"salary_min" integer,
	"salary_max" integer,
	"reason" text,
	"priority" varchar(20) DEFAULT 'Medium' NOT NULL,
	"status" "requisition_status" DEFAULT 'Draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_descriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"req_id" uuid NOT NULL,
	"job_title" varchar(300) NOT NULL,
	"summary" text,
	"responsibilities" text,
	"required_qualifications" text,
	"preferred_qualifications" text,
	"ccat_threshold" integer DEFAULT 30 NOT NULL,
	"epp_values" jsonb DEFAULT '[]',
	"work_sample_instructions" text,
	"status" "jd_status" DEFAULT 'Draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jd_id" uuid,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"email" varchar(300) NOT NULL,
	"phone" varchar(50),
	"linkedin_url" text,
	"resume_url" text,
	"source" varchar(100),
	"current_stage" "candidate_stage" DEFAULT 'Applied' NOT NULL,
	"rejection_reason" text,
	"criteria_corp_id" varchar(100),
	"ccat_score" integer,
	"epp_profile" jsonb,
	"epp_values_match_score" integer,
	"work_sample_score" integer,
	"resume_review_score" integer,
	"reference_check_score" integer,
	"interviewer_name" varchar(200),
	"zoom_meeting_id" varchar(100),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"from_stage" "candidate_stage",
	"to_stage" "candidate_stage" NOT NULL,
	"changed_by" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"recipient" varchar(300) NOT NULL,
	"template" varchar(100) NOT NULL,
	"subject" varchar(500),
	"status" "email_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_requisitions" ADD CONSTRAINT "job_requisitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "job_descriptions" ADD CONSTRAINT "job_descriptions_req_id_job_requisitions_id_fk" FOREIGN KEY ("req_id") REFERENCES "public"."job_requisitions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_jd_id_job_descriptions_id_fk" FOREIGN KEY ("jd_id") REFERENCES "public"."job_descriptions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "candidate_stage_history" ADD CONSTRAINT "candidate_stage_history_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "candidate_stage_history" ADD CONSTRAINT "candidate_stage_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_candidates_jd_id" ON "candidates" USING btree ("jd_id");
--> statement-breakpoint
CREATE INDEX "idx_candidates_stage" ON "candidates" USING btree ("current_stage");
--> statement-breakpoint
CREATE INDEX "idx_stage_history_candidate" ON "candidate_stage_history" USING btree ("candidate_id");
--> statement-breakpoint
CREATE INDEX "idx_email_log_candidate" ON "email_log" USING btree ("candidate_id");
--> statement-breakpoint
CREATE INDEX "idx_job_descriptions_req_id" ON "job_descriptions" USING btree ("req_id");
