// 강좌 데이터 타입과 검색 조건 처리 (화면과 분리해 테스트할 수 있게 둠)

export type Weekday = "월" | "화" | "수" | "목" | "금" | "토" | "일";
export const WEEK: Weekday[] = ["월", "화", "수", "목", "금", "토", "일"];

export interface CourseInfo {
  center: string;
  sport: string;
  desc: string;
  link: string;
}

export interface Course {
  id: string;
  center: string;
  category: string;
  sport: string;
  name: string;
  level: string | null;
  levelRank: number | null;
  days: Weekday[];
  optDays: Weekday[];
  start: string | null;
  end: string | null;
  allDay: boolean;
  capacity: number | null;
  targetRaw: string;
  targets: string[];
  price: number | null;
  since: string | null;
  recent: boolean;
  flags: string[];
  info: number | null;
  sameCount: number;
}

export interface Dataset {
  source: string;
  recentFrom: string;
  count: number;
  spmLink: string;
  infos: CourseInfo[];
  courses: Course[];
}

export type TimeBand = "dawn" | "morning" | "afternoon" | "evening";
export const TIME_BANDS: { id: TimeBand; label: string; from: number; to: number }[] = [
  { id: "dawn", label: "새벽 (~9시)", from: 0, to: 9 * 60 },
  { id: "morning", label: "오전 (9~12시)", from: 9 * 60, to: 12 * 60 },
  { id: "afternoon", label: "오후 (12~18시)", from: 12 * 60, to: 18 * 60 },
  { id: "evening", label: "저녁 (18시~)", from: 18 * 60, to: 24 * 60 },
];

export const LEVELS: { rank: number; label: string }[] = [
  { rank: 1, label: "입문·기초" },
  { rank: 2, label: "초급" },
  { rank: 3, label: "중급" },
  { rank: 4, label: "상급" },
];

export const TARGETS = ["성인", "여성", "실버", "청소년", "어린이", "유아"] as const;

/** 센터마다 어린이 반을 '청소년'으로, 어르신이 듣는 반을 '성인'으로 등록하는 경우가 많아 함께 보여 줌 */
export const TARGET_ALSO: Record<string, string[]> = {
  어린이: ["어린이", "청소년"],
  청소년: ["청소년", "어린이"],
  실버: ["실버", "성인"],
};
const targetOk = (c: Course, t: string) => (TARGET_ALSO[t] ?? [t]).some((x) => c.targets.includes(x));

export type SortKey = "pick" | "time" | "price" | "center" | "saved";

export interface Query {
  text: string;
  centers: string[];
  categories: string[];
  /** 갈 수 있는 요일. 비어 있으면 요일 조건 없음. 강좌의 정규 요일이 모두 여기에 들어 있어야 함 */
  days: Weekday[];
  /** 이 요일에 수업이 있는 강좌만 (빠른 찾기 "오늘 저녁"용) */
  onDay: Weekday | null;
  /** 주 N회 이하. 정규 요일 수가 N 이하인 강좌만 */
  perWeek: number | null;
  times: TimeBand[];
  levels: number[];
  target: string;
  maxPrice: number | null;
  recentOnly: boolean;
  includePrivate: boolean;
  includePaused: boolean;
  sort: SortKey;
}

export const emptyQuery = (): Query => ({
  text: "",
  centers: [],
  categories: [],
  days: [],
  onDay: null,
  perWeek: null,
  times: [],
  levels: [],
  target: "",
  maxPrice: null,
  recentOnly: true,
  includePrivate: false,
  includePaused: false,
  sort: "pick",
});

