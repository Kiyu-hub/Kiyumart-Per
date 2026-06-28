import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // manifest: false — do NOT generate a static manifest.webmanifest.
      // The dynamic manifest is served by the backend at /api/public/app-manifest
      // (reads icon, name, and primaryColor from the DB so admins can update
      // them without a redeploy). index.html already has:
      //   <link rel="manifest" href="/api/public/app-manifest" />
      manifest: false,
      injectRegister: "auto",
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Precache only the app shell (code, styles, fonts, favicon). Bundled
        // images are deliberately excluded — they're cached on-demand by the
        // runtime `images-cache` (CacheFirst) handler below, so precaching them
        // too just bloats the service-worker install on slow connections.
        globPatterns: ["**/*.{js,css,html,ico,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/],
        runtimeCaching: [
          {
            // All API calls: network first so online users always get fresh data.
            // Falls back to cache only when offline (timeout 10s).
            urlPattern: ({ url }: { url: URL }) =>
              url.pathname.startsWith("/api/") &&
              !url.pathname.startsWith("/api/webhooks") &&
              !url.pathname.startsWith("/api/socket"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-stylesheets" },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|avif)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // NOTE: do NOT add a custom rollupOptions.output.manualChunks here. A manual
    // vendor split caused a chunk init-order crash ("Cannot access 'X' before
    // initialization") that left React unmounted and the whole app dead. Rollup's
    // automatic per-route splitting is the known-good behaviour — keep it.
  },
  server: {
    hmr: {
      overlay: false,
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
      "/socket.io": {
        target: "http://localhost:5000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
