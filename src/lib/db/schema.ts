import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  decimal,
  boolean,
  jsonb,
  timestamp,
  date,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/* ============ Enums ============ */

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trial",
  "active",
  "past_due",
  "cancelled",
  "expired",
  "paused",
]);

export const billingIntervalEnum = pgEnum("billing_interval", [
  "monthly",
  "yearly",
  "one_time",
]);

export const invoiceTypeEnum = pgEnum("invoice_type", [
  "subscription",
  "addon",
  "commission",
  "manual",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "pending",
  "paid",
  "failed",
  "cancelled",
  "refunded",
]);

export const chargeStatusEnum = pgEnum("charge_status", [
  "pending",
  "success",
  "failed",
  "retrying",
]);

export const commissionStatusEnum = pgEnum("commission_status", [
  "pending",
  "invoiced",
  "paid",
  "failed",
]);

export const paymentMethodStatusEnum = pgEnum("payment_method_status", [
  "active",
  "expired",
  "deleted",
]);

export const addonStatusEnum = pgEnum("addon_status", [
  "active",
  "cancelled",
  "paused",
]);

export const webhookDeliveryStatusEnum = pgEnum("webhook_delivery_status", [
  "pending",
  "delivered",
  "failed",
  "dead",
]);

export const staffRoleEnum = pgEnum("staff_role", [
  "admin",
  "support",
  "viewer",
]);

export const auditActorTypeEnum = pgEnum("audit_actor_type", [
  "staff",
  "product_api",
  "system",
]);

/* ============ Products ============ */

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 50 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    baseUrl: varchar("base_url", { length: 255 }),
    apiKeyHash: varchar("api_key_hash", { length: 255 }).notNull(),
    webhookSecret: varchar("webhook_secret", { length: 255 }).notNull(),
    invoicePrefix: varchar("invoice_prefix", { length: 10 }).notNull(),
    defaultTrialDays: integer("default_trial_days").default(14).notNull(),
    defaultFeePercentage: decimal("default_fee_percentage", {
      precision: 5,
      scale: 4,
    }),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("idx_products_slug").on(t.slug)],
);

/* ============ Customers ============ */

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    phone: varchar("phone", { length: 30 }),
    name: varchar("name", { length: 200 }),
    vatNumber: varchar("vat_number", { length: 20 }),
    billingAddress: jsonb("billing_address"),
    notes: text("notes"),
    tags: text("tags").array(),
    payplusCustomerUid: varchar("payplus_customer_uid", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_customers_email").on(t.email),
    index("idx_customers_phone").on(t.phone),
  ],
);

export const customerProductLinks = pgTable(
  "customer_product_links",
  {
    customerId: uuid("customer_id")
      .references(() => customers.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    externalId: varchar("external_id", { length: 100 }),
    externalSlug: varchar("external_slug", { length: 100 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.customerId, t.productId] }),
    index("idx_customer_product_links_external").on(t.productId, t.externalId),
  ],
);

/* ============ Plans ============ */

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    monthlyPrice: decimal("monthly_price", { precision: 10, scale: 2 }).notNull(),
    yearlyPrice: decimal("yearly_price", { precision: 10, scale: 2 }),
    features: jsonb("features"),
    trialDays: integer("trial_days"),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("idx_plans_product_code").on(t.productId, t.code),
    index("idx_plans_product").on(t.productId),
  ],
);

/* ============ Payment Methods ============ */

export const paymentMethods = pgTable(
  "payment_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .references(() => customers.id, { onDelete: "cascade" })
      .notNull(),
    payplusCustomerUid: varchar("payplus_customer_uid", { length: 100 }),
    payplusTokenUid: varchar("payplus_token_uid", { length: 100 }).notNull(),
    cardBrand: varchar("card_brand", { length: 30 }),
    cardLast4: varchar("card_last4", { length: 4 }),
    cardExpiry: varchar("card_expiry", { length: 7 }),
    isDefault: boolean("is_default").default(true).notNull(),
    status: paymentMethodStatusEnum("status").default("active").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_payment_methods_customer").on(t.customerId, t.isDefault),
  ],
);

