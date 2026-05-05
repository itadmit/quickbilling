/**
 * Shared HTML envelope for all transactional emails. RTL Hebrew, minimal CSS.
 *
 * RTL handling notes:
 * - Gmail/Outlook largely ignore <html dir="rtl"> — direction must be set
 *   on the rendered elements (table, td, div) AND every text container
 *   needs an explicit `text-align: right` because email clients reset
 *   direction-derived alignment.
 * - The outer table uses dir="rtl" + lang="he" so that Outlook's MSO
 *   conditional rendering picks up the right direction.
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
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <title>${escapeHtml(params.title)}</title>
</head>
<body dir="rtl" style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;text-align:right;direction:rtl;">
  ${params.preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(params.preheader)}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl" style="background:#f5f5f5;direction:rtl;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" dir="rtl" style="background:#ffffff;border-radius:12px;border:1px solid #e5e5e5;max-width:560px;direction:rtl;">
          <tr><td dir="rtl" style="padding:32px 32px 24px;text-align:right;direction:rtl;">
            <div style="font-size:13px;color:#737373;margin-bottom:8px;text-align:right;">Quick Commerce</div>
            <h1 style="margin:0;font-size:20px;font-weight:600;color:#171717;text-align:right;direction:rtl;">${escapeHtml(params.title)}</h1>
          </td></tr>
          <tr><td dir="rtl" style="padding:0 32px 24px;font-size:15px;line-height:1.6;color:#404040;text-align:right;direction:rtl;">${params.bodyHtml}</td></tr>
          ${
            params.ctaUrl && params.ctaLabel
              ? `<tr><td dir="rtl" style="padding:0 32px 32px;text-align:right;direction:rtl;">
                  <a href="${escapeAttr(params.ctaUrl)}" style="display:inline-block;background:#033841;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:500;font-size:14px;">${escapeHtml(params.ctaLabel)}</a>
                </td></tr>`
              : ""
          }
          <tr><td dir="rtl" style="padding:24px 32px;border-top:1px solid #f0f0f0;font-size:12px;color:#a3a3a3;text-align:right;direction:rtl;">
            הודעה זו נשלחה אוטומטית ממערכת החיובים של Quick Commerce.<br />
            אם יש לך שאלה — פשוט השב לאימייל הזה.
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Render a plain-text fallback from the same content. Multipart emails
 * (HTML + text) score better with Gmail's spam filter — sending HTML-only
 * is treated as a weak signal.
 */
export function emailPlainText(params: {
  title: string;
  bodyText: string;
  ctaUrl?: string;
  ctaLabel?: string;
}): string {
  const cta =
    params.ctaUrl && params.ctaLabel
      ? `\n\n${params.ctaLabel}: ${params.ctaUrl}\n`
      : "";
  return [
    `Quick Commerce`,
    ``,
    params.title,
    ``,
    params.bodyText,
    cta,
    ``,
    `--`,
    `הודעה אוטומטית ממערכת החיובים של Quick Commerce.`,
    `אם יש לך שאלה — השב לאימייל הזה.`,
  ].join("\n");
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
