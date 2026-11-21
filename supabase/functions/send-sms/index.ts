import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function normalizeIranianReceptor(phone: string): string | null {
  const normalized = phone.replace(/[\s()-]/g, "");
  if (!/^\+989\d{9}$/.test(normalized)) return null;
  return `0${normalized.slice(3)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET");
  const apiKey = Deno.env.get("KAVENEGAR_API_KEY");
  const template = Deno.env.get("KAVENEGAR_TEMPLATE");

  if (!hookSecret || !apiKey || !template) {
    return json({ error: "SMS provider is not configured" }, 500);
  }

  try {
    const payload = await req.text();
    if (payload.length > 20_000) return json({ error: "Payload too large" }, 413);

    const webhook = new Webhook(hookSecret.replace(/^v1,whsec_/, ""));
    const headers = Object.fromEntries(req.headers.entries());
    const event = webhook.verify(payload, headers) as {
      user?: { phone?: string };
      sms?: { otp?: string };
    };

    const receptor = normalizeIranianReceptor(event.user?.phone ?? "");
    const otp = event.sms?.otp ?? "";
    if (!receptor || !/^\d{4,8}$/.test(otp)) {
      return json({ error: "Invalid SMS event" }, 400);
    }

    const endpoint = new URL(
      `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/verify/lookup.json`,
    );
    endpoint.searchParams.set("receptor", receptor);
    endpoint.searchParams.set("token", otp);
    endpoint.searchParams.set("template", template);

    const providerResponse = await fetch(endpoint, {
      method: "GET",
      signal: AbortSignal.timeout(4_000),
      headers: { Accept: "application/json" },
    });
    if (!providerResponse.ok) return json({ error: "SMS provider request failed" }, 502);

    const result = await providerResponse.json();
    if (result?.return?.status !== 200) {
      return json({ error: "SMS provider rejected the request" }, 502);
    }

    return json({});
  } catch {
    // Never log or return OTPs, phone numbers, webhook signatures or provider payloads.
    return json({ error: "Unable to process SMS request" }, 500);
  }
});
