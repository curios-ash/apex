import { describe, expect, it } from "vitest";

import { evidenceHref } from "./load";

describe("evidenceHref", () => {
  it("builds a query string from the cited ids", () => {
    expect(
      evidenceHref({
        documentId: "doc-1",
        exceptionId: "ex-1",
        transactionId: "tx-1",
        page: 2,
      }),
    ).toBe("/evidence?documentId=doc-1&exceptionId=ex-1&transactionId=tx-1&page=2");
  });

  it("returns the empty viewer when nothing is cited", () => {
    expect(evidenceHref({})).toBe("/evidence");
  });
});
