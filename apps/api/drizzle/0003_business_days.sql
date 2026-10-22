CREATE TABLE "business_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"state" text DEFAULT 'OPEN' NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"closing_version" integer DEFAULT 0 NOT NULL,
	"opened_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "business_days_date_uq" UNIQUE("business_id","store_id","business_date"),
	CONSTRAINT "business_days_scope_uq" UNIQUE("business_id","store_id","id"),
	CONSTRAINT "business_days_state" CHECK ("business_days"."state" in ('OPEN','CLOSED')),
	CONSTRAINT "business_days_revision" CHECK ("business_days"."revision" >= 0 and "business_days"."closing_version" >= 0),
	CONSTRAINT "business_days_date" CHECK ("business_days"."business_date" = ("business_days"."opened_at" AT TIME ZONE 'Asia/Bangkok')::date)
);
--> statement-breakpoint
CREATE TABLE "day_openings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"day_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "day_openings_account_uq" UNIQUE("day_id","account_id"),
	CONSTRAINT "day_openings_amount" CHECK ("day_openings"."amount" between 0 and 9000000000000)
);
--> statement-breakpoint
ALTER TABLE "business_days" ADD CONSTRAINT "business_days_store_fk" FOREIGN KEY ("business_id","store_id") REFERENCES "public"."stores"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_days" ADD CONSTRAINT "business_days_actor_fk" FOREIGN KEY ("business_id","created_by") REFERENCES "public"."business_memberships"("business_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_openings" ADD CONSTRAINT "day_openings_day_fk" FOREIGN KEY ("business_id","store_id","day_id") REFERENCES "public"."business_days"("business_id","store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_openings" ADD CONSTRAINT "day_openings_mapping_fk" FOREIGN KEY ("business_id","store_id","account_id") REFERENCES "public"."account_stores"("business_id","store_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_openings" ADD CONSTRAINT "day_openings_actor_fk" FOREIGN KEY ("business_id","created_by") REFERENCES "public"."business_memberships"("business_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "business_days_open_uq" ON "business_days" USING btree ("business_id","store_id") WHERE "business_days"."state" = 'OPEN';--> statement-breakpoint
CREATE FUNCTION validate_day_opening() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d business_days%ROWTYPE; target uuid;
BEGIN
  IF TG_TABLE_NAME='business_days' THEN target := NEW.id; ELSE target := NEW.day_id; END IF;
  SELECT * INTO d FROM business_days WHERE id=target;
  PERFORM a.id FROM financial_accounts a JOIN account_stores m ON m.business_id=a.business_id AND m.account_id=a.id
    WHERE a.business_id=d.business_id AND m.store_id=d.store_id AND a.active ORDER BY a.id FOR UPDATE OF a;
  IF d.state<>'OPEN' OR NOT EXISTS (SELECT 1 FROM account_stores m JOIN financial_accounts a ON a.business_id=m.business_id AND a.id=m.account_id
      WHERE m.business_id=d.business_id AND m.store_id=d.store_id AND a.active)
    OR EXISTS (SELECT 1 FROM account_stores m JOIN financial_accounts a ON a.business_id=m.business_id AND a.id=m.account_id
      WHERE m.business_id=d.business_id AND m.store_id=d.store_id AND a.active AND NOT EXISTS
      (SELECT 1 FROM account_openings o WHERE o.business_id=a.business_id AND o.account_id=a.id AND o.cutover_at<=d.opened_at))
    OR EXISTS (SELECT 1 FROM account_stores m JOIN financial_accounts a ON a.business_id=m.business_id AND a.id=m.account_id
      WHERE m.business_id=d.business_id AND m.store_id=d.store_id AND a.active AND a.type='CASH'
      AND NOT EXISTS(SELECT 1 FROM day_openings s WHERE s.day_id=d.id AND s.account_id=a.id))
    OR EXISTS (SELECT 1 FROM day_openings s JOIN financial_accounts a ON a.business_id=s.business_id AND a.id=s.account_id
      WHERE s.day_id=d.id AND (a.type<>'CASH' OR NOT a.active OR s.recorded_at<>d.opened_at OR s.created_by<>d.created_by
      OR s.amount<>(SELECT coalesce(sum(delta),0) FROM money_movements WHERE business_id=d.business_id AND account_id=s.account_id))) THEN
    RAISE EXCEPTION 'day opening snapshot is incomplete or inconsistent' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER business_days_opening_guard AFTER INSERT ON business_days DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_day_opening();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER day_openings_guard AFTER INSERT ON day_openings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_day_opening();
