/**
 * imapClient.ts
 *
 * Detailed IMAP client implementation with near-line explanatory comments.
 *
 * Purpose
 * -------
 * Provide a small, self-contained IMAP client used by the backend to:
 *  - connect to an IMAP server over plain TCP or TLS,
 *  - optionally perform STARTTLS upgrade,
 *  - authenticate (LOGIN),
 *  - list/select mailboxes,
 *  - search messages and fetch headers and bodies,
 *  - mark messages read/unread and delete them.
 *
 * Design constraints and notes
 * ---------------------------
 * - This file implements a focused subset of IMAP features required by the
 *   app. It is NOT intended to be a fully compliant IMAP library. It is
 *   pragmatic: parse the common responses we expect, be defensive about
 *   unknown formats, and avoid throwing on unexpected but non-fatal formats.
 *
 * - IMAP responses can include "literals" (a line indicating {N} followed by
 *   N bytes of data). Correct handling of these literals is essential for
 *   retrieving message headers and bodies reliably. The parser below scans the
 *   aggregated response buffer to correctly handle those blocks.
 *
 * - The implementation uses a simple "tagged-command" approach:
 *     - client sends "A0001 <command>"
 *     - server may produce many untagged lines beginning with "* "
 *     - server then returns the tagged response "A0001 OK|NO|BAD ..."
 *   We wait for the tagged response and return all collected untagged lines.
 *
 * - The code emphasises observability during debugging (IMAP_DEBUG env var).
 *
 * Security / production notes
 * ---------------------------
 * - Use secure configuration (TLS or STARTTLS) in production.
 * - Avoid logging sensitive values in production logs.
 * - For large-scale or complex IMAP usage prefer a battle-tested IMAP library.
 */

import * as net from "net";
import * as tls from "tls";

/**
 * Shape of configuration required to connect to an IMAP server.
 *
 * - host: hostname or IP of IMAP server
 * - port: port number (usually 993 for implicit TLS, 143 for plain)
 * - secure: if true, open a TLS connection immediately (implicit TLS).
 * - auth: username / password used with LOGIN authentication.
 */
export interface IMAPConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

/**
 * EmailEnvelope - a parsed IMAP ENVELOPE representation with fields we care about.
 *
 * Note: IMAP ENVELOPE fields are positional. The parsing below extracts the
 * fields we commonly use: date, subject, from, to, cc, reply-to and message-id.
 * The types are permissive because the raw IMAP data can be missing or 'NIL'.
 */
export interface EmailEnvelope {
  date: string;
  subject: string;
  from: EmailAddress[];
  to: EmailAddress[];
  cc?: EmailAddress[];
  replyTo?: EmailAddress[];
  messageId: string;
}

/** Simple name/email pair */
export interface EmailAddress {
  name: string;
  email: string;
}

/** Representation of a message header returned from a FETCH command */
export interface EmailHeader {
  uid: number;
  flags: string[];
  envelope: EmailEnvelope;
  size: number;
}

/** Parsed message body result (text/html + headers) */
export interface EmailBody {
  uid: number;
  text?: string;
  html?: string;
  headers: Record<string, string>;
}

/** Mailbox metadata returned by SELECT */
export interface MailboxInfo {
  name: string;
  flags: string[];
  exists: number;
  recent: number;
  unseen: number;
  uidNext: number;
  uidValidity: number;
}

/** Fetch API result for paginated inbox reads */
export interface FetchResult {
  headers: EmailHeader[];
  total: number;
}

/**
 * Allowed recipients filter (application-specific).
 *
 * The client uses this to limit which inbound messages it processes when
 * the "filterByAllowedRecipients" option is enabled. Only messages sent to
 * any of these addresses will be returned by fetchEmails when filtering.
 */
const ALLOWED_RECIPIENTS = ["us@plazen.org", "support@plazen.org"];

/* ----------------------------------------------------------------------------
 * Internal low-level IMAP connection class (IMAPConnection)
 *
 * Responsibilities (summary)
 * - Manage the socket lifecycle (TCP/TLS)
 * - Send tagged commands and await the matching tagged response
 * - Accumulate "untagged" server responses produced while the command runs
 * - Provide parsing helpers used by higher-level methods (list, select, fetch)
 * ----------------------------------------------------------------------------
 */
/**
 * NOTE:
 * The following class is intentionally implemented with manual parsing logic.
 * The most complex part of working with IMAP is correctly handling "literal"
 * blocks and multi-line responses. This implementation is pragmatic: it
 * implements the behaviour required by the app and is defensive about
 * unexpected server quirks.
 */
class IMAPConnection {
  private socket: net.Socket | tls.TLSSocket | null = null;

  // configuration for the connection (host/port/auth)
  private config: IMAPConfig;

  // accumulated raw bytes converted to a string; we read from this buffer when
  // looking for a tagged response and untagged blocks.
  private responseBuffer: string = "";

  // counter used to create unique tags for each command (A0001, A0002, ...)
  private tagCounter: number = 0;

  // connection state booleans
  private connected: boolean = false;
  private secure: boolean = false;

  // cached mailbox info for the currently selected mailbox (set by SELECT)
  private currentMailbox: MailboxInfo | null = null;

