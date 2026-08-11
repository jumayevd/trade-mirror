import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // static generation forks one worker per core by default; on an 8GB
    // machine seven workers each loading the packed datasets exhaust RAM and
    // the build dies with V8 fatal errors — two workers fit comfortably
    cpus: 2,
  },
};

export default nextConfig;
