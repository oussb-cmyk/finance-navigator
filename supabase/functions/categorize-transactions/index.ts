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

    // Build a compact list for the prompt
    const txList = transactions.map((tx, i) => 
      `${i}: "${tx.description}" | ${tx.amount} | ${tx.sourceAccount || "N/A"}`
    ).join("\n");

    const systemPrompt = `You are a financial analyst specialized in the following business activity: ${activity}.

Categorize each transaction into:
- Poste (detailed category)
- Catégorie Tréso (cash flow category)
- Catégorie P&L (Profit & Loss category)

Context rules:
- Adapt categorization to the business activity
- Example: in SaaS, 'Stripe' = revenue
- Example: in real estate, 'loyer' can be income or expense depending on context

General rules:
- Negative amounts = expenses (Décaissements)
- Positive amounts = revenue (Encaissements)

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

Valid Postes: Masse salariale, Loyer et charges locatives, Publicité et marketing, Frais bancaires, Honoraires et conseils, Fournitures et consommables, Déplacements et missions, Assurances, Télécommunications, Logiciels et abonnements, Impôts et taxes, Chiffre d'affaires, Subventions, Investissements, Emprunts et financements, Remboursements clients, Frais de personnel divers, Entretien et réparations, Formation, Amortissements, Autres charges, Autres produits

Valid Catégorie Tréso: Encaissement client, Décaissement fournisseur, Salaires et charges sociales, Loyer, Impôts, Frais bancaires, Investissement, Financement, TVA, Remboursement, Divers

Valid Catégorie P&L: Chiffre d'affaires, Achats et charges externes, Charges de personnel, Impôts et taxes, Dotations amortissements, Charges financières, Produits financiers, Charges exceptionnelles, Produits exceptionnels, Autres produits, Autres charges

Return ONLY a valid JSON array with one object per transaction (same order as input):
[{"poste":"...","categorie_treso":"...","categorie_pnl":"..."}]`;

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

    // Extract JSON from response (handle markdown code blocks)
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
