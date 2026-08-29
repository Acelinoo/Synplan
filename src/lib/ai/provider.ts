interface AiProviderConfig {
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  isGemini: boolean;
}

export function getAiConfig(): AiProviderConfig {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
  const isGemini = !!apiKey && (apiKey.startsWith("AIzaSy") || apiKey.startsWith("AQ.") || (!apiKey.startsWith("sk-") && apiKey.length > 30));

  let apiUrl = process.env.AI_API_URL;
  let model = process.env.AI_MODEL;

  if (!model || (isGemini && (model.includes("gpt") || model.includes("1.5") || model.includes("2.5-flash")))) {
    model = isGemini ? "gemini-3.6-flash" : "gpt-4o-mini";
  }

  return { apiKey, apiUrl, model, isGemini };
}

/**
 * Sends a structured prompt to the configured LLM API provider.
 * Supports native Google Gemini API (gemini-3.6-flash, gemini-flash-latest, gemini-pro-latest) and OpenAI.
 */
export async function callExternalAiProvider(
  prompt: string,
  systemPrompt: string
): Promise<{ text: string; provider: "gemini" | "openai" } | null> {
  const config = getAiConfig();

  if (!config.apiKey) {
    return null;
  }

  // 1. Google Gemini Native Generative Language API Call
  if (config.isGemini || config.model?.includes("gemini")) {
    const cleanModelName = (config.model || "gemini-3.6-flash").replace(/^models\//, "");
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:generateContent?key=${config.apiKey}`;

    try {
      const res = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${systemPrompt}\n\nUser natural language instruction:\n"${prompt}"` }],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return { text, provider: "gemini" };
        }
      } else if (res.status === 429) {
        console.warn(`[AI Provider] Gemini rate limited (429), delegating gracefully to fallback.`);
        return null;
      } else {
        console.warn(`[AI Provider] Gemini (${cleanModelName}) returned status ${res.status}`);
      }
    } catch (err: any) {
      console.warn(`[AI Provider] Gemini (${cleanModelName}) network error:`, err?.message || err);
    }
  }

  // 2. OpenAI / Standard Chat Completions Fallback
  try {
    const openaiUrl = config.apiUrl || "https://api.openai.com/v1/chat/completions";
    const res = await fetch(openaiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model: config.model || "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (text) {
        return { text, provider: "openai" };
      }
    }
  } catch (openaiErr: any) {
    console.warn("[AI Provider] OpenAI endpoint error:", openaiErr?.message || openaiErr);
  }

  return null;
}
