import { runtimeConfig } from "@/lib/config";

export function GET() {
  const config = runtimeConfig();
  return Response.json({
    status: "ok",
    service: "flowrecovery",
    mode: config.billingMode,
    reminderDelivery: config.reminderDelivery,
    externalSendAllowed: config.externalSendAllowed,
    liveBillingConfigured: config.readyForLiveBilling,
  });
}

