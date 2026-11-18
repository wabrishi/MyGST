"use client";

import { ChevronDown, ChevronUp, GripVertical, LayoutDashboard, Puzzle, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type DragEvent } from "react";
import { useAction } from "@/components/form-utils";
import { Alert, Badge, Button, Card, cn } from "@/components/ui";
import { CORE_SECTIONS, layoutOf, PLUGIN_ICONS } from "@/lib/nav";
import { adminResetNavLayout, adminSaveNavLayout } from "./actions";

export type EditorItem = { key: string; label: string; icon?: string };
export type EditorSection = { key: string; title: string; plugin: boolean; items: EditorItem[] };

/** Core item icons by key; plugin items name a lucide icon. */
const CORE_ICONS = new Map<string, LucideIcon>(CORE_SECTIONS.flatMap((s) => s.items.map((i) => [`${s.key}/${i.key}`, i.icon] as const)));
const iconFor = (section: EditorSection, item: EditorItem): LucideIcon => CORE_ICONS.get(`${section.key}/${item.key}`) ?? PLUGIN_ICONS[item.icon ?? ""] ?? Puzzle;

const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to > from ? to - 1 : to, 0, x);
  return next;
};

/** Where a drop lands: before the element under the pointer, or after it in its lower half. */
const dropIndex = (e: DragEvent<HTMLElement>, index: number) => {
  const r = e.currentTarget.getBoundingClientRect();
  return e.clientY > r.top + r.height / 2 ? index + 1 : index;
};

type Drag = { kind: "section"; from: number } | { kind: "item"; section: number; from: number };

const same = (a: EditorSection[], b: EditorSection[]) => JSON.stringify(layoutOf(a)) === JSON.stringify(layoutOf(b));

function MoveButtons({ label, index, count, onMove }: { label: string; index: number; count: number; onMove: (to: number) => void }) {
  return (
    <span className="flex shrink-0 items-center">
      <button type="button" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => onMove(index - 1)} className="rounded p-1 text-muted hover:bg-subtle hover:text-foreground disabled:opacity-30">
        <ChevronUp size={15} />
      </button>
      <button
        type="button"
        aria-label={`Move ${label} down`}
        disabled={index === count - 1}
        onClick={() => onMove(index + 2)}
        className="rounded p-1 text-muted hover:bg-subtle hover:text-foreground disabled:opacity-30"
      >
        <ChevronDown size={15} />
      </button>
    </span>
  );
}

