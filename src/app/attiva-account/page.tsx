import LegacyProfileActivation from "@/components/LegacyProfileActivation";
import MoviAuthForm from "@/components/MoviAuthForm";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string | string[] }>;
}) {
  const { verified } = await searchParams;
  return verified === "1"
    ? <MoviAuthForm mode="activate" />
    : <LegacyProfileActivation />;
}
