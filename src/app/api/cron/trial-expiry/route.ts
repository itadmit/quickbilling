import { withCronAuth } from "@/lib/cron-handler";
import { expireDueTrials } from "@/lib/billing/trial";

export const POST = withCronAuth(async () => expireDueTrials());
export const GET = POST;