  // when a command is pending we set `responseResolver` so incoming data
  // triggers re-evaluation of the buffer; resolver returns true if it found a
  // matching tagged response and processed it.
  private responseResolver: (() => boolean | void) | null = null;

  // collected untagged responses from the server (populated by waitForResponse)
  private untaggedResponses: string[] = [];

  constructor(config: IMAPConfig) {
    this.config = config;
  }

  /**
   * generateTag
   *
   * Create a new client tag (A0001, A0002, ...). Tags are used to match the
   * server's final response for a command.
   */
  private generateTag(): string {
    this.tagCounter++;
    // pad with zeros for readability: A0001, A0002...
    return `A${this.tagCounter.toString().padStart(4, "0")}`;
  }

  /**
   * waitForResponse
   *
   * Wait for the tagged response corresponding to `tag` while collecting any
   * untagged replies that appear before the tagged response.
   *
   * Behavioural notes and rationale (detailed because this is easy to get wrong):
   * - The server will often emit untagged lines (beginning with "* ") in the
   *   middle of a command's processing; example: when fetching message parts.
   * - IMAP "literals": a server line may end with {N} indicating a literal of N
   *   bytes follows immediately (not terminated by CRLF). When we see a line
   *   ending with `{N}` we must ensure the N bytes are present in the buffer and
   *   treat them as part of the logical response block.
   * - Multi-line logical blocks can be represented by multiple lines and literals
   *   together; the code below tries to identify the boundaries of those blocks
   *   by scanning forward until it finds another untagged header or the tagged
   *   response.
   *
   * Implementation notes:
   * - The function inspects `this.responseBuffer` and returns the tagged line
   *   and a list of untagged logical blocks.
   * - On timeout (60s) it rejects to avoid indefinite hangs.
   *
   * @param tag the client-generated tag to wait for (e.g. "A0001")
   */
  private async waitForResponse(
    tag: string,
  ): Promise<{ tagged: string; untagged: string[] }> {
    return new Promise((resolve, reject) => {
      // generous timeout so large literals have time to arrive
      const timeout = setTimeout(() => {
        reject(new Error("IMAP response timeout"));
      }, 60000);

      // reset collected untagged responses for this wait
      this.untaggedResponses = [];

      // checkResponse is the core parser that scans the internal buffer
      const checkResponse = () => {
        const buffer = this.responseBuffer;
        const collectedUntagged: string[] = [];
        let taggedResponse: string | null = null;
        let pos = 0;

        // Walk the buffer, line by line, handling literal blocks when found.
        while (pos < buffer.length) {
          // find the next CRLF boundary
          const lineEnd = buffer.indexOf("\r\n", pos);
          if (lineEnd === -1) {
            // we don't yet have a complete line
            break;
          }

          // slice the single-line piece from the buffer (without CRLF)
          const line = buffer.slice(pos, lineEnd);

          // detect a literal marker at the end of the line, e.g. {123}
          const literalMatch = line.match(/\{(\d+)\}$/);

          if (literalMatch) {
            // parse the literal byte length
            const literalSize = parseInt(literalMatch[1], 10);
            // literal content begins after the CRLF
            const literalStart = lineEnd + 2;
            const literalEnd = literalStart + literalSize;

            // If the buffer doesn't yet contain the whole literal, break and wait
            if (buffer.length < literalEnd) {
              break;
            }

            // extract the literal content
            const literalContent = buffer.slice(literalStart, literalEnd);
            // combine the original line and the literal content as the full logical line
            const fullLine = line + "\r\n" + literalContent;

            // If the line is an untagged response (starts with "* "), it may be
            // followed by more lines (and possibly more literals) that belong to
            // the same logical block. We attempt to find the end of the block by
            // scanning forward for the next untagged header or the tagged response.
            if (line.startsWith("* ")) {
              let extendedEnd = literalEnd;
              let searchPos = literalEnd;

              // walk forward to build the block boundary
              while (searchPos < buffer.length) {
                const nextLineEnd = buffer.indexOf("\r\n", searchPos);
                if (nextLineEnd === -1) break;

                const nextLine = buffer.slice(searchPos, nextLineEnd);

                // if the next line starts a new untagged response or the tagged
                // response for our command, stop extending the current block.
                if (
                  nextLine.startsWith("* ") ||
                  nextLine.startsWith(`${tag} `)
                ) {
                  break;
                }

                // If the next line itself contains a literal marker, handle it
                const nextLiteralMatch = nextLine.match(/\{(\d+)\}$/);
                if (nextLiteralMatch) {
                  const nextLiteralSize = parseInt(nextLiteralMatch[1], 10);
                  const nextLiteralEnd = nextLineEnd + 2 + nextLiteralSize;
                  // If the buffer doesn't contain that literal yet, ask to wait
                  if (buffer.length < nextLiteralEnd) {
                    // returning false here signals we didn't finish parsing
                    return false;
                  }
                  // extend our logical block boundary to include the next literal
                  extendedEnd = nextLiteralEnd;
                  searchPos = nextLiteralEnd;
                } else {
                  // simple CRLF-terminated line, extend the block boundary
                  extendedEnd = nextLineEnd + 2;
                  searchPos = nextLineEnd + 2;
                }
              }

              // capture the multi-line block and advance pos
              const fullContent = buffer.slice(pos, extendedEnd);
              collectedUntagged.push(fullContent);
              pos = extendedEnd;
              continue;
            } else if (line.startsWith(`${tag} `)) {
              // the tagged response itself contained a literal block; treat that
              // as the tagged response and stop scanning.
              taggedResponse = fullLine;
              pos = literalEnd;
              break;
            } else {
              // a literal appeared in some other place; append it to the
              // previous untagged block if present, otherwise treat as separate.
              if (collectedUntagged.length > 0) {
                collectedUntagged[collectedUntagged.length - 1] +=
                  "\r\n" + fullLine;
              }
              pos = literalEnd;
              continue;
            }
          }

          // No literal marker - a normal short line
          if (line.startsWith("* ")) {
            // untagged response (collect it)
            collectedUntagged.push(line);
          } else if (line.startsWith(`${tag} `)) {
            // tagged response for the command we issued
            taggedResponse = line;
            pos = lineEnd + 2;
            break;
          } else if (line.trim() !== "" && collectedUntagged.length > 0) {
            // some servers may continue long untagged lines across logical
            // lines without a literal marker; treat them as continuation lines
            // to the most recent untagged block.
            collectedUntagged[collectedUntagged.length - 1] += "\r\n" + line;
          }

          // advance past the CRLF we consumed
          pos = lineEnd + 2;
        }

        // If we found the tagged response, resolve with the result and remove
        // the consumed portion from the buffer. Otherwise update stored
        // untaggedResponses for clients that may read them directly.
        if (taggedResponse) {
          clearTimeout(timeout);
          // crop the buffer to remove consumed bytes
          this.responseBuffer = buffer.slice(pos);
          resolve({ tagged: taggedResponse, untagged: collectedUntagged });
          return true;
        }

        // no tagged response yet - update in-flight untagged list and wait
        this.untaggedResponses = collectedUntagged;
        return false;
      };

      // Expose the checkResponse function as the resolver so incoming data can
      // trigger it (see handleData below).
      this.responseResolver = () => checkResponse();

      // Do an initial check in case the buffer already contains a response.
      checkResponse();
    });
  }

