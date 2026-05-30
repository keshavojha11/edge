import { NextRequest } from "next/server";

export async function GET() {
  try {
    const { prisma } = await import("@/lib/db");
    const watches = await prisma.watch.findMany({
      where: { status: { not: "deleted" } },
      include: { matchGroup: { select: { label: true } } },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      watches: watches.map((w: any) => ({
        ...w,
        label: (w.matchGroup as { label: string } | null)?.label,
      })),
    });
  } catch (err) {
    return Response.json({ watches: [], error: String(err) });
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    matchGroupId?: string;
    thresholdPct?: number;
  };

  if (!body.matchGroupId || body.thresholdPct == null) {
    return Response.json({ error: "matchGroupId and thresholdPct required" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/db");

  const group = await prisma.matchGroup.findUnique({ where: { id: body.matchGroupId } });
  if (!group) {
    return Response.json({ error: "matchGroup not found" }, { status: 404 });
  }

  const watch = await prisma.watch.create({
    data: {
      matchGroupId: body.matchGroupId,
      thresholdPct: body.thresholdPct,
      lastSpread: group.maxSpread,
    },
  });

  return Response.json({ watch });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const { prisma } = await import("@/lib/db");
  await prisma.watch.update({ where: { id }, data: { status: "deleted" } });
  return Response.json({ ok: true });
}
