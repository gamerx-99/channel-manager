import { describe, expect, it, vi } from "vitest";
import { discardSocialSignup, shortAccountName, socialEmailMatch, useSocialEmail } from "./socialEmail";

/** A Better Auth stand-in with just what the Facebook email helpers call. */
function fakeAuth(options: { email: string; existing?: { name: string; providers: string[] } | null; hasFacebook?: boolean }) {
  const internalAdapter = {
    findUserById: vi.fn(async () => ({ id: "u-new", email: options.email })),
    findAccounts: vi.fn(async () => (options.hasFacebook === false ? [] : [{ providerId: "facebook", accountId: "fb-1" }])),
    findUserByEmail: vi.fn(async () => (options.existing ? { user: { name: options.existing.name }, accounts: options.existing.providers.map(providerId => ({ providerId })) } : null)),
    updateUser: vi.fn(async () => undefined),
    deleteUser: vi.fn(async () => undefined),
  };
  const auth = { $context: Promise.resolve({ internalAdapter }), api: { getAccessToken: vi.fn(async () => ({ accessToken: "token" })) } };
  return { auth: auth as never, internalAdapter };
}

const PLACEHOLDER = "facebook.123@no-email.hayhost.invalid";
const graph = (email: string | undefined) => vi.fn(async () => new Response(JSON.stringify(email ? { email } : {}), { status: 200 }));

describe("Facebook email on the add-email step", () => {
  it("shortens a name to first name and last initial", () => {
    expect(shortAccountName("Tanutcha Srimrnee")).toBe("Tanutcha S.");
    expect(shortAccountName("Anan")).toBe("Anan");
    expect(shortAccountName("")).toBe("");
  });

  it("reports a free address, and an address that already has an account with its sign-in methods", async () => {
    await expect(socialEmailMatch({ auth: fakeAuth({ email: PLACEHOLDER }).auth, userId: "u-new", fetchImpl: graph("Guest@Example.test") }))
      .resolves.toEqual({ kind: "free", email: "guest@example.test" });
    const taken = fakeAuth({ email: PLACEHOLDER, existing: { name: "Tanutcha Srimrnee", providers: ["google", "credential", "google"] } });
    await expect(socialEmailMatch({ auth: taken.auth, userId: "u-new", fetchImpl: graph("owner@example.test") }))
      .resolves.toEqual({ kind: "taken", email: "owner@example.test", accountName: "Tanutcha S.", signInMethods: ["google", "credential"] });
  });

  it("finds nothing without a Facebook sign-in or a shared email", async () => {
    await expect(socialEmailMatch({ auth: fakeAuth({ email: PLACEHOLDER, hasFacebook: false }).auth, userId: "u-new", fetchImpl: graph("a@b.test") })).resolves.toEqual({ kind: "none" });
    await expect(socialEmailMatch({ auth: fakeAuth({ email: PLACEHOLDER }).auth, userId: "u-new", fetchImpl: graph(undefined) })).resolves.toEqual({ kind: "none" });
  });

  it("never joins an existing account: using a taken address is refused", async () => {
    const taken = fakeAuth({ email: PLACEHOLDER, existing: { name: "Owner", providers: ["google"] } });
    await expect(useSocialEmail({ auth: taken.auth, userId: "u-new", fetchImpl: graph("owner@example.test") })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(taken.internalAdapter.updateUser).not.toHaveBeenCalled();

    const free = fakeAuth({ email: PLACEHOLDER });
    await expect(useSocialEmail({ auth: free.auth, userId: "u-new", fetchImpl: graph("guest@example.test") })).resolves.toEqual({ email: "guest@example.test" });
    expect(free.internalAdapter.updateUser).toHaveBeenCalledWith("u-new", { email: "guest@example.test", emailVerified: false });
  });

  it("removes only a placeholder account with no hotel", async () => {
    const fresh = fakeAuth({ email: PLACEHOLDER });
    await expect(discardSocialSignup({ auth: fresh.auth, userId: "u-new", hasHotels: false })).resolves.toEqual({ removed: true });
    expect(fresh.internalAdapter.deleteUser).toHaveBeenCalledWith("u-new");

    const withHotel = fakeAuth({ email: PLACEHOLDER });
    await expect(discardSocialSignup({ auth: withHotel.auth, userId: "u-new", hasHotels: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const real = fakeAuth({ email: "owner@example.test" });
    await expect(discardSocialSignup({ auth: real.auth, userId: "u-new", hasHotels: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(real.internalAdapter.deleteUser).not.toHaveBeenCalled();
  });
});
