import type { NextConfig } from "next";

/*
 * The CBU Analytics portal: one static site holding both dashboards — the
 * Shadow Economy monitor (/iqtisodiyot, data from the portal's FastAPI JSON
 * API) and Mirror Trade Analytics (/savdo, data bundled at build time). The
 * FastAPI app serves this export at `/`, behind its login, next to /api.
 *
 * A static export cannot redirect, so retired and hidden addresses are
 * answered by the server instead (app/web.py).
 */
const nextConfig: NextConfig = {
  output: "export",
  // /savdo/partners/ → savdo/partners/index.html, which a plain static file
  // server resolves without rewrite rules
  trailingSlash: true,
  experimental: {
    // static generation forks one worker per core by default; on an 8GB
    // machine seven workers each loading the packed datasets exhaust RAM and
    // the build dies with V8 fatal errors — two workers fit comfortably
    cpus: 2,
  },
};

export default nextConfig;
