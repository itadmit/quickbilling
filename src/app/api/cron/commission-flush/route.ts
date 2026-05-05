import { withCronAuth } from "@/lib/cron-handler";
import { flushCommissions } from "@/lib/billing/commission-flush";

export const POST = withCronAuth(async () => flushCommissions());
export const GET = POST;
