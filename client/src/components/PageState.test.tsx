// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageState } from "./PageState";

afterEach(() => cleanup());

describe("PageState", () => {
  it("renders loading state without exposing a retry action", () => {
    render(
      <PageState
        tone="loading"
        title="กำลังโหลดข้อมูล"
        description="กำลังดึงข้อมูลจากระบบ"
        actionLabel="ลองใหม่"
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("กำลังโหลดข้อมูล")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "ลองใหม่" })).toBeNull();
  });

  it("renders an accessible error state and calls the retry handler", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();

    render(
      <PageState
        tone="error"
        title="โหลดข้อมูลไม่สำเร็จ"
        description="โปรดลองอีกครั้ง"
        actionLabel="ลองใหม่"
        onAction={onAction}
      />,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "ลองใหม่" }));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("renders empty state and disables the action while retry is pending", () => {
    render(
      <PageState
        title="ยังไม่มีรายการ"
        description="เพิ่มข้อมูลเพื่อเริ่มใช้งาน"
        actionLabel="ลองใหม่"
        onAction={vi.fn()}
        actionPending
      />,
    );

    const button = screen.getByRole("button", { name: "กำลังลองใหม่…" }) as HTMLButtonElement;
    expect(screen.getByRole("status")).toBeTruthy();
    expect(button.disabled).toBe(true);
  });
});
