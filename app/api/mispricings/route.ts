import { getBoardState } from "@/lib/match";
import { getCreditsSpent } from "@/lib/wire";

export async function GET() {
  try {
    const { groups, source, lastUpdated } = await getBoardState();
    return Response.json({
      groups,
      source,                    // "live" | "demo"
      isDemo: source === "demo", // back-compat for the UI pill
      lastUpdated,
      creditsSpent: getCreditsSpent(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
