import { render, screen, waitFor } from "@testing-library/react";
import QRCode from "qrcode";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QrPass } from "./QrPass";

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(async () => "data:image/png;base64,QUJD") },
}));

const TOKEN = "EP1:" + "b".repeat(43);

describe("QrPass", () => {
  beforeEach(() => {
    vi.mocked(QRCode.toDataURL).mockClear();
  });

  it("encodes exactly the credential token, with no other content", async () => {
    render(<QrPass token={TOKEN} participantName="Michael Banda" eventName="Youth Camp" groupName="Church A" />);
    await waitFor(() => expect(screen.getByAltText("QR pass for Michael Banda")).toBeInTheDocument());
    expect(vi.mocked(QRCode.toDataURL).mock.calls[0][0]).toBe(TOKEN);
  });

  it("shows the name, event and group, but never the token as text", async () => {
    render(<QrPass token={TOKEN} participantName="Michael Banda" eventName="Youth Camp" groupName="Church A" />);
    await screen.findByAltText("QR pass for Michael Banda");
    expect(screen.getByText("Youth Camp")).toBeInTheDocument();
    expect(screen.getByText("Church A")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(TOKEN);
  });

  it("says so when a participant has no group", async () => {
    render(<QrPass token={TOKEN} participantName="M" eventName="E" groupName={null} />);
    expect(await screen.findByText("No group assigned")).toBeInTheDocument();
  });

  it("offers printing", async () => {
    render(<QrPass token={TOKEN} participantName="M" eventName="E" groupName={null} />);
    expect(await screen.findByRole("button", { name: "Print pass" })).toBeInTheDocument();
  });
});
