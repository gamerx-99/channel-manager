import { afterEach, describe, expect, it, vi } from "vitest";
import { ResendEmailSender } from "./email";

afterEach(() => vi.unstubAllGlobals());

async function sentBody(send: (sender: ResendEmailSender) => Promise<void>) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "1" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await send(new ResendEmailSender("key", "from@example.test"));
  return JSON.parse(String((fetchMock.mock.calls[0] as unknown[])[1] && ((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).body));
}

describe("ResendEmailSender", () => {
  it("escapes the hotel name in invite HTML but keeps it readable in text", async () => {
    const name = `<a href="https://evil.example">Click</a>`;
    const body = await sentBody(sender => sender.sendInviteEmail({ to: "a@example.test", hotelName: name, inviteUrl: "https://app.example.test/x?token=1&a=2" }));

    expect(body.html).not.toContain(`<a href="https://evil.example">`);
    expect(body.html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;");
    expect(body.html).toContain("token=1&amp;a=2");
    expect(body.text).toContain(name);
  });

  it("escapes the reset link in password email HTML", async () => {
    const body = await sentBody(sender => sender.sendPasswordResetEmail({ to: "a@example.test", resetUrl: `https://app.example.test/"><img src=x>` }));

    expect(body.html).not.toContain("<img");
  });
});
