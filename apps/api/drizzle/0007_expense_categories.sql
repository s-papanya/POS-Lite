CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "expense_categories_scope_uq" UNIQUE("business_id","id"),
	CONSTRAINT "expense_categories_name" CHECK (length("expense_categories"."name") between 1 and 120 and "expense_categories"."name"=normalize(btrim("expense_categories"."name"),NFC) and "expense_categories"."name" !~ '[[:cntrl:]]')
);
--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_actor_scope_fk" FOREIGN KEY ("business_id","created_by") REFERENCES "public"."business_memberships"("business_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_name_uq" ON "expense_categories" USING btree ("business_id",lower("name"));--> statement-breakpoint
CREATE INDEX "expense_categories_listing_idx" ON "expense_categories" USING btree ("business_id","active","name","id");