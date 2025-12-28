import * as net from "net";
import * as tls from "tls";

export interface IMAPConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface EmailEnvelope {
  date: string;
  subject: string;
  from: EmailAddress[];
  to: EmailAddress[];
  cc?: EmailAddress[];
  replyTo?: EmailAddress[];
  messageId: string;
}

export interface EmailAddress {
  name: string;
  email: string;
}

export interface EmailHeader {
  uid: number;
  flags: string[];
  envelope: EmailEnvelope;
  size: number;
}

export interface EmailBody {
  uid: number;
  text?: string;
  html?: string;
  headers: Record<string, string>;
}

export interface MailboxInfo {
  name: string;
  flags: string[];
  exists: number;
  recent: number;
  unseen: number;
  uidNext: number;
  uidValidity: number;
}

export interface FetchResult {
  headers: EmailHeader[];
  total: number;
}

const ALLOWED_RECIPIENTS = ["us@plazen.org", "support@plazen.org"];

class IMAPConnection {
  private socket: net.Socket | tls.TLSSocket | null = null;
  private config: IMAPConfig;
  private responseBuffer: string = "";
  private tagCounter: number = 0;
  private connected: boolean = false;
  private secure: boolean = false;
  private currentMailbox: MailboxInfo | null = null;
  private responseResolver: (() => boolean | void) | null = null;
  private untaggedResponses: string[] = [];

  constructor(config: IMAPConfig) {
    this.config = config;
  }

  private generateTag(): string {
    this.tagCounter++;
    return `A${this.tagCounter.toString().padStart(4, "0")}`;
  }

