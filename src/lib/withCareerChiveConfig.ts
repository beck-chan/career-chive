import type { NextConfig } from "next";
import { careerchivePath } from "./paths";

type Rewrite = { source: string; destination: string };

function careerchiveRewrites(): Rewrite[] {
  const app = careerchivePath();
  if (app === "/") return [];
  return [
    { source: app, destination: "/" },
    { source: `${app}/:path*`, destination: "/:path*" },
  ];
}

export function withCareerChiveConfig(config: NextConfig = {}): NextConfig {
  const extraRewrites = careerchiveRewrites();

  return {
    ...config,
    env: {
      ...config.env,
      FLAG_PRIVATE: process.env.FLAG_PRIVATE ?? config.env?.FLAG_PRIVATE ?? "",
      FLAG_CHIVEBOT:
        process.env.FLAG_CHIVEBOT ?? config.env?.FLAG_CHIVEBOT ?? "",
    },
    transpilePackages: [
      ...new Set([...(config.transpilePackages ?? []), "career-chive"]),
    ],
    serverExternalPackages: [
      ...new Set([
        ...(config.serverExternalPackages ?? []),
        "@aws-sdk/client-s3",
        "@aws-sdk/s3-request-presigner",
      ]),
    ],
    async rewrites() {
      const existing = config.rewrites;
      if (!existing) return { fallback: extraRewrites };
      const resolved =
        typeof existing === "function" ? await existing() : existing;
      if (Array.isArray(resolved)) {
        return { afterFiles: resolved, fallback: extraRewrites };
      }
      return {
        beforeFiles: resolved.beforeFiles,
        afterFiles: resolved.afterFiles,
        fallback: [...(resolved.fallback ?? []), ...extraRewrites],
      };
    },
  };
}
