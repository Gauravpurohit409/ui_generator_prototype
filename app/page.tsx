"use client";

import { useState } from "react";

const PLACEHOLDER_HTML =
  "<body style='display:flex;align-items:center;justify-content:center;height:100vh;color:#888;font-family:sans-serif'>Your UI will appear here</body>";

  const fixHtml = (raw: string) => {
    let html = raw
      .replace(/```html/gi, "")
      .replace(/```/g, "")
      .trim();
  
    // Nuclear option: remove ANY script tag referencing tailwind (broken or not)
    html = html.replace(/<script[^>]*tailwind[^>]*>[\s\S]*?<\/script>/gi, "");
    // Also remove orphaned src= lines the model leaves behind
    html = html.replace(/^\s*src=["']https:\/\/cdn\.tailwindcss\.com["'][^>]*>\s*$/gm, "");
  
    // Now inject a guaranteed correct Tailwind script into <head>
    html = html.replace(
      /<\/head>/i,
      `<script src="https://cdn.tailwindcss.com"></script>\n</head>`
    );
  
    return html;
  };

/** Normalize streamed model output (fences, split tags) before preview. */
function sanitizeModelHtml(accumulated: string): string {
  return accumulated
    .replace(/```html/gi, "")
    .replace(/```/g, "")
    // Fix broken script tag — model splits it across lines
    .replace(
      /<script[\s\S]*?src=["']https:\/\/cdn\.tailwindcss\.com["'][\s\S]*?><\/script>/gi,
      '<script src="https://cdn.tailwindcss.com"></script>',
    )
    // Fix broken meta viewport tag
    .replace(
      /<meta\s+name=["']viewport["']\s+content=["'][^"']*["']\s*\/?>/gi,
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    )
    // Fix broken charset meta
    .replace(
      /<meta\s+charset=["'][^"']*["']\s*\/?>/gi,
      '<meta charset="UTF-8">',
    )
    .trim();
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    const cleaned = fixHtml(prompt);
    setHtml(cleaned);
    setError(null);

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!res.ok) {
      try {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? `Request failed (${res.status})`);
      } catch {
        setError(`Request failed (${res.status})`);
      }
      setLoading(false);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      setError("No response body");
      setLoading(false);
      return;
    }

    const decoder = new TextDecoder();
    let accumulated = "";
    let sseBuffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        sseBuffer += decoder.decode(value, { stream: !done });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as { text?: string; error?: string };
            if (parsed.error) {
              setError(parsed.error);
              setLoading(false);
              return;
            }
            if (parsed.text) {
              accumulated += parsed.text;
              setHtml(sanitizeModelHtml(accumulated));
            }
          } catch {
            // ignore malformed SSE lines
          }
        }

        if (done) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Read failed");
    }

    setLoading(false);
  }

  return (
    <div className="flex h-screen min-h-0 flex-col bg-gray-950 text-white">
      <div className="flex gap-2 border-b border-gray-800 p-4">
        <input
          className="flex-1 rounded-lg bg-gray-900 px-4 py-2 text-sm outline-none ring-violet-500 focus:ring-2"
          placeholder="Describe a UI... e.g. 'a fintech dashboard with charts'"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && prompt && generate()}
        />
        <button
          type="button"
          onClick={generate}
          disabled={loading || !prompt}
          className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-medium hover:bg-violet-500 disabled:opacity-40"
        >
          {loading ? "Generating..." : "Generate"}
        </button>
      </div>
      {error && (
        <div className="border-b border-red-900/50 bg-red-950/40 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <iframe
          title="Generated UI preview"
          className="min-h-0 flex-1 bg-white"
          srcDoc={html || PLACEHOLDER_HTML}
          sandbox="allow-scripts"
        />
        {html ? (
          <div className="flex w-1/3 min-w-0 flex-col overflow-hidden border-l border-gray-800 bg-gray-900">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-4 py-2 text-xs text-gray-400">
              <span>HTML</span>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(html)}
                className="hover:text-white"
              >
                Copy
              </button>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto p-4 text-xs whitespace-pre-wrap text-green-400">
              {html}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
