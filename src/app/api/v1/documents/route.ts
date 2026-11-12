import { handle } from "@/lib/api/http";
import { documentsByLeadRef } from "@/lib/api/v1";

/** GET /api/v1/documents?leadRef=… → { data: [{ id, kind, number, total, status, url, date }] } */
export async function GET(request: Request) {
  return handle(request, "documents.list", async (ctx) => {
    const leadRef = new URL(request.url).searchParams.get("leadRef") ?? "";
    return { body: { data: await documentsByLeadRef(ctx, leadRef) } };
  });
}
