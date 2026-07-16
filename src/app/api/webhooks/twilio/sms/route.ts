import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getBookingWindowStatus, todayKey } from "@/lib/dates";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

type BookingResult = {
  ok: boolean;
  code: string;
  message: string;
};

const bookingWords = ["PRENOTO", "PRENOTA", "PRENOTAZIONE", "SI"];

export async function POST(request: Request) {
  const form = await request.formData();
  const params = Object.fromEntries(
    Array.from(form.entries()).map(([key, value]) => [key, String(value)]),
  );
  const fromRaw = params.From ?? "";
  const toRaw = params.To ?? "";
  const body = params.Body ?? "";
  const providerMessageId = params.MessageSid ?? params.SmsMessageSid ?? params.SmsSid ?? null;
  const channel = fromRaw.startsWith("whatsapp:") || toRaw.startsWith("whatsapp:")
    ? "whatsapp"
    : "sms";
  const from = normalizeTwilioAddress(fromRaw);

  if (!from) {
    return twiml("Numero mittente non valido.");
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken && !isValidTwilioRequest(request, params, authToken)) {
    return new NextResponse("Firma Twilio non valida.", { status: 403 });
  }

  if (!isBookingMessage(body)) {
    return twiml("Per prenotare scrivi PRENOTO. Per assistenza contatta la Cucina Popolare.");
  }

  const webhookSecret = process.env.CPG_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return twiml("Servizio prenotazioni non configurato. Contatta la Cucina Popolare.");
  }

  const supabase = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.rpc("cpg_request_booking_by_phone_webhook", {
    p_secret: webhookSecret,
    p_phone_e164: from,
    p_channel: channel,
    p_entry_date: getBookingWindowStatus().entryDate ?? todayKey(),
    p_body: body,
    p_provider_message_id: providerMessageId,
  });

  if (error) {
    return twiml("Prenotazione non riuscita. Contatta un operatore.");
  }

  const result = data as BookingResult;
  return twiml(result.message || "Richiesta ricevuta.");
}

function isBookingMessage(body: string) {
  const normalized = body
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return bookingWords.some((word) => normalized === word || normalized.includes(word));
}

function normalizeTwilioAddress(value: string) {
  return value.replace(/^whatsapp:/, "").trim();
}

function isValidTwilioRequest(
  request: Request,
  params: Record<string, string>,
  authToken: string,
) {
  const signature = request.headers.get("x-twilio-signature");
  if (!signature) return false;

  const url = getPublicRequestUrl(request);
  const data = Object.keys(params)
    .sort()
    .reduce((accumulator, key) => `${accumulator}${key}${params[key]}`, url);
  const expected = createHmac("sha1", authToken).update(data).digest("base64");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function getPublicRequestUrl(request: Request) {
  const configured = process.env.TWILIO_WEBHOOK_PUBLIC_URL;
  if (configured) return configured;

  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedProto) url.protocol = `${forwardedProto}:`;
  if (forwardedHost) url.host = forwardedHost;
  return url.toString();
}

function twiml(message: string) {
  return new NextResponse(`<Response><Message>${escapeXml(message)}</Message></Response>`, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
