import { describe, expect, it } from "vitest";
import { emailDate, fillTemplate, inlineEmailStyles, renderTemplate, sampleVars, TEMPLATES, usedVars } from "@/lib/email-templates";

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
    expect(r.html).toMatch(/<p style="[^"]*">Hi Ravi<\/p>/);
  });
});

describe("email layout", () => {
  it("turns buttons, summary panels and text into inline-styled, email-safe HTML", () => {
    const html = inlineEmailStyles(`<h1>Hi</h1><p><a class="btn" href="https://x.in/a">Go</a></p><p class="muted">Small</p><table class="summary"><tr><td>No.</td><td>1</td></tr><tr class="total"><td>Total</td><td>₹5</td></tr></table><p>See <a href="https://x.in">this</a></p>`);
    expect(html).not.toMatch(/class="/);
    expect(html).toContain('<table role="presentation"');
    expect(html).toMatch(/<a href="https:\/\/x\.in\/a" target="_blank" style="[^"]*background|<td style="border-radius:8px;background:#4f46e5"><a href="https:\/\/x\.in\/a"/);
    expect(html).not.toMatch(/<p[^>]*>\s*<table/); // no button table inside a <p>
    expect(html).toMatch(/<a href="https:\/\/x\.in" style="color:#4f46e5/);
    expect(html).toMatch(/font-size:16px;font-weight:700[^>]*>₹5/);
  });

  it("adds inbox preview text and keeps values escaped", () => {
    const t = TEMPLATES.find((x) => x.key === "document_email")!;
    const r = renderTemplate(t, { ...sampleVars(t), partyName: "<script>x</script>" });
    expect(r.html).not.toContain("<script>x</script>");
    expect(r.html).toContain("Dear &lt;script&gt;");
    expect(r.html).toContain("display:none"); // preheader
    expect(r.html).toContain("Thank you for your business");
  });

  it("formats dates for emails", () => {
    expect(emailDate("2026-11-08")).toBe("8 Nov 2026");
    expect(emailDate("")).toBe("");
    expect(emailDate(null)).toBe("");
  });
});
