import { getRankedGroups } from "@/lib/match";
import { getCreditsSpent } from "@/lib/wire";

export async function GET() {
  try {
    const groups = await getRankedGroups();
    return Response.json({ groups, creditsSpent: getCreditsSpent() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
