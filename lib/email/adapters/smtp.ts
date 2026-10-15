// path: lib/email/adapters/smtp.ts
import "server-only";

import net from "node:net";
import tls from "node:tls";
import type { Socket } from "node:net";

import type { EmailAdapter } from "@/lib/email/adapters/base";
import type { EmailCredential, EmailMessage, SendResult } from "@/lib/email/types";
import { ExternalServiceError } from "@/lib/errors/app-errors";

const CONNECT_TIMEOUT_MS = 10_000;
const IDLE_TIMEOUT_MS = 20_000;
const LOCAL_HELO = "kd-solution.it";

/**
 * Substep H - the universal SMTP adapter. Speaks raw SMTP over a TCP/TLS
 * socket (EHLO, optional STARTTLS, AUTH LOGIN, MAIL/RCPT/DATA/QUIT) so any
 * SMTP host the operator configures can be used, not only a managed gateway.
 *
 * The exchange is strictly timeout-bounded and fails closed: an SMTP 250 is a
 * delivery, a 5xx is a permanent bounce, and a 4xx/timeout/connection error is
 * a transient failure the queue retries. Credentials are sent only over the
 * authenticated channel and are never echoed in errors.
 */

interface SmtpResponse {
  readonly code: number;
  readonly text: string;
}

class SmtpSession {
  private buffer = "";
  private pending: string[] = [];
  private socket: Socket;

  private constructor(socket: Socket) {
    this.socket = socket;
    socket.on("data", (chunk: Buffer) => this.ingest(chunk));
  }

  static connect(socket: Socket): SmtpSession {
    return new SmtpSession(socket);
  }

  private ingest(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");
    let newline: number;
    while ((newline = this.buffer.indexOf("\r\n")) !== -1) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 2);
      this.handleLine(line);
    }
  }

  private handleLine(line: string): void {
    const match = /^(\d{3})([ -])(.*)$/.exec(line);
    if (match === null) {
      this.complete({ code: 250, text: this.pending.join("\n") || line });
      return;
    }
    this.pending.push(match[3] ?? "");
    if (match[2] === " ") {
      this.complete({
        code: Number.parseInt(match[1] ?? "000", 10),
        text: this.pending.join("\n"),
      });
    }
  }

  private complete(response: SmtpResponse): void {
    this.pending = [];
    this.onComplete?.(response);
    this.onComplete = null;
  }

  private onComplete: ((response: SmtpResponse) => void) | null = null;

  /** Sends a command and resolves with the server's multi-line response. */
  command(raw: string): Promise<SmtpResponse> {
    if (this.onComplete !== null) {
      return Promise.reject(new Error("SMTP command issued before the previous response was read"));
    }
    return new Promise<SmtpResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.onComplete = null;
        reject(new Error("SMTP response timed out"));
        this.socket.destroy();
      }, IDLE_TIMEOUT_MS);
      this.onComplete = (response) => {
        clearTimeout(timer);
        resolve(response);
      };
      this.socket.once("error", (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
      this.socket.write(raw + "\r\n");
    });
  }

  /** Waits for an unsolicited response (the 220 greeting). */
  waitGreeting(): Promise<SmtpResponse> {
    return new Promise<SmtpResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.onComplete = null;
        reject(new Error("SMTP greeting timed out"));
        this.socket.destroy();
      }, IDLE_TIMEOUT_MS);
      this.onComplete = (response) => {
        clearTimeout(timer);
        resolve(response);
      };
      this.socket.once("error", (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
      if (this.buffer.length > 0) {
        this.ingest(Buffer.from(""));
      }
    });
  }

  raw(): Socket {
    return this.socket;
  }

  close(): void {
    this.socket.end();
    this.socket.destroy();
  }
}

function openSocket(credential: Extract<EmailCredential, { kind: "smtp" }>): Promise<SmtpSession> {
  return new Promise((resolve, reject) => {
    const onFail = (error: Error): void => {
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("SMTP connection timed out"));
    }, CONNECT_TIMEOUT_MS);
    const socket = credential.secure
      ? tls.connect({ host: credential.host, port: credential.port, servername: credential.host })
      : net.connect({ host: credential.host, port: credential.port });
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(SmtpSession.connect(socket));
    });
    socket.once("secureConnect", () => {
      clearTimeout(timer);
      resolve(SmtpSession.connect(socket));
    });
    socket.once("error", onFail);
  });
}

function startTls(socket: Socket, host: string): void {
  socket.removeAllListeners("data");
  const upgraded = tls.connect({
    socket,
    servername: host,
  });
  upgraded.removeAllListeners("error");
}

