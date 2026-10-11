import { describe, expect, it } from "vitest";
import {
  EPOCH,
  addDays,
  dayNumber,
  daysBetween,
  isPlayable,
  isValidDate,
  shortDate,
  utcToday,
  weekday,
} from "@/lib/engine/daily";
import { difficultyOf } from "@/lib/engine/difficulty";

describe("calendar helpers", () => {
  it("numbers days from the epoch", () => {
    expect(dayNumber(EPOCH)).toBe(1);
    expect(dayNumber("2026-10-11")).toBe(11);
    expect(dayNumber("2027-10-01")).toBe(366);
  });

  it("uses the UTC date whatever the local time zone says", () => {
    expect(utcToday(Date.UTC(2026, 9, 11, 23, 59, 59))).toBe("2026-10-11");
    expect(utcToday(Date.UTC(2026, 9, 12, 0, 0, 0))).toBe("2026-10-12");
    expect(utcToday(new Date("2026-10-11T20:30:00-06:00"))).toBe("2026-10-12");
  });

  it("adds days across month, year and leap-day boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-01", "2026-10-11")).toBe(10);
  });

  it("knows the weekday and formats a short date", () => {
    expect(weekday("2026-10-11")).toBe(0);
    expect(shortDate("2026-10-11")).toBe("Sun 11 Oct");
  });

  it("rejects malformed and impossible dates", () => {
    expect(isValidDate("2026-10-11")).toBe(true);
    expect(isValidDate("2026-02-31")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("11/10/2026")).toBe(false);
    expect(isValidDate("")).toBe(false);
  });

  it("only allows days from the epoch up to today", () => {
    expect(isPlayable("2026-10-05", "2026-10-11")).toBe(true);
    expect(isPlayable("2026-10-11", "2026-10-11")).toBe(true);
    expect(isPlayable("2026-10-12", "2026-10-11")).toBe(false);
    expect(isPlayable("2026-09-30", "2026-10-11")).toBe(false);
    expect(isPlayable("nonsense", "2026-10-11")).toBe(false);
  });
});

describe("difficulty scale", () => {
  it("labels by search effort on a log scale", () => {
    expect(difficultyOf(1)).toEqual({ label: "Easy", stars: 1, score: 0 });
    expect(difficultyOf(149).label).toBe("Easy");
    expect(difficultyOf(150).label).toBe("Medium");
    expect(difficultyOf(1499).label).toBe("Medium");
    expect(difficultyOf(1500).label).toBe("Hard");
    expect(difficultyOf(8000)).toEqual({ label: "Expert", stars: 4, score: 13 });
    expect(difficultyOf(30000).label).toBe("Brutal");
    expect(difficultyOf(1024).score).toBe(10);
  });
});