export function toMinutes(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** 정원 1~2명은 개인·소수 레슨으로 봄 */
export const isPrivate = (c: Course) => c.capacity !== null && c.capacity <= 2;

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

export function matches(c: Course, q: Query): boolean {
  if (q.centers.length && !q.centers.includes(c.center)) return false;
  if (q.categories.length && !q.categories.includes(c.category)) return false;
  if (q.recentOnly && !c.recent) return false;
  if (!q.includePrivate && isPrivate(c)) return false;
  if (!q.includePaused && c.flags.includes("일시중지")) return false;
  if (q.target && !targetOk(c, q.target)) return false;
  if (q.maxPrice !== null && (c.price === null || c.price > q.maxPrice)) return false;
  if (q.levels.length && (c.levelRank === null || !q.levels.includes(c.levelRank))) return false;

  if (q.days.length) {
    if (!c.days.length || !c.days.every((d) => q.days.includes(d))) return false;
  }

  if (q.onDay && !c.days.includes(q.onDay) && !c.optDays.includes(q.onDay)) return false;
  if (q.perWeek !== null && !c.allDay && c.days.length > q.perWeek) return false;

  if (q.times.length) {
    const s = toMinutes(c.start);
    if (s === null || c.allDay) {
      // 자유이용(하루 종일) 강좌는 시간대 조건과 관계없이 보여 줌
      if (!c.allDay) return false;
    } else if (!q.times.some((id) => {
      const b = TIME_BANDS.find((x) => x.id === id)!;
      return s >= b.from && s < b.to;
    })) {
      return false;
    }
  }

  if (q.text.trim()) {
    const hay = norm(`${c.name} ${c.sport} ${c.category} ${c.center}`);
    const words = q.text.trim().split(/\s+/).map(norm);
    if (!words.every((w) => hay.includes(w))) return false;
  }
  return true;
}

/**
 * 추천순에서 뒤로 보낼 정도(작을수록 먼저). 처음 온 사람에게 대표 장면이 되기 어려운 강좌를 내린다:
 * 자유 이용(하루 종일), 이른 새벽·늦은 밤(10시 전·21시 이후 시작), 정원이 극단적(4명 이하·200명 이상).
 */
export function pickPenalty(c: Course, timesChosen = false): number {
  let n = 0;
  if (c.allDay) n += 2;
  const s = toMinutes(c.start);
  // 사용자가 시간대를 직접 골랐으면(오전·저녁 등) 그 시간대 강좌를 일부러 뒤로 밀지 않음
  if (!timesChosen && (s === null || s < 10 * 60 || s >= 21 * 60)) n += 1;
  if (c.capacity !== null && (c.capacity <= 4 || c.capacity >= 200)) n += 1;
  return n;
}

/** savedIds: 담은 강좌 아이디(담은 순서). 정렬이 "담은 강좌 먼저"일 때만 쓰며, 나중에 담은 것이 앞에 옴 */
export function search(data: Dataset, q: Query, savedIds: string[] = []): Course[] {
  const out = data.courses.filter((c) => matches(c, q));
  const t = (c: Course) => toMinutes(c.start) ?? 9999;
  const p = (c: Course) => c.price ?? Number.MAX_SAFE_INTEGER;
  // 고른 대상과 정확히 맞는 강좌를 먼저
  const exact = (c: Course) => (q.target && !c.targets.includes(q.target) ? 1 : 0);
  const rank = new Map(savedIds.map((id, i) => [id, i]));
  const sv = (c: Course) => -(rank.get(c.id) ?? -Infinity);
  out.sort((a, b) => {
    if (exact(a) !== exact(b)) return exact(a) - exact(b);
    if (q.sort === "saved") {
      return sv(a) - sv(b) || pickPenalty(a, q.times.length > 0) - pickPenalty(b, q.times.length > 0) || t(a) - t(b) || p(a) - p(b);
    }
    if (q.sort === "price") return p(a) - p(b) || t(a) - t(b);
    if (q.sort === "center") return a.center.localeCompare(b.center, "ko") || t(a) - t(b);
    if (q.sort === "pick") return pickPenalty(a, q.times.length > 0) - pickPenalty(b, q.times.length > 0) || t(a) - t(b) || p(a) - p(b);
    return t(a) - t(b) || p(a) - p(b);
  });
  return out;
}

/** 검색 조건을 주소(#...)에 담아 공유할 수 있게 함 */
export function encodeQuery(q: Query): string {
  const d = emptyQuery();
  const p = new URLSearchParams();
  if (q.text) p.set("q", q.text);
  if (q.centers.length) p.set("c", q.centers.join(","));
  if (q.categories.length) p.set("k", q.categories.join(","));
  if (q.days.length) p.set("d", q.days.join(""));
  if (q.onDay) p.set("o", q.onDay);
  if (q.perWeek !== null) p.set("w", String(q.perWeek));
  if (q.times.length) p.set("t", q.times.join(","));
  if (q.levels.length) p.set("l", q.levels.join(""));
  if (q.target) p.set("g", q.target);
  if (q.maxPrice !== null) p.set("p", String(q.maxPrice));
  if (q.recentOnly !== d.recentOnly) p.set("r", q.recentOnly ? "1" : "0");
  if (q.includePrivate) p.set("pv", "1");
  if (q.includePaused) p.set("ps", "1");
  if (q.sort !== d.sort) p.set("s", q.sort);
  return p.toString();
}

const QUERY_KEYS = ["q", "c", "k", "d", "o", "w", "t", "l", "g", "p", "r", "pv", "ps", "s", "sv"];

/**
 * 주소 해시가 검색 조건(#k=수영)인지, 화면 안 이동용 이름표(#results, #about 등)인지 가른다.
 * 빈 해시는 조건 없음으로 본다. 이름표를 조건으로 읽으면 고른 조건이 지워진다.
 */
export function isQueryHash(hash: string): boolean {
  const h = hash.replace(/^#/, "");
  if (!h) return true;
  return h.split("&").some((kv) => kv.includes("=") && QUERY_KEYS.includes(kv.split("=")[0]));
}

export function decodeQuery(s: string): Query {
  const q = emptyQuery();
  if (!isQueryHash(s)) return q;
  const p = new URLSearchParams(s.replace(/^#/, ""));
  const list = (k: string) => (p.get(k) ? p.get(k)!.split(",").filter(Boolean) : []);
  q.text = p.get("q") ?? "";
  q.centers = list("c");
  q.categories = list("k");
  q.days = [...(p.get("d") ?? "")].filter((x): x is Weekday => (WEEK as string[]).includes(x));
  const od = p.get("o");
  q.onDay = od && (WEEK as string[]).includes(od) ? (od as Weekday) : null;
  const w = Number(p.get("w"));
  q.perWeek = w >= 1 && w <= 7 ? w : null;
  q.times = list("t").filter((x): x is TimeBand => TIME_BANDS.some((b) => b.id === x));
  q.levels = [...(p.get("l") ?? "")].map(Number).filter((n) => n >= 1 && n <= 4);
  q.target = p.get("g") ?? "";
  const mp = Number(p.get("p"));
  q.maxPrice = p.get("p") && Number.isFinite(mp) ? mp : null;
  if (p.get("r")) q.recentOnly = p.get("r") === "1";
  q.includePrivate = p.get("pv") === "1";
  q.includePaused = p.get("ps") === "1";
  const s2 = p.get("s");
  if (s2 === "price" || s2 === "center" || s2 === "time" || s2 === "pick" || s2 === "saved") q.sort = s2;
  return q;
}