  /**
   * handleData
   *
   * Called whenever the socket receives data. This method:
   * - coerces the received chunk into a string (IMAP wire format is mostly ASCII)
   * - appends to the response buffer
   * - invokes the response resolver (if set) to re-evaluate pending commands
   *
   * Notes:
   * - We treat incoming bytes as UTF-8 / ASCII. For binary literal data the
   *   literal-handling above slices raw bytes from the buffer which are still
   *   represented in the JS string; this works for typical email content but
   *   is not a fully general binary-safe implementation. It is pragmatic for
   *   expected workloads.
   */
  private handleData(data: Buffer | string | Uint8Array): void {
    let chunk: string;
    if (typeof data === "string") {
      chunk = data;
    } else if (Buffer.isBuffer(data)) {
      chunk = data.toString();
    } else {
      // support Uint8Array and similar views
      chunk = Buffer.from(data).toString();
    }

    // append received chunk to the internal response buffer
    this.responseBuffer += chunk;

    // if a command is waiting, trigger its resolver to inspect the buffer
    if (this.responseResolver) {
      // resolver will read this.responseBuffer and return true if complete
      this.responseResolver();
    }
  }

  /**
   * sendCommand
   *
   * Send a single IMAP command, tagged with a generated tag, then wait for the
   * corresponding tagged response (and collect untagged messages).
   *
   * Example send: sendCommand('CAPABILITY') will write "A0001 CAPABILITY\r\n"
   * to the socket and wait until a line starting with "A0001 " arrives.
   */
  private async sendCommand(
    command: string,
  ): Promise<{ tagged: string; untagged: string[] }> {
    if (!this.socket) {
      throw new Error("Not connected to IMAP server");
    }

    const tag = this.generateTag();

    return new Promise((resolve, reject) => {
      // write the tagged command to the socket and then wait for response
      this.socket!.write(`${tag} ${command}\r\n`, (err) => {
        if (err) {
          reject(err);
          return;
        }
        this.waitForResponse(tag).then(resolve).catch(reject);
      });
    });
  }

  /**
   * parseResponseStatus
   *
   * Parse the final tagged response (e.g. "A0001 OK ...") into a structured
   * object with status (OK/NO/BAD) and the trailing message. This is merely a
   * convenience helper used by callers.
   */
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

