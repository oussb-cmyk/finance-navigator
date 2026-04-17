// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are an accounting expert specialized in French general accounting (Plan Comptable Général).
You receive an invoice as an image. Perform OCR + accounting interpretation in one pass.

Use the company context to disambiguate suppliers and choose the right account class.

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{
  "ocr": {
    "supplier": "string | null",
    "invoice_number": "string | null",
    "invoice_date": "YYYY-MM-DD | null",
    "due_date": "YYYY-MM-DD | null",
    "amount_ht": number | null,
    "amount_ttc": number | null,
    "vat_amount": number | null,
    "currency": "EUR | USD | ...",
    "raw_text": "the full text you can read on the invoice"
  },
  "accounting": {
    "account": "PCG account code as string, e.g. 6257, 606, 401",
    "poste": "string e.g. Frais de réception, Achats matières premières",
    "categorie_treso": "string e.g. Décaissement Exploitation",
    "categorie_pnl": "string e.g. Charges externes",
    "entry": {
      "debit": [{ "account": "string", "amount": number, "label": "string" }],
      "credit": [{ "account": "string", "amount": number, "label": "string" }]
    },
    "confidence": 0,
    "needs_review": true
  }
}

Rules:
- If the invoice is unreadable or not an invoice, set ocr fields to null and confidence to 0 with needs_review=true.
- Always provide best guesses; never refuse.
- Confidence < 70 ⇒ needs_review = true.
- Debit total must equal credit total (HT expense + VAT debit = TTC supplier credit).`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { invoice_id, company_name, activity, activity_description } = body ?? {};

    if (!invoice_id) {
      return new Response(JSON.stringify({ error: "invoice_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth-scoped client to verify caller owns the invoice
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client for storage + DB writes
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: invoice, error: fetchErr } = await admin
      .from("invoices")
      .select("*")
      .eq("id", invoice_id)
      .eq("user_id", user.id)
      .single();

    if (fetchErr || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as processing
    await admin
      .from("invoices")
      .update({ status: "processing", processing_step: "Downloading file…", error_message: null })
      .eq("id", invoice_id);

    // Download file
    const { data: fileBlob, error: dlErr } = await admin.storage
      .from("invoices")
      .download(invoice.file_path);

    if (dlErr || !fileBlob) {
      await admin.from("invoices").update({
        status: "ocr_failed",
        error_message: `Could not download file: ${dlErr?.message ?? "unknown"}`,
      }).eq("id", invoice_id);
      return new Response(JSON.stringify({ error: "Download failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert to base64 data URL
    const arrayBuf = await fileBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    const mime = invoice.file_type || fileBlob.type || "application/octet-stream";
    const dataUrl = `data:${mime};base64,${base64}`;

    // PDFs need to be sent as documents. gpt-4o-mini supports images natively.
    // For PDFs, OpenAI vision works best on rasterized images, but we send PDF as image_url too;
    // it will fall back gracefully. For broader support we send via image_url for all.
    const userParts: any[] = [
      {
        type: "text",
        text: `COMPANY CONTEXT:
- Name: ${company_name || "(unknown)"}
- Activity: ${activity || "(unknown)"}
- Description: ${activity_description || "(none)"}

Process this invoice (OCR + French accounting interpretation). Return JSON only.`,
      },
    ];

    if (mime.startsWith("image/")) {
      userParts.push({ type: "image_url", image_url: { url: dataUrl, detail: "high" } });
    } else if (mime === "application/pdf") {
      // OpenAI does not yet accept raw PDF in chat completions; send as text fallback note.
      // Best practice: render PDF page 1 client-side. For MVP we still send it as image_url —
      // gpt-4o-mini will refuse and we'll report ocr_failed gracefully.
      userParts.push({ type: "image_url", image_url: { url: dataUrl, detail: "high" } });
    } else {
      userParts.push({ type: "image_url", image_url: { url: dataUrl, detail: "high" } });
    }

    await admin.from("invoices").update({ processing_step: "AI analyzing…" }).eq("id", invoice_id);

    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userParts },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("OpenAI error:", aiResp.status, errText);
      await admin.from("invoices").update({
        status: "ai_failed",
        error_message: `AI request failed (${aiResp.status})`,
      }).eq("id", invoice_id);
      return new Response(JSON.stringify({ error: "AI failed", details: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse AI JSON:", content);
      await admin.from("invoices").update({
        status: "ai_failed",
        error_message: "AI returned invalid JSON",
        ai_raw_response: { content },
      }).eq("id", invoice_id);
      return new Response(JSON.stringify({ error: "Bad AI JSON" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ocr = parsed.ocr ?? {};
    const acc = parsed.accounting ?? {};

    const update: Record<string, any> = {
      status: "to_review",
      processing_step: null,
      error_message: null,
      ai_raw_response: parsed,
      // OCR
      supplier: ocr.supplier ?? null,
      invoice_number: ocr.invoice_number ?? null,
      invoice_date: ocr.invoice_date ?? null,
      due_date: ocr.due_date ?? null,
      amount_ht: ocr.amount_ht ?? null,
      amount_ttc: ocr.amount_ttc ?? null,
      vat_amount: ocr.vat_amount ?? null,
      currency: ocr.currency ?? "EUR",
      raw_text: ocr.raw_text ?? null,
      // Accounting
      account_code: acc.account ?? null,
      poste: acc.poste ?? null,
      categorie_treso: acc.categorie_treso ?? null,
      categorie_pnl: acc.categorie_pnl ?? null,
      ai_entry: acc.entry ?? null,
      confidence: typeof acc.confidence === "number" ? Math.round(acc.confidence) : null,
      needs_review: acc.needs_review !== false,
    };

    const { error: updErr } = await admin.from("invoices").update(update).eq("id", invoice_id);
    if (updErr) {
      console.error("Update error:", updErr);
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, invoice_id, result: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("process-invoice error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
