import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

Object.defineProperty(window, "confirm", { configurable: true, value: vi.fn(() => true) });
Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn(async () => undefined) } });

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
