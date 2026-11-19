import "./style.css";
import {
  type Course,
  type Dataset,
  type Query,
  LEVELS,
  TARGETS,
  TIME_BANDS,
  WEEK,
  type Weekday,
  decodeQuery,
  emptyQuery,
  encodeQuery,
  isQueryHash,
  search,
  toMinutes,
} from "./filter";
import { GUIDE_SPORTS, type GuideSport, LEVEL_LABEL, guideSport, recommend } from "./guide";
import { ICON, sportIcon } from "./icons";
import { type Scene, pickScene, SCENES } from "./scene";
import { looksLikeSentence, parseSentence, sportVocabulary } from "./parse";
import {
  CENTER_SHORT,
  daysLabel,
  decodeShare,
  durationMin,
  levelsLabel,
  overlaps,
  perSession,
  prettyTarget,
  prettyTitle,
  priceLabel,
  queryTokens,
  relaxations,
  shareHash,
  shareText,
  timesLabel,
} from "./present";

const PAGE = 24; // 한 번에 보이는 카드 수. 휴대폰에서 페이지가 끝없이 길어지지 않게 줄임
const EXAMPLES = ["퇴근 후 주 2회 초급 수영", "주말에 우리 아이 스케이트", "분당 화목 오전 요가 8만원 이하", "부모님 아쿠아로빅 월수금 오후", "새벽 6시 수영 월~금", "일산 저녁 배드민턴"];
const PRICE_STEPS = [50000, 80000, 100000, 150000, 200000];
const SAVE_KEY = "olympic-course-finder.saved";
const SCENE_KEY = "olympic-course-finder.scene";
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- 작은 도우미 ----------
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string | null | false)[]) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const k of kids) if (k !== null && k !== false) e.append(k);
  return e;
}
const svg = (html: string) => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild as SVGElement;
};
const won = (n: number | null) => (n === null ? "-" : n.toLocaleString("ko-KR"));
const toggle = <T>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
const todayKo = (): Weekday => WEEK[(new Date().getDay() + 6) % 7];

// ---------- 상태 ----------
let data: Dataset;
let byId = new Map<string, Course>();
let vocab: string[] = [];
let query: Query = decodeQuery(location.hash);
let shown = PAGE;
let view: "cards" | "table" = "cards";
let openPill: string | null = null;
let skipAnim = false; // '더 보기'로 이어 붙일 때는 카드가 다시 나타나는 효과를 생략
let lastNote = "";
let saved: string[] = loadSaved();
let savedOnce = false;

function loadSaved(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function storeSaved() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
  } catch {
    /* 저장이 막힌 브라우저에서는 이번 방문 동안만 기억 */
  }
}
const savedCourses = () => saved.map((id) => byId.get(id)).filter((c): c is Course => !!c);
const find = (q: Query) => search(data, q, saved);
const infoOf = (c: Course) => (c.info !== null ? data.infos[c.info] : null);
const linkOf = (c: Course) => infoOf(c)?.link ?? data.spmLink;

// ---------- 검색 ----------
function update(patch: Partial<Query>, opts: { keepNote?: boolean; push?: boolean } = {}) {
  query = { ...query, ...patch };
  shown = PAGE;
  if (!opts.keepNote) lastNote = "";
  const h = encodeQuery(query);
  const url = h ? `#${h}` : location.pathname + location.search;
  // 센터·종목 카드처럼 사용자가 크게 고른 것은 기록에 남겨 '뒤로 가기'로 이전 화면에 돌아오게 함
  if (opts.push) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
  render();
}

function mergeWords(...parts: string[]) {
  return [...new Set(parts.join(" ").split(/\s+/).filter(Boolean))].join(" ");
}

function submitText(raw: string) {
  const text = raw.trim();
  if (!text) return;
  $<HTMLInputElement>("#q").value = "";
  if (looksLikeSentence(text)) {
    const r = parseSentence(text, vocab);
    lastNote = `“${text}”을(를) 조건으로 바꿨어요. 틀린 조건은 ×로 지우면 바로 다시 찾아요.` +
      (r.rest ? ` 이해하지 못한 말 “${r.rest}”은 빼고 찾았어요.` : "");
    update({ ...r.patch, text: mergeWords(query.text, r.patch.text ?? "") }, { keepNote: true });
  } else {
    lastNote = `“${text}”이(가) 들어간 강좌를 찾았어요.`;
    update({ text: mergeWords(query.text, text) }, { keepNote: true });
  }
  revealResults();
}

/** 먼 거리(화면 2장 넘게)는 부드럽게 가면 오래 걸리고 중간에 멈춘 듯 보여서 바로 이동 */
function scrollToY(top: number) {
  const y = Math.max(0, top);
  const far = Math.abs(y - scrollY) > innerHeight * 2;
  scrollTo({ top: y, behavior: reduceMotion() || far ? "auto" : "smooth" });
}

/** 조건을 바꾼 뒤 결과가 눈에 들어오게: 폭과 관계없이 결과 제목 위치로 옮기고, 바뀐 줄을 잠깐 강조 */
function revealResults(message?: string) {
  // 화면 구성이 바뀐(센터 블록이 접힘 등) 뒤에 위치를 계산해야 어긋나지 않음. 탭이 가려져도 멈추지 않게 타이머를 씀
  // 열려 있던 필터 창이 결과 위에 남지 않게 닫음(포커스는 결과 제목으로 옮기므로 알약으로 돌려보내지 않음)
  if (openPill) { openPill = null; renderPills(); renderPopover(); }
  setTimeout(() => {
    const bar = $(".filter-bar").getBoundingClientRect().height;
    const resultsTop = $("#results").getBoundingClientRect().top;
    const target = resultsTop + scrollY - bar - 8;
    const phone = matchMedia("(max-width: 760px)").matches;
    // 넓은 화면에서 검색창 바로 아래에 이미 결과가 보이면 굳이 움직이지 않음. 휴대폰은 항상 결과 제목을 위쪽에 맞춤
    const alreadyVisible = !phone && resultsTop > bar && resultsTop < innerHeight * 0.55;
    if (!alreadyVisible && Math.abs(target - scrollY) > 24) scrollToY(target);
    const count = $("#count");
    count.focus({ preventScroll: true });
    count.classList.remove("flash");
    void count.offsetWidth;
    count.classList.add("flash");
    if (message) toast(message);
  }, 30);
}

/** "올림픽수영장 강좌 256개를 보여 드려요"처럼 방금 한 선택의 결과를 알려 줌 */
const shownMessage = (label: string) => `${label} 강좌 ${find(query).length.toLocaleString("ko-KR")}개를 보여 드려요`;

// ---------- 그리기 ----------
function render() {
  renderSearch();
  renderQuick();
  renderPills();
  renderPopover();
  renderResults();
  renderTray();
}

function renderSearch() {
  const tokens = queryTokens(query);
  $("#tokens").replaceChildren(
    ...tokens.map((t) => {
      const b = el("button", { type: "button", "aria-label": `${t.label} 조건 지우기` });
      b.append(svg(ICON.x));
      b.addEventListener("click", () => {
        update(t.clear);
        $<HTMLInputElement>("#q").focus();
      });
      return el("span", { class: "token" }, t.label, b);
    }),
  );
  const has = tokens.length > 0;
  $("#search").classList.toggle("compact", has);
  $("#examples").hidden = has;
  $("#reset").hidden = !has;
  $("#submit").textContent = has ? "더하기" : "찾기";
  $<HTMLInputElement>("#q").placeholder = has ? "더 적어 주세요. 예: 일산, 8만원 이하" : `예: ${EXAMPLES[placeholderIdx]}`;
  $("#search-note").textContent = lastNote || (has ? "틀린 조건은 ×로 지우면 바로 다시 찾아요." : "요일, 시간, 수준, 종목을 한 문장으로 적어 주세요. 입력한 말은 이 기기 밖으로 나가지 않아요.");
}

// 빈 검색창의 예시 문장을 몇 초마다 바꿔 보여 줌
let placeholderIdx = 0;
function rotatePlaceholder() {
  if (reduceMotion()) return;
  setInterval(() => {
    const input = $<HTMLInputElement>("#q");
    if (queryTokens(query).length || input.value || document.activeElement === input) return;
    placeholderIdx = (placeholderIdx + 1) % EXAMPLES.length;
    input.placeholder = `예: ${EXAMPLES[placeholderIdx]}`;
  }, 3200);
}

