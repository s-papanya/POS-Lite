CREATE TABLE "expense_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"day_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "expense_payments_scope_uq" UNIQUE("business_id","store_id","day_id","account_id","id"),
	CONSTRAINT "expense_payments_expense_uq" UNIQUE("expense_id"),
	CONSTRAINT "expense_payments_amount" CHECK ("expense_payments"."amount" between 1 and 9000000000000)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"day_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"description" text NOT NULL,
	"evidence_reference" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "expenses_scope_uq" UNIQUE("business_id","store_id","id"),
	CONSTRAINT "expenses_amount" CHECK ("expenses"."amount" between 1 and 9000000000000),
	CONSTRAINT "expenses_description" CHECK (length(trim("expenses"."description")) between 1 and 1000),
	CONSTRAINT "expenses_evidence" CHECK ("expenses"."evidence_reference" is null or length(trim("expenses"."evidence_reference")) between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "money_movements" DROP CONSTRAINT "money_movements_source";--> statement-breakpoint
ALTER TABLE "money_movements" DROP CONSTRAINT "money_movements_delta";--> statement-breakpoint
ALTER TABLE "money_movements" ADD COLUMN "expense_payment_id" uuid;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_expense_fk" FOREIGN KEY ("business_id","store_id","expense_id") REFERENCES "public"."expenses"("business_id","store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_day_fk" FOREIGN KEY ("business_id","store_id","day_id") REFERENCES "public"."business_days"("business_id","store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_account_fk" FOREIGN KEY ("business_id","store_id","account_id") REFERENCES "public"."account_stores"("business_id","store_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_actor_fk" FOREIGN KEY ("business_id","created_by") REFERENCES "public"."business_memberships"("business_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_day_fk" FOREIGN KEY ("business_id","store_id","day_id") REFERENCES "public"."business_days"("business_id","store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_fk" FOREIGN KEY ("business_id","category_id") REFERENCES "public"."expense_categories"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_actor_fk" FOREIGN KEY ("business_id","created_by") REFERENCES "public"."business_memberships"("business_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_listing_idx" ON "expenses" USING btree ("business_id","store_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("business_id","category_id");--> statement-breakpoint
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_expense_fk" FOREIGN KEY ("business_id","store_id","day_id","account_id","expense_payment_id") REFERENCES "public"."expense_payments"("business_id","store_id","day_id","account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_expense_uq" UNIQUE("expense_payment_id");--> statement-breakpoint
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_source" CHECK (num_nonnulls("money_movements"."account_opening_id","money_movements"."sale_payment_id","money_movements"."expense_payment_id")=1 and (("money_movements"."account_opening_id" is not null and "money_movements"."day_id" is null) or ("money_movements"."account_opening_id" is null and "money_movements"."day_id" is not null)));--> statement-breakpoint
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_delta" CHECK (("money_movements"."expense_payment_id" is not null and "money_movements"."delta" between -9000000000000 and -1) or ("money_movements"."expense_payment_id" is null and "money_movements"."delta" between 1 and 9000000000000));
--> statement-breakpoint
-- All writers, including direct SQL, serialize on the real account before reading its shared balance.
CREATE FUNCTION guard_movement_balance() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM 1 FROM financial_accounts WHERE business_id=NEW.business_id AND id=NEW.account_id FOR UPDATE;
  IF (SELECT coalesce(sum(delta),0) FROM money_movements WHERE business_id=NEW.business_id AND account_id=NEW.account_id)+NEW.delta<0 THEN
    RAISE EXCEPTION 'insufficient account funds' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER money_movements_balance_guard BEFORE INSERT ON money_movements FOR EACH ROW EXECUTE FUNCTION guard_movement_balance();
--> statement-breakpoint
CREATE FUNCTION validate_expense_posting() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE expense expenses; payment expense_payments; day business_days;
BEGIN
  IF TG_TABLE_NAME='expenses' THEN
    SELECT * INTO expense FROM expenses WHERE id=NEW.id;
    SELECT * INTO day FROM business_days WHERE id=expense.day_id;
    IF day.state<>'OPEN' OR day.revision<1 OR day.business_date<>(clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date
      OR (expense.occurred_at AT TIME ZONE 'Asia/Bangkok')::date<>day.business_date OR expense.occurred_at>clock_timestamp()
      OR NOT EXISTS(SELECT 1 FROM expense_categories WHERE id=expense.category_id AND business_id=expense.business_id AND active) THEN
      RAISE EXCEPTION 'invalid expense recognition' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
  END IF;
  IF TG_TABLE_NAME='money_movements' THEN
    IF NEW.expense_payment_id IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO payment FROM expense_payments WHERE id=NEW.expense_payment_id;
  ELSE
    SELECT * INTO payment FROM expense_payments WHERE id=NEW.id;
  END IF;
  IF payment.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO expense FROM expenses WHERE id=payment.expense_id;
  SELECT * INTO day FROM business_days WHERE id=payment.day_id;
  IF day.state<>'OPEN' OR day.revision<1 OR day.business_date<>(clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date
    OR (payment.occurred_at AT TIME ZONE 'Asia/Bangkok')::date<>day.business_date OR payment.occurred_at>clock_timestamp()
    OR payment.occurred_at<expense.occurred_at OR payment.amount<>expense.amount
    OR NOT EXISTS(SELECT 1 FROM financial_accounts a JOIN account_openings o ON o.business_id=a.business_id AND o.account_id=a.id
      WHERE a.id=payment.account_id AND a.business_id=payment.business_id AND a.active AND o.cutover_at<=payment.occurred_at)
    OR (SELECT count(*) FROM money_movements WHERE expense_payment_id=payment.id)<>1
    OR EXISTS(SELECT 1 FROM money_movements WHERE expense_payment_id=payment.id AND (delta<>-payment.amount OR created_by<>payment.created_by)) THEN
    RAISE EXCEPTION 'invalid expense payment posting' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER expenses_posting_guard AFTER INSERT ON expenses DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_expense_posting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER expense_payments_posting_guard AFTER INSERT ON expense_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_expense_posting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER expense_movements_posting_guard AFTER INSERT ON money_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_expense_posting();
--> statement-breakpoint
-- PostgreSQL row locking requires UPDATE on one column; the trigger still prohibits every rewrite.
CREATE FUNCTION protect_expense() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'expense history is immutable' USING ERRCODE='23514';
END; $$;
--> statement-breakpoint
CREATE TRIGGER expenses_immutable_guard BEFORE UPDATE OR DELETE ON expenses FOR EACH ROW EXECUTE FUNCTION protect_expense();
