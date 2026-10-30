import { permanentRedirect } from "next/navigation";
import { organizationsSearchHref } from "@/lib/paths";

export default async function SettingsOrganizationsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ add?: string; org?: string; edit?: string }>;
}) {
  const { add, org, edit } = await searchParams;
  permanentRedirect(organizationsSearchHref({ add, org, edit }));
}