interface Quick { label: string; icon: string; patch: Partial<Query>; on: () => boolean }
function quickList(): Quick[] {
  const today = todayKo();
  return [
    { label: `오늘(${today}) 저녁`, icon: ICON.moon, patch: { onDay: today, times: ["evening"] }, on: () => query.onDay === today && query.times.join() === "evening" },
    { label: "출근 전 새벽", icon: ICON.sunrise, patch: { times: ["dawn"] }, on: () => query.times.join() === "dawn" },
    { label: "이번 주말", icon: ICON.sun, patch: { days: ["토", "일"] }, on: () => daysLabel(query.days) === "주말" },
    { label: "아이와 함께", icon: ICON.kid, patch: { target: "어린이" }, on: () => query.target === "어린이" },
    { label: "한 달 8만원 이하", icon: ICON.won, patch: { maxPrice: 80000 }, on: () => query.maxPrice === 80000 },
  ];
}
function renderQuick() {
  $("#quick").replaceChildren(
    el("span", { class: "quick-label" }, "빠른 찾기"),
    ...quickList().map((q) => {
      const on = q.on();
      const b = el("button", { type: "button", class: `quick${on ? " on" : ""}`, "aria-pressed": String(on) });
      b.append(svg(q.icon), q.label);
      b.addEventListener("click", () => {
        if (on) {
          const clear: Partial<Query> = {};
          for (const k of Object.keys(q.patch) as (keyof Query)[]) (clear as Record<string, unknown>)[k] = emptyQuery()[k];
          update(clear);
        } else {
          update(q.patch);
          revealResults();
        }
      });
      return b;
    }),
  );
}

interface PillDef {
  id: string;
  title: string;
  value: () => string;
  on: () => boolean;
  body: () => Node[];
}

function chip(label: string | Node, pressed: boolean, onClick: () => void, count?: number) {
  const b = el("button", { type: "button", class: `chip${count === 0 && !pressed ? " zero" : ""}`, "aria-pressed": String(pressed) }, label);
  if (count !== undefined) b.append(el("span", { class: "n" }, count.toLocaleString("ko-KR")));
  b.addEventListener("click", onClick);
  return b;
}

function counts(f: (c: Course) => string) {
  const base = find({ ...query, centers: [], categories: [] });
  const m = new Map<string, number>();
  for (const c of base) m.set(f(c), (m.get(f(c)) ?? 0) + 1);
  return m;
}

const PILLS: PillDef[] = [
  {
    id: "days", title: "요일", value: () => daysLabel(query.days), on: () => query.days.length > 0,
    body: () => {
      const grid = el("div", { class: "day-grid" }, ...WEEK.map((d) => chip(d, query.days.includes(d), () => update({ days: toggle(query.days, d) }))));
      const quick = el("div", { class: "chips quick-days" },
        ...([["평일", ["월", "화", "수", "목", "금"]], ["주말", ["토", "일"]], ["월수금", ["월", "수", "금"]], ["화목", ["화", "목"]]] as [string, Weekday[]][])
          .map(([l, ds]) => chip(l, daysLabel(query.days) === daysLabel(ds), () => update({ days: ds }))));
      return [el("h3", {}, "갈 수 있는 요일"), grid, quick, el("p", { class: "hint" }, "고른 요일 안에서만 수업하는 강좌를 보여 줘요. 점선 요일(자유수영 등)은 빼고 셉니다.")];
    },
  },
  {
    id: "times", title: "시간", value: () => timesLabel(query.times), on: () => query.times.length > 0,
    body: () => [el("h3", {}, "시작 시간"), el("div", { class: "chips" }, ...TIME_BANDS.map((b) => chip(b.label, query.times.includes(b.id), () => update({ times: toggle(query.times, b.id) }))))],
  },
  {
    id: "level", title: "수준", value: () => levelsLabel(query.levels), on: () => query.levels.length > 0,
    body: () => {
      const btn = el("button", { type: "button", class: "text-btn" }, "내 수준을 모르겠어요");
      btn.addEventListener("click", () => openGuide());
      return [el("h3", {}, "수준"), el("div", { class: "chips" }, ...LEVELS.map((l) => chip(l.label, query.levels.includes(l.rank), () => update({ levels: toggle(query.levels, l.rank) })))),
        el("p", { class: "hint" }, "강좌명에 수준이 적힌 강좌만 걸러져요."), btn];
    },
  },
  {
    id: "week", title: "횟수", value: () => (query.perWeek !== null ? `주 ${query.perWeek}회 이하` : ""), on: () => query.perWeek !== null,
    body: () => [el("h3", {}, "일주일에 몇 번까지"), el("div", { class: "chips" }, ...[1, 2, 3, 5].map((n) => chip(`주 ${n}회 이하`, query.perWeek === n, () => update({ perWeek: query.perWeek === n ? null : n }))))],
  },
  {
    id: "sport", title: "종목", value: () => query.categories.join("·"), on: () => query.categories.length > 0,
    body: () => {
      const m = counts((c) => c.category);
      return [el("h3", {}, "종목"), el("div", { class: "chips" }, ...[...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => {
        const label = el("span", { class: "chip-ico" }, svg(sportIcon(k, 16)), k);
        return chip(label, query.categories.includes(k), () => update({ categories: toggle(query.categories, k) }), n);
      }))];
    },
  },
  {
    id: "center", title: "센터", value: () => query.centers.map((c) => CENTER_SHORT[c] ?? c).join("·"), on: () => query.centers.length > 0,
    body: () => {
      const m = counts((c) => c.center);
      return [el("h3", {}, "센터"), el("div", { class: "chips" }, ...Object.keys(CENTER_SHORT).map((c) => chip(CENTER_SHORT[c], query.centers.includes(c), () => update({ centers: toggle(query.centers, c) }), m.get(c) ?? 0)))];
    },
  },
  {
    id: "target", title: "대상", value: () => query.target, on: () => !!query.target,
    body: () => [el("h3", {}, "누가 다니나요"), el("div", { class: "chips" }, ...TARGETS.map((t) => chip(t, query.target === t, () => update({ target: query.target === t ? "" : t })))),
      el("p", { class: "hint" }, "어린이는 '청소년'반, 실버는 '성인'반도 함께 보여 주고, 정확히 맞는 반을 먼저 보여 줘요.")],
  },
  {
    id: "price", title: "수강료", value: () => (query.maxPrice !== null ? priceLabel(query.maxPrice) : ""), on: () => query.maxPrice !== null,
    body: () => [el("h3", {}, "한 달 수강료"), el("div", { class: "chips" }, ...PRICE_STEPS.map((p) => chip(priceLabel(p), query.maxPrice === p, () => update({ maxPrice: query.maxPrice === p ? null : p }))))],
  },
  {
    id: "more", title: "함께 보기", value: () => "", on: () => !query.recentOnly || query.includePrivate || query.includePaused,
    body: () => {
      const check = (label: string, on: boolean, set: (v: boolean) => void) => {
        const i = el("input", { type: "checkbox" }) as HTMLInputElement;
        i.checked = on;
        i.addEventListener("change", () => set(i.checked));
        return el("label", { class: "check" }, i, label);
      };
      return [
        el("h3", {}, "함께 보기"),
        check(`오래된 강좌도 보기 (${data.recentFrom.replace("-", ".")} 이전 등록)`, !query.recentOnly, (v) => update({ recentOnly: !v })),
        check("개인·2인 레슨도 보기", query.includePrivate, (v) => update({ includePrivate: v })),
        check("일시중지 강좌도 보기", query.includePaused, (v) => update({ includePaused: v })),
      ];
    },
  },
];

/** 자주 쓰는 4개는 바로 보이고, 나머지는 '필터 더 보기' 한 곳에 모음(알약이 너무 많아 헷갈리지 않게) */
const MAIN_IDS = ["sport", "center", "days", "times"];
const MORE_IDS = ["level", "week", "target", "price", "more"];
const PILL_ORDER = ["filters", ...MAIN_IDS]; // 필터 버튼을 맨 앞에 둬서 휴대폰에서 옆으로 밀려 가려지지 않게
const pillById = (id: string) => PILLS.find((p) => p.id === id)!;
const moreCount = () => MORE_IDS.filter((id) => pillById(id).on()).length;

