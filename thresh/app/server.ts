import { createNodeMiddleware, createProbot, type Probot } from "probot";
import http from "node:http";
import { pathToFileURL } from "node:url";
import { threshApp } from "./app.js";

/** Probot 14 loads middleware asynchronously before accepting requests. */
export async function createThreshServer(probot: Probot = createProbot()): Promise<http.Server> {
  const middleware = await createNodeMiddleware(threshApp, { probot });
  return http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    void middleware(req, res, () => { res.writeHead(404); res.end(); });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? "3000");
  const server = await createThreshServer();
  server.listen(port, () => {
    console.log(`[thresh/server] Listening on port ${port}`);
  });
}
