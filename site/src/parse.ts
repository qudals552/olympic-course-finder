// 문장 검색: "퇴근 후 주 2회 초급 수영" 같은 문장을 검색 조건으로 바꿉니다.
// 외부 AI 없이 규칙(단어 사전)으로만 처리해 운영비가 들지 않고, 입력이 밖으로 나가지 않습니다.
import { type Query, type TimeBand, type Weekday, TIME_BANDS, WEEK } from "./filter";

export interface ParseResult {
  patch: Partial<Query>;
  /** 화면에 "이렇게 이해했습니다"로 보여 줄 항목 */
  understood: string[];
  /** 이해하지 못하고 남은 말 */
  rest: string;
}

const NUM: Record<string, number> = { 한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4, 다섯: 5, 여섯: 6, 일곱: 7 };
const toNum = (s: string) => (/^\d+$/.test(s) ? Number(s) : NUM[s] ?? NaN);

const CENTERS: [RegExp, string, string][] = [
  [/분당|성남|서현/, "분당올림픽스포츠센터", "분당"],
  [/일산|고양/, "일산올림픽스포츠센터", "일산"],
  [/올림픽\s*공원|올팍|송파|방이동?/, "올림픽공원스포츠센터", "올림픽공원"],
  [/올림픽\s*수영장|잠실/, "올림픽수영장", "올림픽수영장"],
];

const TARGETS: [RegExp, string][] = [
  [/유아|아기|미취학|[4-7]\s*살/, "유아"],
  [/(?:우리\s*)?(?:아이|애기?|아들|딸|어린이|초등|키즈)/, "어린이"],
  [/청소년|중학생|고등학생|중고생|학생/, "청소년"],
  [/어르신|실버|노인|부모님|할머니|할아버지|시니어|어머니|아버지|효도/, "실버"],
  [/여성|여자|엄마/, "여성"],
  [/직장인|직장|성인|어른|남자/, "성인"],
];

const LEVELS: [RegExp, number[], string][] = [
  [/왕\s*초보|생\s*초보|처음|입문|기초|못\s*하는|안\s*해\s*본/, [1], "입문·기초"],
  [/초보|초급/, [1, 2], "입문~초급"],
  [/중급/, [3], "중급"],
  [/상급|고급|잘\s*하는|연수/, [4], "상급"],
];

// 종목 별칭 → 검색어
const SPORT_ALIASES: [RegExp, string][] = [
  [/필라테스|필라/, "필라"],
  [/헬스|웨이트|근력/, "헬스"],
  [/피티|PT/i, "PT"],
  [/아쿠아로빅|아쿠아/, "아쿠아"],
  [/스케이트|스케이팅|피겨|스피드/, "스케이트"],
  [/트램폴린|점핑/, "트램폴린"],
  [/배드민턴|배드/, "배드민턴"],
];

function expandRange(a: Weekday, b: Weekday): Weekday[] {
  const i = WEEK.indexOf(a), j = WEEK.indexOf(b);
  return i <= j ? WEEK.slice(i, j + 1) : [];
}