function renderPills() {
  $("#pills").replaceChildren(
    ...PILL_ORDER.map((id) => {
      const isMore = id === "filters";
      const p = isMore ? null : pillById(id);
      const n = isMore ? moreCount() : 0;
      const on = isMore ? n > 0 : p!.on();
      const b = el("button", { type: "button", class: `pill${on ? " on" : ""}${isMore ? " pill-more" : ""}`, "aria-expanded": String(openPill === id), "aria-controls": "popover" });
      if (isMore) b.append(svg(ICON.filter));
      else if (on) b.append(svg(ICON.check));
      const v = isMore ? (n ? String(n) : "") : p!.value();
      const title = isMore ? "필터" : p!.title;
      b.append(v ? `${title} · ${v}` : title, svg(ICON.down));
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        openPill = openPill === id ? null : id;
        renderPills();
        renderPopover();
        if (openPill) $("#popover").querySelector<HTMLElement>("button, input")?.focus();
      });
      return b;
    }),
  );
}

function renderPopover() {
  const pop = $("#popover");
  const isMore = openPill === "filters";
  const p = isMore ? null : PILLS.find((x) => x.id === openPill);
  const open = isMore || !!p;
  pop.hidden = !open;
  $("#pop-backdrop").hidden = !open;
  document.body.classList.toggle("pop-open", open);
  if (!open) return pop.replaceChildren();
  const top = pop.scrollTop; // 칩을 눌러 다시 그려도 보던 자리를 유지
  const done = el("button", { type: "button", class: "btn-dark" }, `강좌 ${find(query).length.toLocaleString("ko-KR")}개 보기`);
  done.addEventListener("click", () => { closePopover(); revealResults(); });
  const body = isMore ? MORE_IDS.map((id) => el("section", { class: "pop-sec" }, ...pillById(id).body())) : p!.body();
  pop.replaceChildren(...body, el("div", { class: "popover-actions" }, done));
  pop.setAttribute("aria-label", `${isMore ? "필터 더 보기" : p!.title} 고르기`);
  pop.scrollTop = top;
}

function closePopover() {
  if (!openPill) return;
  const id = openPill;
  openPill = null;
  renderPills();
  renderPopover();
  ($("#pills").children[PILL_ORDER.indexOf(id)] as HTMLElement | undefined)?.focus();
}

// ---------- 카드 ----------
const CAT_KEYS: Record<string, string> = { 수영: "swim", 아쿠아: "aqua", 스케이트: "skate", "필라테스·요가": "yoga", "헬스·PT": "gym", "댄스·에어로빅": "dance", 라켓: "racket", "골프·당구": "golf", 구기: "ball", "자전거·걷기": "bike", 무도: "martial" };
const catKey = (c: string) => CAT_KEYS[c] ?? "etc";

function dayChips(c: Course) {
  return el("div", { class: "days", role: "img", "aria-label": `수업 요일 ${c.days.join(", ") || "정보 없음"}${c.optDays.length ? `, 선택 이용 ${c.optDays.join(", ")}` : ""}` },
    ...WEEK.map((d) => el("span", { class: `day${c.days.includes(d) ? " on" : c.optDays.includes(d) ? " opt" : ""}`, "aria-hidden": "true" }, d)));
}

function heartButton(c: Course, title: string) {
  const isSaved = saved.includes(c.id);
  const heart = el("button", { type: "button", class: "heart", "aria-pressed": String(isSaved), "aria-label": `${title} 담기` });
  heart.append(svg(ICON.heart));
  heart.addEventListener("click", () => toggleSave(c.id, heart, title));
  return heart;
}

function card(c: Course) {
  const isSaved = saved.includes(c.id);
  const title = prettyTitle(c.name);
  const min = durationMin(c);
  const ico = el("span", { class: `sport-badge cat-${catKey(c.category)}`, title: c.category }, svg(sportIcon(c.category, 22)));
  const where = el("p", { class: "where" }, el("span", { class: "cat" }, c.category), el("span", { class: "ctr", title: c.center }, CENTER_SHORT[c.center] ?? c.center));
  const when = el("p", { class: "when" },
    el("span", { class: "t num" }, c.start ?? "--:--"),
    el("span", { class: "d" }, c.allDay ? `${c.start}~${c.end} 자유 이용` : min ? `${min}분 수업` : ""));

  const h3 = el("h3", {}, title);
  // 이름에 이미 수준 말이 있으면("탁구 중급") 알약을 또 붙이지 않음
  if (c.level && !title.includes(c.level)) h3.append(" ", el("span", { class: `lv lv${c.levelRank}` }, c.level));
  for (const f of c.flags) h3.append(el("span", { class: "flag" }, f));
  const head = el("div", {}, h3);
  if (title !== c.name.trim()) head.append(el("p", { class: "orig", title: c.name }, `원래 이름: ${c.name}`));

  const facts = el("dl", { class: "facts" },
    el("dt", {}, "대상"), el("dd", {}, prettyTarget(c.targetRaw) || c.targets.join(" · ") || "-"),
    el("dt", {}, "정원"), el("dd", {}, c.capacity !== null ? `${c.capacity}명` : "-"));

  const info = infoOf(c);
  const link = el("a", { class: "link-btn", href: linkOf(c), target: "_blank", rel: "noopener" }, "종목 공식 페이지");
  link.append(svg(ICON.out));
  const per = perSession(c);
  const price = el("div", { class: "price" },
    el("p", {}, el("span", { class: "k" }, "한 달 "), el("span", { class: "v num" }, won(c.price)), c.price !== null ? "원" : ""),
    per ? el("p", { class: "per" }, `1회 약 ${won(per)}원`) : null);

  const top = el("div", { class: "card-top" }, el("div", { class: "card-id" }, ico, el("div", {}, where, when)), heartButton(c, title));
  const li = el("li", { class: `card${isSaved ? " saved" : ""}`, id: `c-${c.id}`, tabindex: "-1" }, top, dayChips(c), head, facts);
  const tools = el("div", { class: "card-tools" });
  if (info?.desc) {
    const more = el("button", { type: "button", class: "info-btn", "aria-label": `${info.sport} 소개 보기, ${title}` });
    more.append(svg(ICON.info), `${info.sport} 소개`);
    more.addEventListener("click", () => openInfo(c));
    tools.append(more);
  }
  // 공식 신청 화면에서 같은 강좌를 찾을 때 붙여 넣을 수 있게 원래 이름을 복사
  const copy = el("button", { type: "button", class: "info-btn copy-btn", "aria-label": `${title} 원래 이름 복사` });
  copy.append(svg(ICON.copy), "이름 복사");
  copy.addEventListener("click", async () => {
    const ok = await copyText(c.name);
    toast(ok ? `복사했어요: ${c.name}. 공식 신청 화면 검색창에 붙여 넣어 보세요.` : "복사가 막혀 있어요. 강좌 이름을 길게 눌러 복사해 주세요.");
  });
  tools.append(copy);
  li.append(tools);
  li.append(el("div", { class: "card-foot" }, price, link));
  return li;
}

/** 클립보드로 복사. 막힌 브라우저에서는 보이지 않는 입력칸을 이용(열린 창이 있으면 그 안에 둬야 선택됨) */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* 아래 대체 방법으로 */
  }
  try {
    const t = document.createElement("textarea");
    t.value = text;
    t.setAttribute("readonly", "");
    t.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    (document.querySelector("dialog[open]") ?? document.body).append(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  } catch {
    return false;
  }
}

