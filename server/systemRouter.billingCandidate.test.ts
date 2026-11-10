import { describe, expect, it } from "vitest";
import { systemRouter } from "./_core/systemRouter";

const enabled = (value?: string) => systemRouter.createCaller({
  user: null,
  clientIp: "test",
  billingEnv: value === undefined ? undefined : { BILLING_CANDIDATE_ENABLED: value },
});

describe("system.billingCandidateEnabled", () => {
  it.each([undefined, "", "false", "1", "yes"])('fails closed for %s', async value => {
    expect(await enabled(value).billingCandidateEnabled()).toBe(false);
  });

  it("enables only for an explicit true value, case-insensitively", async () => {
    expect(await enabled("true").billingCandidateEnabled()).toBe(true);
    expect(await enabled("TRUE").billingCandidateEnabled()).toBe(true);
    expect(await enabled(" true ").billingCandidateEnabled()).toBe(true);
  });
});
