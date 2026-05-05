CREATE TYPE "public"."addon_status" AS ENUM('active', 'cancelled', 'paused');--> statement-breakpoint
CREATE TYPE "public"."audit_actor_type" AS ENUM('staff', 'product_api', 'system');--> statement-breakpoint
CREATE TYPE "public"."billing_interval" AS ENUM('monthly', 'yearly', 'one_time');--> statement-breakpoint
CREATE TYPE "public"."charge_status" AS ENUM('pending', 'success', 'failed', 'retrying');--> statement-breakpoint
CREATE TYPE "public"."commission_status" AS ENUM('pending', 'invoiced', 'paid', 'failed');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'pending', 'paid', 'failed', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('subscription', 'addon', 'commission', 'manual');--> statement-breakpoint
CREATE TYPE "public"."payment_method_status" AS ENUM('active', 'expired', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('admin', 'support', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trial', 'active', 'past_due', 'cancelled', 'expired', 'paused');--> statement-breakpoint
CREATE TYPE "public"."webhook_delivery_status" AS ENUM('pending', 'delivered', 'failed', 'dead');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_id" varchar(100),
	"action" varchar(100) NOT NULL,
	"target_table" varchar(50) NOT NULL,
	"target_id" uuid,
	"diff" jsonb,
	"ip_address" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"status" charge_status DEFAULT 'pending' NOT NULL,
	"payplus_request" jsonb,
	"payplus_response" jsonb,
	"payplus_transaction_uid" varchar(100),
	"error_code" varchar(50),
	"error_message" text,
	"attempted_at" timestamp DEFAULT now() NOT NULL,
	"next_retry_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"subscription_id" uuid,
	"source_external_id" varchar(100),
	"idempotency_key" varchar(100) NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"fee_rate" numeric(5, 4) NOT NULL,
	"base_amount" numeric(10, 2) NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "commission_status" DEFAULT 'pending' NOT NULL,
	"invoice_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "commission_charges_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "customer_product_links" (
	"customer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"external_id" varchar(100),
	"external_slug" varchar(100),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_product_links_customer_id_product_id_pk" PRIMARY KEY("customer_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(30),
	"name" varchar(200),
	"vat_number" varchar(20),
	"billing_address" jsonb,
	"notes" text,
	"tags" text[],
	"payplus_customer_uid" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" varchar(500) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"total_price" numeric(10, 2) NOT NULL,
	"reference_type" varchar(50),
	"reference_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"subscription_id" uuid,
	"type" "invoice_type" NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"invoice_number" varchar(50) NOT NULL,
	"payplus_invoice_uuid" varchar(100),
	"payplus_invoice_number" varchar(50),
	"payplus_invoice_url" text,
	"payplus_transaction_uid" varchar(100),
	"payplus_transaction_number" varchar(50),
	"subtotal" numeric(10, 2) NOT NULL,
	"vat_amount" numeric(10, 2) NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"vat_rate" numeric(5, 4) DEFAULT '0.18' NOT NULL,
	"currency" varchar(3) DEFAULT 'ILS' NOT NULL,
	"period_start" date,
	"period_end" date,
	"description" text,
	"charge_attempts" integer DEFAULT 0 NOT NULL,
	"last_charge_error" text,
	"issued_at" timestamp,
	"due_at" timestamp,
	"paid_at" timestamp,
	"failed_at" timestamp,
	"refunded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "payment_method_setup_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"payplus_page_request_uid" varchar(100),
	"payment_page_url" text,
	"success_url" text,
	"failure_url" text,
	"callback_url" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"completed_payment_method_id" uuid,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"payplus_customer_uid" varchar(100),
	"payplus_token_uid" varchar(100) NOT NULL,
	"card_brand" varchar(30),
	"card_last4" varchar(4),
	"card_expiry" varchar(7),
	"is_default" boolean DEFAULT true NOT NULL,
	"status" "payment_method_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"monthly_price" numeric(10, 2) NOT NULL,
	"yearly_price" numeric(10, 2),
	"features" jsonb,
	"trial_days" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" varchar(500),
	"category" varchar(50) DEFAULT 'general' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"base_url" varchar(255),
	"api_key_hash" varchar(255) NOT NULL,
	"webhook_secret" varchar(255) NOT NULL,
	"invoice_prefix" varchar(10) NOT NULL,
	"default_trial_days" integer DEFAULT 14 NOT NULL,
	"default_fee_percentage" numeric(5, 4),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(100),
	"image" text,
	"role" "staff_role" DEFAULT 'viewer' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staff_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "subscription_addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"addon_code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"monthly_price" numeric(10, 2) NOT NULL,
	"billing_interval" "billing_interval" DEFAULT 'monthly' NOT NULL,
	"status" "addon_status" DEFAULT 'active' NOT NULL,
	"current_period_start" date,
	"current_period_end" date,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'trial' NOT NULL,
	"billing_interval" "billing_interval" DEFAULT 'monthly' NOT NULL,
	"billing_start_date" date,
	"current_period_start" date,
	"current_period_end" date,
	"trial_ends_at" timestamp,
	"custom_monthly_price" numeric(10, 2),
	"custom_fee_percentage" numeric(5, 4),
	"payment_method_id" uuid,
	"failed_charge_count" integer DEFAULT 0 NOT NULL,
	"dunning_started_at" timestamp,
	"last_failed_charge_at" timestamp,
	"last_failed_charge_error" text,
	"cancelled_at" timestamp,
	"cancellation_reason" text,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"pending_plan_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 5 NOT NULL,
	"response_status" integer,
	"response_body" text,
	"last_attempted_at" timestamp,
	"next_retry_at" timestamp,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"url" text NOT NULL,
	"events" text[] NOT NULL,
	"secret" varchar(100) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_charges" ADD CONSTRAINT "commission_charges_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_charges" ADD CONSTRAINT "commission_charges_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_charges" ADD CONSTRAINT "commission_charges_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_charges" ADD CONSTRAINT "commission_charges_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_product_links" ADD CONSTRAINT "customer_product_links_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_product_links" ADD CONSTRAINT "customer_product_links_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_method_setup_sessions" ADD CONSTRAINT "payment_method_setup_sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_method_setup_sessions" ADD CONSTRAINT "payment_method_setup_sessions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_method_setup_sessions" ADD CONSTRAINT "payment_method_setup_sessions_completed_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("completed_payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_staff_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_addons" ADD CONSTRAINT "subscription_addons_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_pending_plan_id_plans_id_fk" FOREIGN KEY ("pending_plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_target" ON "audit_log" USING btree ("target_table","target_id");--> statement-breakpoint
CREATE INDEX "idx_audit_actor" ON "audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_charges_invoice_attempt" ON "charges" USING btree ("invoice_id","attempt_number");--> statement-breakpoint
CREATE INDEX "idx_charges_payplus_uid" ON "charges" USING btree ("payplus_transaction_uid");--> statement-breakpoint
CREATE INDEX "idx_commission_charges_lookup" ON "commission_charges" USING btree ("customer_id","product_id","period_start","status");--> statement-breakpoint
CREATE INDEX "idx_commission_charges_status_period" ON "commission_charges" USING btree ("status","period_end");--> statement-breakpoint
CREATE INDEX "idx_customer_product_links_external" ON "customer_product_links" USING btree ("product_id","external_id");--> statement-breakpoint
CREATE INDEX "idx_customers_email" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_customers_phone" ON "customers" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "idx_idempotency_expires" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_invoice_items_invoice" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_customer_status" ON "invoices" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "idx_invoices_product_created" ON "invoices" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_invoices_status_due" ON "invoices" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "idx_invoices_subscription" ON "invoices" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "idx_setup_sessions_customer" ON "payment_method_setup_sessions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_setup_sessions_payplus" ON "payment_method_setup_sessions" USING btree ("payplus_page_request_uid");--> statement-breakpoint
CREATE INDEX "idx_payment_methods_customer" ON "payment_methods" USING btree ("customer_id","is_default");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_plans_product_code" ON "plans" USING btree ("product_id","code");--> statement-breakpoint
CREATE INDEX "idx_plans_product" ON "plans" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_platform_settings_category" ON "platform_settings" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_products_slug" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_addons_subscription_status" ON "subscription_addons" USING btree ("subscription_id","status");--> statement-breakpoint
CREATE INDEX "idx_addons_status_period" ON "subscription_addons" USING btree ("status","current_period_end");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_customer_product" ON "subscriptions" USING btree ("customer_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_status_period" ON "subscriptions" USING btree ("status","current_period_end");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_trial" ON "subscriptions" USING btree ("status","trial_ends_at");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_status_retry" ON "webhook_deliveries" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "idx_webhook_deliveries_endpoint" ON "webhook_deliveries" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_endpoints_product" ON "webhook_endpoints" USING btree ("product_id","active");