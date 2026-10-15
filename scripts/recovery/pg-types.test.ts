import { afterEach, describe, expect, it } from "vitest";
import { types } from "pg";
import { configureRecoveryPgTypes, PG_DATE_OID, PG_TIMESTAMP_OID, PG_TIMESTAMPTZ_OID } from "./pg-types.js";

const originalDate = types.getTypeParser(PG_DATE_OID, "text");
const originalTimestamp = types.getTypeParser(PG_TIMESTAMP_OID, "text");
const originalTimestamptz = types.getTypeParser(PG_TIMESTAMPTZ_OID, "text");

afterEach(() => {
  types.setTypeParser(PG_DATE_OID, originalDate);
  types.setTypeParser(PG_TIMESTAMP_OID, originalTimestamp);
  types.setTypeParser(PG_TIMESTAMPTZ_OID, originalTimestamptz);
});

describe("recovery pg type parsers", () => {
  it("returns date and timestamp values as the original text", () => {
    configureRecoveryPgTypes();
    const dateParser = types.getTypeParser(PG_DATE_OID, "text") as (value: string) => unknown;
    const timestampParser = types.getTypeParser(PG_TIMESTAMP_OID, "text") as (value: string) => unknown;
    const timestamptzParser = types.getTypeParser(PG_TIMESTAMPTZ_OID, "text") as (value: string) => unknown;
    expect(dateParser("2026-01-15")).toBe("2026-01-15");
    expect(timestampParser("2026-01-15 12:00:00")).toBe("2026-01-15 12:00:00");
    expect(timestamptzParser("2026-01-15 12:00:00+00")).toBe("2026-01-15 12:00:00+00");
  });

  it("keeps calendar dates as text under Australia/Sydney", () => {
    const previous = process.env.TZ;
    process.env.TZ = "Australia/Sydney";
    try {
      configureRecoveryPgTypes();
      const dateParser = types.getTypeParser(PG_DATE_OID, "text") as (value: string) => unknown;
      const timestamptzParser = types.getTypeParser(PG_TIMESTAMPTZ_OID, "text") as (value: string) => unknown;
      expect(dateParser("2026-01-15")).toBe("2026-01-15");
      expect(timestamptzParser("2026-01-15 00:30:00+00")).toBe("2026-01-15 00:30:00+00");
    } finally {
      if (previous == null) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});
