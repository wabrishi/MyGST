import { describe, expect, it } from "vitest";
import { fillTemplate, renderTemplate, sampleVars, TEMPLATES, usedVars } from "@/lib/email-templates";

describe("email templates", () => {
  it("fills values, escaping them in bodies but not in subjects", () => {
    expect(fillTemplate("Hi {{name}}!", { name: "<b>Asha</b> & co" }, true)).toBe("Hi &lt;b&gt;Asha&lt;/b&gt; &amp; co!");
    expect(fillTemplate("Hi {{ name }}", { name: "A & B" }, false)).toBe("Hi A & B");
    expect(fillTemplate("[{{missing}}]", {}, true)).toBe("[]");
  });

  it("shows {{#if}} parts only when the value isn't empty", () => {
    const t = "Order{{#if date}}, deliver by {{date}}{{/if}}.";
    expect(fillTemplate(t, { date: "2026-11-30" }, true)).toBe("Order, deliver by 2026-11-30.");
    expect(fillTemplate(t, { date: "" }, true)).toBe("Order.");
    expect(fillTemplate(t, {}, true)).toBe("Order.");
  });

  it("lists the variables a template uses", () => {
    expect(usedVars("{{a}} {{#if b}}{{c}}{{/if}} {{ a }}").sort()).toEqual(["a", "b", "c"]);
  });

  it("every default template uses only its own variables, and renders", () => {
    for (const t of TEMPLATES) {
      const unknown = usedVars(`${t.subject} ${t.body}`).filter((v) => !(v in t.vars));
      expect(unknown, t.key).toEqual([]);
      const r = renderTemplate(t, sampleVars(t));
      expect(r.subject, t.key).not.toMatch(/\{\{/);
      expect(r.html, t.key).not.toMatch(/\{\{/);
      expect(r.html).toContain("MyGSTBook");
    }
  });

  it("wraps bodies in the branded layout and keeps subjects on one line", () => {
    const r = renderTemplate({ subject: "Hello\n  {{name}}", body: "<p>Hi {{name}}</p>" }, { name: "Ravi" });
    expect(r.subject).toBe("Hello Ravi");
    expect(r.html).toMatch(/^<!doctype html>/);
    expect(r.html).toContain("<p>Hi Ravi</p>");
  });
});