  /**
   * upgradeToTLS
   *
   * Perform a STARTTLS upgrade: wrap the existing plain socket into a TLS socket.
   * - Creates a tls.TLSSocket using the existing socket as the underlying stream.
   * - Installs the same data/error handlers so the rest of the class keeps working.
   *
   * Note: we currently do not customise TLS options (e.g. CA); production
   * deployments may wish to tune `rejectUnauthorized` or provide CAs.
   */
  private async upgradeToTLS(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tlsOptions: tls.ConnectionOptions = {
        socket: this.socket as net.Socket,
        host: this.config.host,
      };

      const tlsSocket = tls.connect(tlsOptions, () => {
        // optional debug info to help troubleshoot TLS certificate issues
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

        // replace the socket with the TLS-wrapped socket
        this.socket = tlsSocket;
        this.secure = true;
        resolve();
      });

      // ensure incoming data on the TLS socket also arrives at handleData
      tlsSocket.on("data", (data) => this.handleData(data));
      tlsSocket.on("error", (err) => {
        if (process.env.IMAP_DEBUG === "true")
          console.error("[IMAP] TLS error (upgrade):", err);
        reject(err);
      });
    });
  }

  /**
   * connect
   *
   * Establish a TCP or TLS connection to the IMAP server and wait for the
   * initial greeting from the server. The greeting is expected to be "* OK ...".
   *
   * - If config.secure is true we perform an implicit TLS connect (port 993).
   * - Otherwise we open a plain TCP socket (port 143) and later call STARTTLS
   *   if the server advertises it.
   *
   * The function installs handlers for 'data', 'error' and 'close' events and
   * waits for the initial greeting to be present in the buffer.
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const connectOptions = {
        host: this.config.host,
        port: this.config.port,
      };

      if (this.config.secure) {
        // implicit TLS - open a TLS socket immediately
        this.socket = tls.connect(
          {
            ...connectOptions,
            servername: this.config.host,
          },
          () => {
            this.connected = true;
            this.secure = true;

            // Optional debug info showing peer certificate summary
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
        // plain TCP; we'll optionally upgrade via STARTTLS during authenticate()
        this.socket = net.connect(connectOptions, () => {
          this.connected = true;
        });
      }

      // wire data/error/close handlers so the connection becomes usable
      this.socket.on("data", (data) => this.handleData(data));
      this.socket.on("error", (err) => {
        if (process.env.IMAP_DEBUG === "true")
          console.error("[IMAP] socket error:", err);
        reject(err);
      });
      this.socket.on("close", () => {
        this.connected = false;
      });

      // checkGreeting examines the buffer for the initial server greeting
      const checkGreeting = () => {
        if (this.responseBuffer.includes("\r\n")) {
          const lines = this.responseBuffer.split("\r\n");
          const greeting = lines[0];
          if (greeting.startsWith("* OK")) {
            // remove the greeting from the buffer so further processing starts clean
            this.responseBuffer = lines.slice(1).join("\r\n");
            resolve();
          } else {
            reject(new Error(`Unexpected greeting: ${greeting}`));
          }
        }
      };

      // set responseResolver to allow immediate reaction to further incoming data
      this.responseResolver = checkGreeting;
      // schedule a small check in case the greeting arrived synchronously
      setTimeout(checkGreeting, 100);
    });
  }

  /**
   * authenticate
   *
   * Perform authentication against the IMAP server:
   * - If the connection is not secure and the server supports STARTTLS, perform
   *   the upgrade before sending credentials.
   * - Authenticate using LOGIN <user> <pass> (quoted and escaped).
   *
   * Note: For many servers, SASL mechanisms (AUTH PLAIN/CRAM/LOGIN) are available -
   * this minimal implementation uses LOGIN which is widely supported.
   */
  async authenticate(): Promise<void> {
    if (!this.secure) {
      // Query capabilities to detect STARTTLS support
      const capResponse = await this.sendCommand("CAPABILITY");
      const hasStartTLS = capResponse.untagged.some((r) =>
        r.toUpperCase().includes("STARTTLS"),
      );

      if (hasStartTLS) {
        // request STARTTLS and perform the TLS upgrade
        const starttlsResponse = await this.sendCommand("STARTTLS");
        const status = this.parseResponseStatus(starttlsResponse.tagged);
        if (status.status !== "OK") {
          throw new Error(`STARTTLS failed: ${status.message}`);
        }
        await this.upgradeToTLS();
      }
    }

    // Perform LOGIN with properly escaped credentials
    const loginResponse = await this.sendCommand(
      `LOGIN "${this.escapeString(this.config.auth.user)}" "${this.escapeString(this.config.auth.pass)}"`,
    );
    const loginStatus = this.parseResponseStatus(loginResponse.tagged);
    if (loginStatus.status !== "OK") {
      throw new Error(`Authentication failed: ${loginStatus.message}`);
    }
  }

  /**
   * escapeString
   *
   * Escape backslashes and double-quotes for safe embedding inside quoted
   * IMAP strings used in commands like LOGIN and SELECT.
   */
  private escapeString(str: string): string {
    return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  /**
   * listMailboxes
   *
   * Send LIST "" "*" and parse mailbox names from the returned untagged lines.
   * Returns an array of mailbox names (e.g. ["INBOX", "Sent"]).
   */
  async listMailboxes(): Promise<string[]> {
    const response = await this.sendCommand('LIST "" "*"');
    const status = this.parseResponseStatus(response.tagged);
    if (status.status !== "OK") {
      throw new Error(`LIST failed: ${status.message}`);
    }

    const mailboxes: string[] = [];
    // example untagged line:
    // * LIST (\HasNoChildren) "/" "INBOX"
    for (const line of response.untagged) {
      const match = line.match(/^\* LIST \([^)]*\) "[^"]*" "?([^"]+)"?$/);
      if (match) {
        mailboxes.push(match[1]);
      }
    }

    return mailboxes;
  }

  /**
   * selectMailbox
   *
   * Selects the named mailbox and parses the returned mailbox metadata such as
   * EXISTS, RECENT, UNSEEN, UIDNEXT, UIDVALIDITY and FLAGS. The returned object
   * is stored in `this.currentMailbox` and also returned to the caller.
   */
  async selectMailbox(mailbox: string): Promise<MailboxInfo> {
    const response = await this.sendCommand(
      `SELECT "${this.escapeString(mailbox)}"`,
    );
    const status = this.parseResponseStatus(response.tagged);
    if (status.status !== "OK") {
      throw new Error(`SELECT failed: ${status.message}`);
    }

    // default mailbox info structure we populate from untagged lines
    const info: MailboxInfo = {
      name: mailbox,
      flags: [],
      exists: 0,
      recent: 0,
      unseen: 0,
      uidNext: 0,
      uidValidity: 0,
    };

    // parse known untagged indicators
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

  /**
   * fetchHeaders
   *
   * Read a paginated slice of messages in the currently selected mailbox using
   * the server-side numeric message sequence. The function computes the begin
   * and end sequence numbers for the requested page and issues a FETCH for
   * UID, FLAGS, ENVELOPE and RFC822.SIZE. The returned headers are parsed and
   * returned in descending order (newest first).
   */
  async fetchHeaders(start: number, count: number): Promise<FetchResult> {
    if (!this.currentMailbox) {
      throw new Error("No mailbox selected");
    }

    // total messages in the mailbox
    const total = this.currentMailbox.exists;
    if (total === 0) {
      return { headers: [], total: 0 };
    }

    // compute the sequence range to fetch; the UI expects pages starting from
    // the end (newest messages), so we map `start` into an end-based sequence.
    const end = Math.max(1, total - start);
    const begin = Math.max(1, end - count + 1);

    // issue a FETCH for the sequence range
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

    // reverse so that newest messages appear first in the returned array
    headers.reverse();

    return { headers, total };
  }

  /**
   * fetchHeadersByUIDs
   *
   * Fetch a set of headers by explicit UID values. Fetches in batches to avoid
   * overly long commands (server limits).
   */
  async fetchHeadersByUIDs(uids: number[]): Promise<EmailHeader[]> {
    if (!this.currentMailbox) {
      throw new Error("No mailbox selected");
    }
    if (uids.length === 0) {
      return [];
    }

    // batch to avoid massive UID lists; 100 is a safe default
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

  /**
   * searchByRecipients
   *
   * Build a recipient-based OR-search to find UIDs of messages that target any
   * of the provided recipients. Returns UIDs sorted descending (newest first).
   *
   * The function constructs a nested OR expression when multiple recipients are
   * provided because the IMAP SEARCH language supports binary OR only.
   */
  async searchByRecipients(recipients: string[]): Promise<number[]> {
    if (recipients.length === 0) {
      return [];
    }

    // Build a SEARCH expression like: TO "a@x" OR (TO "b@y") (TO "c@z") ...
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
    // parse lines like: "* SEARCH 123 456 789"
    for (const line of response.untagged) {
      const match = line.match(/^\* SEARCH(.*)$/);
      if (match) {
        // split sequence of numbers and coerce to ints
        const nums = match[1].trim().split(/\s+/).filter(Boolean);
        for (const num of nums) {
          const uid = parseInt(num, 10);
          if (!isNaN(uid)) uids.push(uid);
        }
      }
    }

    // sort newest first for convenience of calling code
    uids.sort((a, b) => b - a);

    return uids;
  }

  /**
   * parseFetchResponse
   *
   * Given a single untagged FETCH response line (or logical block including
   * literal data), parse the UID, FLAGS, RFC822.SIZE and ENVELOPE into a
   * structured EmailHeader. Returns null for lines that don't match expected
   * FETCH shape.
   *
   * This function uses simple regex/substring parsing to extract the parts we
   * need; the more complex parsing of the ENVELOPE block is delegated to
   * `parseEnvelope`.
   */
  private parseFetchResponse(line: string): EmailHeader | null {
    // The regex with the 's' flag captures everything inside the outer FETCH parentheses.
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

    // parseEnvelope handles the positional ENVELOPE field parsing
    const envelope = this.parseEnvelope(content);

    return { uid, flags, envelope, size };
  }

  /**
   * extractBalancedParens
   *
   * Utility to extract the substring within the first balanced parentheses
   * starting at startIndex. This is used to isolate the ENVELOPE(...) content
   * which itself may contain nested parentheses.
   *
   * Returns the inside content (without surrounding parentheses) or empty
   * string when no balanced block is present.
   */
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

  /**
   * parseEnvelope
   *
   * Find the "ENVELOPE (...)" section inside the FETCH content and parse it
   * into EmailEnvelope. The ENVELOPE is positional; the helper below splits
   * the envelope content into parts and then maps known positions to fields.
   */
  private parseEnvelope(content: string): EmailEnvelope {
    const envIndex = content.indexOf("ENVELOPE ");
    if (envIndex === -1) {
      // no envelope found - return a safe default object
      return {
        date: "",
        subject: "(No Subject)",
        from: [],
        to: [],
        messageId: "",
      };
    }

    // extract the balanced parentheses part following "ENVELOPE "
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

    // parse the envelope components into an array of parts
    const parts = this.parseEnvelopeComponents(envContent);

    // Map envelope positions to our fields, cleaning and decoding as necessary.
    // ENVELOPE format (RFC3501) positions (simplified):
    // 0 - date, 1 - subject, 2 - from, 3 - sender, 4 - reply-to, 5 - to, 6 - cc, ... 9 - message-id
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

  /**
   * parseEnvelopeComponents
   *
   * Tokenize the envelope (content inside parentheses) into top-level components.
   * - Handles quoted strings, nested parentheses, and NIL tokens.
   * - Stops after collecting the first 10 components (sufficient for our mapping).
   *
   * This function is a small parser rather than a full RFC grammar implementation.
   */
  private parseEnvelopeComponents(content: string): string[] {
    const parts: string[] = [];
    let i = 0;

    while (i < content.length && parts.length < 10) {
      // skip whitespace and CR/LF
      while (
        i < content.length &&
        (content[i] === " " || content[i] === "\r" || content[i] === "\n")
      ) {
        i++;
      }
      if (i >= content.length) break;

      if (content[i] === '"') {
        // quoted string - include surrounding quotes for later cleaning
        let str = '"';
        i++;
        while (i < content.length) {
          if (content[i] === "\\" && i + 1 < content.length) {
            // escaped char sequence like \" or \\ - keep both characters
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
        // nested list - find its end (balanced parentheses)
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
        // NIL token
        parts.push("NIL");
        i += 3;
      } else {
        // atom (unquoted token)
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

  /**
   * cleanEnvelopeValue
   *
   * Normalize an envelope token:
   * - remove surrounding quotes and unescape escaped characters
   * - convert NIL to empty string
   */
  private cleanEnvelopeValue(value: string): string {
    if (!value) return "";
    value = value.trim();
    if (value === "NIL") return "";
    if (value.startsWith('"') && value.endsWith('"')) {
      // remove outer quotes and unescape internal sequences
      return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    return value;
  }

  /**
   * parseAddressList
   *
   * Given a parenthesized address list or NIL token, parse it into an array of
   * EmailAddress objects. Each address item is itself a parenthesized list:
   * ("name" NIL "mailbox" "host")
   */
  private parseAddressList(data: string): EmailAddress[] {
    if (!data || data === "NIL" || data === "") return [];

    const addresses: EmailAddress[] = [];
    let content = data.trim();

    // strip surrounding parentheses when present
    if (content.startsWith("(") && content.endsWith(")")) {
      content = content.slice(1, -1);
    }

    let i = 0;
    while (i < content.length) {
      // skip whitespace
      while (
        i < content.length &&
        (content[i] === " " || content[i] === "\r" || content[i] === "\n")
      ) {
        i++;
      }

      if (i >= content.length) break;

      if (content[i] === "(") {
        // extract the whole parenthesized address structure
        let depth = 1;
        const start = i + 1;
        i++;
        while (i < content.length && depth > 0) {
          if (content[i] === "(") depth++;
          else if (content[i] === ")") depth--;
          i++;
        }
        // i now points just past the closing ')'
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
        // not an address start - skip one character to avoid infinite loop
        i++;
      }
    }

    return addresses;
  }

  /**
   * parseAddressParts
   *
   * Parse the four main components inside an address parentheses:
   *   - name, adl (ignored), mailbox, host
   *
   * Returns a list of strings (raw tokens).
   */
  private parseAddressParts(content: string): string[] {
    const parts: string[] = [];
    let i = 0;

    while (i < content.length && parts.length < 4) {
      // skip whitespace
      while (
        i < content.length &&
        (content[i] === " " || content[i] === "\r" || content[i] === "\n")
      ) {
        i++;
      }
      if (i >= content.length) break;

      if (content[i] === '"') {
        // quoted string - extract and unescape inner content
        let str = "";
        i++;
        while (i < content.length) {
          if (content[i] === "\\" && i + 1 < content.length) {
            // escaped char - include the next char as-is
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
        // NIL indicates an empty component
        parts.push("");
        i += 3;
      } else {
        // atom token - gather until whitespace or closing paren
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

  /**
   * decodeEncodedWord
   *
   * Decode RFC 2047 encoded-words in headers, e.g. =?UTF-8?B?.....?= or
   * =?ISO-8859-1?Q?....?=. The function implements a small subset: Base64 (B)
   * and Quoted-Printable-like 'Q' decoding. Non-standard or unknown encodings are
   * returned as-is.
   */
  private decodeEncodedWord(text: string): string {
    if (!text) return text;

    // replace one or multiple occurrences of the encoded-word pattern
    return text.replace(
      /=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi,
      (_, charset, encoding, encodedText) => {
        try {
          if (encoding.toUpperCase() === "B") {
            // Base64 decode
            const decoded = Buffer.from(encodedText, "base64");
            return decoded.toString(
              charset.toLowerCase() === "utf-8" ? "utf8" : "latin1",
            );
          } else {
            // "Q" encoding: underscores -> spaces and =HH hex escapes
            const decoded = encodedText
              .replace(/_/g, " ")
              .replace(/=([0-9A-F]{2})/gi, (_: string, hex: string) =>
                String.fromCharCode(parseInt(hex, 16)),
              );
            return decoded;
          }
        } catch {
          // On any decode error return the original encoded word
          return encodedText;
        }
      },
    );
  }

  /**
   * fetchBody
   *
   * Fetch the header and text body for a specific UID. This method:
   * - issues UID FETCH <uid> (BODY[HEADER] BODY[TEXT])
   * - extracts the header literal and parses header lines into a headers map
   * - extracts the text literal and decodes based on content-transfer-encoding
   * - supports multipart parsing (basic), returning both text and html when present
   */
  async fetchBody(uid: number): Promise<EmailBody> {
    const response = await this.sendCommand(
      `UID FETCH ${uid} (BODY[HEADER] BODY[TEXT])`,
    );
    const status = this.parseResponseStatus(response.tagged);
    if (status.status !== "OK") {
      throw new Error(`FETCH body failed: ${status.message}`);
    }

    // initialize body object; we'll populate headers and text/html
    const body: EmailBody = {
      uid,
      headers: {},
    };

    // join untagged parts; the fetch response handling earlier ensures any
    // literal blocks are included in these untagged strings.
    const fullResponse = response.untagged.join("\r\n");

    // extract header literal by looking for BODY[HEADER] {<size>}
    const headerMatch = fullResponse.match(/BODY\[HEADER\]\s*\{(\d+)\}\r\n/);
    if (headerMatch) {
      const expectedSize = parseInt(headerMatch[1], 10);
      const headerStart = headerMatch.index! + headerMatch[0].length;
      const headerText = fullResponse.slice(
        headerStart,
        headerStart + expectedSize,
      );

      // split header lines on CRLF that are not folded (folded lines start with tab/space)
      const headerLines = headerText.split(/\r\n(?=[^\t ])/);
      for (const line of headerLines) {
        const colonPos = line.indexOf(":");
        if (colonPos > 0) {
          const key = line.slice(0, colonPos).trim().toLowerCase();
          const value = line
            .slice(colonPos + 1)
            .trim()
            // unfold multiline header continuations
            .replace(/\r\n\s+/g, " ");
          // decode encoded words in header values
          body.headers[key] = this.decodeEncodedWord(value);
        }
      }
    }

    // extract BODY[TEXT] literal
    const textMatch = fullResponse.match(/BODY\[TEXT\]\s*\{(\d+)\}\r\n/);
    if (textMatch) {
      const expectedSize = parseInt(textMatch[1], 10);
      const textStart = textMatch.index! + textMatch[0].length;
      const bodyText = fullResponse.slice(textStart, textStart + expectedSize);

      const contentType = body.headers["content-type"] || "";

      // If the content type is multipart we need to split and parse parts
      if (contentType.includes("multipart/")) {
        const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/);
        if (boundaryMatch) {
          const parsed = this.parseMultipart(bodyText, boundaryMatch[1]);
          body.text = parsed.text;
          body.html = parsed.html;
        }
      } else if (contentType.includes("text/html")) {
        // single part HTML
        body.html = this.decodeBodyContent(bodyText, body.headers);
      } else if (contentType.includes("text/plain") || !contentType) {
        // plain text
        body.text = this.decodeBodyContent(bodyText, body.headers);
      } else {
        // unknown content type - attempt to decode as text
        body.text = this.decodeBodyContent(bodyText, body.headers);
      }
    }

    // Some servers may not use literal blocks and instead include small quoted
    // text inline: try an alternate extraction pattern for small bodies.
    if (!body.text && !body.html) {
      const altBodyMatch = fullResponse.match(/BODY\[TEXT\]\s+"([^"]*)"/);
      if (altBodyMatch) {
        body.text = altBodyMatch[1];
      }
    }

    return body;
  }

  /**
   * decodeBodyContent
   *
   * Decode a body part's raw content using the Content-Transfer-Encoding header.
   * Supports base64 and quoted-printable decoding; otherwise returns the raw content.
   */
  private decodeBodyContent(
    content: string,
    headers: Record<string, string>,
  ): string {
    const encoding = headers["content-transfer-encoding"] || "";

    if (encoding.toLowerCase() === "base64") {
      try {
        // remove whitespace and decode base64
        return Buffer.from(content.replace(/\s/g, ""), "base64").toString(
          "utf8",
        );
      } catch {
        // if decode fails, return raw content to avoid swallowing data
        return content;
      }
    } else if (encoding.toLowerCase() === "quoted-printable") {
      // naive quoted-printable decoding: remove soft line breaks and hex escapes
      return content
        .replace(/=\r\n/g, "")
        .replace(/=([0-9A-F]{2})/gi, (_, hex) =>
          String.fromCharCode(parseInt(hex, 16)),
        );
    }

    // unknown or identity encoding -> return as-is
    return content;
  }

  /**
   * parseMultipart
   *
   * Basic multipart parser that:
   * - splits on boundary markers
   * - extracts headers for each part
   * - decodes each part using decodeBodyContent
   * - handles nested multipart/alternative by recursive call
   *
   * This parser is intentionally minimal but sufficient for the usual
   * text/plain and text/html email structures.
   */
  private parseMultipart(
    content: string,
    boundary: string,
  ): { text?: string; html?: string } {
    const result: { text?: string; html?: string } = {};
    const parts = content.split(`--${boundary}`);

    for (const part of parts) {
      if (part.trim() === "" || part.trim() === "--") continue;

      // find header/body separator (CRLF CRLF preferred; fallback to LF LF)
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

      // split header lines and collect into map (unfold folded lines)
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

      // prefer text/plain for .text and text/html for .html; if nested alternatives
      // are present parse them recursively.
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

  /**
   * search
   *
   * Generic search using server criteria string (IMAP SEARCH syntax).
   * Returns array of matching UIDs.
   */
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

  /**
   * markAsRead
   *
   * Set the \Seen flag on the given UID.
   */
  async markAsRead(uid: number): Promise<void> {
    const response = await this.sendCommand(`UID STORE ${uid} +FLAGS (\\Seen)`);
    const status = this.parseResponseStatus(response.tagged);
    if (status.status !== "OK") {
      throw new Error(`STORE failed: ${status.message}`);
    }
  }

  /**
   * markAsUnread
   *
   * Remove the \Seen flag from the message.
   */
  async markAsUnread(uid: number): Promise<void> {
    const response = await this.sendCommand(`UID STORE ${uid} -FLAGS (\\Seen)`);
    const status = this.parseResponseStatus(response.tagged);
    if (status.status !== "OK") {
      throw new Error(`STORE failed: ${status.message}`);
    }
  }

  /**
   * deleteMessage
   *
   * Mark message +FLAGS (\Deleted) and then EXPUNGE the mailbox to remove it.
   */
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

  /**
   * disconnect
   *
   * Gracefully LOGOUT and then destroy the socket. Catch and ignore errors
   * during logout to ensure cleanup proceeds.
   */
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

/* ----------------------------------------------------------------------------
 * Public, higher-level IMAPClient wrapper
 *
 * - Manages connection lifecycle for each operation via withConnection
 * - Exposes simpler methods used by application code (listMailboxes,
 *   fetchEmails, getEmailBody, etc.)
 * ----------------------------------------------------------------------------
 */

/**
 * IMAPClient
 *
 * Construct with a config (or use fromEnv() to read environment variables).
 * Use withConnection to perform an operation with an authenticated connection;
 * withConnection ensures connect(), authenticate() and disconnect() are called.
 */
export class IMAPClient {
  private config: IMAPConfig;

  constructor(config: IMAPConfig) {
    this.config = config;
  }

  /**
   * fromEnv
   *
   * Convenience: create a client using environment variables. Useful for
   * server-side background tasks that run in a configured environment.
   */
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

  /**
   * withConnection
   *
   * Create a connection, connect/authenticate, run the callback, then ensure
   * disconnect is called even if the callback throws. This simplifies callers
   * who only want to run a single logical operation without managing sockets.
   */
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

  /* High-level wrapper methods that call into withConnection for each operation.
   * Each method selects the mailbox when appropriate and delegates to the
   * corresponding IMAPConnection method.
   */

  async listMailboxes(): Promise<string[]> {
    return this.withConnection((conn) => conn.listMailboxes());
  }

  async getMailboxInfo(mailbox: string): Promise<MailboxInfo> {
    return this.withConnection((conn) => conn.selectMailbox(mailbox));
  }

  /**
   * fetchEmails
   *
   * High-level inbox fetch used by UI/admin flows:
   * - mailbox: mailbox name (e.g. INBOX)
   * - start, count: pagination (start=0 newest first)
   * - filterByAllowedRecipients: when true, only return messages addressed to
   *   the addresses listed in ALLOWED_RECIPIENTS (application-specific)
   */
  async fetchEmails(
    mailbox: string,
    start: number = 0,
    count: number = 20,
    filterByAllowedRecipients: boolean = true,
  ): Promise<FetchResult> {
    return this.withConnection(async (conn) => {
      await conn.selectMailbox(mailbox);

      if (filterByAllowedRecipients) {
        // find UIDs that targeted allowed recipients
        const allUIDs = await conn.searchByRecipients(ALLOWED_RECIPIENTS);
        const total = allUIDs.length;

        if (total === 0) {
          return { headers: [], total: 0 };
        }

        // paginate the UID list and fetch headers for those UIDs
        const paginatedUIDs = allUIDs.slice(start, start + count);
        const headers = await conn.fetchHeadersByUIDs(paginatedUIDs);

        // sort descending by UID so newest first
        headers.sort((a, b) => b.uid - a.uid);

        return { headers, total };
      }

      // fallback: server-side fetch by sequence numbers
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

  /**
   * verify
   *
   * Quick check that connects, lists mailboxes and disconnects. Returns true
   * on success and false if any error occurred. Useful for health checks.
   */
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

  /**
   * getConfig
   *
   * Return public-safe representation of the config (omitting the password).
   * Useful for diagnostics where you want to show which host/port/user is used.
   */
  getConfig(): Omit<IMAPConfig, "auth"> & { auth: { user: string } } {
    return {
      ...this.config,
      auth: {
        user: this.config.auth.user,
      },
    };
  }
}

/* Export default for convenience */
export default IMAPClient;
