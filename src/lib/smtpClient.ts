import * as net from "net";
import * as tls from "tls";
import * as crypto from "crypto";

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

export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
  encoding?: "base64" | "binary";
}

export interface SendResult {
  success: boolean;
  messageId: string;
  response?: string;
  error?: string;
}

class SMTPConnection {
  private socket: net.Socket | tls.TLSSocket | null = null;
  private config: SMTPConfig;
  private responseBuffer: string = "";
  private responseResolver: ((value: string) => void) | null = null;
  private connected: boolean = false;
  private secure: boolean = false;

  constructor(config: SMTPConfig) {
    this.config = config;
  }

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

  private handleData(data: Buffer | string | Uint8Array): void {
    let chunk: string;
    if (typeof data === "string") {
      chunk = data;
    } else if (Buffer.isBuffer(data)) {
      chunk = data.toString();
    } else {
      // Handle Uint8Array / ArrayBufferView variants
      chunk = Buffer.from(data).toString();
    }

    this.responseBuffer += chunk;

    // SMTP responses end with \r\n and multi-line responses have a hyphen after the code
    const lines = this.responseBuffer.split("\r\n");
    const lastCompleteLine = lines[lines.length - 2];

    if (lastCompleteLine && /^\d{3} /.test(lastCompleteLine)) {
      const response = this.responseBuffer;
      this.responseBuffer = "";
      if (this.responseResolver) {
        this.responseResolver(response);
        this.responseResolver = null;
      }
    }
  }

  private async sendCommand(command: string): Promise<string> {
    if (!this.socket) {
      throw new Error("Not connected to SMTP server");
    }

    return new Promise((resolve, reject) => {
      this.socket!.write(command + "\r\n", (err) => {
        if (err) {
          reject(err);
          return;
        }
        this.waitForResponse().then(resolve).catch(reject);
      });
    });
  }

  private parseResponseCode(response: string): number {
    const match = response.match(/^(\d{3})/);
    return match ? parseInt(match[1], 10) : 0;
  }

