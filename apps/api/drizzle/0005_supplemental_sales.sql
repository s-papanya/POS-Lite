ALTER TABLE "document_counters" DROP CONSTRAINT "document_counters_kind";
--> statement-breakpoint
ALTER TABLE "sales" DROP CONSTRAINT "sales_kind";
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "reason" text;
--> statement-breakpoint
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_kind" CHECK (kind IN ('POS','SUPPLEMENTAL'));
--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_kind_details" CHECK
  ((kind='POS' AND reason IS NULL) OR (kind='SUPPLEMENTAL' AND reason IS NOT NULL AND length(trim(reason)) BETWEEN 1 AND 1000 AND discount=0));
--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_kind" CHECK (kind IN ('POS','SUPPLEMENTAL'));
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
    OR (sale.kind='SUPPLEMENTAL' AND n<>0) THEN
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
