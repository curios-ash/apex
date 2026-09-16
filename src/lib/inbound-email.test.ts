import { describe, expect, it } from "vitest";

import { extractAliasSlug, normalizeInboundEmail } from "./inbound-email";

const postmarkPayload = {
  From: "owner@example.com",
  To: "demo@in.apex.example.com",
  ToFull: [{ Email: "demo@in.apex.example.com", Name: "Demo" }],
  Subject: "March statement",
  TextBody: "Attached is the March owner statement.",
  MessageID: "<abc123@mail.example.com>",
  Attachments: [
    {
      Name: "pm-statement.txt",
      ContentType: "text/plain",
      Content: Buffer.from("hello statement").toString("base64"),
      ContentLength: 15,
    },
  ],
};

const resendPayload = {
  type: "email.received",
  data: {
    email_id: "7f3c2e1d",
    from: "owner@example.com",
    to: ["demo@in.apex.example.com"],
    subject: "March statement",
    text: "Attached is the March owner statement.",
    attachments: [
      {
        filename: "pm-statement.txt",
        content_type: "text/plain",
        content: Buffer.from("hello statement").toString("base64"),
      },
    ],
  },
};

describe("normalizeInboundEmail", () => {
  it("normalizes a Postmark payload", () => {
    const email = normalizeInboundEmail(postmarkPayload);
    expect(email).not.toBeNull();
    expect(email?.provider).toBe("postmark");
    expect(email?.from).toBe("owner@example.com");
    expect(email?.to).toContain("demo@in.apex.example.com");
    expect(email?.subject).toBe("March statement");
    expect(email?.messageId).toBe("<abc123@mail.example.com>");
    expect(email?.attachments).toHaveLength(1);
    expect(email?.attachments[0].filename).toBe("pm-statement.txt");
  });

  it("normalizes a Resend payload", () => {
    const email = normalizeInboundEmail(resendPayload);
    expect(email).not.toBeNull();
    expect(email?.provider).toBe("resend");
    expect(email?.messageId).toBe("7f3c2e1d");
    expect(email?.attachments[0].contentType).toBe("text/plain");
  });

  it("skips attachments without inline content", () => {
    const email = normalizeInboundEmail({
      ...postmarkPayload,
      Attachments: [{ Name: "a.pdf", ContentType: "application/pdf" }],
    });
    expect(email?.attachments).toHaveLength(0);
  });

  it.each([[null], ["nope"], [{}], [{ data: {} }]])("rejects malformed payload %j", (body) => {
    expect(normalizeInboundEmail(body)).toBeNull();
  });
});

describe("extractAliasSlug", () => {
  it("extracts the slug from an in.<domain> recipient", () => {
    expect(extractAliasSlug(["demo@in.apex.example.com"])).toBe("demo");
  });

  it("handles display-name recipients and case", () => {
    expect(extractAliasSlug(["Demo Owner <DEMO@in.apex.example.com>"])).toBe("demo");
  });

  it("ignores non-alias recipients", () => {
    expect(extractAliasSlug(["someone@gmail.com", "other@example.com"])).toBeNull();
  });

  it("respects INBOUND_EMAIL_DOMAIN when set", () => {
    expect(extractAliasSlug(["demo@in.apex.example.com"], "in.apex.example.com")).toBe("demo");
    expect(extractAliasSlug(["demo@in.other.com"], "in.apex.example.com")).toBeNull();
  });
});
