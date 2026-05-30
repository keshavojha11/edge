/**
 * Phase 1 discovery script.
 *
 * Fetches /catalog/{slug} for each venue and runs ONE cheap markets/prices
 * action per venue to capture the real response shape.
 *
 * Usage: npm run discover
 * Output: logs to stdout + writes raw JSON to scripts/discovery-output/
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { getCatalog, runTask } from "../lib/wire";

const VENUES = ["kalshi", "polymarket", "manifold", "robinhood"] as const;
type Venue = (typeof VENUES)[number];

const OUT_DIR = path.join(process.cwd(), "scripts", "discovery-output");
fs.mkdirSync(OUT_DIR, { recursive: true });

function save(name: string, data: unknown) {
  const file = path.join(OUT_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`  → saved ${file}`);
}

function summarizeActions(catalog: unknown): Array<{ id: string; name: string; params: unknown }> {
  if (!catalog || typeof catalog !== "object") return [];
  const c = catalog as Record<string, unknown>;

  // Handle array at root
  if (Array.isArray(c)) {
    return (c as Array<Record<string, unknown>>).map((a) => ({
      id: String(a.id ?? a.action_id ?? ""),
      name: String(a.name ?? a.title ?? ""),
      params: a.params ?? a.parameters ?? a.input_schema ?? {},
    }));
  }

  // Handle { actions: [...] }
  if (Array.isArray(c.actions)) {
    return (c.actions as Array<Record<string, unknown>>).map((a) => ({
      id: String(a.id ?? a.action_id ?? ""),
      name: String(a.name ?? a.title ?? ""),
      params: a.params ?? a.parameters ?? a.input_schema ?? {},
    }));
  }

  return [];
}

function pickSampleAction(
  actions: Array<{ id: string; name: string; params: unknown }>,
  venue: Venue
): { id: string; params: Record<string, unknown> } | null {
  // Keywords likely to indicate a market listing action (cheap, read-only)
  const keywords = ["market", "list", "active", "price", "ticker", "event"];

  for (const kw of keywords) {
    const found = actions.find(
      (a) =>
        a.name.toLowerCase().includes(kw) ||
        a.id.toLowerCase().includes(kw)
    );
    if (found) {
      return { id: found.id, params: buildSampleParams(found, venue) };
    }
  }

  // Fallback: first action
  if (actions.length > 0) {
    return { id: actions[0].id, params: buildSampleParams(actions[0], venue) };
  }
  return null;
}

function buildSampleParams(
  action: { id: string; name: string; params: unknown },
  venue: Venue
): Record<string, unknown> {
  // Try to infer sensible minimal params from the param schema
  const p: Record<string, unknown> = {};
  const schema = action.params as Record<string, unknown> | null;

  if (!schema || typeof schema !== "object") return p;

  // Common patterns: limit, count, page_size, category, status, series_ticker
  const raw = (schema.properties ?? schema) as Record<string, unknown>;
  for (const [key] of Object.entries(raw)) {
    if (/limit|count|page_size/i.test(key)) p[key] = 5;
    if (/category|type/i.test(key)) p[key] = "politics";
    if (/status/i.test(key)) p[key] = "active";
  }

  return p;
}

async function discoverVenue(venue: Venue) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`VENUE: ${venue.toUpperCase()}`);
  console.log("=".repeat(60));

  // 1. Fetch catalog
  console.log(`\n[1] Fetching catalog for ${venue}...`);
  let catalog: unknown;
  try {
    catalog = await getCatalog(venue);
    save(`catalog-${venue}`, catalog);
  } catch (err) {
    console.error(`  ✗ Catalog fetch failed: ${err}`);
    return;
  }

  // 2. Summarize actions
  const actions = summarizeActions(catalog);
  console.log(`\n  Found ${actions.length} action(s):`);
  for (const a of actions) {
    console.log(`    • [${a.id}] ${a.name}`);
    if (a.params && Object.keys(a.params as object).length > 0) {
      console.log(`      params: ${JSON.stringify(a.params)}`);
    }
  }

  if (actions.length === 0) {
    console.log("  ⚠ Could not parse actions — raw catalog saved for inspection");
    console.log("  Raw catalog snippet:", JSON.stringify(catalog).slice(0, 500));
    return;
  }

  // 3. Run one sample task
  const sample = pickSampleAction(actions, venue);
  if (!sample) {
    console.log("  ⚠ Could not pick a sample action");
    return;
  }

  console.log(`\n[2] Running sample task: action_id=${sample.id}`);
  console.log(`    params: ${JSON.stringify(sample.params)}`);

  try {
    const result = await runTask(sample.id, sample.params, {
      label: `discover-${venue}`,
      retries: 2,
    });
    save(`sample-${venue}`, result);
    console.log(`\n  ✓ Sample result (first 1000 chars):`);
    console.log("  " + JSON.stringify(result).slice(0, 1000));
  } catch (err) {
    console.error(`  ✗ Sample task failed: ${err}`);
  }
}

async function main() {
  console.log("Edge — Phase 1 Discovery");
  console.log("Fetching Wire catalogs for all 4 venues...\n");

  for (const venue of VENUES) {
    await discoverVenue(venue);
  }

  console.log("\n\nDiscovery complete.");
  console.log(`Raw outputs saved to: ${OUT_DIR}`);
  console.log("\nNext: share the outputs with your pair-programmer to confirm");
  console.log("action_ids + response shapes before writing parsers.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
