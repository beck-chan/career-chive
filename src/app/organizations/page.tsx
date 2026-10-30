import { SettingsForm } from "@/components/SettingsForm";

export default async function OrganizationsPage({
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
