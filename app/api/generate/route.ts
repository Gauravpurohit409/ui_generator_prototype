// const SYSTEM_PROMPT = `You are a UI designer and frontend developer.
// When given a description, output ONLY raw HTML with inline Tailwind CSS classes.
// Always include <script src="https://cdn.tailwindcss.com"></script> in the <head>.
// Use realistic dummy data. Make it look modern and polished.
// Output ONLY the HTML — no explanation, no markdown, no backticks.`;

const SYSTEM_PROMPT = `You are a UI designer and frontend developer.
When given a description, output ONLY raw HTML.
Rules:
- Start with <!DOCTYPE html>
- In <head>, include EXACTLY this script tag: <script src="https://cdn.tailwindcss.com"></script>
- Use Tailwind utility classes for all styling
- Use realistic dummy data
- Make it look modern and polished
- Output ONLY the HTML — no explanation, no markdown, no triple backticks, no code fences`;


export async function POST(req) {
  const { prompt } = await req.json();

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Design this UI: ${prompt}` }
      ],
    }),
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const reader = response.body.getReader();
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