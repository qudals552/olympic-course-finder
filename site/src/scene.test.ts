import { describe, expect, it } from "vitest";
import { SCENES, pickScene } from "./scene";

describe("첫 화면 장면", () => {
  it("직전과 다른 장면을 고름", () => {
    for (const s of SCENES) for (const r of [0, 0.5, 0.99]) expect(pickScene(s.id, () => r).id).not.toBe(s.id);
  });
  it("처음이면 아무 장면이나 고르고, 장면은 4가지", () => {
    expect(SCENES).toHaveLength(4);
    expect(SCENES.map((s) => s.id)).toContain(pickScene(null, () => 0).id);
  });
});