  private async upgradeToTLS(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tlsOptions: tls.ConnectionOptions = {
        socket: this.socket as net.Socket,
        host: this.config.host,
        rejectUnauthorized: true,
      };

      const tlsSocket = tls.connect(tlsOptions, () => {
        this.socket = tlsSocket;
        this.secure = true;
        resolve();
      });

      tlsSocket.on("data", (data) => this.handleData(data));
      tlsSocket.on("error", reject);
    });
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const connectOptions = {
        host: this.config.host,
        port: this.config.port,
      };

      if (this.config.secure) {
        // Direct TLS connection (port 465)
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
        // Plain connection, will upgrade with STARTTLS
        this.socket = net.connect(connectOptions, () => {
          this.connected = true;
        });
      }

      this.socket.on("data", (data) => this.handleData(data));

      this.socket.on("error", (err) => {
        reject(err);
      });

      this.socket.on("close", () => {
        this.connected = false;
      });

      // Wait for initial greeting
      this.waitForResponse()
        .then(async (greeting) => {
          const code = this.parseResponseCode(greeting);
          if (code !== 220) {
            throw new Error(`Unexpected greeting: ${greeting}`);
          }
          resolve();
        })
        .catch(reject);
    });
  }

  async authenticate(): Promise<void> {
    // Send EHLO
    const ehloResponse = await this.sendCommand(
      `EHLO ${this.config.from.email.split("@")[1] || "localhost"}`,
    );
    if (this.parseResponseCode(ehloResponse) !== 250) {
      throw new Error(`EHLO failed: ${ehloResponse}`);
    }

    // Check if we need STARTTLS
    if (!this.secure && ehloResponse.includes("STARTTLS")) {
      const starttlsResponse = await this.sendCommand("STARTTLS");
      if (this.parseResponseCode(starttlsResponse) !== 220) {
        throw new Error(`STARTTLS failed: ${starttlsResponse}`);
      }
      await this.upgradeToTLS();

      // Re-send EHLO after TLS upgrade
      const ehloResponse2 = await this.sendCommand(
        `EHLO ${this.config.from.email.split("@")[1] || "localhost"}`,
      );
      if (this.parseResponseCode(ehloResponse2) !== 250) {
        throw new Error(`EHLO after STARTTLS failed: ${ehloResponse2}`);
      }
    }

    // AUTH LOGIN
    const authResponse = await this.sendCommand("AUTH LOGIN");
    if (this.parseResponseCode(authResponse) !== 334) {
      throw new Error(`AUTH LOGIN failed: ${authResponse}`);
    }

    // Send username (base64 encoded)
    const userResponse = await this.sendCommand(
      Buffer.from(this.config.auth.user).toString("base64"),
    );
    if (this.parseResponseCode(userResponse) !== 334) {
      throw new Error(`Username rejected: ${userResponse}`);
    }

    // Send password (base64 encoded)
    const passResponse = await this.sendCommand(
      Buffer.from(this.config.auth.pass).toString("base64"),
    );
    if (this.parseResponseCode(passResponse) !== 235) {
      throw new Error(`Authentication failed: ${passResponse}`);
    }
  }

  async sendMail(message: EmailMessage): Promise<SendResult> {
    // Use message-level from if provided, otherwise fall back to config
    const fromEmail = message.from?.email || this.config.from.email;
    const messageId = `<${crypto.randomUUID()}@${fromEmail.split("@")[1]}>`;

    try {
      // MAIL FROM
      const mailFromResponse = await this.sendCommand(
        `MAIL FROM:<${fromEmail}>`,
      );
      if (this.parseResponseCode(mailFromResponse) !== 250) {
        throw new Error(`MAIL FROM failed: ${mailFromResponse}`);
      }

      // RCPT TO for each recipient
      const recipients = this.getAllRecipients(message);
      for (const recipient of recipients) {
        const rcptResponse = await this.sendCommand(`RCPT TO:<${recipient}>`);
        const code = this.parseResponseCode(rcptResponse);
        if (code !== 250 && code !== 251) {
          throw new Error(`RCPT TO failed for ${recipient}: ${rcptResponse}`);
        }
      }

      // DATA
      const dataResponse = await this.sendCommand("DATA");
      if (this.parseResponseCode(dataResponse) !== 354) {
        throw new Error(`DATA command failed: ${dataResponse}`);
      }

      // Build and send email content
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

  private extractEmail(address: string): string {
    const match = address.match(/<([^>]+)>/);
    return match ? match[1] : address.trim();
  }

  private formatAddresses(addresses: string | string[]): string {
    if (Array.isArray(addresses)) {
      return addresses.join(", ");
    }
    return addresses;
  }

  private buildEmailContent(message: EmailMessage, messageId: string): string {
    const boundary = `----=_Part_${crypto.randomUUID().replace(/-/g, "")}`;
    const lines: string[] = [];

    // Use message-level from if provided, otherwise fall back to config
    const fromEmail = message.from?.email || this.config.from.email;
    const fromName = message.from?.name || this.config.from.name;

    // Headers
    lines.push(`Message-ID: ${messageId}`);
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

    lines.push(`Subject: ${this.encodeSubject(message.subject)}`);
    lines.push("MIME-Version: 1.0");

    // Custom headers
    if (message.headers) {
      for (const [key, value] of Object.entries(message.headers)) {
        lines.push(`${key}: ${value}`);
      }
    }

    const hasAttachments =
      message.attachments && message.attachments.length > 0;
    const hasMultipleParts = message.text && message.html;

    if (hasAttachments) {
      lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
      lines.push("");

      if (hasMultipleParts) {
        const altBoundary = `----=_Alt_${crypto.randomUUID().replace(/-/g, "")}`;
        lines.push(`--${boundary}`);
        lines.push(
          `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        );
        lines.push("");

        if (message.text) {
          lines.push(`--${altBoundary}`);
          lines.push("Content-Type: text/plain; charset=utf-8");
          lines.push("Content-Transfer-Encoding: quoted-printable");
          lines.push("");
          lines.push(this.encodeQuotedPrintable(message.text));
          lines.push("");
        }

        if (message.html) {
          lines.push(`--${altBoundary}`);
          lines.push("Content-Type: text/html; charset=utf-8");
          lines.push("Content-Transfer-Encoding: quoted-printable");
          lines.push("");
          lines.push(this.encodeQuotedPrintable(message.html));
          lines.push("");
        }

        lines.push(`--${altBoundary}--`);
      } else {
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

      // Add attachments
      for (const attachment of message.attachments!) {
        lines.push(`--${boundary}`);
        lines.push(
          `Content-Type: ${attachment.contentType || "application/octet-stream"}; name="${attachment.filename}"`,
        );
        lines.push("Content-Transfer-Encoding: base64");
        lines.push(
          `Content-Disposition: attachment; filename="${attachment.filename}"`,
        );
        lines.push("");

        const content =
          typeof attachment.content === "string"
            ? Buffer.from(attachment.content)
            : attachment.content;
        lines.push(this.encodeBase64(content));
        lines.push("");
      }

      lines.push(`--${boundary}--`);
    } else if (hasMultipleParts) {
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
      lines.push("Content-Type: text/html; charset=utf-8");
      lines.push("Content-Transfer-Encoding: quoted-printable");
      lines.push("");
      lines.push(this.encodeQuotedPrintable(message.html));
    } else {
      lines.push("Content-Type: text/plain; charset=utf-8");
      lines.push("Content-Transfer-Encoding: quoted-printable");
      lines.push("");
      lines.push(this.encodeQuotedPrintable(message.text || ""));
    }

    return lines.join("\r\n");
  }

  private encodeSubject(subject: string): string {
    // Check if subject contains non-ASCII characters
    if (!/^[\x00-\x7F]*$/.test(subject)) {
      // Use base64 encoding for non-ASCII subjects
      return `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
    }
    return subject;
  }

  private encodeQuotedPrintable(text: string): string {
    const lines: string[] = [];
    let currentLine = "";

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const code = char.charCodeAt(0);
      let encoded: string;

      if (char === "\r" || char === "\n") {
        if (char === "\r" && text[i + 1] === "\n") {
          lines.push(currentLine);
          currentLine = "";
          i++; // Skip the \n
        } else if (char === "\n") {
          lines.push(currentLine);
          currentLine = "";
        }
        continue;
      } else if (
        (code >= 33 && code <= 126 && code !== 61) ||
        code === 32 ||
        code === 9
      ) {
        // Printable ASCII (except =) and space/tab
        encoded = char;
      } else {
        // Non-printable or special characters
        const bytes = Buffer.from(char, "utf8");
        encoded = Array.from(bytes)
          .map((b) => `=${b.toString(16).toUpperCase().padStart(2, "0")}`)
          .join("");
      }

      // Check line length (max 76 characters)
      if (currentLine.length + encoded.length > 75) {
        lines.push(currentLine + "=");
        currentLine = encoded;
      } else {
        currentLine += encoded;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.join("\r\n");
  }

  private encodeBase64(content: Buffer): string {
    const base64 = content.toString("base64");
    const lines: string[] = [];

    for (let i = 0; i < base64.length; i += 76) {
      lines.push(base64.slice(i, i + 76));
    }

    return lines.join("\r\n");
  }

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

export class SMTPClient {
  private config: SMTPConfig;

  constructor(config: SMTPConfig) {
    this.config = config;
  }

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

  async send(message: EmailMessage): Promise<SendResult> {
    const connection = new SMTPConnection(this.config);

    try {
      await connection.connect();
      await connection.authenticate();
      const result = await connection.sendMail(message);
      await connection.disconnect();
      return result;
    } catch (error) {
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
