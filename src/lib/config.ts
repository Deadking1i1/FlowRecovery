export function runtimeConfig() {
  const reminderDelivery = process.env.REMINDER_DELIVERY ?? "disabled";
  const billingMode = process.env.BILLING_MODE ?? "test";
  return {
    billingMode,
    reminderDelivery,
    externalSendAllowed: process.env.ALLOW_EXTERNAL_SEND === "true" && reminderDelivery === "enabled",
    readyForLiveBilling: billingMode === "live" && Boolean(process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")),
  };
}