/** 담은 강좌 목록의 한 줄. side에는 줄마다 다른 버튼을 넣음 */
function svItem(c: Course, clash: boolean, side: Node[]) {
  const per = perSession(c);
  const badge = el("span", { class: `sport-badge cat-${catKey(c.category)}`, "aria-hidden": "true" }, svg(sportIcon(c.category, 22)));
  return el("li", { class: `sv-item${clash ? " clash" : ""}` },
    badge,
    el("div", { class: "sv-main" },
      el("p", { class: "sv-title" }, prettyTitle(c.name), clash ? el("span", { class: "flag" }, "시간 겹침") : null),
      el("p", { class: "sv-when num" }, `${daysLabel(c.days) || "요일 정보 없음"} ${c.start ?? ""}${c.end ? `~${c.end}` : ""}`),
      el("p", { class: "note" }, `${CENTER_SHORT[c.center] ?? c.center} · ${prettyTarget(c.targetRaw) || "대상 정보 없음"}`),
      el("p", { class: "sv-price" }, el("span", { class: "num strong" }, `한 달 ${won(c.price)}원`), per ? el("span", { class: "note" }, ` · 1회 약 ${won(per)}원`) : null)),
    el("div", { class: "sv-side" }, ...side));
}

const officialLink = (c: Course) => {
  const a = el("a", { class: "sv-btn", href: linkOf(c), target: "_blank", rel: "noopener", "aria-label": `${prettyTitle(c.name)} 종목 공식 페이지 보기` }, "종목 공식 페이지");
  return a;
};

/** 친구에게 보낼 링크: 주소 해시(#sv=…)에 강좌 번호만 담음. 서버도 계정도 필요 없음 */
const shareLink = (courses: Course[]) => `${location.origin}${location.pathname}#${shareHash(courses.map((c) => c.id))}`;

// ---------- 시간표 ----------
function timetable(items: Course[], perCell: number, withCenter = true, bars = false) {
  const timed = items.filter((c) => !c.allDay && c.start);
  const hours = timed.map((c) => Math.floor((toMinutes(c.start) ?? 0) / 60));
  const lo = Math.min(...hours), hi = Math.max(...hours);
  const grid = el("div", { class: "tt" }, el("span", {}), ...WEEK.map((d) => el("span", { class: "tt-h" }, d)));
  for (let h = lo; h <= hi; h++) {
    grid.append(el("span", { class: "tt-hour num" }, `${h}시`));
    for (const d of WEEK) {
      const here = timed.filter((c) => c.days.includes(d) && Math.floor((toMinutes(c.start) ?? 0) / 60) === h)
        .sort((a, b) => Number(saved.includes(b.id)) - Number(saved.includes(a.id)));
      const cell = el("div", { class: "tt-cell" });
      for (const c of here.slice(0, perCell)) {
        if (bars) {
          const bar = el("button", { type: "button", class: `tt-bar${saved.includes(c.id) ? " saved" : ""}`, title: `${d} ${c.start} ${prettyTitle(c.name)}`, "aria-label": `${d}요일 ${c.start} ${prettyTitle(c.name)}` });
          bar.addEventListener("click", () => showCard(c.id));
          cell.append(bar);
          continue;
        }
        const b = el("button", { type: "button", class: `tt-item cat-${catKey(c.category)}${saved.includes(c.id) ? " saved" : ""}`, title: `${c.center} ${c.name}` },
          withCenter ? `${CENTER_SHORT[c.center] ?? c.center} ${prettyTitle(c.name)}` : prettyTitle(c.name));
        b.addEventListener("click", () => showCard(c.id));
        cell.append(b);
      }
      if (here.length > perCell) cell.append(el("span", { class: "tt-more" }, `+${here.length - perCell}개`));
      grid.append(cell);
    }
  }
  return grid;
}

function showCard(id: string) {
  const res = find(query);
  const idx = res.findIndex((c) => c.id === id);
  if (idx < 0) return openSaved(); // 지금 조건에 없는 강좌(담은 강좌 막대)는 담은 강좌 목록에서 보여 줌
  view = "cards";
  if (idx >= shown) shown = idx + 1;
  renderResults();
  const target = document.getElementById(`c-${id}`);
  target?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
  target?.focus({ preventScroll: true });
}

// ---------- 결과 ----------
function renderResults() {
  const res = find(query);
  const n = res.length;
  const filtered = queryTokens(query).length > 0;
  $("#count").replaceChildren(
    ...(filtered
      ? n ? ["딱 맞는 강좌 ", el("span", { class: "num hl" }, n.toLocaleString("ko-KR")), "개를 찾았어요"] : ["조건에 맞는 강좌가 없어요"]
      : ["최근 확인된 강좌 ", el("span", { class: "num hl" }, n.toLocaleString("ko-KR")), "개"]),
  );
  $("#share").hidden = !filtered;
  const [ry, rm] = data.recentFrom.split("-");
  const cn = $("#count-note");
  cn.hidden = filtered;
  cn.textContent = `${ry}년 ${Number(rm)}월 이후 등록·갱신된 그룹 강좌예요. 전체 ${data.courses.length.toLocaleString("ko-KR")}개는 위쪽 ‘필터 → 함께 보기’에서 함께 볼 수 있어요.`;
  $("#list").removeAttribute("aria-busy");
  $("#discover").hidden = filtered;
  if (!filtered) renderDiscover(res);

  // 조건 완화 제안
  const relax = $("#relax");
  const rs = filtered && n < 8 ? relaxations(data, query, n) : [];
  relax.hidden = rs.length === 0;
  relax.replaceChildren(
    el("span", {}, n ? "결과가 적어요. 이렇게 넓혀 볼까요?" : "조건을 하나 풀어 볼까요?"),
    ...rs.map((r) => {
      const b = el("button", { type: "button", class: "relax-btn" }, `${r.label} · ${r.count}개`);
      b.addEventListener("click", () => update(r.patch));
      return b;
    }),
  );

  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-view]")) b.setAttribute("aria-pressed", String(b.dataset.view === view));
  const list = $("#list"), table = $("#table"), more = $("#more");
  list.hidden = view !== "cards";
  table.hidden = view !== "table";
  $(".result-body").classList.toggle("table-mode", view === "table");
  if (view === "cards") {
    list.classList.toggle("no-anim", skipAnim);
    skipAnim = false;
    list.replaceChildren(...res.slice(0, shown).map((c, i) => { const li = card(c); li.style.setProperty("--i", String(i % PAGE)); return li; }));
    if (!n) list.append(el("li", { class: "empty" }, el("p", { class: "strong" }, "조건에 맞는 강좌가 없어요."), el("p", { class: "note" }, "위의 제안을 누르거나, 조건 토큰의 ×로 조건을 하나 지워 보세요.")));
    more.hidden = n <= shown;
    more.textContent = `${Math.min(PAGE, n - shown)}개 더 보기 (남은 강좌 ${(n - shown).toLocaleString("ko-KR")}개)`;
  } else {
    more.hidden = true;
    const timed = res.filter((c) => !c.allDay && c.start);
    table.replaceChildren(
      el("p", { class: "note", style: "margin-bottom: 10px" }, `시작 시간 기준이에요. 칸마다 3개까지 보여 주고, 누르면 카드로 이동해요.${res.length - timed.length ? ` 하루 종일 자유 이용 강좌 ${res.length - timed.length}개는 카드에서 볼 수 있어요.` : ""}`),
      timed.length ? timetable(timed, 3) : el("p", {}, "시간표에 놓을 강좌가 없어요."),
    );
  }
  renderWeek(res);
}

function renderWeek(res = find(query)) {
  const week = $("#week");
  week.hidden = false;
  const n = res.length;
  const mine = savedCourses();
  const items = [...mine, ...(n <= 12 ? res.filter((c) => !saved.includes(c.id)) : [])];
  week.replaceChildren(el("h2", {}, "한 주에 놓고 보기"));
  if (items.some((c) => !c.allDay && c.start)) {
    week.append(timetable(items, 3, false, true));
    const timedItems = items.filter((c) => !c.allDay && c.start).slice(0, 6);
    week.append(el("ul", { class: "week-list" }, ...timedItems.map((c) =>
      el("li", {}, el("span", { class: `sw${saved.includes(c.id) ? " saved" : ""}`, "aria-hidden": "true" }),
        el("span", { class: "tm num" }, `${daysLabel(c.days)} ${c.start}`),
        el("span", {}, `${prettyTitle(c.name)} · ${CENTER_SHORT[c.center] ?? c.center}${saved.includes(c.id) ? " (담음)" : ""}`)))));
    const ov = overlaps(mine);
    week.append(el("p", { class: "note" }, `진한 막대는 담은 강좌예요.${n > 12 ? " 결과가 많아 담은 강좌만 보여 드려요." : ""}${ov.length ? ` 담은 강좌 중 ${ov.length}쌍이 시간이 겹쳐요.` : ""}`));
  } else {
    const empty = el("div", { class: "week-empty" });
    empty.append(svg(ICON.heart), el("p", {}, "카드의 하트로 강좌를 담으면, 한 주 일정으로 놓고 겹치는 시간을 알려 드려요."));
    week.append(empty);
  }
}

