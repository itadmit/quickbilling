import { withCronAuth } from "@/lib/cron-handler";
import { drainWebhookQueue } from "@/lib/webhooks/delivery";

export const POST = withCronAuth(async () => drainWebhookQueue());
export const GET = POST;
