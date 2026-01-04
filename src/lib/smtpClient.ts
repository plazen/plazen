/**
 *
 * A lightweight SMTP client implemented using Node's `net` and `tls` sockets.
 *
 * Purpose and responsibilities:
 * - Establish a TCP/TLS connection to an SMTP server.
 * - Perform EHLO/STARTTLS and AUTH LOGIN authentication.
 * - Send RFC-822 style email messages using the SMTP command sequence:
 *     CONNECT -> EHLO -> (STARTTLS -> EHLO) -> AUTH LOGIN -> MAIL FROM -> RCPT TO* -> DATA -> QUIT
 * - Build MIME multipart messages supporting text/html alternatives and attachments.
 *
 * Commenting style:
 * - This file uses A2-level near-line comments for the SMTP protocol flow and important
 *   algorithms (quoted-printable encoding, multipart assembly, base64 wrapping).
 * - The implementation intentionally favors clarity over performance; the goal is correct,
 *   auditable behavior for sending mail from the application.
 */

import * as net from "net";
import * as tls from "tls";
import * as crypto from "crypto";

/**
 * SMTP configuration used to connect and authenticate to an SMTP server.
 *
 * Notes:
 * - `secure: true` indicates SMTPS (TLS-on-connect, typically port 465).
 * - `secure: false` indicates a plaintext connection with optional STARTTLS upgrade (typically port 587).
 */
export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean; // true for TLS on connect (port 465), false for STARTTLS (port 587)
  auth: {
    user: string;
    pass: string;
  };
  from: {
    name: string;
    email: string;
  };
}

/**
 * Represents an email message that can be sent via this client.
 *
 * Important fields:
 * - `to`, `cc`, `bcc` accept strings or arrays. Addresses may be in "Name <email@..." format.
 * - `text` and `html` can both be present. When both are present we build a multipart/alternative section.
 * - `attachments` is an array of binary or string content with metadata used to produce proper MIME parts.
 */
export interface EmailMessage {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
  headers?: Record<string, string>;
  attachments?: EmailAttachment[];
  from?: {
    name: string;
    email: string;
  };
}

/**
 * Attachment descriptor for the email.
 *
 * - `content` can be a Buffer (preferred) or a string (which will be converted to a Buffer).
 * - `encoding` is informational; the code encodes attachments using base64 for transport.
 */
export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
  encoding?: "base64" | "binary";
}

/**
 * Result returned after attempting to send a message.
 *
 * - `success` true indicates server accepted the message for delivery (SMTP 250 after DATA).
 * - `messageId` is locally generated and returned for correlation.
 * - `response` contains server response text when available.
 * - `error` contains an error message on failure.
 */
export interface SendResult {
  success: boolean;
  messageId: string;
  response?: string;
  error?: string;
}

/**
 * Internal class representing a connection to the SMTP server.
 *
 * Responsibilities:
 * - Manage low-level socket (plain or TLS-wrapped).
 * - Send raw SMTP commands and collect server responses.
 * - Handle STARTTLS upgrade, EHLO, AUTH LOGIN, and DATA transmission.
 *
 * Implementation notes:
 * - The SMTP protocol is line-oriented and responses can be multi-line. Multi-line responses
 *   are indicated by the server returning lines starting with a 3-digit code followed by a hyphen
 *   (e.g. "250-...") for intermediate lines and "250 " (space) for the final line. This client
 *   collects data until a final response line is observed (code + space).
 */
class SMTPConnection {
  // Underlying TCP or TLS socket; null when disconnected.
  private socket: net.Socket | tls.TLSSocket | null = null;

  // Configuration passed from the public client wrapper.
  private config: SMTPConfig;

  // Buffer used to accumulate incoming data until a full SMTP response is available.
  private responseBuffer: string = "";

  // Resolver for the current outstanding command's response promise. When the full response
  // arrives we call this function with the collected response string.
  private responseResolver: ((value: string) => void) | null = null;

  // Track connected state separate from socket presence to avoid races.
  private connected: boolean = false;

  // Whether the connection is currently secured with TLS.
  private secure: boolean = false;

  constructor(config: SMTPConfig) {
    this.config = config;
  }

