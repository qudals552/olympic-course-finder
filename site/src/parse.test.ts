import { describe, expect, it } from "vitest";
import { looksLikeSentence, parseSentence, sportVocabulary } from "./parse";

const vocab = sportVocabulary(["수영", "수영단기속성", "필라테스", "기구필라테스(서킷 1:6)", "스케이트", "테니스", "배드민턴", "골프", "요가", "검도", "아쿠아로빅"]);

describe("예시 문장", () => {
  it("퇴근 후 주 2회 초급 수영", () => {
    const r = parseSentence("퇴근 후 주 2회 초급 수영", vocab);
    expect(r.patch).toMatchObject({ times: ["evening"], perWeek: 2, levels: [1, 2], text: "수영", target: "성인" });
    expect(r.rest).toBe("");
  });
  it("주말에 우리 아이 스케이트", () => {
    const r = parseSentence("주말에 우리 아이 스케이트 배우고 싶어요", vocab);
    expect(r.patch).toMatchObject({ days: ["토", "일"], target: "어린이", text: "스케이트" });
    expect(r.rest).toBe("");
  });
  it("분당 화목 오전 요가 8만원 이하", () => {
    const r = parseSentence("분당 화목 오전 요가 8만원 이하", vocab);
    expect(r.patch).toMatchObject({ centers: ["분당올림픽스포츠센터"], days: ["화", "목"], times: ["morning"], maxPrice: 80000, text: "요가" });
  });
  it("일산 평일 저녁 7시 필라테스 처음", () => {
    const r = parseSentence("일산 평일 저녁 7시 필라테스 처음", vocab);
    expect(r.patch).toMatchObject({ centers: ["일산올림픽스포츠센터"], days: ["월", "화", "수", "목", "금"], times: ["evening"], levels: [1], text: "필라" });
  });
  it("부모님 아쿠아로빅 월수금 오후", () => {
    const r = parseSentence("부모님 아쿠아로빅 월수금 오후", vocab);
    expect(r.patch).toMatchObject({ target: "실버", days: ["월", "수", "금"], times: ["afternoon"], text: "아쿠아" });
  });
  it("새벽 6시 수영 월~금", () => {
    const r = parseSentence("새벽 6시 수영 월~금", vocab);
    expect(r.patch).toMatchObject({ times: ["dawn"], days: ["월", "화", "수", "목", "금"], text: "수영" });
  });
  it("테니스 개인레슨 토요일", () => {
    const r = parseSentence("테니스 개인레슨 토요일", vocab);
    expect(r.patch).toMatchObject({ includePrivate: true, days: ["토"], text: "테니스" });
  });
});

describe("오해하기 쉬운 말", () => {
  it("'일산'의 '일'을 일요일로 읽지 않음", () => {
    expect(parseSentence("일산 수영", vocab).patch.days).toBeUndefined();
  });
  it("모르는 말은 rest로 남김", () => {
    expect(parseSentence("수영 주차 되는 곳", vocab).rest).toContain("주차");
  });
  it("강좌명만 쓰면 문장으로 보지 않음", () => {
    expect(looksLikeSentence("수영")).toBe(false);
    expect(looksLikeSentence("화목 저녁 수영")).toBe(true);
  });
});

import { recommend } from "./guide";
describe("수준 안내", () => {
  it("아무것도 못 하면 입문·기초", () => expect(recommend("swim", [])).toEqual([1]));
  it("가장 높은 기술 기준", () => expect(recommend("swim", ["float", "free", "breast"])).toEqual([3]));
  it("스케이트", () => expect(recommend("skate", ["stand", "glide"])).toEqual([2]));
});
