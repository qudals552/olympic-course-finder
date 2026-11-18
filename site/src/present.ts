// 화면에 보여 줄 값 만들기: 조건 토큰, 조건 완화 제안, 읽기 쉬운 강좌 이름, 담은 강좌의 시간 겹침
import { type Course, type Dataset, type Query, LEVELS, TIME_BANDS, WEEK, emptyQuery, search, toMinutes } from "./filter";

export const CENTER_SHORT: Record<string, string> = {
  올림픽수영장: "올림픽수영장",
  올림픽공원스포츠센터: "올림픽공원",
  분당올림픽스포츠센터: "분당",
  일산올림픽스포츠센터: "일산",
};

export function daysLabel(days: string[]): string {
  const s = WEEK.filter((d) => days.includes(d)).join("");
  if (s === "월화수목금") return "평일";
  if (s === "토일") return "주말";
  if (s === "월화수목금토일") return "매일";
  return WEEK.filter((d) => days.includes(d)).join("·");
}

export function levelsLabel(levels: number[]): string {
  const s = [...levels].sort().join("");
  if (s === "12") return "입문~초급";
  if (s === "34") return "중급~상급";
  return LEVELS.filter((l) => levels.includes(l.rank)).map((l) => l.label).join("·");
}

export const timesLabel = (times: string[]) =>
  TIME_BANDS.filter((b) => times.includes(b.id)).map((b) => b.label.split(" ")[0]).join("·");

export const priceLabel = (p: number) => `${(p / 10000).toLocaleString("ko-KR")}만원 이하`;

export interface Token {
  label: string;
  clear: Partial<Query>;
}

/** 지금 검색 조건을 지울 수 있는 토큰 목록으로 */
export function queryTokens(q: Query): Token[] {
  const t: Token[] = [];
  const words = q.text.trim().split(/\s+/).filter(Boolean);
  for (const w of words) t.push({ label: w, clear: { text: words.filter((x) => x !== w).join(" ") } });
  for (const c of q.categories) t.push({ label: c, clear: { categories: q.categories.filter((x) => x !== c) } });
  for (const c of q.centers) t.push({ label: CENTER_SHORT[c] ?? c, clear: { centers: q.centers.filter((x) => x !== c) } });
  if (q.days.length) t.push({ label: daysLabel(q.days), clear: { days: [] } });
  if (q.onDay) t.push({ label: `${q.onDay}요일 수업`, clear: { onDay: null } });
  if (q.times.length) t.push({ label: timesLabel(q.times), clear: { times: [] } });
  if (q.perWeek !== null) t.push({ label: `주 ${q.perWeek}회 이하`, clear: { perWeek: null } });
  if (q.levels.length) t.push({ label: levelsLabel(q.levels), clear: { levels: [] } });
  if (q.target) t.push({ label: q.target, clear: { target: "" } });
  if (q.maxPrice !== null) t.push({ label: priceLabel(q.maxPrice), clear: { maxPrice: null } });
  if (q.includePrivate) t.push({ label: "개인레슨 포함", clear: { includePrivate: false } });
  if (!q.recentOnly) t.push({ label: "오래된 강좌 포함", clear: { recentOnly: true } });
  if (q.includePaused) t.push({ label: "일시중지 포함", clear: { includePaused: false } });
  return t;
}

export interface Relaxation {
  label: string;
  patch: Partial<Query>;
  count: number;
}

/** 결과가 적을 때, 조건 하나를 풀면 몇 개가 되는지 */
export function relaxations(data: Dataset, q: Query, current: number, max = 2): Relaxation[] {
  const cands: { label: string; patch: Partial<Query>; when: boolean }[] = [
    { label: "주 3회까지 보기", patch: { perWeek: 3 }, when: q.perWeek !== null && q.perWeek < 3 },
    { label: "횟수 상관없이 보기", patch: { perWeek: null }, when: q.perWeek !== null },
    { label: "시간대 상관없이 보기", patch: { times: [] }, when: q.times.length > 0 },
    { label: "수준 상관없이 보기", patch: { levels: [] }, when: q.levels.length > 0 },
    { label: "요일 상관없이 보기", patch: { days: [] }, when: q.days.length > 0 },
    { label: "수강료 상관없이 보기", patch: { maxPrice: null }, when: q.maxPrice !== null },
    { label: "모든 센터 보기", patch: { centers: [] }, when: q.centers.length > 0 },
    { label: "오래된 강좌도 보기", patch: { recentOnly: false }, when: q.recentOnly },
  ];
  const out: Relaxation[] = [];
  for (const c of cands) {
    if (!c.when) continue;
    const count = search(data, { ...q, ...c.patch }).length;
    if (count > current && !out.some((o) => o.count === count)) out.push({ label: c.label, patch: c.patch, count });
    if (out.length >= max) break;
  }
  return out;
}

