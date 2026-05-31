import { getRankedGroups } from "@/lib/match";
import { getCreditsSpent } from "@/lib/wire";

export async function GET() {
  try {
    const groups = await getRankedGroups();
    const isDemo = process.env.DEMO_MODE === "true";
    return Response.json({ groups, creditsSpent: getCreditsSpent(), isDemo });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
