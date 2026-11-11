// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: { data: [] as Array<{ id: string; name: string | null; createdAt: string | null }>, isPending: false, error: null as unknown },
  addPasskey: vi.fn(),
  deletePasskey: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useListPasskeys: () => mocks.list,
    passkey: { addPasskey: mocks.addPasskey, deletePasskey: mocks.deletePasskey },
  },
}));

import PasskeySettings from "./PasskeySettings";

beforeEach(() => {
  vi.stubGlobal("PublicKeyCredential", class {});
  mocks.list = { data: [{ id: "pk-1", name: "iPhone", createdAt: "2026-11-11T06:00:00.000Z" }], isPending: false, error: null };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mocks.addPasskey.mockReset();
  mocks.deletePasskey.mockReset();
});

describe("PasskeySettings", () => {
  it("lists the passkeys with their names", () => {
    render(<PasskeySettings />);
    expect(screen.getByText("iPhone")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add a passkey" })).toBeTruthy();
  });

  it("says so when there are none", () => {
    mocks.list = { data: [], isPending: false, error: null };
    render(<PasskeySettings />);
    expect(screen.getByText("No passkey on this account yet.")).toBeTruthy();
  });

  it("adds a passkey under the typed name, or a device name when none is typed", async () => {
    mocks.addPasskey.mockResolvedValue({ data: { id: "new" }, error: null });
    const user = userEvent.setup();
    render(<PasskeySettings />);

    await user.type(screen.getByLabelText(/Device name/), "Front desk PC");
    await user.click(screen.getByRole("button", { name: "Add a passkey" }));
    await waitFor(() => expect(mocks.addPasskey).toHaveBeenCalledWith({ name: "Front desk PC" }));

    await user.click(screen.getByRole("button", { name: "Add a passkey" }));
    await waitFor(() => expect(mocks.addPasskey).toHaveBeenCalledTimes(2));
    const second = mocks.addPasskey.mock.calls[1]![0] as { name: string };
    expect(second.name.length).toBeGreaterThan(0);
    expect(second.name).not.toBe("Front desk PC");
  });

  it("shows nothing alarming when the person closes the system prompt", async () => {
    mocks.addPasskey.mockResolvedValue({ data: null, error: { code: "ERROR_CEREMONY_ABORTED", message: "cancelled" } });
    const user = userEvent.setup();
    render(<PasskeySettings />);
    await user.click(screen.getByRole("button", { name: "Add a passkey" }));
    await waitFor(() => expect(mocks.addPasskey).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("explains a failure and a device that already has a passkey", async () => {
    const user = userEvent.setup();
    render(<PasskeySettings />);

    mocks.addPasskey.mockResolvedValueOnce({ data: null, error: { code: "SERVER_DOWN", message: "x" } });
    await user.click(screen.getByRole("button", { name: "Add a passkey" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Could not add the passkey. Try again.");

    mocks.addPasskey.mockResolvedValueOnce({ data: null, error: { code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED", message: "x" } });
    await user.click(screen.getByRole("button", { name: "Add a passkey" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("This device already has a passkey for this account."));
  });

  it("deletes a passkey only after the person confirms", async () => {
    mocks.deletePasskey.mockResolvedValue({ data: { status: true }, error: null });
    const user = userEvent.setup();
    render(<PasskeySettings />);

    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(mocks.deletePasskey).not.toHaveBeenCalled();

    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mocks.deletePasskey).toHaveBeenCalledWith({ id: "pk-1" }));
  });

  it("hides the add form but keeps the list when the browser has no passkey support", () => {
    vi.stubGlobal("PublicKeyCredential", undefined);
    render(<PasskeySettings />);
    expect(screen.queryByRole("button", { name: "Add a passkey" })).toBeNull();
    expect(screen.getByText("This browser does not support passkeys.")).toBeTruthy();
    expect(screen.getByText("iPhone")).toBeTruthy();
  });
});
