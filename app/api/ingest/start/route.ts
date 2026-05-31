import { startRun } from "@/lib/run";

// Submits Wire tasks ONLY — never polls. Returns a runId immediately (<60s).
export const maxDuration = 60;

export async function POST() {
  if (process.env.DEMO_MODE === "true") {
    return Response.json({ error: "DEMO_MODE is on — live ingest disabled" }, { status: 400 });
  }
  try {
    const result = await startRun({ dedupe: true });
    if (result.submitted === 0 && !result.deduped) {
      return Response.json({ ...result, error: "all task submits failed" }, { status: 502 });
    }
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
