import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();
export const DIST_PUBLIC_PATH = path.resolve(import.meta.dirname, "..", "dist", "public");

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use("/api", (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  app.use("/socket.io", (_req, res) => {
    res.status(404).end();
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    if (url.startsWith("/api") || url.startsWith("/socket.io")) {
      res.status(404).json({ error: `API route not found: ${req.method} ${url}` });
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(404).end();
      return;
    }

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = DIST_PUBLIC_PATH;

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use("/api", (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  app.use("/socket.io", (_req, res) => {
    res.status(404).end();
  });

  app.use(express.static(distPath));

  // fall through to index.html only for non-API GET/HEAD requests
  app.use("*", (req, res) => {
    if (req.originalUrl.startsWith("/api") || req.originalUrl.startsWith("/socket.io")) {
      res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(404).end();
      return;
    }

    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
