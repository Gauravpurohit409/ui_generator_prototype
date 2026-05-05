// const SYSTEM_PROMPT = `You are a UI designer and frontend developer.
// When given a description, output ONLY raw HTML with inline Tailwind CSS classes.
// Always include <script src="https://cdn.tailwindcss.com"></script> in the <head>.
// Use realistic dummy data. Make it look modern and polished.
// Output ONLY the HTML — no explanation, no markdown, no backticks.`;

const SYSTEM_PROMPT = `You are a senior frontend developer. Output a complete HTML page using Tailwind CSS.

CRITICAL — NEVER BREAK THESE TAGS ACROSS LINES:
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"></script>
Each of these must be on a single line exactly as shown above.

STRICT RULES:
1. Start EXACTLY with: <!DOCTYPE html>
2. End EXACTLY with: </html>
3. Nothing before <!DOCTYPE html>, nothing after </html>
4. No backticks, no markdown, no explanations ever

HEAD must be exactly:
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"></script>
</head>

LAYOUT: For dashboards use this exact body structure:
<body class="flex h-screen bg-gray-950 text-white overflow-hidden">
  <aside class="w-64 bg-gray-900 border-r border-gray-800 flex flex-col p-4">sidebar here</aside>
  <div class="flex-1 flex flex-col overflow-hidden">
    <header class="h-16 bg-gray-900 border-b border-gray-800 flex items-center px-6">header here</header>
    <main class="flex-1 overflow-y-auto p-6 bg-gray-950">content here</main>
  </div>
</body>

STYLE RULES:
- Every element must have Tailwind classes — no naked HTML ever
- Cards: rounded-xl p-6 bg-gray-800 border border-gray-700
- Buttons: rounded-lg px-4 py-2 font-medium transition-colors with hover state
- Inputs: w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-white
- Use real data: names, numbers, dates — never lorem ipsum
- For charts use CSS bar divs, never leave sections empty
- Complete the full page — never truncate

ICONS: use only these exact SVG snippets:
Home: <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
User: <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
Bell: <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
Chart: <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>`;


export async function POST(req: Request) {
  const { prompt } = (await req.json()) as { prompt?: string };

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      stream: true,
      max_tokens: 4096,  
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Design this UI: ${prompt}` }
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