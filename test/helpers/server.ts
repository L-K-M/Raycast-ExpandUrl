import http from "node:http";
import zlib from "node:zlib";
import { AddressInfo } from "node:net";

/**
 * A local HTTP server exercising the redirect shapes the engine has to cope
 * with. Real shorteners are not reachable from CI and would make the suite
 * flaky besides, so every behaviour under test is reproduced here.
 */

export interface TestServer {
  origin: string;
  url: (path: string) => string;
  /** Every request the server saw, as `METHOD /path`. */
  requests: string[];
  close: () => Promise<void>;
}

const HTML_META = (target: string, delay = 0) =>
  `<!doctype html><html><head><title>Meta Page</title>` +
  `<meta http-equiv="refresh" content="${delay}; url=${target}"></head><body>hi</body></html>`;

export async function startTestServer(): Promise<TestServer> {
  const requests: string[] = [];
  // Sockets for requests we never answer, so close() cannot hang on them.
  const openSockets = new Set<import("node:net").Socket>();

  const server = http.createServer((req, res) => {
    const path = req.url ?? "/";
    requests.push(`${req.method ?? "GET"} ${path}`);

    const send = (status: number, headers: http.OutgoingHttpHeaders = {}, body = "") => {
      res.writeHead(status, headers);
      // A HEAD response must not carry a body.
      res.end(req.method === "HEAD" ? undefined : body);
    };

    // /redirect/3 -> /redirect/2 -> /redirect/1 -> /end
    const chain = /^\/redirect\/(\d+)$/.exec(path);
    if (chain?.[1] !== undefined) {
      const remaining = Number.parseInt(chain[1], 10);
      const target = remaining <= 1 ? "/end" : `/redirect/${remaining - 1}`;
      send(302, { location: target });
      return;
    }

    // Always redirects somewhere new, so only maxHops can stop it.
    if (path === "/infinite" || path.startsWith("/infinite-")) {
      return send(302, { location: `/infinite-${requests.length}` });
    }

    switch (path) {
      case "/end":
        return send(200, { "content-type": "text/plain" }, "done");

      case "/absolute":
        // An absolute Location pointing back at this same server.
        return send(301, { location: `http://127.0.0.1:${port}/end` });

      case "/relative-dotdot":
        return send(302, { location: "../end" });

      case "/protocol-relative":
        return send(302, { location: `//127.0.0.1:${port}/end` });

      case "/no-location":
        return send(302, {});

      case "/bad-location":
        return send(302, { location: "http://[not a url" });

      case "/loop-a":
        return send(302, { location: "/loop-b" });
      case "/loop-b":
        return send(302, { location: "/loop-a" });
      case "/self-loop":
        return send(302, { location: "/self-loop" });

      case "/head-405":
        if (req.method === "HEAD") return send(405);
        return send(200, { "content-type": "text/plain" }, "get only");

      case "/head-405-redirect":
        if (req.method === "HEAD") return send(405);
        return send(302, { location: "/end" });

      case "/meta":
        return send(200, { "content-type": "text/html" }, HTML_META("/end"));

      case "/meta-absolute":
        return send(200, { "content-type": "text/html" }, HTML_META(`http://127.0.0.1:${port}/end`));

      case "/meta-slow":
        return send(200, { "content-type": "text/html" }, HTML_META("/end", 30));

      case "/meta-self":
        return send(200, { "content-type": "text/html" }, HTML_META("/meta-self"));

      case "/meta-gzip": {
        const body = zlib.gzipSync(Buffer.from(HTML_META("/end")));
        res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
        res.end(req.method === "HEAD" ? undefined : body);
        return;
      }

      case "/html":
        return send(
          200,
          { "content-type": "text/html; charset=utf-8" },
          "<html><head><title>Caf&eacute; &amp; Bar</title></head><body>x</body></html>",
        );

      case "/big": {
        // A megabyte of padding before any tag, to prove the read cap holds.
        const padding = "<!--" + "x".repeat(1024 * 1024) + "-->";
        return send(200, { "content-type": "text/html" }, padding + HTML_META("/end"));
      }

      case "/not-html":
        return send(200, { "content-type": "application/pdf" }, "%PDF-1.4");

      case "/404":
        return send(404, { "content-type": "text/plain" }, "nope");

      case "/500":
        return send(500, { "content-type": "text/plain" }, "boom");

      case "/slow":
        // Never answered; used for timeout and cancellation tests.
        return;

      default:
        return send(200, { "content-type": "text/plain" }, `ok ${path}`);
    }
  });

  server.on("connection", (socket) => {
    openSockets.add(socket);
    socket.on("close", () => openSockets.delete(socket));
  });

  // Without the error listener a failed listen leaves this promise pending and
  // the whole suite hangs with no diagnostic.
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const port = (server.address() as AddressInfo).port;
  const origin = `http://127.0.0.1:${port}`;

  return {
    origin,
    url: (path: string) => `${origin}${path}`,
    requests,
    close: async () => {
      for (const socket of openSockets) socket.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error !== undefined && error !== null ? reject(error) : resolve()));
      });
    },
  };
}
