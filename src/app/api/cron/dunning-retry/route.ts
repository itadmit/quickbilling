import { withCronAuth } from "@/lib/cron-handler";
import { runDunning } from "@/lib/billing/dunning";

export const POST = withCronAuth(async () => runDunning());
export const GET = POST;
