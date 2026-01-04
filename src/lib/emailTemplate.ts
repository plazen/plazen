/**
 * Email template utilities for Plazen
 *
 * This module contains helper functions for converting lightweight markdown to
 * HTML suitable for email, extracting plain-text fallbacks, and composing full
 * HTML email templates. The functions are intentionally small and conservative
 * (email clients are fragile), and include simple styling to ensure decent
 * rendering across common clients.
 *
 * Exported utilities:
 * - markdownToHtml(markdown): quick markdown -> HTML conversion (not a full MD parser)
 * - toPlainText(content): strip markdown/HTML to safe plain text
 * - generateEmailTemplate(options): compose a full HTML email string
 * - generateEmailFromMarkdown(title, markdown, options): convenience builder
 * - emailTemplates: a set of pre-built templates for common admin emails.
 */
import striptags from "striptags";

export interface EmailTemplateOptions {
  title: string;
  preheader?: string;
  body: string;
  buttonText?: string;
  buttonUrl?: string;
  footerText?: string;
}

/**
 * Convert a small subset of Markdown into HTML suitable for emails.
 *
 * This is a lightweight implementation intentionally tailored for the content we
 * send via Plazen (headings, emphasis, code blocks, lists, links, images).
 * It:
 * - Escapes raw HTML first for safety
 * - Applies simple regex-based transforms for common markdown constructs
 * - Wraps plain paragraphs in <p> tags
 *
 * Limitations:
 * - Not a full CommonMark implementation; complex edge cases may not be covered.
 * - For complicated or user-submitted markdown, prefer a proper markdown library.
 *
 * @param markdown - input markdown text
 * @returns HTML string (fragment) ready to be embedded in an email template
 */
/**
 * Convert a small subset of Markdown into HTML suitable for emails.
 *
 * JSDoc for `markdownToHtml`:
 * - Purpose: Provide a conservative, email-friendly markdown -> HTML converter
 *   for content produced by the application. Not a full CommonMark parser.
 * - Behaviour:
 *   - Escapes raw HTML first for safety.
 *   - Transforms common constructs (headers, emphasis, code blocks, links, images).
 *   - Wraps plain paragraphs in <p> with simple inline styles for email rendering.
 * - Returns: an HTML fragment (string) safe to embed inside an email body.
 *
 * @param markdown - input markdown text
 * @returns HTML string (fragment) ready to be embedded in an email template
 */
