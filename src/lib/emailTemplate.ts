// Email template utilities for Plazen

export interface EmailTemplateOptions {
  title: string;
  preheader?: string;
  body: string;
  buttonText?: string;
  buttonUrl?: string;
  footerText?: string;
}

// Convert markdown to HTML (simple implementation)
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

  // Code blocks
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    '<pre style="background-color: #1a1d24; padding: 16px; border-radius: 8px; overflow-x: auto; font-family: monospace; font-size: 14px; color: #B0B0C0; text-align: left;">$2</pre>',
  );

  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    '<code style="background-color: #1a1d24; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 14px; color: #2DD4BF;">$1</code>',
  );

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" style="color: #2DD4BF; text-decoration: none;">$1</a>',
  );

  // Images
  html = html.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" style="max-width: 100%; height: auto; border-radius: 8px;" />',
  );

  // Horizontal rule
  html = html.replace(
    /^---$/gm,
    '<hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 24px 0;" />',
  );

  // Blockquotes
  html = html.replace(
    /^>\s+(.*)$/gm,
    '<blockquote style="border-left: 4px solid #2DD4BF; margin: 16px 0; padding-left: 16px; color: #B0B0C0; font-style: italic;">$1</blockquote>',
  );

  // Unordered lists
  html = html.replace(
    /^[\*\-]\s+(.*)$/gm,
    '<li style="color: #B0B0C0; margin-bottom: 8px;">$1</li>',
  );

  // Ordered lists
  html = html.replace(
    /^\d+\.\s+(.*)$/gm,
    '<li style="color: #B0B0C0; margin-bottom: 8px;">$1</li>',
  );

  // Wrap consecutive <li> items in <ul>
  html = html.replace(
    /(<li[^>]*>.*<\/li>\n?)+/g,
    '<ul style="margin: 16px 0; padding-left: 24px; text-align: left;">$&</ul>',
  );

  // Paragraphs - wrap text blocks that aren't already wrapped
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

  // Clean up empty paragraphs
  html = html.replace(/<p style="[^"]*"><\/p>/g, "");

  return html;
}

// Strip HTML and markdown to get plain text
export function toPlainText(content: string): string {
  let text = content;

  // Remove markdown formatting
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

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#039;/g, "'");
  text = text.replace(/&nbsp;/g, " ");

  // Remove any tags that may have appeared after decoding entities
  text = text.replace(/<[^>]+>/g, "");

  // Clean up whitespace
  text = text.replace(/\n\s*\n/g, "\n\n");
  text = text.trim();

  return text;
}

// Escape HTML entities
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

// Generate the full HTML email template
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

// Generate email from markdown content
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

// Pre-built email templates for admin use (not auth-related)
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
