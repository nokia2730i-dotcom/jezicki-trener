// app/api/claude/route.js
// API kljuc, system promptovi i izbor modela ostaju OVDE, na serveru.
// Klijent salje samo { task, fields } — nikad prompt, nikad model.

import Anthropic from "@anthropic-ai/sdk";
import { TASKS, LEVELS } from "./tasks";

export const runtime = "nodejs";

const MAX_BODY_CHARS = 20000;

// ——— Rate limit ———————————————————————————————————————————————
// VAZNO: Vercel je serverless, pa je ovaj brojac u memoriji JEDNE instance
// i resetuje se kad instanca umre. Zaustavlja odbegli ciklus i slucajno
// hamerovanje, ali NIJE brana protiv nekog odlucnog. Tvrda brana je limit
// trosaka u Anthropic konzoli (Settings > Limits).
const WINDOWS = [
  { max: 30, ms: 5 * 60 * 1000, label: "5 minuta" },
  { max: 400, ms: 24 * 60 * 60 * 1000, label: "24 sata" },
];

const hits = new Map(); // ip -> number[] (timestamps)
const MAX_TRACKED_IPS = 500;

function rateLimited(ip) {
  const now = Date.now();
  const longest = Math.max(...WINDOWS.map((w) => w.ms));

  if (hits.size > MAX_TRACKED_IPS) {
    for (const [key, times] of hits) {
      if (!times.length || now - times[times.length - 1] > longest) hits.delete(key);
    }
  }

  const times = (hits.get(ip) || []).filter((t) => now - t < longest);

  for (const w of WINDOWS) {
    if (times.filter((t) => now - t < w.ms).length >= w.max) {
      hits.set(ip, times);
      return w.label;
    }
  }

  times.push(now);
  hits.set(ip, times);
  return null;
}

function clientIp(req) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

// ——— Validacija ———————————————————————————————————————————————

function bad(message, status = 400) {
  return Response.json({ error: message }, { status });
}

