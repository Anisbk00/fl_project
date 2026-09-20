import { describe, it, expect } from "bun:test";
import { canTransition, nextStates, lifecycleActionLabel } from "@/features/admin/lifecycle";

describe("lifecycle transition model", () => {
  it("allows draft → published/archived", () => {
    expect(canTransition("draft", "published")).toBe(true);
    expect(canTransition("draft", "archived")).toBe(true);
  });
  it("allows published → draft/archived", () => {
    expect(canTransition("published", "draft")).toBe(true);
    expect(canTransition("published", "archived")).toBe(true);
  });
  it("allows archived → draft (republish)", () => {
    expect(canTransition("archived", "draft")).toBe(true);
  });
  it("rejects archived → published (must go draft first)", () => {
    expect(canTransition("archived", "published")).toBe(false);
  });
  it("rejects no-op transitions", () => {
    expect(canTransition("draft", "draft")).toBe(false);
    expect(canTransition("published", "published")).toBe(false);
  });
  it("lists next states", () => {
    expect(nextStates("draft").sort()).toEqual(["archived", "published"]);
  });
  it("labels actions", () => {
    expect(lifecycleActionLabel("published")).toBe("Publish");
    expect(lifecycleActionLabel("archived")).toBe("Archive");
  });
});
