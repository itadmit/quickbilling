/**
 * Shared HTML envelope for all transactional emails. RTL Hebrew, minimal CSS.
 * Adapted from QS10's dunning-notifications.ts pattern.
 */
export function emailLayout(params: {
  title: string;
  preheader?: string;
  bodyHtml: string;
  ctaUrl?: string;
  ctaLabel?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(params.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  ${params.preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(params.preheader)}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:12px;border:1px solid #e5e5e5;max-width:560px;">
          <tr><td style="padding:32px 32px 24px;">
            <div style="font-size:13px;color:#737373;margin-bottom:8px;">Quick Commerce</div>
            <h1 style="margin:0;font-size:20px;font-weight:600;color:#171717;">${escapeHtml(params.title)}</h1>
          </td></tr>
          <tr><td style="padding:0 32px 24px;font-size:15px;line-height:1.6;color:#404040;">${params.bodyHtml}</td></tr>
          ${
            params.ctaUrl && params.ctaLabel
              ? `<tr><td style="padding:0 32px 32px;">
                  <a href="${escapeAttr(params.ctaUrl)}" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:500;font-size:14px;">${escapeHtml(params.ctaLabel)}</a>
                </td></tr>`
              : ""
          }
          <tr><td style="padding:24px 32px;border-top:1px solid #f0f0f0;font-size:12px;color:#a3a3a3;">
            הודעה זו נשלחה אוטומטית ממערכת החיובים של Quick Commerce. במידה שיש שאלה — השב לאימייל.
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}
