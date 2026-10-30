import { ArchiveView } from "@/components/ArchiveView";

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; iso?: string }>;
}) {
  const { org, iso } = await searchParams;
  return <ArchiveView queryOrg={org} queryIso={iso} />;
}
