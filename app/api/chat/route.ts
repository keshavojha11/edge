import { NextRequest } from "next/server";
import { chat } from "@/lib/llm";
import { getRankedGroups } from "@/lib/match";

export const maxDuration = 60;

const SYSTEM = `You are Edge, a prediction-market intelligence assistant.
You have access to live market data from Kalshi, Polymarket, Manifold, and Robinhood.

When answering questions:
- Cite the specific venues and their current implied probabilities
- Note any significant spreads (disagreements between venues)
- Flag differences in resolution criteria when relevant
- Be direct about uncertainty

IMPORTANT: These are signals, not guaranteed arbitrage. Spreads may reflect differences
in resolution criteria, dates, fees, and liquidity. This is NOT financial advice.

Always conclude answers with: "Not financial advice."`;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { query?: string };
  const query = body.query?.trim();

  if (!query) {
    return Response.json({ error: "query is required" }, { status: 400 });
  }

  // Pull current market context
  const groups = await getRankedGroups();
  const marketContext =
    groups.length > 0
      ? groups
          .slice(0, 15)
          .map(
            (g) =>
              `Event: "${g.label}" (max spread: ${g.maxSpread.toFixed(1)} pts)\n` +
              g.markets
                .map(
                  (m) =>
                    `  ${m.venue.toUpperCase()}: ${m.outcomes
                      .map((o) => `${o.name}=${(o.impliedProb * 100).toFixed(1)}%`)
                      .join(", ")}`
                )
                .join("\n")
          )
          .join("\n\n")
      : "No market data available yet.";

  try {
    const answer = await chat(
      [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Current market data:\n\n${marketContext}\n\n---\n\nQuestion: ${query}`,
        },
      ],
      { temperature: 0.3, maxTokens: 800 }
    );

    // Identify which groups were cited
    const cited = groups
      .filter((g) =>
        answer.toLowerCase().includes(g.label.toLowerCase().slice(0, 20))
      )
      .map((g) => g.id);

    return Response.json({ answer, citedGroupIds: cited });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
