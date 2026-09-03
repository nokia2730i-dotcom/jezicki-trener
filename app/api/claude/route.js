// app/api/claude/route.js
// Serverska ruta — API ključ ostaje na serveru, nikad ne stiže do pregledača.

export async function POST(req) {
  try {
    const body = await req.json();

    // Ključevi vezani za identitet (identity-linked) traže i workspace ID.
    // Obični ključevi ga ne traže, pa se zaglavlje šalje samo ako je postavljeno.
    const headers = {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    };
    if (process.env.ANTHROPIC_WORKSPACE_ID) {
      headers["anthropic-workspace-id"] = process.env.ANTHROPIC_WORKSPACE_ID;
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system: body.system,
        messages: body.messages,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return Response.json({ error: "Anthropic API", detail }, { status: res.status });
    }

    const data = await res.json();
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
