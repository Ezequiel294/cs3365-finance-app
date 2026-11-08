import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Normalizer } from "../src/categorization/normalizer";
import { GLOBAL_RULES } from "../src/reference/global-seed";
import { Keys } from "../src/keys";
import { createHarness, TABLES, USER, type Harness } from "./support/harness";

describe("Normalizer", () => {
  const n = new Normalizer();
  it("drops store numbers, locations, and padding", () => {
    expect(n.normalize("AUTOMERCADO ESCAZU 042")).toBe("automercado");
    expect(n.normalize("  automercado   curridabat 017 ")).toBe("automercado");
    expect(n.normalize("SPOTIFY P1A2B3C4D5")).toBe("spotify");
    expect(n.normalize("Café Ñandú #12")).toBe("cafe-nandu");
    expect(n.normalize("1234 5678")).toBe("unknown");
  });

  it("normalizes every global rule's sample to the rule's key", () => {
    for (const rule of GLOBAL_RULES) expect(n.normalize(rule.sample), rule.sample).toBe(rule.merchantKey);
  });
});

describe("Categorizer and RuleService", () => {
  let h: Harness;
  beforeEach(() => (h = createHarness()));
  afterEach(() => h.restore());

  it("uses the global rule when the user has none", async () => {
    const c = await h.services.categorizer().categorize(USER, "automercado");
    expect(c).toEqual({ categoryId: "groceries", tagIds: [], categorizedBy: "global", status: "confirmed" });
  });

  it("prefers the user's own rule and records that a rule decided", async () => {
    await h.services.ruleService().upsert(USER, "automercado", "eating-out", ["university"]);
    const c = await h.services.categorizer().categorize(USER, "automercado");
    expect(c).toEqual({ categoryId: "eating-out", tagIds: ["university"], categorizedBy: "rule", status: "confirmed" });
  });

  it("leaves unknown merchants uncategorized for review", async () => {
    const c = await h.services.categorizer().categorize(USER, "some-new-shop");
    expect(c).toMatchObject({ categorizedBy: "none", status: "pending_review" });
    expect(c.categoryId).toBeUndefined();
  });

  it("rejects a rule that points at an unknown or other user's category", async () => {
    h.dynamo.put(TABLES.REFERENCE_TABLE, { PK: Keys.user("someone-else-0000"), SK: Keys.category("private"), id: "private", name: "Private" });
    await expect(h.services.ruleService().upsert(USER, "spotify", "private", [])).rejects.toMatchObject({ status: 400 });
    await expect(h.services.ruleService().upsert(USER, "spotify", "nope", [])).rejects.toMatchObject({ status: 400 });
    await expect(h.services.ruleService().upsert(USER, "Not A Key", "groceries", [])).rejects.toMatchObject({ status: 400 });
  });
});
