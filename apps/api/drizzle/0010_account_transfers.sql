CREATE TABLE "account_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"source_store_id" uuid NOT NULL,
	"destination_store_id" uuid NOT NULL,
	"source_day_id" uuid NOT NULL,
	"destination_day_id" uuid NOT NULL,
	"source_account_id" uuid NOT NULL,
	"destination_account_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"fee_amount" bigint DEFAULT 0 NOT NULL,
	"fee_expense_id" uuid,
	"reason" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "account_transfers_scope_uq" UNIQUE("business_id","id"),
	CONSTRAINT "account_transfers_fee_uq" UNIQUE("fee_expense_id"),
	CONSTRAINT "account_transfers_amount" CHECK ("account_transfers"."amount" between 1 and 9000000000000 and "account_transfers"."fee_amount" between 0 and 9000000000000),
	CONSTRAINT "account_transfers_accounts" CHECK ("account_transfers"."source_account_id"<>"account_transfers"."destination_account_id"),
	CONSTRAINT "account_transfers_fee" CHECK (("account_transfers"."fee_amount"=0 and "account_transfers"."fee_expense_id" is null) or ("account_transfers"."fee_amount">0 and "account_transfers"."fee_expense_id" is not null)),
	CONSTRAINT "account_transfers_reason" CHECK (length(trim("account_transfers"."reason")) between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "money_movements" DROP CONSTRAINT "money_movements_source";--> statement-breakpoint
ALTER TABLE "money_movements" DROP CONSTRAINT "money_movements_delta";--> statement-breakpoint
ALTER TABLE "money_movements" ADD COLUMN "transfer_id" uuid;--> statement-breakpoint
ALTER TABLE "money_movements" ADD COLUMN "leg" text;--> statement-breakpoint
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_source_day_fk" FOREIGN KEY ("business_id","source_store_id","source_day_id") REFERENCES "public"."business_days"("business_id","store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_destination_day_fk" FOREIGN KEY ("business_id","destination_store_id","destination_day_id") REFERENCES "public"."business_days"("business_id","store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_source_account_fk" FOREIGN KEY ("business_id","source_store_id","source_account_id") REFERENCES "public"."account_stores"("business_id","store_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_destination_account_fk" FOREIGN KEY ("business_id","destination_store_id","destination_account_id") REFERENCES "public"."account_stores"("business_id","store_id","account_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_fee_fk" FOREIGN KEY ("business_id","source_store_id","fee_expense_id") REFERENCES "public"."expenses"("business_id","store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_transfers" ADD CONSTRAINT "account_transfers_actor_fk" FOREIGN KEY ("business_id","created_by") REFERENCES "public"."business_memberships"("business_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_transfers_source_idx" ON "account_transfers" USING btree ("business_id","source_day_id");--> statement-breakpoint
CREATE INDEX "account_transfers_destination_idx" ON "account_transfers" USING btree ("business_id","destination_day_id");--> statement-breakpoint
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_transfer_fk" FOREIGN KEY ("business_id","transfer_id") REFERENCES "public"."account_transfers"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_transfer_uq" UNIQUE("transfer_id","leg");--> statement-breakpoint
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_leg" CHECK (("money_movements"."transfer_id" is null and "money_movements"."leg" is null) or ("money_movements"."transfer_id" is not null and "money_movements"."leg" is not null and "money_movements"."leg" in ('OUT','IN')));--> statement-breakpoint
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_source" CHECK (num_nonnulls("money_movements"."account_opening_id","money_movements"."sale_payment_id","money_movements"."expense_payment_id","money_movements"."owner_transaction_id","money_movements"."transfer_id")=1 and (("money_movements"."account_opening_id" is not null and "money_movements"."day_id" is null) or ("money_movements"."account_opening_id" is null and "money_movements"."day_id" is not null)));--> statement-breakpoint
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_delta" CHECK (("money_movements"."expense_payment_id" is not null and "money_movements"."delta" between -9000000000000 and -1) or (("money_movements"."owner_transaction_id" is not null or "money_movements"."transfer_id" is not null) and "money_movements"."delta" between -9000000000000 and 9000000000000 and "money_movements"."delta"<>0) or ("money_movements"."expense_payment_id" is null and "money_movements"."owner_transaction_id" is null and "money_movements"."transfer_id" is null and "money_movements"."delta" between 1 and 9000000000000));