import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TransactionInput {
  id: string;
  description: string;
  amount: number;
  sourceAccount?: string;
}

function extractJsonArray(content: string): unknown[] {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* continue */ }

  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (Array.isArray(parsed)) return parsed;
    } catch { /* continue */ }
  }

  const arrayMatch = content.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch {
      let repaired = arrayMatch[0];
      let braces = 0, brackets = 0;
      for (const c of repaired) {
        if (c === '{') braces++;
        if (c === '}') braces--;
        if (c === '[') brackets++;
        if (c === ']') brackets--;
      }
      while (braces > 0) { repaired += '}'; braces--; }
      while (brackets > 0) { repaired += ']'; brackets--; }
      try { return JSON.parse(repaired); } catch { /* fall through */ }
    }
  }

  throw new Error("Could not extract valid JSON array from response");
}

function defaultResult(tx: TransactionInput) {
  const isExpense = tx.amount < 0;
  return {
    poste: isExpense ? "Achats de prestations de services" : "Chiffre d'affaires",
    categorie_treso: isExpense ? "Décaissements d'exploitation" : "Encaissements d'exploitation",
    categorie_pnl: isExpense ? "Charges d'exploitation" : "Produits d'exploitation",
    confidence: 10,
    needs_review: true,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transactions, activity, companyName, activityDescription } = (await req.json()) as {
      transactions: TransactionInput[];
      activity: string;
      companyName?: string;
      activityDescription?: string;
    };

    console.log(`Received ${transactions?.length ?? 0} transactions | company: ${companyName ?? 'N/A'} | activity: ${activity}`);

    if (!transactions?.length || !activity) {
      return new Response(
        JSON.stringify({ error: "Missing transactions or activity" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is not configured");
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const txList = transactions.map((tx, i) =>
      `${i}: "${tx.description}" | ${tx.amount} | ${tx.sourceAccount || "N/A"}`
    ).join("\n");

    const systemPrompt = `You are a financial analyst.

Company context:
- Company name: ${companyName || 'N/A'}
- Industry: ${activity}
- Description: ${activityDescription || activity}

Use this context to interpret transactions.

Important:
- You MUST infer meaning even if descriptions are unclear
- Examples:
  "TICKETNET" → ticket sales → revenue
  "URSSAF" → social charges
  "VIR EUROPEEN" → generic transfer → infer from amount and context
- If unsure, still provide best guess and set "confidence" low (30-60) and "needs_review": true

Return ONLY a valid JSON array. NO text, NO explanation, NO markdown.

Each item must be:
{"poste":"...","categorie_treso":"...","categorie_pnl":"...","confidence":0-100,"needs_review":true/false}

Rules:
- Negative amount → expense → categorie_treso: "Décaissements d'exploitation"
- Positive amount → revenue → categorie_treso: "Encaissements d'exploitation"
- Default expense: poste "Achats de prestations de services", categorie_pnl "Charges d'exploitation"
- Default revenue: poste "Chiffre d'affaires", categorie_pnl "Produits d'exploitation"
- Clear keyword → confidence 90-100, needs_review false
- Medium clarity → confidence 60-80, needs_review false
- Low clarity → confidence 30-60, needs_review true
- Taxes → "Impôts et taxes", Salaries → "Masse salariale"

Keywords: facebook/ads/google → Publicité, loyer → Loyer, urssaf → Masse salariale, stripe → Chiffre d'affaires, assurance → Assurances, logiciel/saas → Logiciels et abonnements

Return exactly ${transactions.length} items. ONLY JSON ARRAY.`;

    console.log("Calling OpenAI ChatGPT API...");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Categorize these ${transactions.length} transactions:\n${txList}` },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      }),
    });

    console.log(`OpenAI response status: ${response.status}`);

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI API error:", response.status, errText);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 401) {
        return new Response(
          JSON.stringify({ error: "Invalid OpenAI API key." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content || "";
    console.log("RAW AI RESPONSE:", rawText.substring(0, 500));

    let results: unknown[];
    try {
      results = extractJsonArray(rawText);
    } catch (parseErr) {
      console.error("JSON PARSE ERROR:", parseErr, "Raw:", rawText.substring(0, 300));
      results = transactions.map(defaultResult);
    }

    if (results.length !== transactions.length) {
      console.error(`Result count mismatch: expected ${transactions.length}, got ${results.length}`);
      while (results.length < transactions.length) {
        results.push(defaultResult(transactions[results.length]));
      }
      results = results.slice(0, transactions.length);
    }

    const sanitized = results.map((item: any, i: number) => ({
      poste: item.poste || defaultResult(transactions[i]).poste,
      categorie_treso: item.categorie_treso || defaultResult(transactions[i]).categorie_treso,
      categorie_pnl: item.categorie_pnl || defaultResult(transactions[i]).categorie_pnl,
      confidence: typeof item.confidence === "number" ? item.confidence : 10,
      needs_review: typeof item.needs_review === "boolean" ? item.needs_review : true,
    }));

    console.log(`Successfully categorized ${sanitized.length} transactions`);

    return new Response(JSON.stringify({ results: sanitized }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("categorize-transactions error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