export function parseSentence(input: string, sportWords: string[] = []): ParseResult {
  let s = ` ${input.trim()} `;
  const patch: Partial<Query> = {};
  const understood: string[] = [];
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    s = s.replace(g, (...args) => {
      fn(args.slice(0, -2) as unknown as RegExpMatchArray);
      return " ";
    });
  };

  // 1) 센터 (일산의 '일'이 요일로 읽히지 않도록 먼저)
  const centers: string[] = [];
  for (const [re, name, label] of CENTERS) take(re, () => {
    if (!centers.includes(name)) { centers.push(name); understood.push(`센터: ${label}`); }
  });
  if (centers.length) patch.centers = centers;

  // 2) 금액 ("10만원 이하", "월 8만원까지")
  take(/(?:한\s*달|월)?\s*(\d+(?:\.\d+)?)\s*만\s*원?\s*(?:이하|이내|까지|아래|미만|안쪽|정도)?/, (m) => {
    patch.maxPrice = Math.round(Number(m[1]) * 10000);
    understood.push(`수강료: ${m[1]}만원 이하`);
  });

  // 3) 주 N회
  take(/(?:주|일주일에?|1주에?)\s*(\d|한|두|세|네|다섯|여섯|일곱)\s*(?:회|번|일)/, (m) => {
    const n = toNum(m[1]);
    if (n >= 1 && n <= 7) { patch.perWeek = n; understood.push(`주 ${n}회 이하`); }
  });

  // 4) 요일
  const days = new Set<Weekday>();
  take(/평일|주중/, () => WEEK.slice(0, 5).forEach((d) => days.add(d)));
  take(/주말|토일/, () => { days.add("토"); days.add("일"); });
  take(/([월화수목금토일])\s*[~\-]\s*([월화수목금토일])(?:요일)?/, (m) =>
    expandRange(m[1] as Weekday, m[2] as Weekday).forEach((d) => days.add(d)));
  take(/([월화수목금토일])요일/, (m) => days.add(m[1] as Weekday));
  // "월수금", "화목", "월,수" 처럼 요일 글자만 2개 이상 이어진 경우
  take(/(?<![가-힣])([월화수목금토일](?:\s*[,·/]?\s*[월화수목금토일])+)(?![가-힣])/, (m) =>
    [...m[1].replace(/[\s,·/]/g, "")].forEach((d) => days.add(d as Weekday)));
  if (days.size) {
    patch.days = WEEK.filter((d) => days.has(d));
    understood.push(`요일: ${patch.days.join("·")}`);
  }

  // 5) 시간대
  const times = new Set<TimeBand>();
  let pm = false;
  take(/새벽|아침|출근\s*(?:전|하기\s*전)/, () => times.add("dawn"));
  take(/오전/, () => times.add("morning"));
  take(/점심|오후|낮/, () => { times.add("afternoon"); pm = true; });
  let worker = false;
  take(/퇴근\s*(?:후|뒤|하고)?|일\s*끝나고/, () => { times.add("evening"); pm = true; worker = true; });
  take(/저녁|밤|야간/, () => { times.add("evening"); pm = true; });
  take(/(\d{1,2})\s*시/, (m) => {
    let h = Number(m[1]);
    if ((pm || h <= 5) && h < 12) h += 12;
    const b = TIME_BANDS.find((x) => h * 60 >= x.from && h * 60 < x.to);
    if (b) times.add(b.id);
  });
  if (times.size) {
    patch.times = TIME_BANDS.filter((b) => times.has(b.id)).map((b) => b.id);
    understood.push(`시간: ${TIME_BANDS.filter((b) => times.has(b.id)).map((b) => b.label.split(" ")[0]).join("·")}`);
  }

  // 6) 개인 레슨
  take(/개인\s*레슨|1\s*:\s*1|일대일|개인\s*강습/, () => {
    patch.includePrivate = true;
    understood.push("개인레슨 포함");
  });

  // 7) 대상
  for (const [re, tag] of TARGETS) take(re, () => {
    if (!patch.target) { patch.target = tag; understood.push(`대상: ${tag}`); }
  });

  if (!patch.target && worker) { patch.target = "성인"; understood.push("대상: 성인"); }

  // 8) 수준
  for (const [re, ranks, label] of LEVELS) take(re, () => {
    if (!patch.levels) { patch.levels = ranks; understood.push(`수준: ${label}`); }
  });

  // 9) 종목 → 검색어
  const words: string[] = [];
  for (const [re, w] of SPORT_ALIASES) take(re, () => { if (!words.includes(w)) words.push(w); });
  const vocab = [...new Set(sportWords.filter((w) => w.length >= 2))].sort((a, b) => b.length - a.length);
  for (const w of vocab) {
    if (s.includes(w)) {
      s = s.split(w).join(" ");
      if (!words.some((x) => x.includes(w) || w.includes(x))) words.push(w);
    }
  }
  patch.text = words.join(" ");
  if (words.length) understood.push(`종목: ${words.join(", ")}`);

  // 남은 말에서 조사·흔한 말 지우기
  const rest = s
    .replace(/[.,!?~]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(에|에서|으로|로|을|를|이|가|은|는|도|만|랑|하고|있는|할|수|있는|싶어요?|싶다|배우고|배울|다닐|다니고|하고싶어요?|찾아\s*줘|찾아줘|알려줘|추천|해\s*줘|해줘|좀|강좌|수업|반|곳|데|거|것|원해요?|운동|정도|가능한|괜찮은|쯤|한|요|후|뒤|전)$/.test(w))
    .join(" ");
  return { patch, understood, rest };
}

/** 데이터에서 문장 검색용 종목 단어를 뽑습니다 */
export function sportVocabulary(sports: string[]): string[] {
  const out = new Set<string>();
  for (const sp of sports) {
    for (const part of sp.split(/[\s()·/&]+/)) {
      const w = part.replace(/단기속성|소수정예|특강|교실|\d.*$/g, "");
      if (w.length >= 2) out.add(w);
    }
  }
  return [...out];
}

/** 입력이 문장(조건어 포함)인지, 단순 강좌명 검색인지 */
export function looksLikeSentence(input: string): boolean {
  const r = parseSentence(input);
  return r.understood.some((u) => !u.startsWith("종목"));
}
