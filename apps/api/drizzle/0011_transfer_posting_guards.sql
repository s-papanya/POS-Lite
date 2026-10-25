CREATE FUNCTION validate_transfer_posting() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE target uuid; source account_transfers; sd business_days; dd business_days;
BEGIN
  IF TG_TABLE_NAME='account_transfers' THEN target:=NEW.id; ELSE target:=NEW.transfer_id; END IF;
  IF target IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO source FROM account_transfers WHERE id=target;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO sd FROM business_days WHERE id=source.source_day_id;
  SELECT * INTO dd FROM business_days WHERE id=source.destination_day_id;
  IF sd.state<>'OPEN' OR dd.state<>'OPEN' OR sd.revision<1 OR dd.revision<1
    OR sd.business_date<>(clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date OR dd.business_date<>sd.business_date
    OR (source.occurred_at AT TIME ZONE 'Asia/Bangkok')::date<>sd.business_date OR source.occurred_at>clock_timestamp()
    OR (SELECT count(*) FROM financial_accounts a JOIN account_openings o ON o.business_id=a.business_id AND o.account_id=a.id
      WHERE a.business_id=source.business_id AND a.id IN (source.source_account_id,source.destination_account_id) AND a.active AND o.cutover_at<=source.occurred_at)<>2
    OR (SELECT count(*) FROM money_movements WHERE transfer_id=source.id)<>2
    OR EXISTS(SELECT 1 FROM money_movements m WHERE m.transfer_id=source.id AND
      (m.created_by<>source.created_by OR m.store_id<>(CASE WHEN m.leg='OUT' THEN source.source_store_id ELSE source.destination_store_id END)
      OR m.day_id<>(CASE WHEN m.leg='OUT' THEN source.source_day_id ELSE source.destination_day_id END)
      OR m.account_id<>(CASE WHEN m.leg='OUT' THEN source.source_account_id ELSE source.destination_account_id END)
      OR m.delta<>(CASE WHEN m.leg='OUT' THEN -source.amount ELSE source.amount END))) THEN
    RAISE EXCEPTION 'invalid transfer posting' USING ERRCODE='23514';
  END IF;
  IF source.fee_amount>0 AND NOT EXISTS(SELECT 1 FROM expenses e JOIN expense_payments p ON p.expense_id=e.id
    JOIN expense_categories c ON c.business_id=e.business_id AND c.id=e.category_id
    WHERE e.id=source.fee_expense_id AND e.business_id=source.business_id AND e.store_id=source.source_store_id AND e.day_id=source.source_day_id
    AND e.amount=source.fee_amount AND e.occurred_at=source.occurred_at AND e.created_by=source.created_by AND e.description=source.reason AND c.name='ค่าธรรมเนียม'
    AND p.day_id=source.source_day_id AND p.account_id=source.source_account_id AND p.amount=source.fee_amount AND p.occurred_at=source.occurred_at AND p.created_by=source.created_by) THEN
    RAISE EXCEPTION 'invalid transfer fee posting' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER account_transfers_posting_guard AFTER INSERT ON account_transfers DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_transfer_posting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER transfer_movements_posting_guard AFTER INSERT ON money_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_transfer_posting();
