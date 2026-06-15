/**
 * Minimal markdown → HTML conversion and template variable substitution
 * for bulk email campaigns. Safe by design: variables are inserted before
 * markdown conversion so they cannot inject HTML.
 */

const ALLOWED_VARS = ['founder_name', 'founder_first_name', 'startup_name'] as const
export type TemplateVar = typeof ALLOWED_VARS[number]

export interface TemplateContext {
  founder_name?: string
  founder_first_name?: string
  startup_name?: string
}

/** Escape HTML special chars to neutralize anything user-typed. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Replace {{var}} placeholders in the raw text with values from ctx. */
export function applyVariables(raw: string, ctx: TemplateContext): string {
  return raw.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_match, name: string) => {
    if (!ALLOWED_VARS.includes(name as TemplateVar)) return `{{${name}}}`
    const value = ctx[name as TemplateVar]
    return value ?? ''
  })
}

/**
 * Convert minimal markdown to HTML:
 *  **bold**, *italic*, [text](url), \n\n → paragraphs, single \n → <br>.
 * Input is escaped first so user can't inject HTML.
 */
export function markdownToHtml(raw: string): string {
  const escaped = escapeHtml(raw)
  // Convert links FIRST (otherwise * inside URLs would be matched)
  let html = escaped.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, text: string, url: string) => {
      // Allow only http(s) and mailto
      if (!/^(https?:|mailto:)/.test(url)) return text
      return `<a href="${url}" style="color:#10b981;text-decoration:underline;" target="_blank" rel="noopener noreferrer">${text}</a>`
    },
  )
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // Italic (only outside <strong>)
  html = html.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>')
  // Paragraphs + line breaks
  const blocks = html.split(/\n{2,}/).map(b => b.trim()).filter(Boolean)
  return blocks.map(b => `<p style="margin:0 0 14px 0;">${b.replace(/\n/g, '<br/>')}</p>`).join('')
}

/** Build the full HTML email body for one recipient. */
export function buildHtmlBody(rawMarkdown: string, ctx: TemplateContext, opts: {
  trackingPixelUrl: string
  unsubscribeUrl: string
}): string {
  const withVars = applyVariables(rawMarkdown, ctx)
  const content = markdownToHtml(withVars)
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:32px 28px;line-height:1.55;font-size:15px;">
    ${content}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0 16px;">
    <p style="font-size:11px;color:#9ca3af;margin:0;">
      Vous recevez cet email car vous avez candidaté au programme The Builders by CEED Maroc.<br>
      <a href="${opts.unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Se désabonner</a>
    </p>
  </div>
  <img src="${opts.trackingPixelUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;">
</body>
</html>`
}

/** Plain text fallback (also helps deliverability). */
export function buildTextBody(rawMarkdown: string, ctx: TemplateContext, opts: { unsubscribeUrl: string }): string {
  const withVars = applyVariables(rawMarkdown, ctx)
  return `${withVars}

---
Vous recevez cet email car vous avez candidaté au programme The Builders by CEED Maroc.
Se désabonner : ${opts.unsubscribeUrl}`
}

export function generateTrackingToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}
