import { submitTask } from "@/lib/wire";
import { TARGET_JOBS } from "@/lib/targets";

// Submits Wire tasks ONLY — never polls. Returns a runId immediately (<60s).
export const maxDuration = 60;

const IN_FLIGHT_WINDOW_MS = 5 * 60 * 1000; // dedupe runs started within 5 min

export async function POST() {
  if (process.env.DEMO_MODE === "true") {
    return Response.json({ error: "DEMO_MODE is on — live ingest disabled" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/db");

  // Dedupe: if a run is already in flight (recent + not done), return it.
  const cutoff = new Date(Date.now() - IN_FLIGHT_WINDOW_MS);
  const existing = await prisma.run.findFirst({
    where: { status: { in: ["running", "matching"] }, createdAt: { gte: cutoff } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return Response.json({ runId: existing.id, deduped: true });
  }

  // Create the run, then submit all Wire tasks (POST only, ~1s each).
  const run = await prisma.run.create({ data: { status: "running" } });

  const submitted: Array<{ ok: boolean; job: typeof TARGET_JOBS[number]; wireJobId?: string; error?: string }> = [];
  await Promise.all(
    TARGET_JOBS.map(async (job) => {
      try {
        const wireJobId = await submitTask(job.actionId, job.params);
        submitted.push({ ok: true, job, wireJobId });
      } catch (e) {
        submitted.push({ ok: false, job, error: e instanceof Error ? e.message : String(e) });
      }
    })
  );

  // Persist job rows
  for (const s of submitted) {
    if (s.ok && s.wireJobId) {
      await prisma.ingestJob.create({
        data: {
          runId: run.id,
          venue: s.job.venue,
          kind: s.job.kind,
          event: s.job.event,
          label: s.job.label,
          wireJobId: s.wireJobId,
          status: "pending",
        },
      });
    } else {
      await prisma.ingestJob.create({
        data: {
          runId: run.id,
          venue: s.job.venue,
          kind: s.job.kind,
          event: s.job.event,
          label: s.job.label,
          wireJobId: "",
          status: "failed",
          error: s.error ?? "submit failed",
        },
      });
    }
  }

  const okCount = submitted.filter((s) => s.ok).length;
  if (okCount === 0) {
    await prisma.run.update({ where: { id: run.id }, data: { status: "failed" } });
    return Response.json({ runId: run.id, error: "all task submits failed" }, { status: 502 });
  }

  return Response.json({ runId: run.id, submitted: okCount, total: TARGET_JOBS.length });
}
