import { handleHubEvent, verifyHubSignature } from "@/lib/hub";

/**
 * Events from the suite Hub (LeadManager/docs/ARCHITECTURE.md §5), signed with SUITE_EVENTS_SECRET
 * (= the Hub's GST_EVENTS_SECRET). Keeps the local mirror of companies, members and the GST entitlement current.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const ok = verifyHubSignature(process.env.SUITE_EVENTS_SECRET ?? "", Number(req.headers.get("x-suite-timestamp")), raw, req.headers.get("x-suite-signature") ?? "");
  if (!ok) return Response.json({ error: "Invalid signature" }, { status: 401 });

  let ev: { id?: unknown; type?: unknown; workspaceId?: unknown; data?: unknown };
  try {
    ev = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof ev.id !== "string" || !ev.id || typeof ev.type !== "string" || typeof ev.workspaceId !== "string" || !ev.workspaceId) {
    return Response.json({ error: "id, type and workspaceId are required" }, { status: 400 });
  }
  const data = ev.data && typeof ev.data === "object" ? (ev.data as Record<string, unknown>) : {};
  const applied = await handleHubEvent({ id: ev.id, type: ev.type, workspaceId: ev.workspaceId, data });
  return Response.json({ ok: true, duplicate: !applied });
}
