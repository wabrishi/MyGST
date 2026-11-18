import { describe, expect, it } from "vitest";
import { BUILTIN_ADMIN_PERMISSIONS } from "@/lib/admin-permissions";
import { applyLayout, CORE_SECTIONS, layoutOf, orderByKeys, parseLayout } from "@/lib/nav";

const sec = (key: string, ...items: string[]) => ({ key, items: items.map((k) => ({ key: k })) });
const keys = (list: Array<{ key: string; items: Array<{ key: string }> }>) => list.map((s) => `${s.key}:${s.items.map((i) => i.key).join(",")}`);

describe("sidebar menu order", () => {
  const menu = [sec("sales", "invoices", "quotations", "payments"), sec("purchases", "purchase-orders", "purchases"), sec("masters", "parties", "products")];

  it("default order when nothing is saved", () => {
    expect(keys(applyLayout(menu, { sections: [], items: {} }))).toEqual(keys(menu));
  });

  it("reorders sections and the items inside them", () => {
    const out = applyLayout(menu, { sections: ["purchases", "sales", "masters"], items: { sales: ["payments", "invoices", "quotations"] } });
    expect(keys(out)).toEqual(["purchases:purchase-orders,purchases", "sales:payments,invoices,quotations", "masters:parties,products"]);
  });

  it("new sections and items keep their default place at the end; stale keys are ignored", () => {
    const withPlugin = [...menu, sec("plugin:lead-manager", "pipeline", "leads")];
    const out = applyLayout(withPlugin, { sections: ["gone", "masters", "sales"], items: { sales: ["payments", "old-page"], purchases: [] } });
    expect(keys(out)).toEqual([
      "masters:parties,products",
      "sales:payments,invoices,quotations",
      "purchases:purchase-orders,purchases",
      "plugin:lead-manager:pipeline,leads",
    ]);
  });

  it("a plugin section can go above the core ones", () => {
    const withPlugin = [...menu, sec("plugin:lead-manager", "pipeline", "leads")];
    expect(applyLayout(withPlugin, { sections: ["plugin:lead-manager"], items: { "plugin:lead-manager": ["leads"] } })[0]).toEqual(sec("plugin:lead-manager", "leads", "pipeline"));
  });

  it("layoutOf round-trips through applyLayout", () => {
    const shuffled = [sec("masters", "products", "parties"), sec("sales", "quotations", "invoices", "payments"), sec("purchases", "purchases", "purchase-orders")];
    expect(keys(applyLayout(menu, layoutOf(shuffled)))).toEqual(keys(shuffled));
    expect(orderByKeys([{ key: "a" }, { key: "b" }], undefined)).toEqual([{ key: "a" }, { key: "b" }]);
  });

  it("parseLayout ignores malformed data", () => {
    expect(parseLayout(null)).toEqual({ sections: [], items: {} });
    expect(parseLayout("x")).toEqual({ sections: [], items: {} });
    expect(parseLayout({ sections: ["sales", 3, "sales", "bad key!"], items: { sales: ["a", null], "bad key!": ["x"], masters: "no" } })).toEqual({
      sections: ["sales"],
      items: { sales: ["a"], masters: [] },
    });
  });

  it("core sections have unique keys", () => {
    const all = CORE_SECTIONS.flatMap((s) => [s.key, ...s.items.map((i) => `${s.key}/${i.key}`)]);
    expect(new Set(all).size).toBe(all.length);
  });

  it("only Super admin can arrange the menu by default", () => {
    expect(BUILTIN_ADMIN_PERMISSIONS.SUPER_ADMIN).toContain("menu.manage");
    expect(BUILTIN_ADMIN_PERMISSIONS.SUPPORT).not.toContain("menu.manage");
    expect(BUILTIN_ADMIN_PERMISSIONS.VIEWER).not.toContain("menu.manage");
  });
});
