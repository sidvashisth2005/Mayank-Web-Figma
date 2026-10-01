// Local server: serves dist/ with clean URLs and runs the api/ functions with
// variables from .env.local (create it with `vercel env pull .env.local`).
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".xml": "application/xml", ".txt": "text/plain" };
const port = Number(process.env.PORT || 3000);

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    const file = join(root, "api", `${url.pathname.slice(5)}.js`);
    if (!existsSync(file)) { res.writeHead(404).end(); return; }
    const mod = await import(pathToFileURL(file).href);
    const handler = mod[req.method];
    if (!handler) { res.writeHead(405).end(); return; }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
    const response = await handler(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  let path = join(root, "dist", decodeURIComponent(url.pathname));
  if (!extname(path) && existsSync(path + ".html")) path += ".html";
  else if (existsSync(path) && statSync(path).isDirectory()) path = join(path, "index.html");
  if (!existsSync(path)) { res.writeHead(404, { "Content-Type": types[".html"] }); res.end(readFileSync(join(root, "dist/404.html"))); return; }
  res.writeHead(200, { "Content-Type": types[extname(path)] || "application/octet-stream" });
  res.end(readFileSync(path));
}).listen(port, () => console.log(`Mayank running at http://localhost:${port}`));
