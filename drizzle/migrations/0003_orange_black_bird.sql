ALTER TABLE "subscriptions" ADD COLUMN "total_payments" integer;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "payments_charged" integer DEFAULT 0 NOT NULL;