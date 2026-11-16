import { createServer, type Socket } from "node:net";

/** External mail delivery SIM; the application's actual SMTP transport sends here. */
export async function startAgencySmtpInbox(port = 2526) {
  const messages: { recipients: string[]; body: string }[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding("utf8");
    socket.on("error", () => undefined);
    socket.on("close", () => sockets.delete(socket));
    socket.write("220 agency-business-smtp-sim ESMTP\r\n");
    let buffer = "";
    let recipients: string[] = [];
    let data: string[] | null = null;
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      for (;;) {
        const end = buffer.indexOf("\r\n");
        if (end < 0) break;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line !== ".") {
            data.push(line.startsWith("..") ? line.slice(1) : line);
            continue;
          }
          const mime = data.join("\r\n");
          const boundary = mime.indexOf("\r\n\r\n");
          const headers = mime.slice(0, boundary);
          const encoded = mime.slice(boundary + 4);
          messages.push({
            recipients: [...recipients],
            body: /Content-Transfer-Encoding:\s*base64/i.test(headers)
              ? Buffer.from(encoded.replace(/\s/g, ""), "base64").toString(
                  "utf8",
                )
              : encoded,
          });
          data = null;
          recipients = [];
          socket.write("250 queued as agency-business-sim\r\n");
        } else if (/^(EHLO|HELO) /i.test(line)) {
          socket.write("250 agency-business-smtp-sim\r\n");
        } else if (/^MAIL FROM:/i.test(line)) {
          recipients = [];
          socket.write("250 sender accepted\r\n");
        } else if (/^RCPT TO:/i.test(line)) {
          const recipient = /^RCPT TO:\s*<([^>]+)>/i.exec(line)?.[1];
          if (recipient) recipients.push(recipient.toLowerCase());
          socket.write("250 recipient accepted\r\n");
        } else if (/^DATA$/i.test(line)) {
          data = [];
          socket.write("354 send MIME message, end with a single dot\r\n");
        } else if (/^QUIT$/i.test(line)) {
          socket.end("221 goodbye\r\n");
        } else {
          socket.write("502 unsupported SMTP command\r\n");
        }
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return {
    messages,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
