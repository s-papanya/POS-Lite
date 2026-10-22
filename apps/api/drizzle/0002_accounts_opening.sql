CREATE TABLE "account_openings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"cutover_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "account_openings_account_uq" UNIQUE("business_id","account_id"),
	CONSTRAINT "account_openings_source_uq" UNIQUE("business_id","store_id","account_id","id"),
	CONSTRAINT "account_openings_cutover" CHECK ("cutover_at" <= "created_at"),
	CONSTRAINT "account_openings_amount" CHECK ("account_openings"."amount" between 0 and 9000000000000),
	CONSTRAINT "account_openings_reason" CHECK (length(trim("account_openings"."reason")) between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "account_stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "account_stores_scope_uq" UNIQUE("business_id","store_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "financial_accounts_scope_uq" UNIQUE("business_id","id"),
	CONSTRAINT "financial_accounts_name_uq" UNIQUE("business_id","name"),
	CONSTRAINT "financial_accounts_type" CHECK ("financial_accounts"."type" in ('CASH','BANK')),
	CONSTRAINT "financial_accounts_name" CHECK (length(trim("financial_accounts"."name")) between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "money_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"account_opening_id" uuid NOT NULL,
	"delta" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "money_movements_opening_uq" UNIQUE("account_opening_id"),
	CONSTRAINT "money_movements_delta" CHECK ("money_movements"."delta" > 0 and "money_movements"."delta" <= 9000000000000)
);
--> statement-breakpoint
ALTER TABLE "account_openings" ADD CONSTRAINT "account_openings_mapping_fk" FOREIGN KEY ("business_id","store_id","account_id") REFERENCES "public"."account_stores"("business_id","store_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_openings" ADD CONSTRAINT "account_openings_actor_fk" FOREIGN KEY ("business_id","created_by") REFERENCES "public"."business_memberships"("business_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_stores" ADD CONSTRAINT "account_stores_store_fk" FOREIGN KEY ("business_id","store_id") REFERENCES "public"."stores"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_stores" ADD CONSTRAINT "account_stores_account_fk" FOREIGN KEY ("business_id","account_id") REFERENCES "public"."financial_accounts"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_stores" ADD CONSTRAINT "account_stores_actor_fk" FOREIGN KEY ("business_id","created_by") REFERENCES "public"."business_memberships"("business_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_actor_fk" FOREIGN KEY ("business_id","created_by") REFERENCES "public"."business_memberships"("business_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_opening_scope_fk" FOREIGN KEY ("business_id","store_id","account_id","account_opening_id") REFERENCES "public"."account_openings"("business_id","store_id","account_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_actor_fk" FOREIGN KEY ("business_id","created_by") REFERENCES "public"."business_memberships"("business_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_stores_account_idx" ON "account_stores" USING btree ("business_id","account_id");--> statement-breakpoint
CREATE INDEX "money_movements_balance_idx" ON "money_movements" USING btree ("business_id","account_id","created_at","id");
--> statement-breakpoint
CREATE FUNCTION public.check_account_mapping() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ids uuid[]; target uuid; kind text; n bigint;
BEGIN
  IF TG_TABLE_NAME='financial_accounts' THEN
    ids:=ARRAY[CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END];
  ELSE
    ids:=ARRAY[CASE WHEN TG_OP<>'INSERT' THEN OLD.account_id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.account_id END];
  END IF;
  FOREACH target IN ARRAY ids LOOP
    IF target IS NULL THEN CONTINUE; END IF;
    SELECT type INTO kind FROM public.financial_accounts WHERE id=target FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT count(*) INTO n FROM public.account_stores WHERE account_id=target;
    IF n=0 OR (kind='CASH' AND n<>1) THEN
      RAISE EXCEPTION 'invalid account store mapping' USING ERRCODE='23514';
    END IF;
  END LOOP;
  RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER financial_accounts_mapping AFTER INSERT OR UPDATE ON public.financial_accounts
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_account_mapping();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER account_stores_mapping AFTER INSERT OR UPDATE OR DELETE ON public.account_stores
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_account_mapping();
--> statement-breakpoint
CREATE FUNCTION public.check_opening_posting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ids uuid[]; target uuid; source public.account_openings%ROWTYPE; n bigint; total numeric; wrong_actor bigint;
BEGIN
  IF TG_TABLE_NAME='account_openings' THEN
    ids:=ARRAY[CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END];
  ELSE
    ids:=ARRAY[CASE WHEN TG_OP<>'INSERT' THEN OLD.account_opening_id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.account_opening_id END];
  END IF;
  FOREACH target IN ARRAY ids LOOP
    IF target IS NULL THEN CONTINUE; END IF;
    SELECT * INTO source FROM public.account_openings WHERE id=target;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT count(*),coalesce(sum(delta),0),count(*) FILTER(WHERE created_by<>source.created_by)
      INTO n,total,wrong_actor FROM public.money_movements WHERE account_opening_id=target;
    IF n<>(CASE WHEN source.amount=0 THEN 0 ELSE 1 END) OR total<>source.amount OR wrong_actor<>0 THEN
      RAISE EXCEPTION 'opening posting mismatch' USING ERRCODE='23514';
    END IF;
  END LOOP;
  RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER account_openings_posting AFTER INSERT OR UPDATE OR DELETE ON public.account_openings
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_opening_posting();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER money_movements_posting AFTER INSERT OR UPDATE OR DELETE ON public.money_movements
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_opening_posting();
