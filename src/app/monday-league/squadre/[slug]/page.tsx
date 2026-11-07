import { PublicLeagueTeamPage } from "@/components/monday-league/PublicLeagueViews";

export default async function MondayLeagueTeamRoute({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ phase?: string; match?: string }> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  return <PublicLeagueTeamPage slug={slug} initialPhaseId={query.phase} initialMatchId={query.match} />;
}