  private async waitForResponse(
    tag: string,
  ): Promise<{ tagged: string; untagged: string[] }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("IMAP response timeout"));
      }, 60000);

      this.untaggedResponses = [];

      const checkResponse = () => {
        const buffer = this.responseBuffer;
        const collectedUntagged: string[] = [];
        let taggedResponse: string | null = null;
        let pos = 0;

        while (pos < buffer.length) {
          const lineEnd = buffer.indexOf("\r\n", pos);
          if (lineEnd === -1) {
            break;
          }

          const line = buffer.slice(pos, lineEnd);
          const literalMatch = line.match(/\{(\d+)\}$/);

          if (literalMatch) {
            const literalSize = parseInt(literalMatch[1], 10);
            const literalStart = lineEnd + 2;
            const literalEnd = literalStart + literalSize;

            if (buffer.length < literalEnd) {
              break;
            }

            const literalContent = buffer.slice(literalStart, literalEnd);
            const fullLine = line + "\r\n" + literalContent;

            if (line.startsWith("* ")) {
              let extendedEnd = literalEnd;
              let searchPos = literalEnd;

              while (searchPos < buffer.length) {
                const nextLineEnd = buffer.indexOf("\r\n", searchPos);
                if (nextLineEnd === -1) break;

                const nextLine = buffer.slice(searchPos, nextLineEnd);

                if (
                  nextLine.startsWith("* ") ||
                  nextLine.startsWith(`${tag} `)
                ) {
                  break;
                }

                const nextLiteralMatch = nextLine.match(/\{(\d+)\}$/);
                if (nextLiteralMatch) {
                  const nextLiteralSize = parseInt(nextLiteralMatch[1], 10);
                  const nextLiteralEnd = nextLineEnd + 2 + nextLiteralSize;
                  if (buffer.length < nextLiteralEnd) {
                    return false;
                  }
                  extendedEnd = nextLiteralEnd;
                  searchPos = nextLiteralEnd;
                } else {
                  extendedEnd = nextLineEnd + 2;
                  searchPos = nextLineEnd + 2;
                }
              }

              const fullContent = buffer.slice(pos, extendedEnd);
              collectedUntagged.push(fullContent);
              pos = extendedEnd;
              continue;
            } else if (line.startsWith(`${tag} `)) {
              taggedResponse = fullLine;
              pos = literalEnd;
              break;
            } else {
              if (collectedUntagged.length > 0) {
                collectedUntagged[collectedUntagged.length - 1] +=
                  "\r\n" + fullLine;
              }
              pos = literalEnd;
              continue;
            }
          }

          if (line.startsWith("* ")) {
            collectedUntagged.push(line);
          } else if (line.startsWith(`${tag} `)) {
            taggedResponse = line;
            pos = lineEnd + 2;
            break;
          } else if (line.trim() !== "" && collectedUntagged.length > 0) {
            collectedUntagged[collectedUntagged.length - 1] += "\r\n" + line;
          }

          pos = lineEnd + 2;
        }

        if (taggedResponse) {
          clearTimeout(timeout);
          this.responseBuffer = buffer.slice(pos);
          resolve({ tagged: taggedResponse, untagged: collectedUntagged });
          return true;
        }

        this.untaggedResponses = collectedUntagged;
        return false;
      };

      this.responseResolver = () => checkResponse();

      checkResponse();
    });
  }

  private handleData(data: Buffer | string | Uint8Array): void {
    let chunk: string;
    if (typeof data === "string") {
      chunk = data;
    } else if (Buffer.isBuffer(data)) {
      chunk = data.toString();
    } else {
      chunk = Buffer.from(data).toString();
    }

    this.responseBuffer += chunk;
    if (this.responseResolver) {
      // Call resolver without passing the buffer; resolver will inspect
      // `this.responseBuffer` and may return true if it handled a tagged response.
      this.responseResolver();
    }
  }

  private async sendCommand(
    command: string,
  ): Promise<{ tagged: string; untagged: string[] }> {
    if (!this.socket) {
      throw new Error("Not connected to IMAP server");
    }

    const tag = this.generateTag();

    return new Promise((resolve, reject) => {
      this.socket!.write(`${tag} ${command}\r\n`, (err) => {
        if (err) {
          reject(err);
          return;
        }
        this.waitForResponse(tag).then(resolve).catch(reject);
      });
    });
  }

  private parseResponseStatus(response: string): {
    status: string;
    message: string;
  } {
    const match = response.match(/^A\d+ (OK|NO|BAD)\s*(.*)?$/i);
    if (match) {
      return { status: match[1].toUpperCase(), message: match[2] || "" };
    }
    return { status: "UNKNOWN", message: response };
  }

  private async upgradeToTLS(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tlsOptions: tls.ConnectionOptions = {
        socket: this.socket as net.Socket,
        host: this.config.host,
      };

      const tlsSocket = tls.connect(tlsOptions, () => {
        if (process.env.IMAP_DEBUG === "true") {
          try {
            console.debug(
              "[IMAP] STARTTLS upgrade: authorized=",
              tlsSocket.authorized,
              "authorizationError=",
              tlsSocket.authorizationError,
            );
            const peer = tlsSocket.getPeerCertificate(true) || {};
            console.debug(
              "[IMAP] STARTTLS peer subject:",
              peer.subject,
              "issuer:",
              peer.issuer,
            );
          } catch (e) {
            console.debug("[IMAP] STARTTLS debug failed:", e);
          }
        }

        this.socket = tlsSocket;
        this.secure = true;
        resolve();
      });

      tlsSocket.on("data", (data) => this.handleData(data));
      tlsSocket.on("error", (err) => {
        if (process.env.IMAP_DEBUG === "true")
          console.error("[IMAP] TLS error (upgrade):", err);
        reject(err);
      });
    });
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const connectOptions = {
        host: this.config.host,
        port: this.config.port,
      };

      if (this.config.secure) {
        this.socket = tls.connect(
          {
            ...connectOptions,
            servername: this.config.host,
          },
          () => {
            this.connected = true;
            this.secure = true;

            if (process.env.IMAP_DEBUG === "true") {
              try {
                const s = this.socket as tls.TLSSocket;
                console.debug(
                  "[IMAP] TLS connect: authorized=",
                  s.authorized,
                  "authorizationError=",
                  s.authorizationError,
                );
                const peer = s.getPeerCertificate(true) || {};
                console.debug(
                  "[IMAP] TLS peer subject:",
                  peer.subject,
                  "issuer:",
                  peer.issuer,
                );
              } catch (e) {
                console.debug("[IMAP] TLS connect debug failed:", e);
              }
            }
          },
        );
      } else {
        this.socket = net.connect(connectOptions, () => {
          this.connected = true;
        });
      }

      this.socket.on("data", (data) => this.handleData(data));
      this.socket.on("error", (err) => {
        if (process.env.IMAP_DEBUG === "true")
          console.error("[IMAP] socket error:", err);
        reject(err);
      });
      this.socket.on("close", () => {
        this.connected = false;
      });

      const checkGreeting = () => {
        if (this.responseBuffer.includes("\r\n")) {
          const lines = this.responseBuffer.split("\r\n");
          const greeting = lines[0];
          if (greeting.startsWith("* OK")) {
            this.responseBuffer = lines.slice(1).join("\r\n");
            resolve();
          } else {
            reject(new Error(`Unexpected greeting: ${greeting}`));
          }
        }
      };

      this.responseResolver = checkGreeting;
      setTimeout(checkGreeting, 100);
    });
  }

  async authenticate(): Promise<void> {
    if (!this.secure) {
      const capResponse = await this.sendCommand("CAPABILITY");
      const hasStartTLS = capResponse.untagged.some((r) =>
        r.toUpperCase().includes("STARTTLS"),
      );

      if (hasStartTLS) {
        const starttlsResponse = await this.sendCommand("STARTTLS");
        const status = this.parseResponseStatus(starttlsResponse.tagged);
        if (status.status !== "OK") {
          throw new Error(`STARTTLS failed: ${status.message}`);
        }
        await this.upgradeToTLS();
      }
    }

    const loginResponse = await this.sendCommand(
      `LOGIN "${this.escapeString(this.config.auth.user)}" "${this.escapeString(this.config.auth.pass)}"`,
    );
    const loginStatus = this.parseResponseStatus(loginResponse.tagged);
    if (loginStatus.status !== "OK") {
      throw new Error(`Authentication failed: ${loginStatus.message}`);
    }
  }

  private escapeString(str: string): string {
    return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  async listMailboxes(): Promise<string[]> {
    const response = await this.sendCommand('LIST "" "*"');
    const status = this.parseResponseStatus(response.tagged);
    if (status.status !== "OK") {
      throw new Error(`LIST failed: ${status.message}`);
    }

    const mailboxes: string[] = [];
    for (const line of response.untagged) {
      const match = line.match(/^\* LIST \([^)]*\) "[^"]*" "?([^"]+)"?$/);
      if (match) {
        mailboxes.push(match[1]);
      }
    }

    return mailboxes;
  }

  async selectMailbox(mailbox: string): Promise<MailboxInfo> {
    const response = await this.sendCommand(
      `SELECT "${this.escapeString(mailbox)}"`,
    );
    const status = this.parseResponseStatus(response.tagged);
    if (status.status !== "OK") {
      throw new Error(`SELECT failed: ${status.message}`);
    }

    const info: MailboxInfo = {
      name: mailbox,
      flags: [],
      exists: 0,
      recent: 0,
      unseen: 0,
      uidNext: 0,
      uidValidity: 0,
    };

    for (const line of response.untagged) {
      if (line.includes("EXISTS")) {
        const match = line.match(/\* (\d+) EXISTS/);
        if (match) info.exists = parseInt(match[1], 10);
      } else if (line.includes("RECENT")) {
        const match = line.match(/\* (\d+) RECENT/);
        if (match) info.recent = parseInt(match[1], 10);
      } else if (line.includes("FLAGS")) {
        const match = line.match(/FLAGS \(([^)]*)\)/);
        if (match) info.flags = match[1].split(" ").filter(Boolean);
      } else if (line.includes("UIDNEXT")) {
        const match = line.match(/UIDNEXT (\d+)/);
        if (match) info.uidNext = parseInt(match[1], 10);
      } else if (line.includes("UIDVALIDITY")) {
        const match = line.match(/UIDVALIDITY (\d+)/);
        if (match) info.uidValidity = parseInt(match[1], 10);
      } else if (line.includes("UNSEEN")) {
        const match = line.match(/UNSEEN (\d+)/);
        if (match) info.unseen = parseInt(match[1], 10);
      }
    }

    this.currentMailbox = info;
    return info;
  }

  async fetchHeaders(start: number, count: number): Promise<FetchResult> {
    if (!this.currentMailbox) {
      throw new Error("No mailbox selected");
    }

    const total = this.currentMailbox.exists;
    if (total === 0) {
      return { headers: [], total: 0 };
    }

    const end = Math.max(1, total - start);
    const begin = Math.max(1, end - count + 1);

    const response = await this.sendCommand(
      `FETCH ${begin}:${end} (UID FLAGS ENVELOPE RFC822.SIZE)`,
    );
    const status = this.parseResponseStatus(response.tagged);
    if (status.status !== "OK") {
      throw new Error(`FETCH failed: ${status.message}`);
    }

    const headers: EmailHeader[] = [];
    for (const line of response.untagged) {
      const header = this.parseFetchResponse(line);
      if (header) {
        headers.push(header);
      }
    }

    headers.reverse();

    return { headers, total };
  }

  async fetchHeadersByUIDs(uids: number[]): Promise<EmailHeader[]> {
    if (!this.currentMailbox) {
      throw new Error("No mailbox selected");
    }

    if (uids.length === 0) {
      return [];
    }

    const batchSize = 100;
    const headers: EmailHeader[] = [];

    for (let i = 0; i < uids.length; i += batchSize) {
      const batch = uids.slice(i, i + batchSize);
      const uidSet = batch.join(",");

      const response = await this.sendCommand(
        `UID FETCH ${uidSet} (UID FLAGS ENVELOPE RFC822.SIZE)`,
      );
      const status = this.parseResponseStatus(response.tagged);
      if (status.status !== "OK") {
        throw new Error(`UID FETCH failed: ${status.message}`);
      }

      for (const line of response.untagged) {
        const header = this.parseFetchResponse(line);
        if (header) {
          headers.push(header);
        }
      }
    }

    return headers;
  }

  async searchByRecipients(recipients: string[]): Promise<number[]> {
    if (recipients.length === 0) {
      return [];
    }

    let criteria: string;
    if (recipients.length === 1) {
      criteria = `TO "${recipients[0]}"`;
    } else {
      criteria = `TO "${recipients[0]}"`;
      for (let i = 1; i < recipients.length; i++) {
        criteria = `OR (${criteria}) (TO "${recipients[i]}")`;
      }
    }

    const response = await this.sendCommand(`UID SEARCH ${criteria}`);
    const status = this.parseResponseStatus(response.tagged);
    if (status.status !== "OK") {
      throw new Error(`SEARCH failed: ${status.message}`);
    }

    const uids: number[] = [];
    for (const line of response.untagged) {
      const match = line.match(/^\* SEARCH(.*)$/);
      if (match) {
        const nums = match[1].trim().split(/\s+/).filter(Boolean);
        for (const num of nums) {
          const uid = parseInt(num, 10);
          if (!isNaN(uid)) uids.push(uid);
        }
      }
    }

    uids.sort((a, b) => b - a);

    return uids;
  }

  private parseFetchResponse(line: string): EmailHeader | null {
    const fetchMatch = line.match(
      new RegExp("^\\* \\d+ FETCH \\((.*)\\)$", "s"),
    );
    if (!fetchMatch) return null;

    const content = fetchMatch[1];

    const uidMatch = content.match(/UID (\d+)/);
    const uid = uidMatch ? parseInt(uidMatch[1], 10) : 0;

    const flagsMatch = content.match(/FLAGS \(([^)]*)\)/);
    const flags = flagsMatch ? flagsMatch[1].split(" ").filter(Boolean) : [];

    const sizeMatch = content.match(/RFC822\.SIZE (\d+)/);
    const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;

    const envelope = this.parseEnvelope(content);

    return { uid, flags, envelope, size };
  }

  private extractBalancedParens(content: string, startIndex: number): string {
    let depth = 0;
    let start = -1;

    for (let i = startIndex; i < content.length; i++) {
      const char = content[i];
      if (char === "(") {
        if (depth === 0) start = i + 1;
        depth++;
      } else if (char === ")") {
        depth--;
        if (depth === 0) {
          return content.slice(start, i);
        }
      }
    }
    return "";
  }

  private parseEnvelope(content: string): EmailEnvelope {
    const envIndex = content.indexOf("ENVELOPE ");
    if (envIndex === -1) {
      return {
        date: "",
        subject: "(No Subject)",
        from: [],
        to: [],
        messageId: "",
      };
    }

    const envContent = this.extractBalancedParens(content, envIndex + 9);
    if (!envContent) {
      return {
        date: "",
        subject: "(No Subject)",
        from: [],
        to: [],
        messageId: "",
      };
    }

    const parts = this.parseEnvelopeComponents(envContent);

    return {
      date: this.cleanEnvelopeValue(parts[0]) || "",
      subject:
        this.decodeEncodedWord(this.cleanEnvelopeValue(parts[1])) ||
        "(No Subject)",
      from: this.parseAddressList(parts[2]),
      to: this.parseAddressList(parts[5]),
      cc:
        parts[6] && parts[6] !== "NIL"
          ? this.parseAddressList(parts[6])
          : undefined,
      replyTo:
        parts[4] && parts[4] !== "NIL"
          ? this.parseAddressList(parts[4])
          : undefined,
      messageId: this.cleanEnvelopeValue(parts[9]) || "",
    };
  }

  private parseEnvelopeComponents(content: string): string[] {
    const parts: string[] = [];
    let i = 0;

    while (i < content.length && parts.length < 10) {
      while (
        i < content.length &&
        (content[i] === " " || content[i] === "\r" || content[i] === "\n")
      ) {
        i++;
      }
      if (i >= content.length) break;

      if (content[i] === '"') {
        let str = '"';
        i++;
        while (i < content.length) {
          if (content[i] === "\\" && i + 1 < content.length) {
            str += content[i] + content[i + 1];
            i += 2;
          } else if (content[i] === '"') {
            str += '"';
            i++;
            break;
          } else {
            str += content[i];
            i++;
          }
        }
        parts.push(str);
      } else if (content[i] === "(") {
        let depth = 1;
        const start = i;
        i++;
        while (i < content.length && depth > 0) {
          if (content[i] === "(") depth++;
          else if (content[i] === ")") depth--;
          i++;
        }
        parts.push(content.slice(start, i));
      } else if (content.slice(i, i + 3).toUpperCase() === "NIL") {
        parts.push("NIL");
        i += 3;
      } else {
        let atom = "";
        while (
          i < content.length &&
          content[i] !== " " &&
          content[i] !== ")" &&
          content[i] !== "("
        ) {
          atom += content[i];
          i++;
        }
        if (atom) parts.push(atom);
      }
    }

    return parts;
  }

  private cleanEnvelopeValue(value: string): string {
    if (!value) return "";
    value = value.trim();
    if (value === "NIL") return "";
    if (value.startsWith('"') && value.endsWith('"')) {
      return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    return value;
  }

  private parseAddressList(data: string): EmailAddress[] {
    if (!data || data === "NIL" || data === "") return [];

    const addresses: EmailAddress[] = [];
    let content = data.trim();

    if (content.startsWith("(") && content.endsWith(")")) {
      content = content.slice(1, -1);
    }

    let i = 0;
    while (i < content.length) {
      while (
        i < content.length &&
        (content[i] === " " || content[i] === "\r" || content[i] === "\n")
      ) {
        i++;
      }

      if (i >= content.length) break;

      if (content[i] === "(") {
        let depth = 1;
        const start = i + 1;
        i++;
        while (i < content.length && depth > 0) {
          if (content[i] === "(") depth++;
          else if (content[i] === ")") depth--;
          i++;
        }
        const addrContent = content.slice(start, i - 1);

        const addrParts = this.parseAddressParts(addrContent);
        if (addrParts.length >= 4) {
          const name =
            this.decodeEncodedWord(this.cleanEnvelopeValue(addrParts[0])) || "";
          const mailbox = this.cleanEnvelopeValue(addrParts[2]) || "";
          const host = this.cleanEnvelopeValue(addrParts[3]) || "";
          if (mailbox && host) {
            addresses.push({
              name,
              email: `${mailbox}@${host}`,
            });
          }
        }
      } else {
        i++;
      }
    }

    return addresses;
  }

  private parseAddressParts(content: string): string[] {
    const parts: string[] = [];
    let i = 0;

    while (i < content.length && parts.length < 4) {
      while (
        i < content.length &&
        (content[i] === " " || content[i] === "\r" || content[i] === "\n")
      ) {
        i++;
      }
      if (i >= content.length) break;

      if (content[i] === '"') {
        let str = "";
        i++;
        while (i < content.length) {
          if (content[i] === "\\" && i + 1 < content.length) {
            str += content[i + 1];
            i += 2;
          } else if (content[i] === '"') {
            i++;
            break;
          } else {
            str += content[i];
            i++;
          }
        }
        parts.push(str);
      } else if (content.slice(i, i + 3).toUpperCase() === "NIL") {
        parts.push("");
        i += 3;
      } else {
        let atom = "";
        while (i < content.length && content[i] !== " " && content[i] !== ")") {
          atom += content[i];
          i++;
        }
        if (atom) parts.push(atom);
      }
    }

    return parts;
  }

  private decodeEncodedWord(text: string): string {
    if (!text) return text;

    return text.replace(
      /=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi,
      (_, charset, encoding, encodedText) => {
        try {
          if (encoding.toUpperCase() === "B") {
            const decoded = Buffer.from(encodedText, "base64");
            return decoded.toString(
              charset.toLowerCase() === "utf-8" ? "utf8" : "latin1",
            );
          } else {
            const decoded = encodedText
              .replace(/_/g, " ")
              .replace(/=([0-9A-F]{2})/gi, (_: string, hex: string) =>
                String.fromCharCode(parseInt(hex, 16)),
              );
            return decoded;
          }
        } catch {
          return encodedText;
        }
      },
    );
  }

  async fetchBody(uid: number): Promise<EmailBody> {
    const response = await this.sendCommand(
      `UID FETCH ${uid} (BODY[HEADER] BODY[TEXT])`,
    );
    const status = this.parseResponseStatus(response.tagged);
    if (status.status !== "OK") {
      throw new Error(`FETCH body failed: ${status.message}`);
    }

    const body: EmailBody = {
      uid,
      headers: {},
    };

    const fullResponse = response.untagged.join("\r\n");

    const headerMatch = fullResponse.match(/BODY\[HEADER\]\s*\{(\d+)\}\r\n/);
    if (headerMatch) {
      const expectedSize = parseInt(headerMatch[1], 10);
      const headerStart = headerMatch.index! + headerMatch[0].length;
      const headerText = fullResponse.slice(
        headerStart,
        headerStart + expectedSize,
      );

      const headerLines = headerText.split(/\r\n(?=[^\t ])/);
      for (const line of headerLines) {
        const colonPos = line.indexOf(":");
        if (colonPos > 0) {
          const key = line.slice(0, colonPos).trim().toLowerCase();
          const value = line
            .slice(colonPos + 1)
            .trim()
            .replace(/\r\n\s+/g, " ");
          body.headers[key] = this.decodeEncodedWord(value);
        }
      }
    }

    const textMatch = fullResponse.match(/BODY\[TEXT\]\s*\{(\d+)\}\r\n/);
    if (textMatch) {
      const expectedSize = parseInt(textMatch[1], 10);
      const textStart = textMatch.index! + textMatch[0].length;
      const bodyText = fullResponse.slice(textStart, textStart + expectedSize);

      const contentType = body.headers["content-type"] || "";

      if (contentType.includes("multipart/")) {
        const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/);
        if (boundaryMatch) {
          const parsed = this.parseMultipart(bodyText, boundaryMatch[1]);
          body.text = parsed.text;
          body.html = parsed.html;
        }
      } else if (contentType.includes("text/html")) {
        body.html = this.decodeBodyContent(bodyText, body.headers);
      } else if (contentType.includes("text/plain") || !contentType) {
        body.text = this.decodeBodyContent(bodyText, body.headers);
      } else {
        body.text = this.decodeBodyContent(bodyText, body.headers);
      }
    }

    if (!body.text && !body.html) {
      const altBodyMatch = fullResponse.match(/BODY\[TEXT\]\s+"([^"]*)"/);
      if (altBodyMatch) {
        body.text = altBodyMatch[1];
      }
    }

    return body;
  }

  private decodeBodyContent(
    content: string,
    headers: Record<string, string>,
  ): string {
    const encoding = headers["content-transfer-encoding"] || "";

    if (encoding.toLowerCase() === "base64") {
      try {
        return Buffer.from(content.replace(/\s/g, ""), "base64").toString(
          "utf8",
        );
      } catch {
        return content;
      }
    } else if (encoding.toLowerCase() === "quoted-printable") {
      return content
        .replace(/=\r\n/g, "")
        .replace(/=([0-9A-F]{2})/gi, (_, hex) =>
          String.fromCharCode(parseInt(hex, 16)),
        );
    }

    return content;
  }

  private parseMultipart(
    content: string,
    boundary: string,
  ): { text?: string; html?: string } {
    const result: { text?: string; html?: string } = {};
    const parts = content.split(`--${boundary}`);

    for (const part of parts) {
      if (part.trim() === "" || part.trim() === "--") continue;

      let headerEnd = part.indexOf("\r\n\r\n");
      let separatorLen = 4;
      if (headerEnd === -1) {
        headerEnd = part.indexOf("\n\n");
        separatorLen = 2;
      }
      if (headerEnd === -1) continue;

      const partHeaders: Record<string, string> = {};
      const partHeaderText = part.slice(0, headerEnd);
      const partBody = part.slice(headerEnd + separatorLen);

      const headerLines = partHeaderText.split(/\r?\n(?=[^\t ])/);
      for (const line of headerLines) {
        const colonPos = line.indexOf(":");
        if (colonPos > 0) {
          const key = line.slice(0, colonPos).trim().toLowerCase();
          const value = line.slice(colonPos + 1).trim();
          partHeaders[key] = value;
        }
      }

      const partContentType = partHeaders["content-type"] || "";
      const decodedBody = this.decodeBodyContent(partBody, partHeaders);

      if (partContentType.includes("text/plain") && !result.text) {
        result.text = decodedBody;
      } else if (partContentType.includes("text/html") && !result.html) {
        result.html = decodedBody;
      } else if (partContentType.includes("multipart/alternative")) {
        const nestedBoundary = partContentType.match(/boundary="?([^";]+)"?/);
        if (nestedBoundary) {
          const nested = this.parseMultipart(partBody, nestedBoundary[1]);
          if (nested.text) result.text = nested.text;
          if (nested.html) result.html = nested.html;
        }
      }
    }

    return result;
  }

  async search(criteria: string): Promise<number[]> {
    const response = await this.sendCommand(`UID SEARCH ${criteria}`);
    const status = this.parseResponseStatus(response.tagged);
    if (status.status !== "OK") {
      throw new Error(`SEARCH failed: ${status.message}`);
    }

    const uids: number[] = [];
    for (const line of response.untagged) {
      const match = line.match(/^\* SEARCH (.*)$/);
      if (match) {
        const nums = match[1].split(" ").filter(Boolean);
        for (const num of nums) {
          const uid = parseInt(num, 10);
          if (!isNaN(uid)) uids.push(uid);
        }
      }
    }

    return uids;
  }

  async markAsRead(uid: number): Promise<void> {
    const response = await this.sendCommand(`UID STORE ${uid} +FLAGS (\\Seen)`);
    const status = this.parseResponseStatus(response.tagged);
    if (status.status !== "OK") {
      throw new Error(`STORE failed: ${status.message}`);
    }
  }

  async markAsUnread(uid: number): Promise<void> {
    const response = await this.sendCommand(`UID STORE ${uid} -FLAGS (\\Seen)`);
    const status = this.parseResponseStatus(response.tagged);
    if (status.status !== "OK") {
      throw new Error(`STORE failed: ${status.message}`);
    }
  }

  async deleteMessage(uid: number): Promise<void> {
    const storeResponse = await this.sendCommand(
      `UID STORE ${uid} +FLAGS (\\Deleted)`,
    );
    const storeStatus = this.parseResponseStatus(storeResponse.tagged);
    if (storeStatus.status !== "OK") {
      throw new Error(`STORE failed: ${storeStatus.message}`);
    }

    const expungeResponse = await this.sendCommand("EXPUNGE");
    const expungeStatus = this.parseResponseStatus(expungeResponse.tagged);
    if (expungeStatus.status !== "OK") {
      throw new Error(`EXPUNGE failed: ${expungeStatus.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.socket && this.connected) {
      try {
        await this.sendCommand("LOGOUT");
      } catch {}
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
    }
  }
}

export class IMAPClient {
  private config: IMAPConfig;

  constructor(config: IMAPConfig) {
    this.config = config;
  }

  static fromEnv(): IMAPClient {
    const config: IMAPConfig = {
      host: process.env.IMAP_HOST || process.env.SMTP_HOST || "",
      port: parseInt(process.env.IMAP_PORT || "993", 10),
      secure: process.env.IMAP_SECURE !== "false",
      auth: {
        user: process.env.IMAP_USER || process.env.SMTP_USER || "",
        pass: process.env.IMAP_PASS || process.env.SMTP_PASS || "",
      },
    };
    return new IMAPClient(config);
  }

  async withConnection<T>(
    callback: (connection: IMAPConnection) => Promise<T>,
  ): Promise<T> {
    const connection = new IMAPConnection(this.config);

    try {
      await connection.connect();
      await connection.authenticate();
      const result = await callback(connection);
      await connection.disconnect();
      return result;
    } catch (error) {
      try {
        await connection.disconnect();
      } catch {}
      throw error;
    }
  }

  async listMailboxes(): Promise<string[]> {
    return this.withConnection((conn) => conn.listMailboxes());
  }

  async getMailboxInfo(mailbox: string): Promise<MailboxInfo> {
    return this.withConnection((conn) => conn.selectMailbox(mailbox));
  }

  async fetchEmails(
    mailbox: string,
    start: number = 0,
    count: number = 20,
    filterByAllowedRecipients: boolean = true,
  ): Promise<FetchResult> {
    return this.withConnection(async (conn) => {
      await conn.selectMailbox(mailbox);

      if (filterByAllowedRecipients) {
        const allUIDs = await conn.searchByRecipients(ALLOWED_RECIPIENTS);
        const total = allUIDs.length;

        if (total === 0) {
          return { headers: [], total: 0 };
        }

        const paginatedUIDs = allUIDs.slice(start, start + count);
        const headers = await conn.fetchHeadersByUIDs(paginatedUIDs);

        headers.sort((a, b) => b.uid - a.uid);

        return { headers, total };
      }

      return conn.fetchHeaders(start, count);
    });
  }

  async getEmailBody(mailbox: string, uid: number): Promise<EmailBody> {
    return this.withConnection(async (conn) => {
      await conn.selectMailbox(mailbox);
      return conn.fetchBody(uid);
    });
  }

  async searchEmails(mailbox: string, criteria: string): Promise<number[]> {
    return this.withConnection(async (conn) => {
      await conn.selectMailbox(mailbox);
      return conn.search(criteria);
    });
  }

  async markAsRead(mailbox: string, uid: number): Promise<void> {
    return this.withConnection(async (conn) => {
      await conn.selectMailbox(mailbox);
      await conn.markAsRead(uid);
    });
  }

  async markAsUnread(mailbox: string, uid: number): Promise<void> {
    return this.withConnection(async (conn) => {
      await conn.selectMailbox(mailbox);
      await conn.markAsUnread(uid);
    });
  }

  async deleteEmail(mailbox: string, uid: number): Promise<void> {
    return this.withConnection(async (conn) => {
      await conn.selectMailbox(mailbox);
      await conn.deleteMessage(uid);
    });
  }

  async verify(): Promise<boolean> {
    try {
      await this.withConnection(async (conn) => {
        await conn.listMailboxes();
      });
      return true;
    } catch {
      return false;
    }
  }

  getConfig(): Omit<IMAPConfig, "auth"> & { auth: { user: string } } {
    return {
      ...this.config,
      auth: {
        user: this.config.auth.user,
      },
    };
  }
}

export default IMAPClient;
