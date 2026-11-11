import { describe, expect, it } from "vitest";
import { passkeyRelyingParty } from "./passkeyConfig";

describe("passkeyRelyingParty", () => {
  it("drops www so one passkey covers the apex and www", () => {
    expect(passkeyRelyingParty("https://www.hayhostth.com")).toEqual({ rpID: "hayhostth.com", origin: "https://www.hayhostth.com" });
  });

  it("keeps an apex host as is", () => {
    expect(passkeyRelyingParty("https://hayhostth.com/login")).toEqual({ rpID: "hayhostth.com", origin: "https://hayhostth.com" });
  });

  it("uses localhost with its port in the origin only", () => {
    expect(passkeyRelyingParty("http://localhost:8787")).toEqual({ rpID: "localhost", origin: "http://localhost:8787" });
  });

  it("uses the full host under workers.dev, a public suffix", () => {
    expect(passkeyRelyingParty("https://hayhost-stage.lannatc.workers.dev")).toEqual({
      rpID: "hayhost-stage.lannatc.workers.dev",
      origin: "https://hayhost-stage.lannatc.workers.dev",
    });
    expect(passkeyRelyingParty("https://www.example.workers.dev").rpID).toBe("www.example.workers.dev");
  });

  it("does not strip www from a bare www host or an IP address", () => {
    expect(passkeyRelyingParty("http://www").rpID).toBe("www");
    expect(passkeyRelyingParty("http://127.0.0.1:8787").rpID).toBe("127.0.0.1");
  });
});
