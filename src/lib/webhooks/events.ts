/**
 * Catalog of outbound webhook event types.
 * Products subscribe by selecting from this list.
 */
export const WEBHOOK_EVENTS = [
  "customer.created",
  "customer.updated",

  "subscription.created",
  "subscription.updated",
  "subscription.cancelled",
  "subscription.paused",
  "subscription.resumed",
  "subscription.trial_will_end",

  "invoice.created",
  "invoice.paid",
  "invoice.failed",
  "invoice.refunded",

  "charge.failed",
  "charge.dunning_started",
  "charge.recovered",

  "payment_method.created",
  "payment_method.updated",
  "payment_method.expired",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
