import { config } from "./config";
import { formatDateNl } from "./time";
import { STATUS_LABELS, type NewsletterContent } from "./types";

// E-mailverzending via Resend (https://resend.com). Uitgeschakeld tot
// RESEND_API_KEY én een ontvanger in Instellingen zijn ingevuld. Een andere
// provider (SMTP, Postmark) is alleen een andere implementatie van deze functie.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderEmailHtml(n: NewsletterContent, dashboardUrl?: string): string {
  const h = n.headlines
    .map(
      (x) => `<tr><td style="padding:14px 0;border-bottom:1px solid #e5e5e5">
  <div style="font-size:12px;color:#666">${esc(STATUS_LABELS[x.status])} · relevantie ${x.relevance}/10</div>
  <div style="font-size:17px;font-weight:600;margin:4px 0">${esc(x.title)}</div>
  <div style="font-size:14px;line-height:1.5">${esc(x.summary)}</div>
  ${x.whyItMatters ? `<div style="font-size:14px;line-height:1.5;margin-top:6px"><b>Waarom belangrijk:</b> ${esc(x.whyItMatters)}</div>` : ""}
  <div style="font-size:13px;margin-top:6px">${x.sources.map((s) => `<a href="${esc(s.url)}" style="color:#2563eb">${esc(s.name)}</a>`).join(" · ")}</div>
</td></tr>`,
    )
    .join("");
  const big = n.bigPicture
    ? `<h2 style="font-size:18px;margin-top:28px">The Big Picture</h2><p style="font-size:14px;line-height:1.6">${esc(n.bigPicture.keyDevelopment)}</p><p style="font-size:14px;line-height:1.6"><b>Onthoud:</b> ${esc(n.bigPicture.takeaway)}</p>`
    : "";
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111">
<h1 style="font-size:22px;margin:0">AI-nieuws · ${esc(formatDateNl(n.date))}</h1>
<h2 style="font-size:18px;margin-top:24px">Today's AI Headlines</h2>
<table style="width:100%;border-collapse:collapse">${h}</table>
${big}
${dashboardUrl ? `<p style="margin-top:28px"><a href="${esc(dashboardUrl)}" style="color:#2563eb">Volledige nieuwsbrief met tools, kansen en uitleg →</a></p>` : ""}
</body></html>`;
}

export async function sendNewsletterEmail(n: NewsletterContent, to: string, fetcher: typeof fetch = fetch): Promise<void> {
  if (!config.resendKey) throw new Error("RESEND_API_KEY ontbreekt");
  const res = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${config.resendKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: config.emailFrom,
      to: [to],
      subject: `AI-nieuws ${n.date}: ${n.headlines[0]?.title ?? "je dagelijkse update"}`,
      html: renderEmailHtml(n, process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL.replace(/\/$/, "")}/newsletter` : undefined),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Resend gaf HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
