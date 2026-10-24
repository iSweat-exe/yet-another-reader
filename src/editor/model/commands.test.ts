import { describe, expect, it } from "vitest";
import { fold, matchScore, rank } from "./commands";

describe("fold", () => {
  it("drops accents and case", () => {
    expect(fold("Étoiles")).toBe("etoiles");
  });
});

describe("matchScore", () => {
  it("is 0 when a word of the query is missing", () => {
    expect(matchScore("PP if FC", "pp zzz")).toBe(0);
  });

  it("prefers a label that starts with the query, then a word start, then anywhere", () => {
    const start = matchScore("Score", "sco");
    const word = matchScore("Max score", "sco");
    const inside = matchScore("Rescore", "sco");
    expect(start).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(0);
  });

  it("accepts everything for an empty query", () => {
    expect(matchScore("anything", "  ")).toBeGreaterThan(0);
  });
});

describe("rank", () => {
  const items = ["Rescore", "Max score", "Score", "Combo"];

  it("orders by relevance and drops what does not match", () => {
    expect(rank(items, "sco", (s) => s)).toEqual(["Score", "Max score", "Rescore"]);
  });

  it("keeps the original order for an empty query and for equal scores", () => {
    expect(rank(items, "", (s) => s)).toEqual(items);
    expect(rank(["b score", "a score"], "score", (s) => s)).toEqual(["b score", "a score"]);
  });
});
