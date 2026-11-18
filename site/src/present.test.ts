import { describe, expect, it } from "vitest";
import { type Course, type Dataset, emptyQuery } from "./filter";
import { overlaps, perSession, prettyTarget, prettyTitle, queryTokens, relaxations, decodeShare, shareHash, shareText } from "./present";

const base: Course = {
  id: "x", center: "일산올림픽스포츠센터", category: "수영", sport: "수영", name: "18시 초급1", level: "초급", levelRank: 2,
  days: ["화", "목"], optDays: [], start: "18:00", end: "18:50", allDay: false, capacity: 30, targetRaw: "성인남여",
  targets: ["성인"], price: 60000, since: "2026-09", recent: true, flags: [], info: null, sameCount: 1,
};
const c = (p: Partial<Course>): Course => ({ ...base, ...p });

describe("prettyTitle", () => {
  it.each([
    ["18시 신기초(초보자.화목)(토.자유수영)", "신기초 (초보자)"],
    ["18시 초급1(배영.평영발차기.화목)(토.자유수영)", "초급1 (배영.평영발차기)"],
    ["11시 매트필라테스(월수금)", "매트필라테스"],
    ["(결원보충X) 21시 초급1 (보조풀1,2)", "초급1 (보조풀1,2)"],
    ["06:30 러닝크루 월", "러닝크루"],
    ["아티스틱 스위밍(기초)-평영이상가능자", "아티스틱 스위밍 (기초)-평영이상가능자"],
    ["헬스", "헬스"],
  ])("%s → %s", (input, out) => {
    expect(prettyTitle(input)).toBe(out);
  });
});

describe("queryTokens", () => {
  it("조건마다 토큰, 지우면 그 조건만 빠짐", () => {
    const q = { ...emptyQuery(), text: "수영", days: ["월", "화", "수", "목", "금"] as Course["days"], perWeek: 2, levels: [1, 2], target: "성인" };
    const t = queryTokens(q);
    expect(t.map((x) => x.label)).toEqual(["수영", "평일", "주 2회 이하", "입문~초급", "성인"]);
    expect(t[2].clear).toEqual({ perWeek: null });
  });
});

describe("relaxations", () => {
  const data = {
    courses: [c({ id: "a" }), c({ id: "b", days: ["월", "수", "금"] }), c({ id: "c", days: ["월", "화", "수", "목", "금"] })],
  } as Dataset;
  it("조건 하나를 풀었을 때 늘어나는 수", () => {
    const q = { ...emptyQuery(), perWeek: 2 };
    const r = relaxations(data, q, 1);
    expect(r.map((x) => [x.label, x.count])).toEqual([["주 3회까지 보기", 2], ["횟수 상관없이 보기", 3]]);
  });
});

describe("overlaps", () => {
  it("같은 요일·시간이 겹치면 찾음", () => {
    expect(overlaps([c({ id: "a" }), c({ id: "b", start: "18:30", end: "19:20" })])).toHaveLength(1);
    expect(overlaps([c({ id: "a" }), c({ id: "b", days: ["월"] })])).toHaveLength(0);
    expect(overlaps([c({ id: "a" }), c({ id: "b", start: "18:50", end: "19:40" })])).toHaveLength(0);
  });
});

describe("prettyTitle 추가 사례", () => {
  it.each([
    ["3쿠션 16-18 화목토", "3쿠션"],
    ["4.입문 패키지(입문3회+그룹8회)", "입문 패키지 (입문3회+그룹8회)"],
    ["20시 연수1 (오리발=화.금)", "연수1 (오리발=화.금)"],
    ["기구필라 13시(금)고민정", "기구필라 고민정"],
    ["12시 피겨 초급반(토)[19년~11년생]", "피겨 초급반 (19년~11년생)"],
    ["17시 소수정예(초등.개별진도.월수금)", "소수정예 (초등.개별진도)"],
  ])("%s → %s", (input, out) => {
    expect(prettyTitle(input)).toBe(out);
  });
});

describe("괄호 밖 시간·요일", () => {
  it.each([
    ["골프09시 화목", "골프"],
    ["골프10시 주5일", "골프"],
    ["자유스쿼시 06시(1년이상게임가능.화목토일)", "자유스쿼시 (1년이상게임가능)"],
    ["검도 1800-1930 (월화목금) 청소년", "검도 청소년"],
    ["실내 목 15:00-16:00 (7세)", "실내 (7세)"],
    ["당구 초급 11-13 월~토", "당구 초급"],
    ["헬스 2시간 이용권", "헬스 2시간 이용권"],
    ["오전 골프 월자유 [06~14시/16세이상(10년생)]", "오전 골프 월자유 (16세이상 (10년생))"],
  ])("%s → %s", (input, out) => expect(prettyTitle(input)).toBe(out));
});

describe("prettyTarget", () => {
  it.each([
    ["성인남여및청소년", "성인 남녀 · 청소년"],
    ["성인여성", "성인 여성"],
    ["청소년", "청소년"],
    ["어린이/성인", "어린이 · 성인"],
  ])("%s → %s", (input, out) => expect(prettyTarget(input)).toBe(out));
});

describe("perSession", () => {
  it("한 달 60,000원 주 2회 → 약 6,900원", () => expect(perSession(base)).toBe(6900));
  it("자유 이용은 계산하지 않음", () => expect(perSession(c({ allDay: true }))).toBeNull());
});

describe("메신저 공유", () => {
  const a = c({ id: "a-1", name: "바디슬림 (헬스등록필수)", days: ["화", "목"], start: "10:00", end: "10:50", price: 30000 });
  const b = c({ id: "b-2", name: "아쿠아워킹", days: ["목"], start: "10:30", end: "11:20", price: 45000, center: "올림픽수영장" });
  it("합계·겹침·링크가 들어간 글을 만든다", () => {
    const t = shareText([a, b], "https://example.com/#sv=a-1,b-2");
    expect(t).toContain("[올림픽 강좌 후보 2개]");
    expect(t).toContain("1) 바디슬림 (헬스등록필수)");
    expect(t).toContain("합계 한 달 75,000원 · 시간 겹침 1쌍");
    expect(t).toContain("⚠ 바디슬림 (헬스등록필수) ↔ 아쿠아워킹");
    expect(t.endsWith("https://example.com/#sv=a-1,b-2")).toBe(true);
  });
  it("겹침이 없으면 겹침 문구를 넣지 않는다", () => {
    const t = shareText([a], "");
    expect(t).not.toContain("겹침");
    expect(t).not.toContain("http");
  });
  it("공유 링크의 강좌 번호를 왕복한다", () => {
    expect(shareHash(["15110953-1013306", "x_1"])).toBe("sv=15110953-1013306,x_1");
    expect(decodeShare("#sv=15110953-1013306,x_1")).toEqual(["15110953-1013306", "x_1"]);
  });
  it("이상한 값·중복·너무 많은 값은 버린다", () => {
    expect(decodeShare("#sv=a-1,<script>,a-1,,b%20c")).toEqual(["a-1"]);
    expect(decodeShare("#k=수영")).toEqual([]);
    const many = Array.from({ length: 50 }, (_, i) => `id-${i}`).join(",");
    expect(decodeShare(`#sv=${many}`)).toHaveLength(30);
  });
});
