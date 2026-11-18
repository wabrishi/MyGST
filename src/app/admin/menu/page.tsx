import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { APPS_SECTION_KEY, applyLayout, CORE_SECTIONS, pluginSectionKey } from "@/lib/nav";
import { getNavLayout } from "@/lib/nav-store";
import { manifestOf } from "@/lib/plugins/runner";
import { MenuEditor, type EditorSection } from "./menu-editor";

export const metadata = { title: "Menu" };

/**
 * Admin → Menu: the order of the company sidebar (sections, and items inside each), for every company.
 * Plugin sections come from installed plugins; what each user actually sees still depends on their roles.
 */
export default async function AdminMenuPage() {
  await requireAdmin("menu.manage");
  const [layout, plugins] = await Promise.all([getNavLayout(), db.plugin.findMany({ where: { status: "INSTALLED" }, omit: { bundle: true }, orderBy: { name: "asc" } })]);

  const sections: EditorSection[] = CORE_SECTIONS.map((s) => ({ key: s.key, title: s.title, plugin: false, items: s.items.map((i) => ({ key: i.key, label: i.label })) }));
  const apps: EditorSection = { key: APPS_SECTION_KEY, title: "Apps", plugin: true, items: [] };
  for (const p of plugins) {
    const m = manifestOf(p);
    const pages = (m?.pages ?? []).filter((pg) => pg.inNav);
    if (!m || !pages.length) continue;
    if (pages.length > 1) {
      sections.push({ key: pluginSectionKey(p.id), title: m.name, plugin: true, items: pages.map((pg) => ({ key: pg.slug, label: pg.title, icon: pg.icon ?? m.icon })) });
    } else {
      apps.items.push({ key: `${p.id}/${pages[0].slug}`, label: `${pages[0].title} (${m.name})`, icon: pages[0].icon ?? m.icon });
    }
  }
  if (apps.items.length) sections.push(apps);

  return (
    <>
      <PageHeader
        title="Menu"
        subtitle="Drag sections and items to set the order of the sidebar in every company. Dashboard always stays at the top; each user only sees the items their roles allow."
      />
      <MenuEditor defaults={sections} initial={applyLayout(sections, layout)} />
    </>
  );
}
