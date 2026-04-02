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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transactions, activity } = (await req.json()) as {
      transactions: TransactionInput[];
      activity: string;
    };

    if (!transactions?.length || !activity) {
      return new Response(
        JSON.stringify({ error: "Missing transactions or activity" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const txList = transactions.map((tx, i) => 
      `${i}: "${tx.description}" | ${tx.amount} | ${tx.sourceAccount || "N/A"}`
    ).join("\n");

    const systemPrompt = `You are a financial transaction classification engine specialized in: ${activity}.

Your goal is to classify transactions EVEN when descriptions are unclear, generic, or contain only references (e.g. invoice numbers, codes).

IMPORTANT:
- Return ONLY valid JSON
- No explanation
- No text outside the JSON array

For each transaction, return:
- poste
- categorie_treso
- categorie_pnl
- confidence (0 to 100)
- needs_review (true or false)

Core logic:

1. Amount:
- Negative → expense → "Décaissements d'exploitation"
- Positive → revenue → "Encaissements d'exploitation"

2. Interpretation (CRITICAL):
If the description is unclear (e.g. "FACT", invoice number, code):
You MUST infer using:
- The business activity: ${activity}
- Typical business behavior
- Common accounting patterns

Examples:
- "FACT", "invoice", unknown supplier → default to "Achats de prestations de services"
- Random company name → assume supplier → expense
- Person name → salary or contractor → Masse salariale OR Honoraires
- Bank / transfer → Compte courant

Context rules:
- Adapt categorization to the business activity
- Example: in SaaS, 'Stripe' = revenue
- Example: in real estate, 'loyer' can be income or expense depending on context

3. Confidence scoring:
- Very clear keyword match (facebook, urssaf, loyer, etc.) → confidence: 90–100, needs_review: false
- Medium clarity (supplier name, partial meaning) → confidence: 60–80, needs_review: false
- Low clarity (FACT, REF, unknown code, vague text) → confidence: 30–60, needs_review: true
- Very ambiguous / guess → confidence: ≤40, needs_review: true

4. Default fallback (VERY IMPORTANT):
If you cannot clearly identify:
- For negative amount:
  → poste: "Achats de prestations de services"
  → categorie_treso: "Décaissements d'exploitation"
  → categorie_pnl: "Charges d'exploitation"
- For positive amount:
  → poste: "Chiffre d'affaires"
  → categorie_treso: "Encaissements d'exploitation"
  → categorie_pnl: "Produits d'exploitation"

5. Financial rules:
- NEVER classify financing as expense
- Taxes → Impôts et taxes
- Salaries → Masse salariale

Keyword hints:
- 'facebook', 'ads', 'google' → Publicité et marketing
- 'loyer' → Loyer et charges locatives
- 'urssaf' → Masse salariale
- 'salary', 'payroll' → Masse salariale
- 'loan', 'emprunt' → Emprunts et financements
- 'tax', 'tva' → Impôts et taxes
- 'stripe', 'payment', 'virement client' → Chiffre d'affaires
- 'assurance', 'insurance' → Assurances
- 'logiciel', 'software', 'saas', 'subscription' → Logiciels et abonnements

You MUST always return a classification. Never skip a transaction.

Return ONLY a valid JSON array with one object per transaction (same order as input):
[{"poste":"...","categorie_treso":"...","categorie_pnl":"...","confidence":75,"needs_review":false}]`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Categorize these ${transactions.length} transactions:\n${txList}` },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings → Workspace → Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Invalid AI response format");
    }

    const results = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify({ results }), {
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