// 처음 화면: 종목 바로가기와 센터 둘러보기
function renderDiscover(res: Course[]) {
  const m = new Map<string, number>();
  for (const c of res) m.set(c.category, (m.get(c.category) ?? 0) + 1);
  $("#starter-tiles").replaceChildren(...[...m.entries()].filter(([k]) => k !== "기타").sort((a, b) => b[1] - a[1]).map(([k, cnt]) => {
    const b = el("button", { type: "button", class: `starter-tile cat-${catKey(k)}` },
      el("span", { class: "st-ico" }, svg(sportIcon(k, 26))),
      el("span", { class: "k" }, k), el("span", { class: "n" }, `강좌 ${cnt.toLocaleString("ko-KR")}개`));
    b.addEventListener("click", () => { update({ categories: [k] }, { push: true }); revealResults(shownMessage(k)); });
    return b;
  }));
}

// ---------- 담기 ----------
function toggleSave(id: string, btn: HTMLButtonElement, title: string) {
  const adding = !saved.includes(id);
  saved = adding ? [...saved, id] : saved.filter((x) => x !== id);
  storeSaved();
  // 카드 전체를 다시 그리지 않고 그 자리에서 바꿔 효과가 보이게
  btn.setAttribute("aria-pressed", String(adding));
  btn.setAttribute("aria-label", `${title} 담기`);
  btn.closest(".card")?.classList.toggle("saved", adding);
  if (adding) {
    burst(btn);
    toast(savedOnce ? "담았어요" : "담았어요. 하트 버튼이나 아래 ‘목록 보기’에서 모아 보고 시간이 겹치는지 확인할 수 있어요.");
    savedOnce = true;
  }
  renderTray(adding);
  renderWeek();
}

function burst(btn: HTMLElement) {
  if (reduceMotion()) return;
  btn.classList.remove("pop");
  void btn.offsetWidth;
  btn.classList.add("pop");
  const b = el("span", { class: "burst", "aria-hidden": "true" });
  for (let i = 0; i < 10; i++) {
    const p = el("i");
    p.style.setProperty("--a", `${i * 36}deg`);
    p.style.setProperty("--d", `${26 + (i % 2) * 10}px`);
    b.append(p);
  }
  btn.append(b);
  setTimeout(() => b.remove(), 700);
}

/** 담은 강좌 수가 보이는 모든 곳(머리말 버튼, 하단 바, 첫 화면 카드)을 한 번에 맞춤 */
function renderTray(bump = false) {
  const tray = $("#tray");
  const mine = savedCourses();
  const ov = overlaps(mine);
  document.body.classList.toggle("has-tray", mine.length > 0);

  const badge = $("#saved-count");
  badge.textContent = String(mine.length);
  badge.hidden = mine.length === 0;
  $("#saved-btn").classList.toggle("has", mine.length > 0);
  $("#saved-btn").setAttribute("aria-label", mine.length ? `담은 강좌 ${mine.length}개 보기` : "담은 강좌 보기");
  if (bump && !reduceMotion()) {
    badge.classList.remove("bump");
    void badge.offsetWidth;
    badge.classList.add("bump");
  }

  syncHearts();
  syncSortSaved();

  tray.hidden = mine.length === 0;
  if (!mine.length) { document.body.style.removeProperty("--tray-h"); return tray.replaceChildren(); }
  const icon = el("span", { class: `tray-icon${bump && !reduceMotion() ? " bump" : ""}`, "aria-hidden": "true" });
  icon.append(svg(ICON.heart));
  (icon.firstChild as SVGElement).setAttribute("fill", "currentColor");
  const total = mine.reduce((s, c) => s + (c.price ?? 0), 0);
  const first = mine[0];
  const line2 = mine.length === 1 ? `${daysLabel(first.days)} ${first.start ?? ""} · 한 달 ${won(first.price)}원` : `한 달 합계 ${won(total)}원`;
  // 글자 영역 전체가 목록을 여는 버튼
  const open = el("button", { type: "button", class: "tray-open", "aria-label": `담은 강좌 ${mine.length}개 목록 열기` },
    el("span", { class: "tray-text" },
      el("span", { class: "strong" }, `담은 강좌 ${mine.length}개${mine.length === 1 ? ` · ${CENTER_SHORT[first.center]} ${prettyTitle(first.name)}` : ""}`),
      // 가장 중요한 '시간 겹침'을 앞에 둬서 좁은 화면에서 말줄임으로 잘리지 않게 함
      ov.length
        ? el("span", { class: "s" }, el("span", { class: "warn" }, `시간 겹침 ${ov.length}건`), ` · ${line2}`)
        : el("span", { class: "s" }, `${line2} · 시간이 겹치지 않아요`)));
  open.addEventListener("click", () => openSaved());
  const btn = el("button", { type: "button", class: "btn-dark" }, "목록 보기");
  btn.addEventListener("click", () => openSaved());
  tray.replaceChildren(icon, open, btn);
  // 맨 위로 버튼이 하단 바 바로 위에 오도록 실제 높이를 반영(큰 글자 설정에서도 겹치지 않게)
  document.body.style.setProperty("--tray-h", `${tray.offsetHeight + 12}px`);
}

