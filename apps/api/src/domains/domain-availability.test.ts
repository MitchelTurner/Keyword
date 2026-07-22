import { describe, expect, it } from "vitest";
import { checkDomainAvailability } from "./domain-availability";

describe("checkDomainAvailability", () => {
  it("marks a well-known domain as taken", async () => {
    const result = await checkDomainAvailability("google.com");
    expect(result.available).toBe(false);
  }, 15_000);

  it("rejects invalid hosts", async () => {
    const result = await checkDomainAvailability("not a domain");
    expect(result.available).toBeNull();
  });
});
