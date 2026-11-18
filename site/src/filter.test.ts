import { describe, expect, it } from "vitest";
import { type Course, type Dataset, decodeQuery, emptyQuery, encodeQuery, isQueryHash, matches, pickPenalty, search } from "./filter";

const base: Course = {
  id: "x-1", center: "일산올림픽스포츠센터", category: "수영", sport: "수영", name: "19시 초급1(평영발차기.화목)",
  level: "초급", levelRank: 2, days: ["화", "목"], optDays: ["토"], start: "19:00", end: "19:50", allDay: false,
  capacity: 20, targetRaw: "성인남여및청소년", targets: ["성인", "청소년"], price: 60000, since: "2026-09",
  recent: true, flags: [], info: null, sameCount: 1,
};
const c = (p: Partial<Course>): Course => ({ ...base, ...p });

describe("matches", () => {
  it("요일: 강좌 요일이 모두 고른 요일 안에 있어야 함", () => {
    expect(matches(base, { ...emptyQuery(), days: ["화", "목", "금"] })).toBe(true);
    expect(matches(base, { ...emptyQuery(), days: ["화"] })).toBe(false);
  });
  it("주 N회 이하", () => {
    expect(matches(base, { ...emptyQuery(), perWeek: 2 })).toBe(true);
    expect(matches(base, { ...emptyQuery(), perWeek: 1 })).toBe(false);
  });
  it("괄호 선택 요일은 요일 조건에 쓰지 않음", () => {
    expect(matches(base, { ...emptyQuery(), days: ["화", "목"] })).toBe(true);
  });
  it("시간대", () => {
    expect(matches(base, { ...emptyQuery(), times: ["evening"] })).toBe(true);
    expect(matches(base, { ...emptyQuery(), times: ["morning"] })).toBe(false);
    expect(matches(c({ allDay: true, start: "06:00", end: "21:50" }), { ...emptyQuery(), times: ["morning"] })).toBe(true);
  });
  it("개인레슨·일시중지·최근 기본 제외", () => {
    expect(matches(c({ capacity: 1 }), emptyQuery())).toBe(false);
    expect(matches(c({ capacity: 1 }), { ...emptyQuery(), includePrivate: true })).toBe(true);
    expect(matches(c({ flags: ["일시중지"] }), emptyQuery())).toBe(false);
    expect(matches(c({ recent: false }), emptyQuery())).toBe(false);
  });
  it("수준·대상·금액", () => {
    expect(matches(base, { ...emptyQuery(), levels: [1, 2] })).toBe(true);
    expect(matches(c({ level: null, levelRank: null }), { ...emptyQuery(), levels: [2] })).toBe(false);
    expect(matches(base, { ...emptyQuery(), target: "어린이" })).toBe(true); // 청소년 반도 함께
    expect(matches(c({ targets: ["성인"] }), { ...emptyQuery(), target: "어린이" })).toBe(false);
    expect(matches(c({ targets: ["성인"] }), { ...emptyQuery(), target: "실버" })).toBe(true);
    expect(matches(base, { ...emptyQuery(), maxPrice: 50000 })).toBe(false);
    expect(matches(c({ price: null }), { ...emptyQuery(), maxPrice: 50000 })).toBe(false);
  });
  it("검색어는 공백을 무시하고 모든 단어를 포함해야 함", () => {
    expect(matches(base, { ...emptyQuery(), text: "초급 수영" })).toBe(true);
    expect(matches(base, { ...emptyQuery(), text: "평영 발차기" })).toBe(true);
    expect(matches(base, { ...emptyQuery(), text: "접영" })).toBe(false);
  });
});

describe("search 정렬", () => {
  const data = { courses: [c({ id: "a", start: "20:00", price: 50000 }), c({ id: "b", start: "07:00", price: 90000 })] } as Dataset;
  it("시간순과 가격순", () => {
    expect(search(data, { ...emptyQuery(), sort: "time" }).map((x) => x.id)).toEqual(["b", "a"]);
    expect(search(data, { ...emptyQuery(), sort: "price" }).map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("기본(추천순)은 이른 새벽·자유 이용·극단 정원을 뒤로 보냄", () => {
    const d = { courses: [
      c({ id: "dawn", start: "06:00" }),
      c({ id: "free", start: "09:00", allDay: true }),
      c({ id: "tiny", start: "11:00", capacity: 4 }),
      c({ id: "late", start: "21:00" }),
      c({ id: "b", start: "19:00" }),
      c({ id: "a", start: "10:00" }),
    ] } as Dataset;
    expect(emptyQuery().sort).toBe("pick");
    expect(search(d, emptyQuery()).map((x) => x.id)).toEqual(["a", "b", "dawn", "tiny", "late", "free"]);
  });
  it("시간대를 직접 고르면 그 시간대 강좌를 뒤로 밀지 않음", () => {
    const d = { courses: [c({ id: "nine", start: "09:00" }), c({ id: "ten", start: "10:00" })] } as Dataset;
    // 기본: 9시 시작은 감점 → 10시가 먼저
    expect(search(d, emptyQuery()).map((x) => x.id)).toEqual(["ten", "nine"]);
    // '오전'을 고르면 시간순 그대로 9시가 먼저
    expect(search(d, { ...emptyQuery(), times: ["morning"] }).map((x) => x.id)).toEqual(["nine", "ten"]);
  });
  it("pickPenalty 경계: 자유 이용 2점, 10시 정각·21시 직전은 0점, 정원 4명·200명은 1점", () => {
    expect(pickPenalty(c({ allDay: true, start: "10:00" }))).toBe(2);
    expect(pickPenalty(c({ start: "10:00" }))).toBe(0);
    expect(pickPenalty(c({ start: "20:59" }))).toBe(0);
    expect(pickPenalty(c({ start: "21:00" }))).toBe(1);
    expect(pickPenalty(c({ start: "12:00", capacity: 4 }))).toBe(1);
    expect(pickPenalty(c({ start: "12:00", capacity: 5 }))).toBe(0);
    expect(pickPenalty(c({ start: "12:00", capacity: 200 }))).toBe(1);
    expect(pickPenalty(c({ start: null }))).toBe(1);
  });
});

describe("주소 저장", () => {
  it("encode → decode 하면 같은 조건", () => {
    const q = { ...emptyQuery(), text: "수영", centers: ["올림픽수영장"], days: ["화", "목"] as const,
      times: ["evening" as const], levels: [1, 2], target: "성인", maxPrice: 100000, recentOnly: false,
      includePrivate: true, sort: "price" as const };
    expect(decodeQuery("#" + encodeQuery({ ...q, days: [...q.days] }))).toEqual({ ...q, days: [...q.days] });
  });
  it("빈 조건은 빈 문자열", () => {
    expect(encodeQuery(emptyQuery())).toBe("");
  });
  it("화면 안 이동 이름표(#centers, #results 등)는 조건으로 읽지 않음", () => {
    expect(isQueryHash("#centers")).toBe(false);
    expect(isQueryHash("#results")).toBe(false);
    expect(isQueryHash("#k=수영&w=2")).toBe(true);
    expect(isQueryHash("")).toBe(true);
    expect(isQueryHash("#")).toBe(true);
    // 이름표 해시가 들어와도 조건이 만들어지지 않음
    expect(encodeQuery(decodeQuery("#centers"))).toBe("");
  });
  it("시작 시간순은 주소에 남음", () => {
    expect(encodeQuery({ ...emptyQuery(), sort: "time" })).toBe("s=time");
    expect(decodeQuery("#s=time").sort).toBe("time");
  });
});
