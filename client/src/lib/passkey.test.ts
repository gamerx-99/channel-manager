// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyPasskeyError, defaultPasskeyName, passkeyAutofillSupported, passkeySupported } from "./passkey";

afterEach(() => vi.unstubAllGlobals());

describe("passkey support", () => {
  it("is off when the browser has no PublicKeyCredential", () => {
    vi.stubGlobal("PublicKeyCredential", undefined);
    expect(passkeySupported()).toBe(false);
  });

  it("is on when PublicKeyCredential exists, and autofill follows the browser's answer", async () => {
    vi.stubGlobal("PublicKeyCredential", { isConditionalMediationAvailable: async () => true });
    expect(passkeySupported()).toBe(true);
    await expect(passkeyAutofillSupported()).resolves.toBe(true);

    vi.stubGlobal("PublicKeyCredential", {});
    await expect(passkeyAutofillSupported()).resolves.toBe(false);

    vi.stubGlobal("PublicKeyCredential", { isConditionalMediationAvailable: async () => { throw new Error("nope"); } });
    await expect(passkeyAutofillSupported()).resolves.toBe(false);
  });
});

describe("classifyPasskeyError", () => {
  it("treats closing the system prompt as a cancel", () => {
    expect(classifyPasskeyError({ code: "AUTH_CANCELLED" })).toBe("cancelled");
    expect(classifyPasskeyError({ code: "ERROR_CEREMONY_ABORTED" })).toBe("cancelled");
    expect(classifyPasskeyError({ message: "NotAllowedError: The operation either timed out or was not allowed" })).toBe("cancelled");
  });

  it("recognises a device that already has a passkey for the account", () => {
    expect(classifyPasskeyError({ code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" })).toBe("alreadyAdded");
  });

  it("calls everything else a failure", () => {
    expect(classifyPasskeyError({ code: "PASSKEY_NOT_FOUND", message: "x" })).toBe("failed");
    expect(classifyPasskeyError(null)).toBe("failed");
  });
});

describe("defaultPasskeyName", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "iPhone"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8)", "Android"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "Mac"],
    ["Mozilla/5.0 (X11; Linux x86_64)", "Linux"],
    ["something else", "Passkey"],
  ])("names %s as %s", (userAgent, expected) => {
    expect(defaultPasskeyName(userAgent)).toBe(expected);
  });
});
