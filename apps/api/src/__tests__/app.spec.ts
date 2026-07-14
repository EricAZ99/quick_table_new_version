import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

describe("createApp — bootstrap", () => {
  it("construit une instance Express valide", () => {
    const app = createApp();

    expect(app).toBeDefined();
    expect(typeof app.listen).toBe("function");
    expect(typeof app.use).toBe("function");
  });

  it("retourne une nouvelle instance à chaque appel (pas de singleton implicite)", () => {
    const first = createApp();
    const second = createApp();

    expect(first).not.toBe(second);
  });
});