/* ============ Subscriptions ============ */

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .references(() => customers.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "restrict" })
      .notNull(),
    planId: uuid("plan_id")
      .references(() => plans.id, { onDelete: "restrict" })
      .notNull(),

    status: subscriptionStatusEnum("status").default("trial").notNull(),
    billingInterval: billingIntervalEnum("billing_interval")
      .default("monthly")
      .notNull(),

    billingStartDate: date("billing_start_date"),
    currentPeriodStart: date("current_period_start"),
    currentPeriodEnd: date("current_period_end"),
    trialEndsAt: timestamp("trial_ends_at"),

    customMonthlyPrice: decimal("custom_monthly_price", {
      precision: 10,
      scale: 2,
    }),
    customFeePercentage: decimal("custom_fee_percentage", {
      precision: 5,
      scale: 4,
    }),

    paymentMethodId: uuid("payment_method_id").references(
      () => paymentMethods.id,
      { onDelete: "set null" },
    ),

    failedChargeCount: integer("failed_charge_count").default(0).notNull(),
    dunningStartedAt: timestamp("dunning_started_at"),
    lastFailedChargeAt: timestamp("last_failed_charge_at"),
    lastFailedChargeError: text("last_failed_charge_error"),

    cancelledAt: timestamp("cancelled_at"),
    cancellationReason: text("cancellation_reason"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),

    pendingPlanId: uuid("pending_plan_id").references(() => plans.id),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_subscriptions_customer_product").on(t.customerId, t.productId),
    index("idx_subscriptions_status_period").on(t.status, t.currentPeriodEnd),
    index("idx_subscriptions_trial").on(t.status, t.trialEndsAt),
  ],
);

/* ============ Subscription Addons ============ */

export const subscriptionAddons = pgTable(
  "subscription_addons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id")
      .references(() => subscriptions.id, { onDelete: "cascade" })
      .notNull(),
    addonCode: varchar("addon_code", { length: 50 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    monthlyPrice: decimal("monthly_price", { precision: 10, scale: 2 }).notNull(),
    billingInterval: billingIntervalEnum("billing_interval")
      .default("monthly")
      .notNull(),
    status: addonStatusEnum("status").default("active").notNull(),
    currentPeriodStart: date("current_period_start"),
    currentPeriodEnd: date("current_period_end"),
    cancelledAt: timestamp("cancelled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_addons_subscription_status").on(t.subscriptionId, t.status),
    index("idx_addons_status_period").on(t.status, t.currentPeriodEnd),
  ],
);

/* ============ Invoices ============ */

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .references(() => customers.id, { onDelete: "restrict" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "restrict" })
      .notNull(),
    subscriptionId: uuid("subscription_id").references(
      () => subscriptions.id,
      { onDelete: "set null" },
    ),

    type: invoiceTypeEnum("type").notNull(),
    status: invoiceStatusEnum("status").default("draft").notNull(),
    invoiceNumber: varchar("invoice_number", { length: 50 }).notNull().unique(),

    payplusInvoiceUuid: varchar("payplus_invoice_uuid", { length: 100 }),
    payplusInvoiceNumber: varchar("payplus_invoice_number", { length: 50 }),
    payplusInvoiceUrl: text("payplus_invoice_url"),
    payplusTransactionUid: varchar("payplus_transaction_uid", { length: 100 }),
    payplusTransactionNumber: varchar("payplus_transaction_number", {
      length: 50,
    }),

    subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
    vatAmount: decimal("vat_amount", { precision: 10, scale: 2 }).notNull(),
    totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
    vatRate: decimal("vat_rate", { precision: 5, scale: 4 })
      .default("0.18")
      .notNull(),
    currency: varchar("currency", { length: 3 }).default("ILS").notNull(),

    periodStart: date("period_start"),
    periodEnd: date("period_end"),

    description: text("description"),

    chargeAttempts: integer("charge_attempts").default(0).notNull(),
    lastChargeError: text("last_charge_error"),

    issuedAt: timestamp("issued_at"),
    dueAt: timestamp("due_at"),
    paidAt: timestamp("paid_at"),
    failedAt: timestamp("failed_at"),
    refundedAt: timestamp("refunded_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_invoices_customer_status").on(t.customerId, t.status),
    index("idx_invoices_product_created").on(t.productId, t.createdAt),
    index("idx_invoices_status_due").on(t.status, t.dueAt),
    index("idx_invoices_subscription").on(t.subscriptionId),
  ],
);

/* ============ Invoice Items ============ */

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .references(() => invoices.id, { onDelete: "cascade" })
      .notNull(),
    description: varchar("description", { length: 500 }).notNull(),
    quantity: integer("quantity").default(1).notNull(),
    unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
    totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
    referenceType: varchar("reference_type", { length: 50 }),
    referenceId: varchar("reference_id", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_invoice_items_invoice").on(t.invoiceId)],
);

/* ============ Commission Charges ============ */

