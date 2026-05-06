ALTER TABLE "invoices" ADD COLUMN "payplus_refund_transaction_uid" varchar(100);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payplus_refund_invoice_uuid" varchar(100);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payplus_refund_invoice_number" varchar(50);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payplus_refund_invoice_url" text;
