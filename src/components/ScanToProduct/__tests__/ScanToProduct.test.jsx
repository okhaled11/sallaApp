import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ScanToProduct from "../ScanToProduct.jsx";

vi.mock("qrcode.react", () => ({
  QRCodeSVG: () => <div data-testid="mock-qr" />,
}));

vi.mock("../../../utils/scanApi.js", () => ({
  createScanSession: vi.fn(),
  pollScanSession: vi.fn(),
  publishScannedProduct: vi.fn(),
  uploadScanImageFromDashboard: vi.fn(),
  analyzeScanSessionFromDashboard: vi.fn(),
  scanImageUrl: (token) => `http://mock/img/${token}`,
  buildPhoneUrl: () => "http://mock/phone",
}));

describe("ScanToProduct Component", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders initial empty state with title and Gemini AI badge", () => {
    render(<ScanToProduct products={[]} token="mock-token" />);
    expect(screen.getByText(/أضف منتجًا بالتصوير والذكاء الاصطناعي/)).toBeInTheDocument();
    expect(screen.getByText(/مدعوم بنموذج Google Gemini للذكاء الاصطناعي/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /بدء جلسة التصوير والتحليل/ })).toBeInTheDocument();
  });
});
