CREATE TABLE "reconciliation_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"day_id" uuid NOT NULL,
	"reconciliation_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"recorded" bigint NOT NULL,
	"target" bigint NOT NULL,
	"delta" bigint NOT NULL,
	"resulting_sale_id" uuid,
	CONSTRAINT "reconciliation_lines_bucket_uq" UNIQUE("reconciliation_id","account_id","channel"),
	CONSTRAINT "reconciliation_lines_sale_uq" UNIQUE("resulting_sale_id"),
	CONSTRAINT "reconciliation_lines_values" CHECK ("reconciliation_lines"."channel" in ('CASH','TRANSFER') and "reconciliation_lines"."target" between -9000000000000 and 9000000000000 and "reconciliation_lines"."delta" = "reconciliation_lines"."target"::numeric - "reconciliation_lines"."recorded" and "reconciliation_lines"."delta" between 0 and 9000000000000 and (("reconciliation_lines"."delta" = 0 and "reconciliation_lines"."resulting_sale_id" is null) or ("reconciliation_lines"."delta" > 0 and "reconciliation_lines"."resulting_sale_id" is not null)))
);
--> statement-breakpoint
CREATE TABLE "reconciliation_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"day_id" uuid NOT NULL,
	"base_revision" bigint NOT NULL,
	"day_revision" bigint NOT NULL,
	"reason" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "reconciliation_records_scope_uq" UNIQUE("business_id","store_id","day_id","id"),
	CONSTRAINT "reconciliation_records_values" CHECK ("reconciliation_records"."base_revision" >= 0 and "reconciliation_records"."day_revision" > "reconciliation_records"."base_revision" and length(trim("reconciliation_records"."reason")) between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "document_counters" DROP CONSTRAINT "document_counters_kind";--> statement-breakpoint
ALTER TABLE "sales" DROP CONSTRAINT "sales_kind";--> statement-breakpoint
ALTER TABLE "sales" DROP CONSTRAINT "sales_kind_details";--> statement-breakpoint
ALTER TABLE "reconciliation_lines" ADD CONSTRAINT "reconciliation_lines_record_fk" FOREIGN KEY ("business_id","store_id","day_id","reconciliation_id") REFERENCES "public"."reconciliation_records"("business_id","store_id","day_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_lines" ADD CONSTRAINT "reconciliation_lines_account_fk" FOREIGN KEY ("business_id","store_id","account_id") REFERENCES "public"."account_stores"("business_id","store_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_lines" ADD CONSTRAINT "reconciliation_lines_sale_fk" FOREIGN KEY ("business_id","store_id","day_id","resulting_sale_id") REFERENCES "public"."sales"("business_id","store_id","day_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_records" ADD CONSTRAINT "reconciliation_records_day_fk" FOREIGN KEY ("business_id","store_id","day_id") REFERENCES "public"."business_days"("business_id","store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_records" ADD CONSTRAINT "reconciliation_records_actor_fk" FOREIGN KEY ("business_id","created_by") REFERENCES "public"."business_memberships"("business_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reconciliation_records_history_idx" ON "reconciliation_records" USING btree ("day_id","occurred_at");--> statement-breakpoint
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_kind" CHECK ("document_counters"."kind" in ('POS','SUPPLEMENTAL','RECONCILIATION'));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_kind" CHECK ("sales"."kind" in ('POS','SUPPLEMENTAL','RECONCILIATION'));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_kind_details" CHECK (("sales"."kind" = 'POS' and "sales"."reason" is null) or ("sales"."kind" in ('SUPPLEMENTAL','RECONCILIATION') and "sales"."reason" is not null and length(trim("sales"."reason")) between 1 and 1000 and "sales"."discount" = 0));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_sale_posting() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF (sale.kind='POS' AND (n NOT BETWEEN 1 AND 100 OR total<>sale.gross))
    OR (sale.kind IN ('SUPPLEMENTAL','RECONCILIATION') AND n<>0) THEN
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
  IF sale.kind='RECONCILIATION' AND NOT EXISTS(SELECT 1 FROM reconciliation_lines WHERE resulting_sale_id=sale.id) THEN
    RAISE EXCEPTION 'reconciliation sale needs a source line' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION validate_reconciliation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid; r reconciliation_records%ROWTYPE; d business_days%ROWTYPE; n bigint; positives bigint;
BEGIN
  IF TG_TABLE_NAME='reconciliation_records' THEN target_id:=NEW.id; ELSE target_id:=NEW.reconciliation_id; END IF;
  SELECT * INTO r FROM reconciliation_records WHERE id=target_id;
  SELECT * INTO d FROM business_days WHERE id=r.day_id FOR UPDATE;
  SELECT count(*),count(*) FILTER (WHERE delta>0) INTO n,positives FROM reconciliation_lines WHERE reconciliation_id=r.id;
  IF n NOT BETWEEN 1 AND 100 OR d.state<>'OPEN' OR r.day_revision>d.revision
    OR r.day_revision<>r.base_revision+greatest(1,positives)
    OR (r.occurred_at AT TIME ZONE 'Asia/Bangkok')::date<>d.business_date OR r.occurred_at>clock_timestamp() THEN
    RAISE EXCEPTION 'reconciliation header mismatch' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM reconciliation_lines l JOIN financial_accounts a ON a.id=l.account_id
    LEFT JOIN sales s ON s.id=l.resulting_sale_id WHERE l.reconciliation_id=r.id AND (
      (l.channel='CASH' AND a.type<>'CASH') OR (l.channel='TRANSFER' AND a.type<>'BANK')
      OR l.recorded<>(SELECT coalesce(sum(p.amount),0) FROM sale_payments p JOIN sales prior_sale ON prior_sale.id=p.sale_id
        WHERE p.day_id=r.day_id AND p.account_id=l.account_id AND p.channel=l.channel AND prior_sale.day_revision<=r.base_revision)
      OR (l.delta>0 AND (s.kind<>'RECONCILIATION' OR s.net<>l.delta OR s.discount<>0 OR s.reason<>r.reason
        OR s.occurred_at<>r.occurred_at OR s.created_by<>r.created_by OR s.day_revision<=r.base_revision OR s.day_revision>r.day_revision
        OR (SELECT count(*) FROM sale_payments WHERE sale_id=s.id)<>1
        OR NOT EXISTS(SELECT 1 FROM sale_payments WHERE sale_id=s.id AND account_id=l.account_id AND channel=l.channel AND amount=l.delta))))) THEN
    RAISE EXCEPTION 'reconciliation line mismatch' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER reconciliation_records_guard AFTER INSERT ON reconciliation_records DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_reconciliation();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER reconciliation_lines_guard AFTER INSERT ON reconciliation_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_reconciliation();