/** 담은 강좌 목록 창. 머리말 버튼·하단 바·시간표 막대에서 열림. 휴대폰에서는 아래에서 올라오는 시트 모양 */
function openSaved() {
  closePopover();
  const dlg = $<HTMLDialogElement>("#compare");
  const body = $("#compare-body");
  const title = $("#compare-title");
  let lastRemoved: { id: string; at: number } | null = null;

  const removeCourse = (c: Course) => {
    const at = saved.indexOf(c.id);
    saved = saved.filter((x) => x !== c.id);
    storeSaved();
    lastRemoved = { id: c.id, at };
    renderResults();
    renderTray();
    draw(`뺐어요 · ${prettyTitle(c.name)}`, true);
    title.focus(); // 눌렀던 버튼이 사라지므로 창 제목으로 포커스를 옮겨 키보드 사용자가 길을 잃지 않게
  };
  const undo = () => {
    if (!lastRemoved || saved.includes(lastRemoved.id)) return;
    saved.splice(Math.min(lastRemoved.at, saved.length), 0, lastRemoved.id);
    storeSaved();
    lastRemoved = null;
    renderResults();
    renderTray();
    draw("되돌렸어요", false);
    title.focus();
  };

  const draw = (notice = "", canUndo = false) => {
    const mine = savedCourses();
    title.textContent = mine.length ? `담은 강좌 ${mine.length}개` : "담은 강좌";
    const live = el("p", { class: "sv-live", role: "status" }, notice);
    if (canUndo) {
      const u = el("button", { type: "button", class: "text-btn" }, "되돌리기");
      u.addEventListener("click", undo);
      live.append(" ", u);
    }
    if (!mine.length) {
      const go = el("button", { type: "button", class: "btn-primary" }, "강좌 둘러보기");
      go.addEventListener("click", () => {
        dlg.close();
        // 지금 조건에 맞는 강좌가 없으면 0건 화면으로 보내지 않고 조건을 풀어 줌
        if (find(query).length === 0) update({ ...emptyQuery() });
        revealResults();
      });
      const empty = el("div", { class: "sv-empty" },
        el("span", { class: "sv-heart", "aria-hidden": "true" }),
        el("p", { class: "strong" }, "아직 담은 강좌가 없어요"),
        el("p", { class: "note" }, "카드의 하트를 누르면 여기에 모여요. 합계와 시간이 겹치는지도 바로 알려 드려요."),
        go);
      body.replaceChildren(live, empty, el("p", { class: "note" }, "담은 강좌는 이 브라우저에만 저장돼요."));
      return;
    }
    const ov = overlaps(mine);
    const items = mine.map((c) => {
      const clash = ov.some(([x, y]) => x.id === c.id || y.id === c.id);
      const rm = el("button", { type: "button", class: "sv-btn sv-rm", "aria-label": `${prettyTitle(c.name)} 빼기` }, "빼기");
      rm.addEventListener("click", () => removeCourse(c));
      return svItem(c, clash, [officialLink(c), rm]);
    });
    const total = mine.reduce((s, c) => s + (c.price ?? 0), 0);
    // 메신저로 보내기: 글(합계·겹침·링크 포함)과 링크만 복사. 알림은 창 안에 보여야 하므로 위쪽 안내 띠에 씀
    const sayCopied = (ok: boolean, what: string) => { live.textContent = ok ? `${what} 복사했어요. 메신저에 붙여 넣어 보내세요.` : "복사가 막혀 있어요. 브라우저 설정을 확인해 주세요."; };
    const copyList = el("button", { type: "button", class: "btn-primary" }, "카톡용으로 복사");
    copyList.addEventListener("click", async () => sayCopied(await copyText(shareText(mine, shareLink(mine))), "후보 목록을"));
    const copyLink = el("button", { type: "button", class: "btn-secondary" }, "링크 복사");
    copyLink.addEventListener("click", async () => sayCopied(await copyText(shareLink(mine)), "링크를"));
    const shareRow = el("div", { class: "sv-share" }, copyList, copyLink);
    // 브라우저 기본 확인창 대신, 창 안에서 한 번 더 묻는 줄을 보여 줌
    const clear = el("button", { type: "button", class: "text-btn" }, "모두 비우기");
    const clearRow = el("div", { class: "cmp-actions" }, clear);
    clear.addEventListener("click", () => {
      const yes = el("button", { type: "button", class: "btn-dark btn-confirm" }, "모두 비우기");
      const no = el("button", { type: "button", class: "text-btn" }, "취소");
      yes.addEventListener("click", () => {
        saved = [];
        storeSaved();
        renderResults();
        renderTray();
        draw();
        title.focus();
      });
      no.addEventListener("click", () => { clearRow.replaceChildren(clear); clear.focus(); });
      clearRow.replaceChildren(el("span", { class: "strong" }, `담은 강좌 ${mine.length}개를 모두 뺄까요?`), yes, no);
      no.focus();
    });
    body.replaceChildren(
      live,
      el("div", { class: "cmp-sum" },
        el("span", { class: ov.length ? "warn" : "" }, ov.length ? `시간이 겹치는 강좌가 ${ov.length}쌍 있어요.` : "담은 강좌끼리 시간이 겹치지 않아요."),
        el("strong", {}, `한 달 합계 ${won(total)}원`)),
      el("ul", { class: "sv-list" }, ...items),
      shareRow,
      clearRow,
      el("p", { class: "note" }, "담은 강좌는 이 브라우저에만 저장돼요. 링크로 보내면 받은 사람은 같은 후보를 열어 볼 수 있어요. 신청은 각 공식 페이지에서 해 주세요."),
    );
  };
  // 닫을 때 열었던 곳으로 포커스를 돌려줌. 하단 바 버튼은 다시 그려져 사라졌을 수 있어 머리말 버튼으로 대신함
  const opener = document.activeElement as HTMLElement | null;
  dlg.addEventListener("close", () => {
    const back = opener && opener.isConnected ? opener : $("#saved-btn");
    back.focus({ preventScroll: true });
  }, { once: true });
  draw();
  dlg.showModal();
  title.setAttribute("tabindex", "-1");
  title.focus();
}

/** 친구가 보낸 링크(#sv=…)로 들어왔을 때: 받은 후보를 보여 주고 내 담은 강좌에 한 번에 담게 함 */
function openShared(ids: string[]) {
  const mine = ids.map((id) => byId.get(id)).filter((c): c is Course => !!c);
  if (!mine.length) {
    toast("받은 링크의 강좌를 찾지 못했어요. 강좌 정보가 바뀌었을 수 있어요.");
    return;
  }
  const dlg = $<HTMLDialogElement>("#compare");
  const title = $("#compare-title");
  title.textContent = `받은 후보 ${mine.length}개`;
  const ov = overlaps(mine);
  const total = mine.reduce((s, c) => s + (c.price ?? 0), 0);
  const items = mine.map((c) => svItem(c, ov.some(([x, y]) => x.id === c.id || y.id === c.id), [officialLink(c)]));
  const add = el("button", { type: "button", class: "btn-primary" }, "내 담은 강좌에 모두 담기");
  add.addEventListener("click", () => {
    const fresh = mine.filter((c) => !saved.includes(c.id));
    saved = [...saved, ...fresh.map((c) => c.id)];
    storeSaved();
    renderResults();
    renderTray(true);
    dlg.close();
    toast(fresh.length ? `${fresh.length}개를 담았어요. 위쪽 ‘담은 강좌’에서 확인할 수 있어요.` : "이미 모두 담겨 있어요.");
  });
  $("#compare-body").replaceChildren(
    el("p", { class: "sv-live", role: "status" }, "누군가 보내 준 후보 강좌예요. 마음에 들면 내 목록에 담아 보세요."),
    el("div", { class: "cmp-sum" },
      el("span", { class: ov.length ? "warn" : "" }, ov.length ? `시간이 겹치는 강좌가 ${ov.length}쌍 있어요.` : "후보끼리 시간이 겹치지 않아요."),
      el("strong", {}, `한 달 합계 ${won(total)}원`)),
    el("ul", { class: "sv-list" }, ...items),
    el("div", { class: "sv-share" }, add),
    el("p", { class: "note" }, "이 화면은 링크에 담긴 강좌 번호로 만들어요. 남은 자리와 신청은 각 공식 페이지에서 확인해 주세요."),
  );
  dlg.showModal();
  title.setAttribute("tabindex", "-1");
  title.focus();
}

// ---------- 종목 소개 ----------
function openInfo(c: Course) {
  const info = infoOf(c);
  if (!info) return;
  const dlg = $<HTMLDialogElement>("#info");
  $("#info-title").replaceChildren(el("span", { class: `sport-badge cat-${catKey(c.category)}` }, svg(sportIcon(c.category, 22))), `${info.sport} 소개`);
  const only = el("button", { type: "button", class: "btn-dark" }, `${info.sport} 강좌만 보기`);
  only.addEventListener("click", () => {
    dlg.close();
    update({ text: info.sport.replace(/\s+/g, "") });
    revealResults();
  });
  const link = el("a", { class: "link-btn", href: info.link, target: "_blank", rel: "noopener" }, "공식 소개 페이지");
  link.append(svg(ICON.out));
  $("#info-body").replaceChildren(
    el("p", { class: "info-center" }, `${info.center} 제공`),
    el("p", { class: "info-desc" }, info.desc),
    el("div", { class: "info-actions" }, only, link),
  );
  dlg.showModal();
}

// ---------- 알림 ----------
let toastTimer = 0;
function toast(msg: string) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove("show"), 2600);
}