function validate(spec, taskName, fields) {
  for (const key of spec.required || []) {
    const v = fields[key];
    if (typeof v !== "string" || !v.trim()) {
      return `Zadatak "${taskName}" trazi polje "${key}".`;
    }
  }

  for (const [key, limit] of Object.entries(spec.fields || {})) {
    const v = fields[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string") return `Polje "${key}" mora biti tekst.`;
    if (v.length > limit) {
      return `Unos je predug: "${key}" ima ${v.length} znakova, dozvoljeno je ${limit}.`;
    }
  }

  if (fields.level !== undefined && !LEVELS.includes(fields.level)) {
    return "Nepoznat nivo.";
  }

  if (spec.maxTurns !== undefined) {
    const msgs = fields.messages;
    if (!Array.isArray(msgs) || msgs.length === 0) {
      return "Razgovor je prazan.";
    }
    if (msgs.length > spec.maxTurns) {
      return `Razgovor je predug (${msgs.length} poruka). Pocni novi razgovor.`;
    }
    for (const m of msgs) {
      if (!m || (m.role !== "user" && m.role !== "assistant")) {
        return "Neispravna poruka u razgovoru.";
      }
      if (typeof m.content !== "string" || !m.content.trim()) {
        return "Neispravna poruka u razgovoru.";
      }
      if (m.content.length > spec.maxCharsPerTurn) {
        return `Poruka je predugacka (najvise ${spec.maxCharsPerTurn} znakova).`;
      }
    }
  }

  if (spec.maxWords !== undefined && fields.words !== undefined) {
    if (!Array.isArray(fields.words)) return "Neispravna lista reci.";
    if (fields.words.length > spec.maxWords) {
      return `Previse reci (najvise ${spec.maxWords}).`;
    }
    for (const w of fields.words) {
      if (typeof w !== "string" || w.length > 80) return "Neispravna rec u listi.";
    }
  }

  return null;
}

// ——— Poziv modela sa jednim ponovnim pokusajem ——————————————————

function textOf(message) {
  return (message.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function parseGuarded(raw) {
  const cleaned = String(raw).replace(/```json|```/g, "").trim();
  if (!cleaned) return { ok: false, reason: "prazan odgovor" };
  try {
    return { ok: true, value: JSON.parse(cleaned) };
  } catch (e) {
    return { ok: false, reason: String(e.message || e) };
  }
}

async function callModel(client, spec, fields, nudge) {
  const messages = spec.messages(fields);
  const payload = {
    model: spec.model,
    max_tokens: spec.maxTokens,
    system: nudge ? `${spec.system(fields)}\n\n${nudge}` : spec.system(fields),
    messages,
    output_config: {
      effort: spec.effort || "medium",
      format: { type: "json_schema", schema: spec.schema },
    },
  };

  const message = await client.messages.create(payload);

  // Potrosnja po pozivu — da se u logu vidi sta stvarno kosta.
  const u = message.usage || {};
  console.log(
    `[tokeni] ${spec.model} in=${u.input_tokens ?? "?"} out=${u.output_tokens ?? "?"}` +
      ` stop=${message.stop_reason}${nudge ? " (ponovni pokusaj)" : ""}`
  );

  if (message.stop_reason === "refusal") {
    return { ok: false, fatal: "Model je odbio ovaj zahtev. Promeni unos." };
  }
  if (message.stop_reason === "max_tokens") {
    return { ok: false, reason: "odgovor je presecen na max_tokens" };
  }

  return parseGuarded(textOf(message));
}

// ——— Ruta ————————————————————————————————————————————————————

export async function POST(req) {
  let body;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_CHARS) {
      return bad("Zahtev je prevelik.", 413);
    }
    body = JSON.parse(raw);
  } catch {
    return bad("Neispravan zahtev.");
  }

  // PIN se proverava na serveru. Bez ovoga bi svako mogao da gadja rutu
  // direktno i trosi kredite. Ako APP_PIN nije postavljen, zastita je iskljucena.
  const pin = process.env.APP_PIN;
  if (pin && req.headers.get("x-app-pin") !== pin) {
    return Response.json({ error: "Pogrešan PIN" }, { status: 401 });
  }

  // Provera PIN-a bez trosenja kredita — koristi je ekran za otkljucavanje.
  if (body.check) {
    return Response.json({ ok: true });
  }

  const taskName = typeof body.task === "string" ? body.task : "";
  const spec = Object.prototype.hasOwnProperty.call(TASKS, taskName)
    ? TASKS[taskName]
    : null;
  if (!spec) {
    return bad("Nepoznat zadatak.");
  }

  const fields = body.fields && typeof body.fields === "object" ? body.fields : {};
  if (!fields.level) fields.level = "A1";

  const invalid = validate(spec, taskName, fields);
  if (invalid) return bad(invalid);

  const limited = rateLimited(clientIp(req));
  if (limited) {
    return Response.json(
      { error: `Previše zahteva u ${limited}. Sačekaj malo pa pokušaj ponovo.` },
      { status: 429 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY nije postavljen na serveru." },
      { status: 500 }
    );
  }

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    // Potreban samo za identity-linked kljuceve.
    ...(process.env.ANTHROPIC_WORKSPACE_ID
      ? { defaultHeaders: { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } }
      : {}),
  });

  try {
    let result = await callModel(client, spec, fields);

    // Jedan ponovni pokusaj ako JSON nije prosao.
    if (!result.ok && !result.fatal) {
      result = await callModel(
        client,
        spec,
        fields,
        "PRETHODNI ODGOVOR NIJE BIO ISPRAVAN JSON. Odgovori isključivo validnim JSON objektom po zadatoj šemi, bez ikakvog teksta i bez markdown ograda."
      );
    }

    if (result.fatal) {
      return Response.json({ error: result.fatal }, { status: 422 });
    }
    if (!result.ok) {
      console.error("Neispravan JSON iz modela:", taskName, result.reason);
      return Response.json(
        { error: "Odgovor nije stigao u očekivanom obliku. Pokušaj ponovo." },
        { status: 502 }
      );
    }

    return Response.json({ data: result.value });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic auth:", e.message);
      return Response.json({ error: "API ključ nije prihvaćen." }, { status: 500 });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return Response.json(
        { error: "Anthropic je trenutno zagušen. Pokušaj za minut." },
        { status: 429 }
      );
    }
    if (e instanceof Anthropic.APIError) {
      console.error("Anthropic API:", e.status, e.message);
      return Response.json({ error: "Greška na strani modela." }, { status: 502 });
    }
    console.error("Nepoznata greška:", e);
    return Response.json({ error: "Nepoznata greška na serveru." }, { status: 500 });
  }
}