export function MenuEditor({ defaults, initial }: { defaults: EditorSection[]; initial: EditorSection[] }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [sections, setSections] = useState(initial);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<{ kind: "section"; at: number } | { kind: "item"; section: number; at: number } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const save = useAction(adminSaveNavLayout);
  const reset = useAction(adminResetNavLayout);
  const dirty = !same(sections, saved);
  const isDefault = same(sections, defaults);

  const moveSection = (from: number, to: number) => setSections((s) => move(s, from, to));
  const moveItem = (si: number, from: number, to: number) => setSections((s) => s.map((sec, i) => (i === si ? { ...sec, items: move(sec.items, from, to) } : sec)));

  const endDrag = () => {
    setDrag(null);
    setOver(null);
  };
  const onDrop = () => {
    if (drag?.kind === "section" && over?.kind === "section") moveSection(drag.from, over.at);
    if (drag?.kind === "item" && over?.kind === "item" && over.section === drag.section) moveItem(drag.section, drag.from, over.at);
    endDrag();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted">
          <LayoutDashboard size={16} /> Dashboard <span className="ml-auto text-xs">always first</span>
        </div>
        <ol className="flex flex-col gap-3" aria-label="Menu sections">
          {sections.map((s, si) => (
            <li
              key={s.key}
              aria-label={s.title}
              onDragOver={(e) => {
                if (drag?.kind !== "section") return;
                e.preventDefault();
                setOver({ kind: "section", at: dropIndex(e, si) });
              }}
              onDrop={(e) => {
                e.preventDefault();
                onDrop();
              }}
              className="relative"
            >
              {over?.kind === "section" && over.at === si && <div className="absolute -top-2 left-0 right-0 h-0.5 rounded bg-primary" />}
              {over?.kind === "section" && over.at === si + 1 && si === sections.length - 1 && <div className="absolute -bottom-2 left-0 right-0 h-0.5 rounded bg-primary" />}
              <Card className={cn("overflow-hidden", drag?.kind === "section" && drag.from === si && "opacity-50")}>
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", s.key);
                    setDrag({ kind: "section", from: si });
                  }}
                  onDragEnd={endDrag}
                  data-testid={`section-handle-${s.key}`}
                  className="flex cursor-grab items-center gap-2 border-b border-border bg-surface-2 px-3 py-2.5 active:cursor-grabbing"
                >
                  <GripVertical size={16} className="shrink-0 text-muted" aria-hidden />
                  <span className="text-[13px] font-semibold uppercase tracking-wider">{s.title}</span>
                  {s.plugin && <Badge color="blue">Plugin</Badge>}
                  <span className="ml-auto" />
                  <MoveButtons label={s.title} index={si} count={sections.length} onMove={(to) => moveSection(si, to)} />
                </div>
                <ol className="flex flex-col p-1.5" aria-label={`${s.title} items`}>
                  {s.items.map((it, ii) => {
                    const Icon = iconFor(s, it);
                    const indicator = over?.kind === "item" && over.section === si;
                    return (
                      <li
                        key={it.key}
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", it.key);
                          setDrag({ kind: "item", section: si, from: ii });
                        }}
                        onDragEnd={endDrag}
                        onDragOver={(e) => {
                          if (drag?.kind !== "item" || drag.section !== si) return;
                          e.preventDefault();
                          e.stopPropagation();
                          setOver({ kind: "item", section: si, at: dropIndex(e, ii) });
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onDrop();
                        }}
                        data-testid={`item-${s.key}-${it.key}`}
                        className={cn(
                          "relative flex cursor-grab items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-subtle active:cursor-grabbing",
                          drag?.kind === "item" && drag.section === si && drag.from === ii && "opacity-50",
                        )}
                      >
                        {indicator && over.at === ii && <div className="absolute -top-px left-2 right-2 h-0.5 rounded bg-primary" />}
                        {indicator && over.at === ii + 1 && ii === s.items.length - 1 && <div className="absolute -bottom-px left-2 right-2 h-0.5 rounded bg-primary" />}
                        <GripVertical size={14} className="shrink-0 text-muted" aria-hidden />
                        <Icon size={16} className="shrink-0 text-muted" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{it.label}</span>
                        <MoveButtons label={it.label} index={ii} count={s.items.length} onMove={(to) => moveItem(si, ii, to)} />
                      </li>
                    );
                  })}
                </ol>
              </Card>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
        <Card className="flex flex-col gap-3 p-4 text-sm">
          <h2 className="font-semibold">Save</h2>
          <p className="text-xs text-muted">
            Drag a section by its header, or an item by its row (items stay in their section). The ▲ ▼ buttons do the same with the keyboard or on a phone.
          </p>
          {dirty && <p className="text-xs font-medium text-warning">Unsaved changes</p>}
          {save.error && <Alert>{save.error}</Alert>}
          {(save.message || reset.message) && !dirty && <Alert kind="success">{save.message || reset.message}</Alert>}
          {reset.error && <Alert>{reset.error}</Alert>}
          <Button
            disabled={!dirty || save.pending}
            onClick={async () => {
              const r = await save.execute(layoutOf(sections));
              if (r?.ok) {
                setSaved(sections);
                router.refresh();
              }
            }}
          >
            {save.pending ? "Saving…" : "Save order"}
          </Button>
          <Button variant="secondary" disabled={!dirty} onClick={() => setSections(saved)}>
            Discard changes
          </Button>
          {confirmReset ? (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <p className="text-xs">Put every section and item back in the built-in order for all companies?</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  disabled={reset.pending}
                  onClick={async () => {
                    const r = await reset.execute();
                    if (r?.ok) {
                      setSections(defaults);
                      setSaved(defaults);
                      setConfirmReset(false);
                      router.refresh();
                    }
                  }}
                >
                  {reset.pending ? "Resetting…" : "Reset"}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirmReset(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" disabled={isDefault && !dirty} onClick={() => setConfirmReset(true)}>
              Reset to default
            </Button>
          )}
        </Card>
        <p className="px-1 text-xs text-muted">New plugins and new pages appear at the end of the menu (or of their section) until you place them.</p>
      </div>
    </div>
  );
}