function encodeLine(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

/** Dot-stuffs the DATA body per RFC 5321 section 4.5.2. */
function dotStuff(body: string): string {
  const normalized = body.replace(/\r?\n/g, "\r\n");
  const lines = normalized.split("\r\n");
  return lines.map((line) => (line.startsWith(".") ? `.${line}` : line)).join("\r\n");
}

async function smtpExchange(
  credential: Extract<EmailCredential, { kind: "smtp" }>,
  message: EmailMessage,
  verifyOnly: boolean,
): Promise<{ delivered: boolean; bounced: boolean; code: number; detail?: string }> {
  let session: SmtpSession | null = null;
  try {
    session = await openSocket(credential);
    const greeting = await session.waitGreeting();
    if (greeting.code !== 220) {
      throw new Error(`unexpected greeting ${greeting.code}`);
    }
    await session.command(`EHLO ${LOCAL_HELO}`);

    if (!credential.secure) {
      const upgraded = await session.command("STARTTLS");
      if (upgraded.code === 220) {
        startTls(session.raw(), credential.host);
        await new Promise<void>((resolve) => {
          session!.raw().once("secureConnect", () => resolve());
        });
        await session!.command(`EHLO ${LOCAL_HELO}`);
      }
    }

    const auth = await session.command("AUTH LOGIN");
    if (auth.code === 334) {
      const userAck = await session.command(encodeLine(credential.username));
      if (userAck.code !== 334) {
        throw new Error("SMTP authentication failed (username)");
      }
      const passAck = await session.command(encodeLine(credential.password));
      if (passAck.code !== 235) {
        throw new Error("SMTP authentication failed (credentials)");
      }
    } else if (auth.code !== 250) {
      throw new Error("SMTP authentication was not accepted");
    }

    if (verifyOnly) {
      await session.command("QUIT").catch(() => undefined);
      return { delivered: false, bounced: false, code: 250 };
    }

    const mail = await session.command(`MAIL FROM:<${message.from}>`);
    if (mail.code !== 250) {
      return { delivered: false, bounced: true, code: mail.code, detail: "MAIL FROM rejected" };
    }
    const rcpt = await session.command(`RCPT TO:<${message.to}>`);
    if (rcpt.code !== 250 && rcpt.code !== 251) {
      return { delivered: false, bounced: true, code: rcpt.code, detail: "recipient rejected" };
    }
    const data = await session.command("DATA");
    if (data.code !== 354) {
      throw new Error("SMTP DATA not accepted");
    }
    const body = [
      `From: ${message.from}`,
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(message.html, "utf8").toString("base64"),
    ].join("\r\n");
    const result = await session.command(dotStuff(body) + "\r\n.");
    if (result.code !== 250) {
      return {
        delivered: false,
        bounced: result.code >= 500,
        code: result.code,
        detail: "message not accepted",
      };
    }
    await session.command("QUIT").catch(() => undefined);
    return { delivered: true, bounced: false, code: 250 };
  } finally {
    session?.close();
  }
}

export const smtpAdapter: EmailAdapter = {
  name: "smtp",

  async send(message: EmailMessage, credential: EmailCredential): Promise<SendResult> {
    if (credential.kind !== "smtp") {
      return { delivered: false, bounced: false, detail: "credential/provider mismatch" };
    }
    try {
      const outcome = await smtpExchange(credential, message, false);
      if (outcome.delivered) {
        return { delivered: true, bounced: false };
      }
      if (outcome.bounced) {
        return {
          delivered: false,
          bounced: true,
          bounceCategory: "permanent",
          detail: outcome.detail ?? `smtp ${outcome.code}`,
        };
      }
      return { delivered: false, bounced: false, detail: outcome.detail ?? `smtp ${outcome.code}` };
    } catch (error) {
      return {
        delivered: false,
        bounced: false,
        detail: error instanceof Error ? error.message.slice(0, 200) : "smtp transport error",
      };
    }
  },

  async verifyConnection(credential: EmailCredential): Promise<void> {
    if (credential.kind !== "smtp") {
      throw new ExternalServiceError("Credential does not match the SMTP provider.");
    }
    try {
      const outcome = await smtpExchange(
        credential,
        {
          to: credential.from,
          from: credential.from,
          subject: "KD connection verification",
          text: "This message is not delivered; it verifies the SMTP connection.",
          html: "<p>This message is not delivered; it verifies the SMTP connection.</p>",
          templateId: "system.connection-verification",
        },
        true,
      );
      if (!outcome.delivered && outcome.bounced) {
        throw new ExternalServiceError("SMTP connection could not be verified.");
      }
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      throw new ExternalServiceError(
        error instanceof Error ? error.message.slice(0, 200) : "SMTP connection failed",
      );
    }
  },
};
