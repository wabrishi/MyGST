import { handle, readJson } from "@/lib/api/http";
import { upsertParty } from "@/lib/api/v1";

/** POST /api/v1/parties/upsert → { id, created } */
export async function POST(request: Request) {
  return handle(request, "parties.upsert", async (ctx) => {
    const r = await upsertParty(ctx, await readJson(request));
    return { status: r.created ? 201 : 200, body: r };
  });
}
