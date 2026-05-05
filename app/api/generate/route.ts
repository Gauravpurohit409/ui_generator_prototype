const SYSTEM_PROMPT = `You are a senior frontend developer. Output ONE clean, complete HTML page for the requested UI. Aim for the look of Stripe / Linear / Notion: simple, light, well-spaced, professional. Not flashy.

RULES
- Start with <!DOCTYPE html>. End with </html>. No prose, no markdown, no backticks.
- Tailwind is injected automatically — do NOT add a Tailwind <script>.
- Use STANDARD short Tailwind classes. Do NOT use arbitrary values like ring-slate-900/[0.06] or shadow-[0_1px_2px_rgba(...)].
- NO <img> tags. NO external URLs (no picsum, dicebear, unsplash, placehold.co).
- Icons: inline <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"> with class="h-5 w-5" (or h-4 w-4) — always include size classes.
- Avatars: initials in a colored circle, e.g. <span class="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-medium text-indigo-700">AS</span>.
- Photo/artwork placeholder: <div class="aspect-video w-full rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500"></div>.
- Close every tag. Fill the page completely. Never truncate.

HEAD
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>...</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>html,body{font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased}</style>
</head>

DESIGN
- Default to light theme: bg-white or bg-slate-50, text-slate-900, accent indigo-600 (or violet-600).
- Dark theme only if explicitly requested: bg-slate-950, text-slate-100, accent violet-500.
- ONE accent hue per page. Soft, restrained. Not neon.

STANDARD COMPONENT CLASSES (use these exactly)
- Card:        rounded-xl border border-slate-200 bg-white p-6 shadow-sm
- Section:     px-6 py-12 lg:px-10
- Heading:     text-3xl font-semibold tracking-tight text-slate-900
- Subheading:  text-lg text-slate-600
- Body text:   text-sm text-slate-600 leading-6
- Label:       text-sm font-medium text-slate-700
- Primary btn: inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800
- Ghost btn:   inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50
- Input:       w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
- Badge:       inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800
- Divider:     border-slate-200
- Cap font weight at font-semibold (600). Never font-bold or font-black.

LAYOUTS (pick the one that matches the request)
- Marketing/landing: top nav (logo + 4 links + sign-in btn) → hero (heading, 1-line subheading, 2 CTAs, gradient artwork on right) → 3-column feature grid with svg icons → simple testimonial quote → pricing (3 plan cards) → footer with 4 link columns.
- Auth (login/signup): centered max-w-sm card on bg-slate-50 background, brand mark on top, form with email + password + primary button, "or" divider, secondary social button, footer link.
- Dashboard: <body class="flex min-h-screen bg-slate-50">, sidebar w-60 bg-white border-r border-slate-200 with logo + 5 nav links + user card at bottom; main column with header (h-14, page title + actions) and content area (4 stat cards in a grid, then a card containing an inline-svg line chart, then a data table with avatars).
- Settings: two columns — left section nav (5 items), right grouped form cards (Profile, Account, Notifications) each with labeled inputs and a Save button.

CONTENT
- Real product/brand name (e.g. "Lumen", "Vault", "Halo"). Real people with first+last names. Real numbers ($12,480), real dates (Mar 14, 2026).
- No "Lorem ipsum", no "Card 1 / Card 2", no empty placeholders.
- Every page must feel filled — every section has actual content, not just headings.

OUTPUT THE COMPLETE HTML NOW.`;

export async function POST(req: Request) {
  const { prompt } = (await req.json()) as { prompt?: string };

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      stream: true,
      max_tokens: 6000,
      temperature: 0.3,
      top_p: 0.9,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Build a clean, complete page for: ${prompt}

Pick the right layout (marketing / auth / dashboard / settings). Use the standard component classes from the rules. Fill every section with real content. Output ONLY the HTML.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return Response.json(
      { error: detail || `Groq request failed (${response.status})` },
      { status: response.status >= 500 ? 502 : response.status },
    );
  }

  const upstream = response.body;
  if (!upstream) {
    return Response.json({ error: "No response body from Groq" }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && !line.includes("[DONE]")) {
            try {
              const json = JSON.parse(line.slice(6));
              const text = json.choices?.[0]?.delta?.content || "";
              if (text) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
              }
            } catch {}
          }
        }
      }

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}