// ---------- 수준 안내 ----------
let gSport: GuideSport = "swim";
let gChecked: string[] = [];
function renderGuide() {
  $("#guide-tabs").replaceChildren(...GUIDE_SPORTS.map((s) => {
    const b = el("button", { type: "button", role: "tab", class: `g-tab cat-${catKey(s.category)}`, "aria-selected": String(s.id === gSport) });
    b.append(svg(sportIcon(s.category, 22)), s.label);
    b.addEventListener("click", () => { gSport = s.id; gChecked = []; renderGuide(); });
    return b;
  }));
  $("#guide-items").replaceChildren(...guideSport(gSport).skills.map((sk) => {
    const i = el("input", { type: "checkbox" }) as HTMLInputElement;
    i.checked = gChecked.includes(sk.id);
    i.addEventListener("change", () => { gChecked = toggle(gChecked, sk.id); renderGuideResult(); });
    return el("label", { class: "skill" }, i, sk.label);
  }));
  renderGuideResult();
}
function guidePatch(): Partial<Query> {
  const s = guideSport(gSport);
  return s.text ? { text: s.text } : { categories: [s.category] };
}
function renderGuideResult() {
  const lv = recommend(gSport, gChecked);
  $("#guide-level").textContent = `${lv.map((n) => LEVEL_LABEL[n]).join(" 또는 ")} 반`;
  const top = Math.max(...lv);
  const meter = $("#guide-meter");
  meter.setAttribute("aria-label", `4단계 중 ${top}단계, ${LEVEL_LABEL[top]}`);
  meter.replaceChildren(...[1, 2, 3, 4].map((r) => el("span", { class: `${r <= top ? "done" : ""}${lv.includes(r) ? " here" : ""}` }, el("i"), LEVEL_LABEL[r])));
  const base = { ...emptyQuery(), sort: query.sort, ...guidePatch() };
  const withLv = find({ ...base, levels: lv }).length;
  $("#guide-apply").textContent = withLv ? `이 수준 강좌 ${withLv}개 보기` : `${guideSport(gSport).label} 강좌 모두 보기`;
}
function openGuide(sport?: GuideSport) {
  closePopover();
  if (sport) { gSport = sport; gChecked = []; }
  renderGuide();
  $<HTMLDialogElement>("#guide").showModal();
}

// ---------- 첫 화면 장면(센터 레인 + 추천 강좌) ----------
let heroScene: Scene = SCENES[0];
let heroPicks: Course[] = [];
let heroPickAt = 0;

/** 담았는지가 바뀔 때마다 카드·추천의 하트를 한꺼번에 맞춤 */
function syncHearts() {
  for (const li of document.querySelectorAll<HTMLElement>("li.card[id^='c-']")) {
    const on = saved.includes(li.id.slice(2));
    li.classList.toggle("saved", on);
    li.querySelector(".heart")?.setAttribute("aria-pressed", String(on));
  }
  const ph = document.querySelector<HTMLElement>("#pick .heart");
  const cur = heroPicks[heroPickAt];
  if (ph && cur) ph.setAttribute("aria-pressed", String(saved.includes(cur.id)));
}

/** 결과 머리말의 정렬 선택: '담은 강좌 먼저'에는 담은 개수를 붙여 보여 줌 */
function syncSortSaved() {
  const sel = document.querySelector<HTMLSelectElement>("#sort-select");
  if (!sel) return;
  const n = savedCourses().length;
  const opt = sel.querySelector<HTMLOptionElement>('option[value="saved"]');
  if (opt) opt.textContent = n ? `담은 강좌 먼저 (${n}개)` : "담은 강좌 먼저";
  sel.value = query.sort;
}