export const commissionCharges = pgTable(
  "commission_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .references(() => customers.id, { onDelete: "restrict" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "restrict" })
      .notNull(),
    subscriptionId: uuid("subscription_id").references(
      () => subscriptions.id,
      { onDelete: "set null" },
    ),

    sourceExternalId: varchar("source_external_id", { length: 100 }),
    idempotencyKey: varchar("idempotency_key", { length: 100 })
      .notNull()
      .unique(),

    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    feeRate: decimal("fee_rate", { precision: 5, scale: 4 }).notNull(),
    baseAmount: decimal("base_amount", { precision: 10, scale: 2 }).notNull(),

    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),

    status: commissionStatusEnum("status").default("pending").notNull(),
    invoiceId: uuid("invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_commission_charges_lookup").on(
      t.customerId,
      t.productId,
      t.periodStart,
      t.status,
    ),
    index("idx_commission_charges_status_period").on(t.status, t.periodEnd),
  ],
);

/* ============ Charges (attempts) ============ */

export const charges = pgTable(
  "charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .references(() => invoices.id, { onDelete: "cascade" })
      .notNull(),
    attemptNumber: integer("attempt_number").default(1).notNull(),
    status: chargeStatusEnum("status").default("pending").notNull(),

    payplusRequest: jsonb("payplus_request"),
    payplusResponse: jsonb("payplus_response"),
    payplusTransactionUid: varchar("payplus_transaction_uid", { length: 100 }),

    errorCode: varchar("error_code", { length: 50 }),
    errorMessage: text("error_message"),

    attemptedAt: timestamp("attempted_at").defaultNow().notNull(),
    nextRetryAt: timestamp("next_retry_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_charges_invoice_attempt").on(t.invoiceId, t.attemptNumber),
    index("idx_charges_payplus_uid").on(t.payplusTransactionUid),
  ],
);

/* ============ Webhook Endpoints + Deliveries ============ */

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    url: text("url").notNull(),
    events: text("events").array().notNull(),
    secret: varchar("secret", { length: 100 }).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("idx_webhook_endpoints_product").on(t.productId, t.active)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    endpointId: uuid("endpoint_id")
      .references(() => webhookEndpoints.id, { onDelete: "cascade" })
      .notNull(),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    payload: jsonb("payload").notNull(),
    status: webhookDeliveryStatusEnum("status").default("pending").notNull(),
    retryCount: integer("retry_count").default(0).notNull(),
    maxRetries: integer("max_retries").default(5).notNull(),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    lastAttemptedAt: timestamp("last_attempted_at"),
    nextRetryAt: timestamp("next_retry_at"),
    deliveredAt: timestamp("delivered_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_webhook_deliveries_status_retry").on(t.status, t.nextRetryAt),
    index("idx_webhook_deliveries_endpoint").on(t.endpointId),
  ],
);

/* ============ Audit Log ============ */

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorType: auditActorTypeEnum("actor_type").notNull(),
    actorId: varchar("actor_id", { length: 100 }),
    action: varchar("action", { length: 100 }).notNull(),
    targetTable: varchar("target_table", { length: 50 }).notNull(),
    targetId: uuid("target_id"),
    diff: jsonb("diff"),
    ipAddress: varchar("ip_address", { length: 50 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_audit_target").on(t.targetTable, t.targetId),
    index("idx_audit_actor").on(t.actorId, t.createdAt),
  ],
);

/* ============ Staff Users (NextAuth) ============ */

export const staffUsers = pgTable(
  "staff_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 100 }),
    image: text("image"),
    passwordHash: varchar("password_hash", { length: 255 }),
    role: staffRoleEnum("role").default("viewer").notNull(),
    active: boolean("active").default(true).notNull(),
    lastLoginAt: timestamp("last_login_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
);

/* ============ Platform Settings ============ */

export const platformSettings = pgTable(
  "platform_settings",
  {
    key: varchar("key", { length: 100 }).primaryKey(),
    value: jsonb("value").notNull(),
    description: varchar("description", { length: 500 }),
    category: varchar("category", { length: 50 }).default("general").notNull(),
    updatedBy: uuid("updated_by").references(() => staffUsers.id),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("idx_platform_settings_category").on(t.category)],
);

/* ============ Idempotency Keys ============ */

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    key: varchar("key", { length: 100 }).primaryKey(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (t) => [index("idx_idempotency_expires").on(t.expiresAt)],
);

/* ============ Payment Method Setup Sessions ============ */

export const paymentMethodSetupSessions = pgTable(
  "payment_method_setup_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .references(() => customers.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    payplusPageRequestUid: varchar("payplus_page_request_uid", { length: 100 }),
    paymentPageUrl: text("payment_page_url"),
    successUrl: text("success_url"),
    failureUrl: text("failure_url"),
    callbackUrl: text("callback_url"),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    completedPaymentMethodId: uuid("completed_payment_method_id").references(
      () => paymentMethods.id,
    ),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_setup_sessions_customer").on(t.customerId),
    index("idx_setup_sessions_payplus").on(t.payplusPageRequestUid),
  ],
);

