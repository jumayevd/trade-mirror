import type { NextConfig } from "next";

/*
 * Sections still being finished are hidden with a build-time flag rather than
 * reverted (see src/lib/flags.ts). The page itself calls notFound(), but a
 * prerendered route that calls notFound() is still emitted and served with a
 * 200 — only the framework's own _not-found carries a 404 status — so the URL
 * would answer, with the section's title in its <head>. Redirecting here takes
 * the address out of the deployment properly: config redirects are matched in
 * the routing layer, before the filesystem route is reached.
 */
const HIDDEN_ROUTES = process.env.NEXT_PUBLIC_SHOW_UNEXPLAINED === "1" ? [] : ["/unexplained"];

const nextConfig: NextConfig = {
  experimental: {
    // static generation forks one worker per core by default; on an 8GB
    // machine seven workers each loading the packed datasets exhaust RAM and
    // the build dies with V8 fatal errors — two workers fit comfortably
    cpus: 2,
  },
  async redirects() {
    return HIDDEN_ROUTES.map((source) => ({
      source,
      destination: "/",
      // temporary on purpose: the section is coming back, and a 308 would be
      // cached by browsers long after it does
      permanent: false,
    }));
  },
};

export default nextConfig;
