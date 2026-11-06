import { describe, expect, test } from "vitest";
import { classifyPosts, isShockPost, postsFrom } from "../src/news.js";

describe("isShockPost", () => {
  test("routine daily rate report is not a shock", () => {
    expect(isShockPost("The US dollar traded at approximately ₦1,400 on Nigeria's parallel market on Friday, while the naira closed at ₦1,348.74 per dollar on the official NFEM.")).toBe(false);
  });
  test("reported devaluation or CBN halt is a shock", () => {
    expect(isShockPost("CBN announces devaluation of the naira to N1,600/$")).toBe(true);
    expect(isShockPost("Breaking: Central bank suspends FX sales to BDCs")).toBe(true);
    expect(isShockPost("Nigeria floats the naira again")).toBe(true);
    expect(isShockPost("The naira has been devalued for the third time")).toBe(true);
  });
  test("opinion that mentions devaluation is not a shock (real posts, 2026-11-06)", () => {
    expect(isShockPost("Devaluation of naira sounds good but the impracticality will kill the country. The moment you devalue to 600 you local industries will be facing competition")).toBe(false);
    expect(isShockPost("Historical instances of confiscations, forced withdrawals, bank collapses and reckless inflationary policies: this is what Bitcoin is for!")).toBe(false);
  });
  test("naira drop of 3% or more is a shock, smaller is not", () => {
    expect(isShockPost("Naira plunges 4.2% against the dollar at the official window")).toBe(true);
    expect(isShockPost("Naira fell 3% on Thursday")).toBe(true);
    expect(isShockPost("Naira dropped 0.8% to N1,360")).toBe(false);
  });
});

describe("classifyPosts", () => {
  const shock = "Naira crashes 5% overnight";
  test("needs two different accounts", () => {
    expect(classifyPosts([{ author: "a", text: shock }])).toBe("normal");
    expect(classifyPosts([{ author: "a", text: shock }, { author: "A", text: shock }])).toBe("normal");
    expect(classifyPosts([{ author: "a", text: shock }, { author: "b", text: "CBN devalues naira" }])).toBe("shock");
  });
  test("no posts is normal", () => {
    expect(classifyPosts([])).toBe("normal");
  });
});

describe("postsFrom", () => {
  test("reads tweets from the gateway envelope and ignores other shapes", () => {
    const body = { transaction: "0x1", output: { timeline: [{ type: "tweet", screen_name: "TelegraphNG", text: "hi" }, { type: "user", screen_name: "x" }] } };
    expect(postsFrom(body)).toEqual([{ author: "TelegraphNG", text: "hi" }]);
    expect(postsFrom({ error: "x" })).toEqual([]);
    expect(postsFrom(null)).toEqual([]);
  });
});
