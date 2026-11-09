import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page reads live Elasticsearch state and is rendered per request, so
  // the cacheComponents model (which forbids `export const dynamic`) does not
  // apply here.
  cacheComponents: false,
  // Keep the server-only Elasticsearch and OTel packages out of the bundler.
  serverExternalPackages: [
    "@elastic/elasticsearch",
    "@opentelemetry/sdk-node",
    "@opentelemetry/auto-instrumentations-node",
  ],
};

export default nextConfig;
