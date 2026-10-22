CREATE TABLE "document_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"kind" text NOT NULL,
	"next_number" bigint NOT NULL,
	CONSTRAINT "document_counters_scope_uq" UNIQUE("business_id","store_id","business_date","kind"),
	CONSTRAINT "document_counters_number" CHECK ("document_counters"."next_number" > 0),
	CONSTRAINT "document_counters_kind" CHECK ("document_counters"."kind" = 'POS')
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"product_id" uuid NOT NULL,
	"name_snapshot" text NOT NULL,
	"unit_price" bigint NOT NULL,
	"product_version" integer NOT NULL,
	"quantity" integer NOT NULL,
	"line_total" bigint NOT NULL,
	CONSTRAINT "sale_items_position_uq" UNIQUE("sale_id","position"),
	CONSTRAINT "sale_items_product_uq" UNIQUE("sale_id","product_id"),
	CONSTRAINT "sale_items_values" CHECK ("sale_items"."position" between 0 and 99 and "sale_items"."quantity" between 1 and 999 and "sale_items"."product_version" > 0 and length(trim("sale_items"."name_snapshot")) between 1 and 120 and "sale_items"."unit_price" > 0 and "sale_items"."line_total" = "sale_items"."unit_price"::numeric * "sale_items"."quantity" and "sale_items"."line_total" <= 9000000000000)
);
--> statement-breakpoint
CREATE TABLE "sale_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"day_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"amount" bigint NOT NULL,
	"tendered" bigint,
	"change" bigint,
	CONSTRAINT "sale_payments_scope_uq" UNIQUE("business_id","store_id","day_id","account_id","id"),
	CONSTRAINT "sale_payments_account_uq" UNIQUE("sale_id","account_id"),
	CONSTRAINT "sale_payments_amount" CHECK ("sale_payments"."amount" > 0 and "sale_payments"."amount" <= 9000000000000),
	CONSTRAINT "sale_payments_channel" CHECK (("sale_payments"."channel" = 'CASH' and "sale_payments"."tendered" is not null and "sale_payments"."change" is not null and "sale_payments"."tendered" between "sale_payments"."amount" and 9000000000000 and "sale_payments"."change" = "sale_payments"."tendered" - "sale_payments"."amount") or ("sale_payments"."channel" = 'TRANSFER' and "sale_payments"."tendered" is null and "sale_payments"."change" is null))
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"day_id" uuid NOT NULL,
	"kind" text DEFAULT 'POS' NOT NULL,
	"reference" text NOT NULL,
	"gross" bigint NOT NULL,
	"discount" bigint NOT NULL,
	"net" bigint NOT NULL,
	"day_revision" bigint NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "sales_scope_uq" UNIQUE("business_id","store_id","id"),
	CONSTRAINT "sales_day_scope_uq" UNIQUE("business_id","store_id","day_id","id"),
	CONSTRAINT "sales_reference_uq" UNIQUE("business_id","store_id","reference"),
	CONSTRAINT "sales_revision_uq" UNIQUE("day_id","day_revision"),
	CONSTRAINT "sales_amounts" CHECK ("sales"."gross" > 0 and "sales"."gross" <= 9000000000000 and "sales"."discount" between 0 and "sales"."gross" and "sales"."net" = "sales"."gross" - "sales"."discount" and "sales"."net" > 0),
	CONSTRAINT "sales_kind" CHECK ("sales"."kind" = 'POS'),
	CONSTRAINT "sales_revision" CHECK ("sales"."day_revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "money_movements" ALTER COLUMN "account_opening_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "money_movements" ADD COLUMN "sale_payment_id" uuid;--> statement-breakpoint
ALTER TABLE "money_movements" ADD COLUMN "day_id" uuid;--> statement-breakpoint
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_store_fk" FOREIGN KEY ("business_id","store_id") REFERENCES "public"."stores"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_fk" FOREIGN KEY ("business_id","store_id","sale_id") REFERENCES "public"."sales"("business_id","store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_fk" FOREIGN KEY ("business_id","store_id","product_id") REFERENCES "public"."products"("business_id","store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_fk" FOREIGN KEY ("business_id","store_id","day_id","sale_id") REFERENCES "public"."sales"("business_id","store_id","day_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_mapping_fk" FOREIGN KEY ("business_id","store_id","account_id") REFERENCES "public"."account_stores"("business_id","store_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_day_fk" FOREIGN KEY ("business_id","store_id","day_id") REFERENCES "public"."business_days"("business_id","store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_actor_fk" FOREIGN KEY ("business_id","created_by") REFERENCES "public"."business_memberships"("business_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_history_idx" ON "sales" USING btree ("business_id","store_id","occurred_at","id");--> statement-breakpoint
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_payment_fk" FOREIGN KEY ("business_id","store_id","day_id","account_id","sale_payment_id") REFERENCES "public"."sale_payments"("business_id","store_id","day_id","account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_payment_uq" UNIQUE("sale_payment_id");--> statement-breakpoint
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_source" CHECK (("money_movements"."account_opening_id" is not null and "money_movements"."sale_payment_id" is null and "money_movements"."day_id" is null) or ("money_movements"."account_opening_id" is null and "money_movements"."sale_payment_id" is not null and "money_movements"."day_id" is not null));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_day_opening() RETURNS trigger LANGUAGE plpgsql AS $$
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
      OR s.amount<>(SELECT coalesce(sum(delta),0) FROM money_movements WHERE business_id=d.business_id AND account_id=s.account_id AND day_id IS DISTINCT FROM d.id))) THEN
    RAISE EXCEPTION 'day opening snapshot is incomplete or inconsistent' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION validate_sale_posting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; sale sales%ROWTYPE; d business_days%ROWTYPE; n bigint; total numeric;
BEGIN
  IF TG_TABLE_NAME='sales' THEN target:=NEW.id;
  ELSIF TG_TABLE_NAME='money_movements' THEN
    IF NEW.sale_payment_id IS NULL THEN RETURN NULL; END IF;
    SELECT sale_id INTO target FROM sale_payments WHERE id=NEW.sale_payment_id;
  ELSE target:=NEW.sale_id; END IF;
  SELECT * INTO sale FROM sales WHERE id=target;
  SELECT * INTO d FROM business_days WHERE id=sale.day_id FOR UPDATE;
  IF d.state<>'OPEN' OR (sale.occurred_at AT TIME ZONE 'Asia/Bangkok')::date<>d.business_date
    OR sale.occurred_at>clock_timestamp() OR sale.day_revision>d.revision THEN
    RAISE EXCEPTION 'sale day mismatch' USING ERRCODE='23514'; END IF;
  SELECT count(*),coalesce(sum(line_total),0) INTO n,total FROM sale_items WHERE sale_id=target;
  IF n NOT BETWEEN 1 AND 100 OR total<>sale.gross THEN
    RAISE EXCEPTION 'sale item totals mismatch' USING ERRCODE='23514'; END IF;
  SELECT count(*),coalesce(sum(amount),0) INTO n,total FROM sale_payments WHERE sale_id=target;
  IF n NOT BETWEEN 1 AND 100 OR total<>sale.net THEN
    RAISE EXCEPTION 'sale payment totals mismatch' USING ERRCODE='23514'; END IF;
  PERFORM a.id FROM financial_accounts a JOIN sale_payments p ON p.account_id=a.id WHERE p.sale_id=target ORDER BY a.id FOR UPDATE OF a;
  IF EXISTS(SELECT 1 FROM sale_payments p JOIN financial_accounts a ON a.id=p.account_id
    WHERE p.sale_id=target AND (NOT a.active OR (p.channel='CASH' AND a.type<>'CASH') OR (p.channel='TRANSFER' AND a.type<>'BANK')
      OR NOT EXISTS(SELECT 1 FROM account_openings o WHERE o.account_id=a.id AND o.cutover_at<=sale.occurred_at)
      OR (SELECT count(*) FROM money_movements m WHERE m.sale_payment_id=p.id)<>1
      OR EXISTS(SELECT 1 FROM money_movements m WHERE m.sale_payment_id=p.id AND (m.delta<>p.amount OR m.created_by<>sale.created_by)))) THEN
    RAISE EXCEPTION 'sale posting mismatch' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER sales_posting_guard AFTER INSERT ON sales DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_sale_posting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER sale_items_posting_guard AFTER INSERT ON sale_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_sale_posting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER sale_payments_posting_guard AFTER INSERT ON sale_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_sale_posting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER sale_movements_posting_guard AFTER INSERT ON money_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_sale_posting();
