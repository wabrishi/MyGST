import { handle, readJson } from "@/lib/api/http";
import { createQuotation } from "@/lib/api/v1";

/** POST /api/v1/quotations → { id, number, url, total } */
export async function POST(request: Request) {
  return handle(request, "quotations.create", async (ctx) => ({ status: 201, body: await createQuotation(ctx, await readJson(request)) }));
}
