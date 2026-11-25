import { describe, expect, it } from "vitest";
import { mailErrorMessage } from "@/lib/mail";
import { samplePdfAttachment } from "@/lib/pdf/sample-document";

describe("email server errors", () => {
  it("explains a refused recipient with the server's reply", () => {
    const m = mailErrorMessage({ code: "EENVELOPE", command: "RCPT TO", response: "550 5.1.1 <admin@e2e.test>: Recipient address rejected" }, "admin@e2e.test");
    expect(m).toContain("refused to deliver to admin@e2e.test");
    expect(m).toContain("550 5.1.1");
  });

  it("points at the right setting for login, connection and sender problems", () => {
    expect(mailErrorMessage({ code: "EAUTH" }, "a@b.in")).toContain("SMTP_USER and SMTP_PASS");
    expect(mailErrorMessage({ code: "ETIMEDOUT" }, "a@b.in")).toContain("SMTP_HOST and SMTP_PORT");
    expect(mailErrorMessage({ command: "MAIL FROM", response: "553 Sender address rejected" }, "a@b.in")).toContain("MAIL_FROM");
    expect(mailErrorMessage(new Error("boom"), "a@b.in")).toBe("The email couldn't be sent. Server said: boom");
  });
});

describe("sample PDF for test emails", () => {
  it("renders a real PDF", async () => {
    const a = await samplePdfAttachment();
    expect(a.contentType).toBe("application/pdf");
    expect(a.content.subarray(0, 5).toString()).toBe("%PDF-");
    expect(a.content.length).toBeGreaterThan(5000);
  }, 60_000);
});
