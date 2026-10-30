import { redirect } from "next/navigation";
import { ArchiveView } from "../components/ArchiveView";
import { LoginForm } from "../components/LoginForm";
import { OverviewView } from "../components/OverviewView";
import { NotFoundBody } from "../components/PageStates";
import { SearchShell } from "../components/SearchShell";
import { SettingsForm } from "../components/SettingsForm";
import { flags } from "../lib/flags";
import { careerchiveHref } from "../lib/paths";
import { getSession } from "../lib/session";

export {
  careerchiveLoginMetadata,
  careerchiveMetadata as careerchiveArchiveMetadata,
  careerchiveOrganizationsMetadata,
  careerchiveOverviewMetadata,
  careerchiveSearchMetadata,
} from "./metadata";

export async function CareerChiveArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; iso?: string }>;
}) {
  const { org, iso } = await searchParams;
  return <ArchiveView queryOrg={org} queryIso={iso} />;
}

export function CareerChiveOverviewPage() {
  return <OverviewView />;
}

export function CareerChiveSearchPage() {
  return <SearchShell />;
}

export async function CareerChiveOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string; org?: string; edit?: string }>;
}) {
  const { add, org, edit } = await searchParams;
  return (
    <SettingsForm
      startAdding={add === "1"}
      queryOrg={org}
      queryEdit={edit === "1"}
    />
  );
}

export async function CareerChiveLoginPage() {
  if (!flags.private) {
    redirect(careerchiveHref("/"));
  }
  if (await getSession()) {
    redirect(careerchiveHref("/"));
  }
  return (
    <div className="page-cols">
      <div className="page-state-full">
        <LoginForm />
      </div>
    </div>
  );
}

export function CareerChiveNotFound() {
  return (
    <div className="page-cols">
      <div className="page-state-full">
        <NotFoundBody />
      </div>
    </div>
  );
}