function pickShowcase(sc: Scene): Course[] {
  const res = find({ ...emptyQuery(), sort: "pick" });
  const nice = (c: Course) => !c.allDay && c.start !== null && c.price !== null && (c.levelRank === null || c.levelRank <= 2);
  const evening = (c: Course) => { const m = toMinutes(c.start); return m !== null && m >= 17 * 60 && m < 21 * 60; };
  const pool = [
    ...res.filter((c) => c.category === sc.category && nice(c) && evening(c)),
    ...res.filter((c) => c.category === sc.category && nice(c)),
    ...res.filter((c) => nice(c) && evening(c)),
  ];
  // 같은 센터·같은 이름이 겹치지 않게 최대 3장, 시작할 때마다 다른 조합
  const seen = new Set<string>();
  const out: Course[] = [];
  const head = pool.slice(0, 14).sort(() => Math.random() - 0.5);
  for (const c of [...head, ...pool.slice(14)]) {
    const k = `${c.center}|${prettyTitle(c.name)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length === 3) break;
  }
  return out;
}

function goToCourse(c: Course) {
  update({ ...emptyQuery(), sort: query.sort === "saved" ? "saved" : "pick", centers: [c.center], categories: [c.category] }, { push: true });
  revealResults();
  // 결과가 그려진 뒤, 그 강좌가 목록에 있으면 그 카드로 이동해 잠깐 강조
  setTimeout(() => {
    const li = document.getElementById(`c-${c.id}`);
    if (!li) return;
    li.focus();
    li.classList.remove("hit");
    void li.offsetWidth;
    li.classList.add("hit");
  }, 260);
}

function renderPick(swap = false) {
  const box = $("#pick");
  const c = heroPicks[heroPickAt];
  box.hidden = !c;
  if (!c) return box.replaceChildren();
  const title = prettyTitle(c.name);
  const go = el("button", { type: "button", class: "pick-go", "aria-label": `${CENTER_SHORT[c.center] ?? c.center} ${title}, ${daysLabel(c.days)} ${c.start} 시작. 눌러서 목록에서 보기` },
    el("span", { class: "pick-tag" }, `오늘의 추천 · ${c.category}`),
    el("span", { class: "pick-time num" }, `${daysLabel(c.days)} ${c.start}`),
    el("span", { class: "pick-title" }, title),
    el("span", { class: "pick-meta" }, `${CENTER_SHORT[c.center] ?? c.center} · 한 달 ${won(c.price)}원`),
    el("span", { class: "pick-cta" }, "목록에서 보기", svg(ICON.arrow)));
  if (swap && !reduceMotion()) go.classList.add("swap");
  go.addEventListener("click", () => goToCourse(c));
  box.replaceChildren(go, heartButton(c, title));
}

function renderHero() {
  const art = $("#hero-art");
  let prev: string | null = null;
  try { prev = localStorage.getItem(SCENE_KEY); } catch { /* 저장이 막혀도 그냥 무작위 */ }
  // 주소에 ?scene=skate 처럼 적으면 그 장면을 고정(확인용)
  const forced = new URLSearchParams(location.search).get("scene");
  heroScene = SCENES.find((s) => s.id === forced) ?? pickScene(prev);
  try { localStorage.setItem(SCENE_KEY, heroScene.id); } catch { /* 무시 */ }
  art.classList.add(`scene-${heroScene.id}`);
  $("#art-cap").textContent = heroScene.caption;
  $("#actor").innerHTML = heroScene.actor;

  const lanes = Object.keys(CENTER_SHORT);
  const all = find({ ...emptyQuery() });
  const setLane = (i: number) => art.style.setProperty("--lane", String(i));
  setLane(Math.floor(Math.random() * lanes.length)); // 캐릭터가 서 있는 레인도 새로고침마다 무작위
  $("#lanes").replaceChildren(...lanes.map((center, i) => {
    const n = all.filter((c) => c.center === center).length;
    const b = el("button", { type: "button", class: "lane", "aria-label": `${CENTER_SHORT[center]} 강좌 ${n}개 보기` },
      el("span", { class: "lane-name" }, CENTER_SHORT[center] ?? center),
      el("span", { class: "lane-n num" }, `${n.toLocaleString("ko-KR")}개`),
      el("span", { class: "lane-go", "aria-hidden": "true" }, svg(ICON.arrow)));
    // 마우스를 올릴 때 그림이 따라다니면 어수선하므로, 키보드로 옮길 때와 누를 때만 이동
    b.addEventListener("focus", () => { if (b.matches(":focus-visible")) setLane(i); });
    b.addEventListener("click", () => {
      setLane(i);
      // 그림이 그 레인으로 헤엄쳐 가는 것을 잠깐 보여 준 뒤 이동(움직임 줄이기 설정이면 바로)
      setTimeout(() => {
        update({ centers: [center] }, { push: true });
        revealResults(shownMessage(CENTER_SHORT[center] ?? center));
      }, reduceMotion() ? 0 : 320);
    });
    return el("li", {}, b);
  }));

  heroPicks = pickShowcase(heroScene);
  heroPickAt = 0;
  renderPick();
  const box = $("#pick");
  let hold = false;
  for (const ev of ["pointerenter", "focusin"]) box.addEventListener(ev, () => { hold = true; });
  for (const ev of ["pointerleave", "focusout"]) box.addEventListener(ev, () => { hold = false; });
  if (heroPicks.length > 1 && !reduceMotion()) {
    window.setInterval(() => {
      if (hold || document.hidden || art.offsetParent === null) return;
      heroPickAt = (heroPickAt + 1) % heroPicks.length;
      renderPick(true);
    }, 6000);
  }
}

// ---------- 시작 ----------
async function init() {
  const res = await fetch(`${import.meta.env.BASE_URL}courses.json`);
  if (!res.ok) throw new Error(`courses.json ${res.status}`);
  data =(await res.json()) as Dataset;
  byId = new Map(data.courses.map((c) => [c.id, c]));
  vocab = sportVocabulary([...new Set(data.courses.map((c) => c.sport))]);
  saved = saved.filter((id) => byId.has(id));
  $("#source").textContent = `데이터: ${data.source}. 공공데이터포털(data.go.kr), 이용허락범위 제한 없음.`;

  $("#search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    submitText($<HTMLInputElement>("#q").value);
  });
  $<HTMLInputElement>("#q").addEventListener("keydown", (e) => {
    const input = e.target as HTMLInputElement;
    if (e.key === "Backspace" && input.value === "") {
      const t = queryTokens(query);
      if (t.length) update(t[t.length - 1].clear);
    }
  });
  const ex = $("#examples");
  ex.append(el("span", {}, "이렇게 말해 보세요"));
  for (const t of EXAMPLES.slice(0, 4)) {
    const b = el("button", { type: "button", class: "ex" }, `“${t}”`);
    b.addEventListener("click", () => submitText(t));
    ex.append(b);
  }
  $("#reset").addEventListener("click", () => {
    $<HTMLInputElement>("#q").value = "";
    update({ ...emptyQuery() });
  });
  $("#share").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      toast("링크를 복사했어요. 메신저에 붙여 넣으면 같은 조건으로 열려요.");
    } catch {
      toast("복사가 막혀 있어요. 주소창의 주소를 복사해 주세요.");
    }
  });
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-view]")) {
    b.addEventListener("click", () => { view = b.dataset.view as typeof view; renderResults(); });
  }
  $("#more").addEventListener("click", () => {
    const from = shown;
    shown += PAGE;
    skipAnim = true;
    renderResults();
    ($("#list").children[from] as HTMLElement | undefined)?.focus();
  });

  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    // 칩을 누르면 팝오버가 다시 그려지며 눌린 칩이 문서에서 떨어져 나가므로, 떨어진 요소의 클릭은 '바깥 클릭'으로 보지 않음
    if (!t.isConnected) return;
    if (openPill && !t.closest("#popover, #pills")) closePopover();
  });
  $("#popover").addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); closePopover(); }
  });
  window.addEventListener("hashchange", () => {
    const sh = decodeShare(location.hash);
    if (sh.length) {
      // 같은 탭에서 공유 링크를 열었을 때도 받은 후보를 보여 줌 (조건은 그대로 두고 주소만 정리)
      const h = encodeQuery(query);
      history.replaceState(null, "", h ? `#${h}` : location.pathname + location.search);
      openShared(sh);
      return;
    }
    if (!isQueryHash(location.hash)) return; // 화면 안 이동 이름표는 조건을 바꾸지 않음
    if (location.hash.replace(/^#/, "") === encodeQuery(query)) return;
    query = decodeQuery(location.hash);
    shown = PAGE;
    lastNote = "";
    render();
  });

  for (const b of document.querySelectorAll<HTMLElement>("[data-open-guide]")) b.addEventListener("click", () => openGuide());
  $("#saved-btn").addEventListener("click", () => openSaved());
  // 다른 탭에서 담은 강좌가 바뀌면 이 탭에도 반영(서로 덮어쓰지 않게)
  addEventListener("storage", (e) => {
    if (e.key !== SAVE_KEY) return;
    saved = loadSaved().filter((id) => byId.has(id));
    renderResults();
    renderTray();
  });

  // 화면 안 이동 링크: 주소 해시를 바꾸지 않고(고른 조건이 지워지지 않게) 직접 이동
  const headerBar = () => $(".filter-bar").getBoundingClientRect().height;
  const goTo = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    scrollToY(target.getBoundingClientRect().top + scrollY - headerBar() - 12);
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  };
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
    const id = a.getAttribute("href")!.slice(1);
    a.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation(); // 방금 여는 필터 창을 '바깥 클릭'이 바로 닫지 않게
      if (id === "search") {
        scrollToY(0);
        $<HTMLInputElement>("#q").focus({ preventScroll: true });
      } else if (id === "centers" && queryTokens(query).length > 0) {
        // 조건이 걸려 있으면 센터 카드 구역이 접혀 있으므로, 조건을 지우지 않고 센터 고르는 창을 열어 줌
        scrollToY(0);
        const i = PILLS.findIndex((p) => p.id === "center");
        if (i >= 0) {
          openPill = "center"; renderPills(); renderPopover();
          ($("#popover").querySelector("button") as HTMLElement | null)?.focus();
        }
      } else if (id === "centers") {
        // 센터 고르기는 첫 화면의 센터 레인이 맡음. 이미 보이는 자리라 화면이 안 움직여도 눌렀다는 것을 알 수 있게 레인을 반짝임
        const art = $("#hero-art");
        const top = art.getBoundingClientRect().top + scrollY - headerBar() - 12;
        scrollToY(art.offsetParent === null ? 0 : top);
        art.querySelector<HTMLElement>(".lane")?.focus({ preventScroll: true });
        art.classList.remove("ping");
        void art.offsetWidth;
        art.classList.add("ping");
        setTimeout(() => art.classList.remove("ping"), 2200);
        toast("센터 레인 중 하나를 눌러 보세요");
      } else {
        goTo(id);
      }
    });
  }

  // 맨 위로: 첫 화면을 지나면 나타남
  const toTop = $("#to-top");
  const syncToTop = () => { toTop.hidden = scrollY < innerHeight * 0.9; };
  addEventListener("scroll", syncToTop, { passive: true });
  toTop.addEventListener("click", () => {
    scrollToY(0);
    $<HTMLInputElement>("#q").focus({ preventScroll: true });
  });
  syncToTop();
  $("#guide-apply").addEventListener("click", () => {
    const lv = recommend(gSport, gChecked);
    const s = guideSport(gSport);
    const base = { ...emptyQuery(), sort: query.sort, ...guidePatch() };
    const hasLv = find({ ...base, levels: lv }).length > 0;
    $<HTMLDialogElement>("#guide").close();
    lastNote = hasLv
      ? `수준 안내 결과(${lv.map((n) => LEVEL_LABEL[n]).join("·")})로 ${s.label} 강좌를 찾았어요.`
      : `${s.label} 강좌는 강좌명에 수준이 적힌 반이 적어서, 수준 대신 ${s.label} 강좌를 모두 보여 드려요.`;
    update(hasLv ? { ...base, levels: lv } : base, { keepNote: true });
    revealResults();
  });

  rotatePlaceholder();
  renderHero();
  $<HTMLSelectElement>("#sort-select").addEventListener("change", (e) => {
    update({ sort: (e.target as HTMLSelectElement).value as Query["sort"] });
  });
  $("#pop-backdrop").addEventListener("click", () => closePopover());
  render();
  // 다 그린 다음 수영 장면을 움직임 (그리는 동안 시작하면 끊겨 보임)
  setTimeout(() => document.querySelector(".hero-art")?.classList.add("run"), 700);

  // 공유 링크로 들어왔으면 받은 후보를 보여 주고, 주소에서는 공유 표시를 지워 새로고침해도 다시 뜨지 않게 함
  const shared = decodeShare(location.hash);
  if (shared.length) {
    const h = encodeQuery(query);
    history.replaceState(null, "", h ? `#${h}` : location.pathname + location.search);
    openShared(shared);
  }
}

init().catch((e) => {
  console.error(e);
  document.querySelector(".hero-art")?.classList.add("run");
  $("#count").textContent = "강좌 데이터를 불러오지 못했어요";
  const retry = el("button", { type: "button", class: "btn-primary" }, "다시 불러오기");
  retry.addEventListener("click", () => location.reload());
  $("#list").removeAttribute("aria-busy");
  $("#list").replaceChildren(el("li", { class: "empty" },
    el("p", { class: "strong" }, "인터넷 연결을 확인하고 다시 시도해 주세요."),
    el("p", { class: "note" }, "강좌 정보는 공공데이터를 정리한 파일을 불러와서 보여 드려요."),
    retry));
});
