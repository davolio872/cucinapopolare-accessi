import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getBookingWindowStatus, todayKey } from "@/lib/dates";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

type GatewayChannel = "sms" | "whatsapp" | "telefono";

type GatewayPayload = {
  secret?: string;
  from?: string;
  body?: string;
  channel?: GatewayChannel;
  providerMessageId?: string;
};

type BookingResult = {
  ok: boolean;
  code: string;
  message: string;
};

const bookingWords = ["PRENOTO", "PRENOTA", "PRENOTAZIONE", "SI"];
const allowedChannels = new Set<GatewayChannel>(["sms", "whatsapp", "telefono"]);

export async function GET(request: Request) {
  const configuredGatewaySecret = process.env.ANDROID_GATEWAY_SECRET;
  const receivedGatewaySecret = request.headers.get("x-cpg-gateway-secret");
  if (!configuredGatewaySecret) {
    return jsonError("Gateway Android non configurato.", 503);
  }

  if (!receivedGatewaySecret || receivedGatewaySecret !== configuredGatewaySecret) {
    return jsonError("Gateway Android non autorizzato.", 401);
  }

  if (!process.env.CPG_WEBHOOK_SECRET) {
    return jsonError("Servizio prenotazioni non configurato.", 503);
  }

  return NextResponse.json({
    ok: true,
    code: "gateway_configurato",
    reply: "Connessione al gestionale riuscita.",
    sendReply: false,
  });
}

export async function POST(request: Request) {
  const payload = await readPayload(request);
  if (!payload) {
    return jsonError("Richiesta non valida.", 400);
  }

  const configuredGatewaySecret = process.env.ANDROID_GATEWAY_SECRET;
  const receivedGatewaySecret = request.headers.get("x-cpg-gateway-secret") || payload.secret;
  if (!configuredGatewaySecret) {
    return jsonError("Gateway Android non configurato.", 503);
  }

  if (!receivedGatewaySecret || receivedGatewaySecret !== configuredGatewaySecret) {
    return jsonError("Gateway Android non autorizzato.", 401);
  }

  const channel = payload.channel || "sms";
  if (!allowedChannels.has(channel)) {
    return jsonError("Canale non valido.", 400);
  }

  const from = normalizePhone(payload.from || "");
  if (!from) {
    return jsonError("Numero mittente non valido.", 400);
  }

  const body = payload.body || (channel === "telefono" ? "Chiamata ricevuta" : "");
  if (channel !== "telefono" && !isBookingMessage(body)) {
    return NextResponse.json({
      ok: false,
      code: "messaggio_non_riconosciuto",
      reply: "Per prenotare scrivi PRENOTO. Per assistenza contatta la Cucina Popolare.",
      sendReply: true,
    });
  }

  const webhookSecret = process.env.CPG_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return jsonError("Servizio prenotazioni non configurato.", 503);
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
    p_provider_message_id: payload.providerMessageId || null,
  });

  if (error) {
    return jsonError("Prenotazione non riuscita. Contatta un operatore.", 502);
  }

  const result = data as BookingResult;
  return NextResponse.json({
    ok: result.ok,
    code: result.code,
    reply: result.message || "Richiesta ricevuta.",
    sendReply: true,
  });
}

async function readPayload(request: Request) {
  try {
    return (await request.json()) as GatewayPayload;
  } catch {
    return null;
  }
}

function isBookingMessage(body: string) {
  const normalized = body
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return bookingWords.some((word) => normalized === word || normalized.includes(word));
}

function normalizePhone(value: string) {
  const cleaned = value.replace(/^whatsapp:/, "").replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("00")) return `+${cleaned.slice(2)}`;
  return cleaned;
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      code: "errore_gateway",
      reply: message,
      sendReply: false,
    },
    { status },
  );
}