export function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Escape HTML entities first
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Headers
  html = html.replace(/^######\s+(.*)$/gm, "<h6>$1</h6>");
  html = html.replace(/^#####\s+(.*)$/gm, "<h5>$1</h5>");
  html = html.replace(/^####\s+(.*)$/gm, "<h4>$1</h4>");
  html = html.replace(/^###\s+(.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.*)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.*)$/gm, "<h1>$1</h1>");

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/___(.+?)___/g, "<strong><em>$1</em></strong>");
  html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");
  html = html.replace(/_(.+?)_/g, "<em>$1</em>");

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // Code blocks - preserve formatting and apply monospace styling
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    '<pre style="background-color: #1a1d24; padding: 16px; border-radius: 8px; overflow-x: auto; font-family: monospace; font-size: 14px; color: #B0B0C0; text-align: left;">$2</pre>',
  );

  // Inline code styling
  html = html.replace(
    /`([^`]+)`/g,
    '<code style="background-color: #1a1d24; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 14px; color: #2DD4BF;">$1</code>',
  );

  // Links - convert to anchor tags with safe styling
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" style="color: #2DD4BF; text-decoration: none;">$1</a>',
  );

  // Images - embed simple responsive image markup
  html = html.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" style="max-width: 100%; height: auto; border-radius: 8px;" />',
  );

  // Horizontal rule
  html = html.replace(
    /^---$/gm,
    '<hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 24px 0;" />',
  );

  // Blockquotes - simple styling
  html = html.replace(
    /^>\s+(.*)$/gm,
    '<blockquote style="border-left: 4px solid #2DD4BF; margin: 16px 0; padding-left: 16px; color: #B0B0C0; font-style: italic;">$1</blockquote>',
  );

  // Unordered lists -> <li> entries
  html = html.replace(
    /^[\*\-]\s+(.*)$/gm,
    '<li style="color: #B0B0C0; margin-bottom: 8px;">$1</li>',
  );

  // Ordered lists -> <li> entries
  html = html.replace(
    /^\d+\.\s+(.*)$/gm,
    '<li style="color: #B0B0C0; margin-bottom: 8px;">$1</li>',
  );

  // Wrap consecutive <li> items in <ul>
  html = html.replace(
    /(<li[^>]*>.*<\/li>\n?)+/g,
    '<ul style="margin: 16px 0; padding-left: 24px; text-align: left;">$&</ul>',
  );

  // Paragraph wrapping - only wrap lines that are not already HTML
  const lines = html.split("\n");
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (
      line &&
      !line.startsWith("<h") &&
      !line.startsWith("<ul") &&
      !line.startsWith("<ol") &&
      !line.startsWith("<li") &&
      !line.startsWith("<pre") &&
      !line.startsWith("<blockquote") &&
      !line.startsWith("<hr") &&
      !line.startsWith("</")
    ) {
      processedLines.push(
        `<p style="font-size: 16px; line-height: 1.6; color: #B0B0C0; margin-bottom: 16px;">${line}</p>`,
      );
    } else {
      processedLines.push(lines[i]);
    }
  }

  html = processedLines.join("\n");

  // Remove any accidental empty paragraphs
  html = html.replace(/<p style="[^"]*"><\/p>/g, "");

  return html;
}

/**
 * Convert an HTML/Markdown string to plain text.
 *
 * This is useful for generating the plain-text part of an email or for
 * search/indexing. It attempts to remove markdown formatting and strip HTML
 * tags safely using a robust library (striptags).
 *
 * @param content - input string containing markdown and/or HTML
 * @returns plain-text representation
 */
/**
 * Convert an HTML/Markdown string to plain text.
 *
 * JSDoc for `toPlainText`:
 * - Purpose: Produce a plain-text fallback suitable for the text part of
 *   multipart emails or for indexing/searching. It strips markdown decorations
 *   and HTML tags conservatively.
 * - Behaviour:
 *   - Removes common markdown formatting while preserving readable content.
 *   - Strips HTML tags using a robust utility (`striptags`).
 *   - Normalizes whitespace and trims result.
 *
 * @param content - input string containing markdown and/or HTML
 * @returns plain-text representation
 */
export function toPlainText(content: string): string {
  let text = content;

  // Remove common markdown decorations while preserving text
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, "$1");
  text = text.replace(/\*\*(.+?)\*\*/g, "$1");
  text = text.replace(/\*(.+?)\*/g, "$1");
  text = text.replace(/___(.+?)___/g, "$1");
  text = text.replace(/__(.+?)__/g, "$1");
  text = text.replace(/_(.+?)_/g, "$1");
  text = text.replace(/~~(.+?)~~/g, "$1");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "[$1]");
  text = text.replace(/^#+\s+/gm, "");
  text = text.replace(/^>\s+/gm, "");
  text = text.replace(/^[\*\-]\s+/gm, "• ");
  text = text.replace(/^\d+\.\s+/gm, "");
  text = text.replace(/^---$/gm, "");

  // Remove HTML tags in a safe way
  text = striptags(text);

  // Normalize whitespace and trim
  text = text.replace(/\n\s*\n/g, "\n\n");
  text = text.trim();

  return text;
}

/**
 * Escape a string for safe insertion into HTML attributes or text nodes.
 *
 * @param text - input text
 * @returns escaped HTML-safe string
 */
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}

/**
 * Compose the full HTML email template used by the Plazen site.
 *
 * The function accepts a small set of options and returns a complete HTML
 * document string. It is safe to call from server-side code that needs to send
 * email via SMTP.
 *
 * @param options - email template options
 * @returns HTML document string
 */
/**
 * Compose the full HTML email template used by the Plazen site.
 *
 * JSDoc for `generateEmailTemplate`:
 * - Purpose: Produce a complete, self-contained HTML document suitable to be
 *   sent as the HTML part of an email. The function adds basic layout,
 *   inline styles, and optional call-to-action button and footer.
 * - Notes:
 *   - Keeps styles inline and conservative for maximum client compatibility.
 *   - Escapes user-provided values where necessary to avoid injection.
 *
 * @param options - email template options (title, preheader, body, button, footer)
 * @returns HTML document string
 */
export function generateEmailTemplate(options: EmailTemplateOptions): string {
  const {
    title,
    preheader = "",
    body,
    buttonText,
    buttonUrl,
    footerText,
  } = options;

  const currentYear = new Date().getFullYear();

  const buttonHtml =
    buttonText && buttonUrl
      ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px auto;">
        <tr>
          <td>
            <a href="${escapeHtml(buttonUrl)}" style="display: inline-block; background-color: #2DD4BF; color: #11121E; padding: 14px 32px; border-radius: 12px; font-weight: 500; text-decoration: none; font-size: 16px;">${escapeHtml(buttonText)}</a>
          </td>
        </tr>
      </table>
    `
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>${escapeHtml(title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Mona+Sans:ital,wght@0,200..900;1,200..900&family=Montserrat:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet">
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Mona+Sans:ital,wght@0,200..900;1,200..900&family=Montserrat:ital,wght@0,100..900;1,100..900&display=swap");
    body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; background-color: #10131a; font-family: \"Mona Sans\", \"Montserrat\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif; color: #F2F2F2; }
    img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    a { color: #2DD4BF; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #10131a; font-family: 'Mona Sans', 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  ${
    preheader
      ? `
  <div style="display: none; font-size: 1px; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all;">
    ${escapeHtml(preheader)}
    ${"&zwnj;&nbsp;".repeat(80)}
  </div>
  `
      : ""
  }

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #10131a;">
    <tr>
      <td align="center" style="padding: 40px 20px;">

        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width: 480px; width: 100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom: 30px;">
              <img src="https://avatars.githubusercontent.com/u/226096442?s=200&v=4" alt="Plazen" width="48" height="48" style="display: block; border-radius: 8px;">
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color: #0f1217; border-radius: 12px; padding: 40px; text-align: center; border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 4px 24px rgba(0,0,0,0.2);">

              <!-- Title -->
              <h1 style="font-size: 24px; font-weight: 600; margin: 0 0 16px 0; color: #ffffff; font-family: 'Mona Sans', 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                ${escapeHtml(title)}
              </h1>

              <!-- Content -->
              <div style="text-align: center;">
                ${body}
              </div>

              <!-- Button -->
              ${buttonHtml}

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top: 24px; text-align: center;">
              ${
                footerText
                  ? `<p style="font-size: 12px; color: #666677; margin: 0 0 10px 0; font-family: 'Mona Sans', 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">${escapeHtml(footerText)}</p>`
                  : ""
              }
              <p style="font-size: 12px; color: #666677; margin: 0; font-family: 'Mona Sans', 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                &copy; ${currentYear} <a href="https://plazen.org" style="color: #2DD4BF; text-decoration: none;">Plazen.org</a>
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Helper to generate both HTML and plain-text content from markdown input.
 *
 * Useful when sending multipart emails where a plain-text fallback is required.
 *
 * @param title - email title (used in text fallback and <title> in HTML)
 * @param markdownContent - markdown content to render
 * @param options - optional template configuration (preheader, button, footer)
 * @returns object with { html, text } for email sending
 */
/**
 * Helper to generate both HTML and plain-text content from markdown input.
 *
 * JSDoc for `generateEmailFromMarkdown`:
 * - Purpose: Convenience builder that converts markdown into both HTML and a
 *   plain-text fallback, and wraps the HTML into the full email template.
 * - Behaviour:
 *   - Uses `markdownToHtml` to render HTML fragment.
 *   - Uses `toPlainText` to produce the text fallback.
 *   - Composes the final HTML via `generateEmailTemplate`.
 *
 * @param title - email title (used in HTML <title> and in the text fallback)
 * @param markdownContent - markdown content to render
 * @param options - optional template configuration (preheader, button, footer)
 * @returns object with { html, text } ready to be used in multipart emails
 */
export function generateEmailFromMarkdown(
  title: string,
  markdownContent: string,
  options?: {
    preheader?: string;
    buttonText?: string;
    buttonUrl?: string;
    footerText?: string;
  },
): { html: string; text: string } {
  const htmlBody = markdownToHtml(markdownContent);
  const textBody = toPlainText(markdownContent);

  const html = generateEmailTemplate({
    title,
    body: htmlBody,
    preheader: options?.preheader,
    buttonText: options?.buttonText,
    buttonUrl: options?.buttonUrl,
    footerText: options?.footerText,
  });

  const text = `
${title}
${"=".repeat(title.length)}

${textBody}

---
© ${new Date().getFullYear()} Plazen.org
`.trim();

  return { html, text };
}

/**
 * Pre-built email templates for common administrative actions.
 *
 * These are convenience factories that produce an `{ html, text }` payload via
 * `generateEmailFromMarkdown`. They are intentionally simple and non-authoring.
 */
/**
 * Pre-built email templates for common administrative actions.
 *
 * JSDoc for `emailTemplates`:
 * - Purpose: Small set of convenience factories producing `{ html, text }`
 *   payloads via `generateEmailFromMarkdown` for common communication types
 *   (newsletter, announcement, feature update, maintenance notice).
 * - Usage: import and call the desired factory to obtain ready-to-send payloads.
 */
export const emailTemplates = {
  newsletter: (content: string) =>
    generateEmailFromMarkdown("Plazen Newsletter", content, {
      footerText: "You received this because you subscribed to Plazen updates.",
    }),

  announcement: (
    title: string,
    content: string,
    buttonText?: string,
    buttonUrl?: string,
  ) =>
    generateEmailFromMarkdown(title, content, {
      buttonText,
      buttonUrl,
    }),

  featureUpdate: (featureName: string, description: string) =>
    generateEmailFromMarkdown(`New Feature: ${featureName}`, description, {
      buttonText: "Try it now",
      buttonUrl: "https://plazen.org/schedule",
    }),

  maintenanceNotice: (date: string, duration: string, details: string) =>
    generateEmailFromMarkdown(
      "Scheduled Maintenance",
      `
We will be performing scheduled maintenance on **${date}**.

**Expected duration:** ${duration}

${details}

We apologize for any inconvenience this may cause.
    `.trim(),
      {
        preheader: `Scheduled maintenance on ${date}`,
      },
    ),
};

const emailTemplateUtils = {
  markdownToHtml,
  toPlainText,
  generateEmailTemplate,
  generateEmailFromMarkdown,
  emailTemplates,
};

export default emailTemplateUtils;
