CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"key" uuid NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"payload_hash" "bytea" NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"resource_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_records_key_uq" UNIQUE("business_id","user_id","key"),
	CONSTRAINT "idempotency_records_hash" CHECK (octet_length("idempotency_records"."payload_hash") = 32),
	CONSTRAINT "idempotency_records_status" CHECK ("idempotency_records"."response_status" between 200 and 299)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price" bigint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "products_scope_uq" UNIQUE("business_id","store_id","id"),
	CONSTRAINT "products_price" CHECK ("products"."price" > 0 and "products"."price" <= 9000000000000),
	CONSTRAINT "products_name" CHECK (length(trim("products"."name")) between 1 and 120),
	CONSTRAINT "products_version" CHECK ("products"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_scope_fk" FOREIGN KEY ("business_id","user_id") REFERENCES "public"."business_memberships"("business_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_scope_fk" FOREIGN KEY ("business_id","store_id") REFERENCES "public"."stores"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_actor_scope_fk" FOREIGN KEY ("business_id","created_by") REFERENCES "public"."business_memberships"("business_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idempotency_records_time_idx" ON "idempotency_records" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "products_listing_idx" ON "products" USING btree ("business_id","store_id","active","name","id");
--> statement-breakpoint
CREATE FUNCTION public.enforce_idempotency_completion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE body jsonb;
BEGIN
  SELECT response_body INTO body FROM public.idempotency_records WHERE id=NEW.id;
  IF NOT FOUND OR jsonb_typeof(body) IS DISTINCT FROM 'object' OR NOT (body ? 'data') THEN
    RAISE EXCEPTION 'idempotency response incomplete' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER idempotency_completion AFTER INSERT OR UPDATE ON public.idempotency_records
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.enforce_idempotency_completion();
--> statement-breakpoint
CREATE FUNCTION public.protect_idempotency_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.response_body ? 'data' OR
     ROW(NEW.business_id,NEW.user_id,NEW.key,NEW.method,NEW.path,NEW.payload_hash,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.business_id,OLD.user_id,OLD.key,OLD.method,OLD.path,OLD.payload_hash,OLD.created_at) THEN
    RAISE EXCEPTION 'idempotency record immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER idempotency_immutable BEFORE UPDATE ON public.idempotency_records
FOR EACH ROW EXECUTE FUNCTION public.protect_idempotency_record();
