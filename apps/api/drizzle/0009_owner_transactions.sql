CREATE TABLE "owner_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"day_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" bigint NOT NULL,
	"note" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "owner_transactions_scope_uq" UNIQUE("business_id","store_id","day_id","account_id","id"),
	CONSTRAINT "owner_transactions_kind" CHECK ("owner_transactions"."kind" in ('CONTRIBUTION','WITHDRAWAL')),
	CONSTRAINT "owner_transactions_amount" CHECK ("owner_transactions"."amount" between 1 and 9000000000000),
	CONSTRAINT "owner_transactions_note" CHECK (length(trim("owner_transactions"."note")) between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "money_movements" DROP CONSTRAINT "money_movements_source";--> statement-breakpoint
ALTER TABLE "money_movements" DROP CONSTRAINT "money_movements_delta";--> statement-breakpoint
ALTER TABLE "money_movements" ADD COLUMN "owner_transaction_id" uuid;--> statement-breakpoint
ALTER TABLE "owner_transactions" ADD CONSTRAINT "owner_transactions_day_fk" FOREIGN KEY ("business_id","store_id","day_id") REFERENCES "public"."business_days"("business_id","store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_transactions" ADD CONSTRAINT "owner_transactions_account_fk" FOREIGN KEY ("business_id","store_id","account_id") REFERENCES "public"."account_stores"("business_id","store_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_transactions" ADD CONSTRAINT "owner_transactions_actor_fk" FOREIGN KEY ("business_id","created_by") REFERENCES "public"."business_memberships"("business_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "owner_transactions_day_idx" ON "owner_transactions" USING btree ("business_id","store_id","day_id");--> statement-breakpoint
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_owner_fk" FOREIGN KEY ("business_id","store_id","day_id","account_id","owner_transaction_id") REFERENCES "public"."owner_transactions"("business_id","store_id","day_id","account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_owner_uq" UNIQUE("owner_transaction_id");--> statement-breakpoint
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_source" CHECK (num_nonnulls("money_movements"."account_opening_id","money_movements"."sale_payment_id","money_movements"."expense_payment_id","money_movements"."owner_transaction_id")=1 and (("money_movements"."account_opening_id" is not null and "money_movements"."day_id" is null) or ("money_movements"."account_opening_id" is null and "money_movements"."day_id" is not null)));--> statement-breakpoint
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_delta" CHECK (("money_movements"."expense_payment_id" is not null and "money_movements"."delta" between -9000000000000 and -1) or ("money_movements"."owner_transaction_id" is not null and "money_movements"."delta" between -9000000000000 and 9000000000000 and "money_movements"."delta"<>0) or ("money_movements"."expense_payment_id" is null and "money_movements"."owner_transaction_id" is null and "money_movements"."delta" between 1 and 9000000000000));
--> statement-breakpoint
CREATE FUNCTION validate_owner_posting() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE target uuid; source owner_transactions; day business_days;
BEGIN
  IF TG_TABLE_NAME='owner_transactions' THEN target:=NEW.id;
  ELSE target:=NEW.owner_transaction_id;
  END IF;
  IF target IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO source FROM owner_transactions WHERE id=target;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO day FROM business_days WHERE id=source.day_id;
  IF day.state<>'OPEN' OR day.revision<1 OR day.business_date<>(clock_timestamp() AT TIME ZONE 'Asia/Bangkok')::date
    OR (source.occurred_at AT TIME ZONE 'Asia/Bangkok')::date<>day.business_date OR source.occurred_at>clock_timestamp()
    OR NOT EXISTS(SELECT 1 FROM financial_accounts a JOIN account_openings o ON o.business_id=a.business_id AND o.account_id=a.id
      WHERE a.business_id=source.business_id AND a.id=source.account_id AND a.active AND o.cutover_at<=source.occurred_at)
    OR (SELECT count(*) FROM money_movements WHERE owner_transaction_id=source.id)<>1
    OR EXISTS(SELECT 1 FROM money_movements WHERE owner_transaction_id=source.id AND
      (delta<>(CASE WHEN source.kind='CONTRIBUTION' THEN source.amount ELSE -source.amount END) OR created_by<>source.created_by)) THEN
    RAISE EXCEPTION 'invalid owner transaction posting' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER owner_transactions_posting_guard AFTER INSERT ON owner_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_owner_posting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER owner_movements_posting_guard AFTER INSERT ON money_movements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_owner_posting();
