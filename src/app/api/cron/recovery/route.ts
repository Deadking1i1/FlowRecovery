import { runtimeConfig } from "@/lib/config";

export function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization");
  if (!expected || supplied !== `Bearer ${expected}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const config = runtimeConfig();
  return Response.json({ status: "safe", evaluated: 0, createdReminders: 0, externalSendAllowed: config.externalSendAllowed, reason: "durable_worker_not_configured" });
}

