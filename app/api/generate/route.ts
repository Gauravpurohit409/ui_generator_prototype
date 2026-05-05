// const SYSTEM_PROMPT = `You are a UI designer and frontend developer.
// When given a description, output ONLY raw HTML with inline Tailwind CSS classes.
// Always include <script src="https://cdn.tailwindcss.com"></script> in the <head>.
// Use realistic dummy data. Make it look modern and polished.
// Output ONLY the HTML — no explanation, no markdown, no backticks.`;

const SYSTEM_PROMPT = `You are a senior frontend developer. Output a complete HTML page using Tailwind CSS.

STRICT RULES:
1. Start EXACTLY with: <!DOCTYPE html>
2. End EXACTLY with: </html>  
3. Nothing before <!DOCTYPE html>, nothing after </html>
4. No backticks, no markdown, no explanations

HEAD structure:
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>

Note: Tailwind will be injected automatically. Just use Tailwind classes freely.

LAYOUT for dashboards:
<body class="flex h-screen bg-gray-950 text-white overflow-hidden">
  <aside class="w-64 bg-gray-900 border-r border-gray-800 flex flex-col p-4">sidebar</aside>
  <div class="flex-1 flex flex-col overflow-hidden">
    <header class="h-16 bg-gray-900 border-b border-gray-800 flex items-center px-6">header</header>
    <main class="flex-1 overflow-y-auto p-6 bg-gray-950">content</main>
  </div>
</body>

STYLE RULES:
- Every element must have Tailwind classes
- Cards: rounded-xl p-6 bg-gray-800 border border-gray-700
- Buttons: rounded-lg px-4 py-2 font-medium transition-colors with hover state
- Inputs: w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-white
- Use real data: real names, numbers, dates
- Complete the full page — never truncate`;

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