  /**
   * Wait for a server response to the last issued command.
   *
   * Creates a promise and stores a resolver function that `handleData` will call once a
   * complete response (final response line) has been detected. A 30s timeout is used to
   * avoid hanging indefinitely if the server doesn't respond.
   */
  private async waitForResponse(): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("SMTP response timeout"));
      }, 30000);

      this.responseResolver = (response: string) => {
        clearTimeout(timeout);
        resolve(response);
      };
    });
  }

  /**
   * Low-level data handler attached to the socket "data" event.
   *
   * Responsibilities:
   * - Convert incoming chunk to string and append to the `responseBuffer`.
   * - Detect when the server has sent a final response line (code + space) and resolve the
   *   waiting promise with the collected response text.
   *
   * Note on multi-line responses:
   * - Servers send multi-line responses as:
   *     250-First line
   *     250-Second line
   *     250 Last line
   *   We look for the last complete line ending with \r\n and test for /^\d{3} / to detect the final line.
   */
  private handleData(data: Buffer | string | Uint8Array): void {
    let chunk: string;
    if (typeof data === "string") {
      chunk = data;
    } else if (Buffer.isBuffer(data)) {
      chunk = data.toString();
    } else {
      // Handle Uint8Array / ArrayBufferView variants by converting to Buffer then string.
      chunk = Buffer.from(data).toString();
    }

    // Append the received data to the buffer for parsing.
    this.responseBuffer += chunk;

    // Split lines to inspect the most recent complete line. Splitting by \r\n produces
    // an array where the last element may be partial; the element at length-2 is the last complete line.
    const lines = this.responseBuffer.split("\r\n");
    const lastCompleteLine = lines[lines.length - 2];

    // If the last complete line begins with a 3-digit code followed by a space, it is the final line.
    if (lastCompleteLine && /^\d{3} /.test(lastCompleteLine)) {
      // Capture everything received so far as the response for the current command.
      const response = this.responseBuffer;
      // Reset buffer for the next command/response cycle.
      this.responseBuffer = "";
      if (this.responseResolver) {
        // Resolve the promise waiting for this response.
        this.responseResolver(response);
        this.responseResolver = null;
      }
    }
  }

  /**
   * Send an SMTP command (a line) and return the server's response string.
   *
   * - Appends CRLF to the command and writes to the socket.
   * - Returns the response collected by `waitForResponse` which resolves when a final response line is observed.
   */
  private async sendCommand(command: string): Promise<string> {
    if (!this.socket) {
      throw new Error("Not connected to SMTP server");
    }

    return new Promise((resolve, reject) => {
      // Write the command followed by the required CRLF terminator.
      this.socket!.write(command + "\r\n", (err) => {
        if (err) {
          reject(err);
          return;
        }
        // Wait for the server's response to this command.
        this.waitForResponse().then(resolve).catch(reject);
      });
    });
  }

  /**
   * Parse the three-digit SMTP response code from the server response text.
   *
   * Returns 0 if no code was found.
   */
  private parseResponseCode(response: string): number {
    const match = response.match(/^(\d{3})/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Upgrade the existing plain TCP socket to TLS using Node's `tls.connect` with the existing socket.
   *
   * - Uses the current `socket` as the `socket` option for `tls.connect` to initiate an in-place TLS handshake.
   * - Replaces `this.socket` with the resulting `TLSSocket` and marks the connection as secure once established.
   */
  private async upgradeToTLS(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tlsOptions: tls.ConnectionOptions = {
        socket: this.socket as net.Socket,
        host: this.config.host,
        // We keep certificate verification enabled by default (rejectUnauthorized: true).
        rejectUnauthorized: true,
      };

      const tlsSocket = tls.connect(tlsOptions, () => {
        // Once the TLS handshake is complete, swap the socket and mark as secure.
        this.socket = tlsSocket;
        this.secure = true;
        resolve();
      });

      // Attach the same data handler to the TLS socket so responses continue to be processed.
      tlsSocket.on("data", (data) => this.handleData(data));
      tlsSocket.on("error", reject);
    });
  }

  /**
   * Establishes a connection to the SMTP server and waits for the initial server greeting (220).
   *
   * Behavior:
   * - If `config.secure` is true, perform TLS-on-connect (SMTPS).
   * - Otherwise open a plain TCP socket and expect to issue STARTTLS later if the server advertises it.
   * - Attach 'data', 'error', and 'close' handlers to manage lifecycle.
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const connectOptions = {
        host: this.config.host,
        port: this.config.port,
      };

      if (this.config.secure) {
        // Direct TLS connection (port 465): create a TLSSocket immediately.
        this.socket = tls.connect(
          {
            ...connectOptions,
            rejectUnauthorized: true,
          },
          () => {
            this.connected = true;
            this.secure = true;
          },
        );
      } else {
        // Plain TCP connection which may be upgraded later using STARTTLS.
        this.socket = net.connect(connectOptions, () => {
          this.connected = true;
        });
      }

      // For both socket types attach the same data handler so response parsing is centralized.
      this.socket.on("data", (data) => this.handleData(data));

      this.socket.on("error", (err) => {
        reject(err);
      });

      this.socket.on("close", () => {
        this.connected = false;
      });

      // Wait for the server's initial greeting (should be code 220).
      this.waitForResponse()
        .then(async (greeting) => {
          const code = this.parseResponseCode(greeting);
          if (code !== 220) {
            // If we received something other than 220, treat it as an error.
            throw new Error(`Unexpected greeting: ${greeting}`);
          }
          resolve();
        })
        .catch(reject);
    });
  }

  /**
   * Performs EHLO, optional STARTTLS, and AUTH LOGIN.
   *
   * Flow:
   * 1. EHLO to discover server capabilities.
   * 2. If not already TLS and server advertises STARTTLS, issue STARTTLS and upgrade socket to TLS,
   *    then re-issue EHLO (as required by RFC).
   * 3. Perform AUTH LOGIN sequence: send "AUTH LOGIN", then base64(username), base64(password).
   *
   * NOTES:
   * - This method only supports "AUTH LOGIN" flow. OAuth2 or CRAM-MD5 are not implemented here.
   */
  async authenticate(): Promise<void> {
    // Send EHLO to identify ourselves and retrieve server capabilities.
    const ehloResponse = await this.sendCommand(
      `EHLO ${this.config.from.email.split("@")[1] || "localhost"}`,
    );
    if (this.parseResponseCode(ehloResponse) !== 250) {
      throw new Error(`EHLO failed: ${ehloResponse}`);
    }

    // If connection is not already secured and the server supports STARTTLS, upgrade.
    if (!this.secure && ehloResponse.includes("STARTTLS")) {
      const starttlsResponse = await this.sendCommand("STARTTLS");
      if (this.parseResponseCode(starttlsResponse) !== 220) {
        throw new Error(`STARTTLS failed: ${starttlsResponse}`);
      }
      await this.upgradeToTLS();

      // After a successful STARTTLS handshake, RFC requires re-issuing EHLO.
      const ehloResponse2 = await this.sendCommand(
        `EHLO ${this.config.from.email.split("@")[1] || "localhost"}`,
      );
      if (this.parseResponseCode(ehloResponse2) !== 250) {
        throw new Error(`EHLO after STARTTLS failed: ${ehloResponse2}`);
      }
    }

    // Begin AUTH LOGIN sequence which is a simple base64-challenge exchange.
    const authResponse = await this.sendCommand("AUTH LOGIN");
    if (this.parseResponseCode(authResponse) !== 334) {
      throw new Error(`AUTH LOGIN failed: ${authResponse}`);
    }

    // Send username encoded as base64. The server should reply with 334 asking for the password.
    const userResponse = await this.sendCommand(
      Buffer.from(this.config.auth.user).toString("base64"),
    );
    if (this.parseResponseCode(userResponse) !== 334) {
      throw new Error(`Username rejected: ${userResponse}`);
    }

    // Send password encoded as base64. On success the server replies with 235 (authentication successful).
    const passResponse = await this.sendCommand(
      Buffer.from(this.config.auth.pass).toString("base64"),
    );
    if (this.parseResponseCode(passResponse) !== 235) {
      throw new Error(`Authentication failed: ${passResponse}`);
    }
  }

  /**
   * Send a single message using the SMTP protocol.
   *
   * Sequence implemented:
   * - MAIL FROM:<sender>
   * - RCPT TO:<recipient>  (repeated for each recipient)
   * - DATA
   * - <email content lines>
   * - .
   *
   * The messageId is generated locally for correlation and included in the Message-ID header.
   */
  async sendMail(message: EmailMessage): Promise<SendResult> {
    // Use message-level from if provided, otherwise fall back to config
    const fromEmail = message.from?.email || this.config.from.email;
    // Generate a locally-unique message id for tracking. It's not required by SMTP server but useful.
    const messageId = `<${crypto.randomUUID()}@${fromEmail.split("@")[1]}>`;

    try {
      // MAIL FROM: declare the envelope sender
      const mailFromResponse = await this.sendCommand(
        `MAIL FROM:<${fromEmail}>`,
      );
      if (this.parseResponseCode(mailFromResponse) !== 250) {
        throw new Error(`MAIL FROM failed: ${mailFromResponse}`);
      }

      // RCPT TO: add each RCPT TO for all envelope recipients (to/cc/bcc).
      const recipients = this.getAllRecipients(message);
      for (const recipient of recipients) {
        const rcptResponse = await this.sendCommand(`RCPT TO:<${recipient}>`);
        const code = this.parseResponseCode(rcptResponse);
        // Accept codes 250 (OK) and 251 (User not local will forward) as success indicators.
        if (code !== 250 && code !== 251) {
          throw new Error(`RCPT TO failed for ${recipient}: ${rcptResponse}`);
        }
      }

      // DATA: server should respond with 354 to indicate it is ready to receive the message body.
      const dataResponse = await this.sendCommand("DATA");
      if (this.parseResponseCode(dataResponse) !== 354) {
        throw new Error(`DATA command failed: ${dataResponse}`);
      }

      // Build the full email content including headers and MIME parts and send it.
      // The SMTP DATA terminator is a single period on a line by itself; here we append "\r\n." to indicate end.
      const emailContent = this.buildEmailContent(message, messageId);
      const sendResponse = await this.sendCommand(emailContent + "\r\n.");
      if (this.parseResponseCode(sendResponse) !== 250) {
        throw new Error(`Message rejected: ${sendResponse}`);
      }

      return {
        success: true,
        messageId,
        response: sendResponse,
      };
    } catch (error) {
      return {
        success: false,
        messageId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Aggregate all recipients from `to`, `cc`, and `bcc` into a flat string array of email addresses.
   *
   * Accepts inputs that are either strings or arrays of strings and supports addresses in
   * "Name <local@domain>" format by extracting the angle-bracketed email.
   */
  private getAllRecipients(message: EmailMessage): string[] {
    const recipients: string[] = [];

    const addRecipients = (value: string | string[] | undefined) => {
      if (!value) return;
      if (Array.isArray(value)) {
        recipients.push(...value.map((r) => this.extractEmail(r)));
      } else {
        recipients.push(this.extractEmail(value));
      }
    };

    addRecipients(message.to);
    addRecipients(message.cc);
    addRecipients(message.bcc);

    return recipients;
  }

  /**
   * Extract a plain email address from a formatted address string.
   *
   * Examples:
   * - "Alice <alice@example.com>" => "alice@example.com"
   * - "bob@example.com" => "bob@example.com"
   */
  private extractEmail(address: string): string {
    const match = address.match(/<([^>]+)>/);
    return match ? match[1] : address.trim();
  }

  /**
   * Format addresses for header output. If an array is provided it joins with commas.
   */
  private formatAddresses(addresses: string | string[]): string {
    if (Array.isArray(addresses)) {
      return addresses.join(", ");
    }
    return addresses;
  }

  /**
   * Build the raw email content (headers + body) to be transmitted over the SMTP DATA command.
   *
   * Implementation notes:
   * - Uses randomly generated MIME boundaries for multipart sections.
   * - Supports:
   *    - Simple single-part text or html messages
   *    - multipart/alternative when both text and html are present
   *    - multipart/mixed with attachments (and an inner multipart/alternative if both text/html present)
   * - Attachments are base64 encoded and split to 76-character lines per RFC.
   *
   * Important: This method returns a CRLF-separated string (lines joined with "\r\n") but does not
   * append the DATA terminator (".") — the caller is responsible for appending the final CRLF + ".".
   */
  private buildEmailContent(message: EmailMessage, messageId: string): string {
    // Boundary identifiers must be unique and should not appear in the content. Use UUID-derived strings.
    const boundary = `----=_Part_${crypto.randomUUID().replace(/-/g, "")}`;
    const lines: string[] = [];

    // Use message-level from if provided, otherwise fall back to config
    const fromEmail = message.from?.email || this.config.from.email;
    const fromName = message.from?.name || this.config.from.name;

    // --- Headers ---
    lines.push(`Message-ID: ${messageId}`);
    // Date in RFC-compatible form. We standardize to UTC and replace GMT with +0000 for explicit timezone.
    lines.push(
      `Date: ${new Date().toUTCString().replace("GMT", "+0000").replace(",", "")}`,
    );
    lines.push(`From: ${fromName} <${fromEmail}>`);
    lines.push(`To: ${this.formatAddresses(message.to)}`);

    if (message.cc) {
      lines.push(`Cc: ${this.formatAddresses(message.cc)}`);
    }

    if (message.replyTo) {
      lines.push(`Reply-To: ${message.replyTo}`);
    }

    // Threading headers for replies
    if (message.inReplyTo) {
      lines.push(`In-Reply-To: ${message.inReplyTo}`);
    }

    if (message.references) {
      lines.push(`References: ${message.references}`);
    }

    // Encode subject properly if non-ASCII characters present.
    lines.push(`Subject: ${this.encodeSubject(message.subject)}`);
    lines.push("MIME-Version: 1.0");

    // Add any custom headers provided by the caller.
    if (message.headers) {
      for (const [key, value] of Object.entries(message.headers)) {
        lines.push(`${key}: ${value}`);
      }
    }

    // Determine body/attachment layout choices.
    const hasAttachments =
      message.attachments && message.attachments.length > 0;
    const hasMultipleParts = message.text && message.html;

    // --- Case: attachments exist => multipart/mixed is the outer container ---
    if (hasAttachments) {
      lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
      lines.push("");

      // If both text and html exist, nest a multipart/alternative inside the mixed part.
      if (hasMultipleParts) {
        const altBoundary = `----=_Alt_${crypto.randomUUID().replace(/-/g, "")}`;
        lines.push(`--${boundary}`);
        lines.push(
          `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        );
        lines.push("");

        // Plain text part
        if (message.text) {
          lines.push(`--${altBoundary}`);
          lines.push("Content-Type: text/plain; charset=utf-8");
          lines.push("Content-Transfer-Encoding: quoted-printable");
          lines.push("");
          lines.push(this.encodeQuotedPrintable(message.text));
          lines.push("");
        }

        // HTML part
        if (message.html) {
          lines.push(`--${altBoundary}`);
          lines.push("Content-Type: text/html; charset=utf-8");
          lines.push("Content-Transfer-Encoding: quoted-printable");
          lines.push("");
          lines.push(this.encodeQuotedPrintable(message.html));
          lines.push("");
        }

        // Close the inner alternative boundary
        lines.push(`--${altBoundary}--`);
      } else {
        // No nested alternative; include the single best representation directly in the mixed part.
        lines.push(`--${boundary}`);
        if (message.html) {
          lines.push("Content-Type: text/html; charset=utf-8");
          lines.push("Content-Transfer-Encoding: quoted-printable");
          lines.push("");
          lines.push(this.encodeQuotedPrintable(message.html));
        } else if (message.text) {
          lines.push("Content-Type: text/plain; charset=utf-8");
          lines.push("Content-Transfer-Encoding: quoted-printable");
          lines.push("");
          lines.push(this.encodeQuotedPrintable(message.text));
        }
        lines.push("");
      }

      // --- Attachments: each attachment is its own part in the outer mixed boundary ---
      for (const attachment of message.attachments!) {
        lines.push(`--${boundary}`);
        lines.push(
          `Content-Type: ${attachment.contentType || "application/octet-stream"}; name="${attachment.filename}"`,
        );
        // Use base64 for attachments; mail servers and clients reliably support it.
        lines.push("Content-Transfer-Encoding: base64");
        lines.push(
          `Content-Disposition: attachment; filename="${attachment.filename}"`,
        );
        lines.push("");

        // Normalize content to Buffer
        const content =
          typeof attachment.content === "string"
            ? Buffer.from(attachment.content)
            : attachment.content;
        // Base64 encode and wrap to 76-character lines.
        lines.push(this.encodeBase64(content));
        lines.push("");
      }

      // Close outer boundary
      lines.push(`--${boundary}--`);
    } else if (hasMultipleParts) {
      // --- No attachments, but both text and html are present: multipart/alternative ---
      lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      lines.push("");

      if (message.text) {
        lines.push(`--${boundary}`);
        lines.push("Content-Type: text/plain; charset=utf-8");
        lines.push("Content-Transfer-Encoding: quoted-printable");
        lines.push("");
        lines.push(this.encodeQuotedPrintable(message.text));
        lines.push("");
      }

      if (message.html) {
        lines.push(`--${boundary}`);
        lines.push("Content-Type: text/html; charset=utf-8");
        lines.push("Content-Transfer-Encoding: quoted-printable");
        lines.push("");
        lines.push(this.encodeQuotedPrintable(message.html));
        lines.push("");
      }

      lines.push(`--${boundary}--`);
    } else if (message.html) {
      // Single-part HTML
      lines.push("Content-Type: text/html; charset=utf-8");
      lines.push("Content-Transfer-Encoding: quoted-printable");
      lines.push("");
      lines.push(this.encodeQuotedPrintable(message.html));
    } else {
      // Single-part plain text (fallback)
      lines.push("Content-Type: text/plain; charset=utf-8");
      lines.push("Content-Transfer-Encoding: quoted-printable");
      lines.push("");
      lines.push(this.encodeQuotedPrintable(message.text || ""));
    }

    // Join lines with CRLF as required by SMTP and RFC 5322/2045.
    return lines.join("\r\n");
  }

  /**
   * Encode the subject header using MIME encoded-word syntax if non-ASCII characters are present.
   *
   * Uses Base64 encoding with UTF-8 charset:
   *   =?UTF-8?B?<base64>?=
   */
  private encodeSubject(subject: string): string {
    // Check if subject contains non-ASCII characters
    if (!/^[\x00-\x7F]*$/.test(subject)) {
      // Use base64 encoding for non-ASCII subjects
      return `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
    }
    return subject;
  }

  /**
   * A conservative quoted-printable encoder that:
   * - Leaves printable ASCII characters (except '=') as-is.
   * - Encodes non-printable and non-ASCII bytes as =HH hex sequences.
   * - Preserves CRLF line breaks and wraps encoded lines so they don't exceed 76 characters
   *   (we use 75 as a safe boundary then append "=" as soft line-break indicator).
   *
   * This implementation operates on characters and converts each to UTF-8 bytes if necessary.
   */
  private encodeQuotedPrintable(text: string): string {
    const lines: string[] = [];
    let currentLine = "";

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const code = char.charCodeAt(0);
      let encoded: string;

      // Preserve CRLF sequences as actual line breaks in the encoded output.
      if (char === "\r" || char === "\n") {
        if (char === "\r" && text[i + 1] === "\n") {
          // Windows-style CRLF: push current line and skip the LF
          lines.push(currentLine);
          currentLine = "";
          i++; // Skip the \n
        } else if (char === "\n") {
          // Unix-style LF only
          lines.push(currentLine);
          currentLine = "";
        }
        continue;
      } else if (
        // Printable ASCII range excluding '=' (61) which must be encoded.
        (code >= 33 && code <= 126 && code !== 61) ||
        // Space (32) and TAB (9) are allowed but must be handled carefully at line ends; here we keep them.
        code === 32 ||
        code === 9
      ) {
        // Printable ASCII (except =) and space/tab
        encoded = char;
      } else {
        // Non-printable or non-ASCII characters must be encoded as =HH per byte of UTF-8.
        const bytes = Buffer.from(char, "utf8");
        encoded = Array.from(bytes)
          .map((b) => `=${b.toString(16).toUpperCase().padStart(2, "0")}`)
          .join("");
      }

      // Ensure lines are wrapped to at most 76 characters. We append a soft-break "=" when wrapping.
      if (currentLine.length + encoded.length > 75) {
        lines.push(currentLine + "=");
        currentLine = encoded;
      } else {
        currentLine += encoded;
      }
    }

    // Push the remaining buffered content as the last line.
    if (currentLine) {
      lines.push(currentLine);
    }

    // Join using CRLF to produce the final quoted-printable block.
    return lines.join("\r\n");
  }

  /**
   * Encode a Buffer to base64 and wrap lines at 76 characters as required by MIME.
   *
   * This helper is used for attachments.
   */
  private encodeBase64(content: Buffer): string {
    const base64 = content.toString("base64");
    const lines: string[] = [];

    for (let i = 0; i < base64.length; i += 76) {
      lines.push(base64.slice(i, i + 76));
    }

    return lines.join("\r\n");
  }

  /**
   * Gracefully close the SMTP session with QUIT and destroy the socket.
   *
   * Errors during QUIT are ignored to maximize disconnect robustness.
   */
  async disconnect(): Promise<void> {
    if (this.socket && this.connected) {
      try {
        await this.sendCommand("QUIT");
      } catch {
        // Ignore errors during disconnect
      }
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
    }
  }
}

/**
 * Public client wrapper used by application code.
 *
 * - Exposes convenience methods to construct client from environment (`fromEnv`),
 *   send a single message (`send`), send many messages reusing a connection (`sendBatch`),
 *   and verify credentials (`verify`).
 */
export class SMTPClient {
  private config: SMTPConfig;

  constructor(config: SMTPConfig) {
    this.config = config;
  }

  /**
   * Create a client from environment variables. Useful for server configuration.
   *
   * Expected env vars:
   * - SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM_NAME, SMTP_FROM_EMAIL
   *
   * The function applies sane defaults if values are missing.
   */
  static fromEnv(): SMTPClient {
    const config: SMTPConfig = {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
      },
      from: {
        name: process.env.SMTP_FROM_NAME || "Plazen",
        email: process.env.SMTP_FROM_EMAIL || "",
      },
    };

    return new SMTPClient(config);
  }

  /**
   * Send a single email message.
   *
   * This method sets up a fresh connection, performs authentication, sends the message,
   * then disconnects. For bulk sends, use `sendBatch` which reuses a single connection.
   */
  async send(message: EmailMessage): Promise<SendResult> {
    const connection = new SMTPConnection(this.config);

    try {
      await connection.connect();
      await connection.authenticate();
      const result = await connection.sendMail(message);
      await connection.disconnect();
      return result;
    } catch (error) {
      // Ensure we always attempt to disconnect the socket on error.
      try {
        await connection.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      return {
        success: false,
        messageId: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Send multiple messages reusing a single SMTP connection.
   *
   * Behavior:
   * - Open connection and authenticate once.
   * - Send each message sequentially using the same session (MAIL FROM / RCPT TO / DATA).
   * - On fatal error, mark remaining messages as failed with the same error message.
   */
  async sendBatch(messages: EmailMessage[]): Promise<SendResult[]> {
    const connection = new SMTPConnection(this.config);
    const results: SendResult[] = [];

    try {
      await connection.connect();
      await connection.authenticate();

      for (const message of messages) {
        const result = await connection.sendMail(message);
        results.push(result);
      }

      await connection.disconnect();
    } catch (error) {
      try {
        await connection.disconnect();
      } catch {
        // Ignore disconnect errors
      }

      // If we failed before sending all messages, mark remaining as failed
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      while (results.length < messages.length) {
        results.push({
          success: false,
          messageId: "",
          error: errorMessage,
        });
      }
    }

    return results;
  }

  /**
   * Verify that the configured credentials are valid by connecting and authenticating.
   *
   * Returns true if authentication succeeds; false otherwise.
   */
  async verify(): Promise<boolean> {
    const connection = new SMTPConnection(this.config);

    try {
      await connection.connect();
      await connection.authenticate();
      await connection.disconnect();
      return true;
    } catch {
      try {
        await connection.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      return false;
    }
  }

  /**
   * Return the client configuration but with the password redacted (only expose username).
   * Useful for diagnostics without leaking secrets.
   */
  getConfig(): Omit<SMTPConfig, "auth"> & { auth: { user: string } } {
    return {
      ...this.config,
      auth: {
        user: this.config.auth.user,
      },
    };
  }
}

export default SMTPClient;
