import { createSupabaseOutboxRepository, runRecoveryCron } from "@/domain/outbox";
import { runtimeConfig } from "@/lib/config";

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization");
  if (!expected || supplied !== `Bearer ${expected}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = runtimeConfig();
  const repository = createSupabaseOutboxRepository({
    baseUrl: process.env.SUPABASE_URL ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  });
  if (!repository) {
    return Response.json({
      status: "safe",
      evaluated: 0,
      createdReminders: 0,
      externalSendAllowed: config.externalSendAllowed,
      reason: "durable_worker_not_configured",
    });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = await runRecoveryCron(repository, today);
    return Response.json({ status: "safe", ...result, reason: "reminders_scheduled_not_sent" });
  } catch {
    return Response.json({
      status: "safe",
      evaluated: 0,
      createdReminders: 0,
      externalSendAllowed: config.externalSendAllowed,
      reason: "durable_worker_error",
    }, { status: 500 });
  }
}

