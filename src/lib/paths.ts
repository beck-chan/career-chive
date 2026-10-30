function normalizePath(raw: string | undefined, fallback: string) {
  if (!raw?.trim()) return fallback;
  const trimmed = raw.trim().replace(/\/$/, "");
  return trimmed || fallback;
}

export function careerchivePath() {
  return normalizePath(process.env.NEXT_PUBLIC_CAREERCHIVE_PATH, "/");
}

export function careerchiveHref(path = "/") {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const app = careerchivePath();
  if (app === "/") return suffix;
  return suffix === "/" ? app : `${app}${suffix}`;
}

export function careerchiveOrganizationsPath() {
  return careerchiveHref("/organizations");
}

export function organizationAddHref() {
  return `${careerchiveOrganizationsPath()}?add=1`;
}

export function organizationHref(orgId: string) {
  return `${careerchiveOrganizationsPath()}?org=${encodeURIComponent(orgId)}`;
}

export function organizationEditHref(orgId: string) {
  return `${organizationHref(orgId)}&edit=1`;
}

export function archiveDayHref(orgId: string, iso: string) {
  const base = careerchiveHref("/");
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}org=${encodeURIComponent(orgId)}&iso=${encodeURIComponent(iso)}`;
}

export function isCareerchiveRoute(pathname: string, route: string) {
  const href =
    route === "/organizations"
      ? careerchiveOrganizationsPath()
      : careerchiveHref(route);
  if (route === "/") {
    return pathname === href || pathname === `${href}/`;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
