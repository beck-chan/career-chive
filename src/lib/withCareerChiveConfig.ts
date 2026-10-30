import { careerchivePath, careerchiveOrganizationsPath } from "./paths";

type Rewrite = { source: string; destination: string };

type Redirect = { source: string; destination: string; permanent: boolean };

type RewriteResult =
  | Rewrite[]
  | {
      beforeFiles?: Rewrite[];
      afterFiles?: Rewrite[];
      fallback?: Rewrite[];
    };

type CareerChiveHostConfig = {
  transpilePackages?: string[];
  serverExternalPackages?: string[];
  rewrites?: RewriteResult | (() => RewriteResult | Promise<RewriteResult>);
  redirects?: Redirect[] | (() => Redirect[] | Promise<Redirect[]>);
};

function careerchiveRewrites(): Rewrite[] {
  const app = careerchivePath();
  if (app === "/") return [];
  return [
    { source: app, destination: "/" },
    { source: `${app}/:path*`, destination: "/:path*" },
  ];
}

function careerchiveRedirects(): Redirect[] {
  const app = careerchivePath();
  const oldSettings = app === "/" ? "/settings" : `${app}/settings`;
  return [
    {
      source: oldSettings,
      destination: careerchiveOrganizationsPath(),
      permanent: true,
    },
  ];
}

export function withCareerChiveConfig<T extends CareerChiveHostConfig>(
  config: T = {} as T,
) {
  const extraRewrites = careerchiveRewrites();
  const extraRedirects = careerchiveRedirects();

  return {
    ...config,
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
      if (!existing) return extraRewrites;
      const resolved =
        typeof existing === "function" ? await existing() : existing;
      if (Array.isArray(resolved)) return [...resolved, ...extraRewrites];
      return {
        beforeFiles: resolved.beforeFiles,
        afterFiles: [...(resolved.afterFiles ?? []), ...extraRewrites],
        fallback: resolved.fallback,
      };
    },
    async redirects() {
      const existing = config.redirects;
      if (!existing) return extraRedirects;
      const resolved =
        typeof existing === "function" ? await existing() : existing;
      return [...resolved, ...extraRedirects];
    },
  };
}