/** "18시 신기초(초보자.화목)(토.자유수영)" → "신기초 (초보자)" */
export function prettyTitle(name: string): string {
  let s = name
    .replace(/^\s*\((?:신설|결원보충X|\d+월신설)\)\s*/i, "")
    .replace(/^\s*\d{1,2}(?::\d{2}\s*|\s*시\s*)(?:\d{1,2}분\s*)?/, "")
    .replace(/^\s*\d{1,2}\.\s*/, "")
    .replace(/^[-o]\s*/, "");
  // 요일·자유수영·시간만 든 괄호 지우기 (대괄호는 소괄호로 바꿔 같은 규칙 적용)
  s = s.replace(/\[([^[\]]*)\]/g, "($1)");
  s = s.replace(/\(([^()]*)\)/g, (_m, inner: string) => {
    // '자유수영'의 '수'가 요일로 지워지지 않도록 단어부터 지움
    const left = inner
      .replace(/자유수영|자유|주말|평일|공휴일/g, "")
      .replace(/[월화수목금토일](?:요일)?/g, "")
      .replace(/\d{1,2}(:\d{2})?\s*[~-]\s*\d{1,2}(:\d{2})?/g, "")
      .replace(/[\s.,·~\-/☆]/g, "");
    if (!left) return " ";
    // 끝의 요일 덩어리(".화목", ".월~금")만 지움. "오리발=화.금"처럼 한 글자 요일은 둠
    const kept = inner.replace(/[.·,]\s*(?:[월화수목금토일]{2,7}|[월화수목금토일][~-][월화수목금토일])\s*$/, "").trim();
    return kept ? ` (${kept}) ` : " ";
  });
  // 괄호 밖의 시간·요일 표기도 지움 (카드에 시간과 요일을 따로 크게 보여 주므로)
  s = s
    .replace(/\d{1,2}\s*[~-]\s*\d{1,2}\s*시/g, " ")
    .replace(/\d{1,2}:\d{2}\s*[~-]\s*\d{1,2}:\d{2}/g, " ")
    .replace(/(?<!\d)\d{4}\s*-\s*\d{4}(?!\d)/g, " ")
    .replace(/(?<![\d.])\d{1,2}\s*[~-]\s*\d{1,2}(?=\s|$)/g, " ")
    .replace(/(?<!\d)\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?(?!간)/g, " ")
    .replace(/(?:^|\s)(?:주\s*\d\s*일|[월화수목금토일]{1,7}(?:[~-][월화수목금토일])?)(?=\s|$)/g, " ");
  s = s.replace(/\s{2,}/g, " ").replace(/\(\s*[/,.·]\s*/g, "(").replace(/\s+([)\]])/g, "$1").replace(/\(\s*\)/g, "").replace(/\)\s+-/g, ")-").trim();
  return s || name.trim();
}

/** "성인남여및청소년" → "성인 남녀 · 청소년" */
export function prettyTarget(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/남여/g, "남녀")
    .split(/및|\//)
    .map((p) => p.trim().replace(/^성인(?=\S)/, "성인 "))
    .filter(Boolean)
    .join(" · ");
}

export function durationMin(c: Course): number | null {
  const a = toMinutes(c.start), b = toMinutes(c.end);
  return a !== null && b !== null && b > a ? b - a : null;
}

/** 담은 강좌끼리 같은 요일·같은 시간에 겹치는 쌍 */
export function overlaps(courses: Course[]): [Course, Course][] {
  const out: [Course, Course][] = [];
  for (let i = 0; i < courses.length; i++) {
    for (let j = i + 1; j < courses.length; j++) {
      const a = courses[i], b = courses[j];
      if (a.allDay || b.allDay) continue;
      const as = toMinutes(a.start), ae = toMinutes(a.end), bs = toMinutes(b.start), be = toMinutes(b.end);
      if (as === null || ae === null || bs === null || be === null) continue;
      if (a.days.some((d) => b.days.includes(d)) && as < be && bs < ae) out.push([a, b]);
    }
  }
  return out;
}

export const isEmptyQuery = (q: Query) => queryTokens(q).length === 0 && JSON.stringify({ ...q, sort: emptyQuery().sort }) === JSON.stringify(emptyQuery());

/** 1회당 대략 가격: 한 달 수강료 ÷ (주 횟수 × 4.3주), 100원 단위 */
export function perSession(c: Course): number | null {
  if (c.price === null || c.allDay || !c.days.length) return null;
  return Math.round(c.price / (c.days.length * 4.345) / 100) * 100;
}


/** 담은 강좌를 메신저에 붙여 넣기 좋은 글로 만든다 (합계, 시간 겹침, 공유 링크 포함) */
export function shareText(courses: Course[], link = ""): string {
  const won = (n: number) => n.toLocaleString("ko-KR");
  const ov = overlaps(courses);
  const total = courses.reduce((s, c) => s + (c.price ?? 0), 0);
  const lines = [`[올림픽 강좌 후보 ${courses.length}개]`];
  courses.forEach((c, i) => {
    const when = `${daysLabel(c.days) || "요일 정보 없음"} ${c.start ?? ""}${c.end ? `~${c.end}` : ""}`.trim();
    const price = c.price !== null ? `한 달 ${won(c.price)}원` : "금액 정보 없음";
    lines.push(`${i + 1}) ${prettyTitle(c.name)}`, `   ${CENTER_SHORT[c.center] ?? c.center} · ${when} · ${price}`);
  });
  lines.push("", `합계 한 달 ${won(total)}원${ov.length ? ` · 시간 겹침 ${ov.length}쌍` : ""}`);
  for (const [a, b] of ov.slice(0, 3)) lines.push(`⚠ ${prettyTitle(a.name)} ↔ ${prettyTitle(b.name)}`);
  lines.push("※ 남은 자리와 신청은 공식 페이지에서 확인하세요.");
  if (link) lines.push(link);
  return lines.join("\n");
}

/** 공유 링크의 해시(#sv=…)에 강좌 번호를 담고 꺼낸다. 이상한 값은 버린다 */
export const SHARE_KEY = "sv";
const SHARE_MAX = 30;
export function shareHash(ids: string[]): string {
  return `${SHARE_KEY}=${ids.slice(0, SHARE_MAX).map(encodeURIComponent).join(",")}`;
}
export function decodeShare(hash: string): string[] {
  const v = new URLSearchParams(hash.replace(/^#/, "")).get(SHARE_KEY);
  if (!v) return [];
  return [...new Set(v.split(",").filter((x) => /^[0-9A-Za-z_-]{1,40}$/.test(x)))].slice(0, SHARE_MAX);
}