/* ============ Relations ============ */

export const productsRelations = relations(products, ({ many }) => ({
  customerLinks: many(customerProductLinks),
  plans: many(plans),
  subscriptions: many(subscriptions),
  invoices: many(invoices),
  webhookEndpoints: many(webhookEndpoints),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  productLinks: many(customerProductLinks),
  subscriptions: many(subscriptions),
  paymentMethods: many(paymentMethods),
  invoices: many(invoices),
}));

export const customerProductLinksRelations = relations(
  customerProductLinks,
  ({ one }) => ({
    customer: one(customers, {
      fields: [customerProductLinks.customerId],
      references: [customers.id],
    }),
    product: one(products, {
      fields: [customerProductLinks.productId],
      references: [products.id],
    }),
  }),
);

export const plansRelations = relations(plans, ({ one, many }) => ({
  product: one(products, {
    fields: [plans.productId],
    references: [products.id],
  }),
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(
  subscriptions,
  ({ one, many }) => ({
    customer: one(customers, {
      fields: [subscriptions.customerId],
      references: [customers.id],
    }),
    product: one(products, {
      fields: [subscriptions.productId],
      references: [products.id],
    }),
    plan: one(plans, {
      fields: [subscriptions.planId],
      references: [plans.id],
    }),
    paymentMethod: one(paymentMethods, {
      fields: [subscriptions.paymentMethodId],
      references: [paymentMethods.id],
    }),
    addons: many(subscriptionAddons),
    invoices: many(invoices),
  }),
);

export const subscriptionAddonsRelations = relations(
  subscriptionAddons,
  ({ one }) => ({
    subscription: one(subscriptions, {
      fields: [subscriptionAddons.subscriptionId],
      references: [subscriptions.id],
    }),
  }),
);

export const paymentMethodsRelations = relations(
  paymentMethods,
  ({ one, many }) => ({
    customer: one(customers, {
      fields: [paymentMethods.customerId],
      references: [customers.id],
    }),
    subscriptions: many(subscriptions),
  }),
);

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  customer: one(customers, {
    fields: [invoices.customerId],
    references: [customers.id],
  }),
  product: one(products, {
    fields: [invoices.productId],
    references: [products.id],
  }),
  subscription: one(subscriptions, {
    fields: [invoices.subscriptionId],
    references: [subscriptions.id],
  }),
  items: many(invoiceItems),
  charges: many(charges),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id],
  }),
}));

export const chargesRelations = relations(charges, ({ one }) => ({
  invoice: one(invoices, {
    fields: [charges.invoiceId],
    references: [invoices.id],
  }),
}));

export const commissionChargesRelations = relations(
  commissionCharges,
  ({ one }) => ({
    customer: one(customers, {
      fields: [commissionCharges.customerId],
      references: [customers.id],
    }),
    product: one(products, {
      fields: [commissionCharges.productId],
      references: [products.id],
    }),
    subscription: one(subscriptions, {
      fields: [commissionCharges.subscriptionId],
      references: [subscriptions.id],
    }),
    invoice: one(invoices, {
      fields: [commissionCharges.invoiceId],
      references: [invoices.id],
    }),
  }),
);

export const webhookEndpointsRelations = relations(
  webhookEndpoints,
  ({ one, many }) => ({
    product: one(products, {
      fields: [webhookEndpoints.productId],
      references: [products.id],
    }),
    deliveries: many(webhookDeliveries),
  }),
);

export const webhookDeliveriesRelations = relations(
  webhookDeliveries,
  ({ one }) => ({
    endpoint: one(webhookEndpoints, {
      fields: [webhookDeliveries.endpointId],
      references: [webhookEndpoints.id],
    }),
  }),
);

/* ============ Type Exports ============ */

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type SubscriptionAddon = typeof subscriptionAddons.$inferSelect;
export type NewSubscriptionAddon = typeof subscriptionAddons.$inferInsert;
export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type NewPaymentMethod = typeof paymentMethods.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type NewInvoiceItem = typeof invoiceItems.$inferInsert;
export type Charge = typeof charges.$inferSelect;
export type NewCharge = typeof charges.$inferInsert;
export type CommissionCharge = typeof commissionCharges.$inferSelect;
export type NewCommissionCharge = typeof commissionCharges.$inferInsert;
export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
export type StaffUser = typeof staffUsers.$inferSelect;
export type PlatformSetting = typeof platformSettings.$inferSelect;
