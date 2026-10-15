import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A date-only wellness entry ("YYYY-MM-DD" from the day forms) must read back
 * on the same calendar day through the journal page's local-getter dayKey, in
 * any server time zone (`npm run test:tz` runs this under America/New_York and
 * America/Santiago; the main suite runs it under Australia/Brisbane). Parsed
 * as UTC midnight it lands on the previous day west of UTC.
 */
const m = vi.hoisted(() => {
  const entryCreate = vi.fn();
  const prisma: Record<string, unknown> = {
    journalEntry: { create: entryCreate },
    auditLog: { create: vi.fn() },
  };
  Object.assign(prisma, { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)) });
  return { prisma, entryCreate, currentUser: vi.fn() };
});

vi.mock("@/lib/db", () => ({ prisma: m.prisma }));
vi.mock("@/lib/auth/owner", () => ({ getCurrentUser: m.currentUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/crypto/fieldEncryption", () => ({
  encryptField: (v: string | null | undefined) => (v == null ? null : `ENC(${v})`),
}));

import { createJournalEntry } from "./journal";

// Same local-getter bucketing as src/app/journal/page.tsx dayKey().
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function storedDate(dateISO: string): Promise<Date> {
  const res = await createJournalEntry({ dateISO, weight: "80" });
  expect(res.ok).toBe(true);
  return m.entryCreate.mock.calls[0][0].data.date as Date;
}

describe("createJournalEntry dateISO", () => {
  beforeEach(() => {
    m.entryCreate.mockReset().mockResolvedValue({ id: "e1" });
    m.currentUser.mockResolvedValue({ id: "u1" });
  });

  it("buckets a date-only entry on the day that was submitted", async () => {
    expect(dayKey(await storedDate("2026-10-14"))).toBe("2026-10-14");
  });

  it("stores a date-only entry at local noon", async () => {
    expect((await storedDate("2026-10-14")).getHours()).toBe(12);
  });

  it("parses a full timestamp exactly as before", async () => {
    const iso = "2026-10-14T03:30:00.000Z";
    expect((await storedDate(iso)).toISOString()).toBe(iso);
  });
});
