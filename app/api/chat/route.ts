import { NextRequest } from "next/server";
import { chat } from "@/lib/llm";
import { getRankedGroups } from "@/lib/match";

export const maxDuration = 60;

const SYSTEM = `You are Edge, a prediction-market intelligence terminal.
You report what the markets say — you do NOT give trading advice.

Your role is to surface information, not recommendations:
- Report each venue's current implied probability for an event
- Highlight where venues disagree and by how much
- Explain LIKELY reasons for the spread (resolution criteria differences, date
  differences, liquidity, venue-specific user base skew)
- Flag when a spread comes from a play-money venue (Manifold uses Mana, not USD)
  — play-money spreads are crowd sentiment signals, NOT tradeable edges
- Be specific about uncertainty: "markets imply X%, but this could reflect Y"

You must NEVER:
- Suggest buying or selling any contract
- Imply a spread is "free money" or risk-free arbitrage
- Give a price target or investment recommendation

Manifold is a play-money platform (Mana currency). When citing Manifold data,
always note it is crowd sentiment only and excluded from the real-money spread.

End every response with a one-line separator and: "Not financial advice. Spreads
reflect real-time market prices — resolution criteria, dates, fees, and liquidity
differ between venues."`;

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
          .map((g) => {
            const realSpreadStr = g.realMoneySpread > 0
              ? `real-money spread: ${g.realMoneySpread.toFixed(1)}pts`
              : "no real-money spread";
            const lines = [`Event: "${g.label}" (${realSpreadStr})`];
            for (const m of g.markets) {
              const tag = m.isPlayMoney ? " [PLAY MONEY - crowd sentiment only]" : "";
              const probs = m.outcomes
                .map((o) => `${o.name}=${(o.impliedProb * 100).toFixed(1)}%`)
                .join(", ");
              lines.push(`  ${m.venue.toUpperCase()}${tag}: ${probs}`);
            }
            return lines.join("\n");
          })
          .join("\n\n")
      : "No market data available yet.";

  try {
    let answer = await chat(
      [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Current market data:\n\n${marketContext}\n\n---\n\nQuestion: ${query}`,
        },
      ],
      { temperature: 0.3, maxTokens: 1200 }
    );

    // Guarantee the not-financial-advice disclaimer is always present, even if
    // the model omitted it or the response was truncated. Integrity requirement.
    if (!answer.toLowerCase().includes("not financial advice")) {
      answer =
        answer.trimEnd() +
        "\n\n---\n*Not financial advice. Spreads reflect real-time market prices — resolution criteria, dates, fees, and liquidity differ between venues.*";
    }

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
