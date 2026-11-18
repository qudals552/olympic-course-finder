"""한국체육산업개발 스포츠센터 강좌 CSV 4종 + 통합 강좌정보를 하나의 courses.json으로 정리합니다.

사용법:  python -I src/build_courses.py
입력:    data/raw/*.csv (data.go.kr에서 받은 원본, CP949)
출력:    data/courses.json, data/build_report.md
"""
from __future__ import annotations

import csv
import io
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT_JSON = ROOT / "data" / "courses.json"
OUT_REPORT = ROOT / "data" / "build_report.md"

OPEN_END = "9999-12-31"
RECENT_FROM = "2025-01"  # 이 달 이후 시작(또는 갱신)된 강좌를 '최근 확인'으로 표시
SPM_LINK = "https://www.ksponco.or.kr/spm"

# 센터별 원본 파일과 컬럼 이름 (센터마다 이름이 다름)
SOURCES = [
    {
        "center": "올림픽수영장",
        "file": "15101610_올림픽수영장_강좌정보.csv",
        "dataset": "15101610",
        "cols": dict(id="강좌번호", month="시작월", sport="강좌코드명", name="강좌명", time="시작종료시간",
                     cap="정원", days="요일", target="강습반", price="강좌금액"),
        # 시작일자 칸에 "시작~종료"가 들어 있음 (컬럼 밀림)
        "period": lambda r: r["시작일자"].split("~"),
    },
    {
        "center": "올림픽공원스포츠센터",
        "file": "15110953_올림픽스포츠센터_강좌정보.csv",
        "dataset": "15110953",
        "cols": dict(id="강좌일련번호", month="수강월", sport="종목", name="강좌명", time="수강시간",
                     cap="정원", days="수강요일", target="수강대상", price="수강금액"),
        "period": lambda r: [r["수강시작일"], r["수강종료일"]],
    },
    {
        "center": "일산올림픽스포츠센터",
        "file": "15114776_일산스포츠센터_강좌정보.csv",
        "dataset": "15114776",
        "cols": dict(id="강좌번호", month="시작월", sport="종목", name="강좌명", time="시작종료시간",
                     cap="정원", days="요일", target="강습반", price="금액"),
        "period": lambda r: r["시작일"].split("~"),
    },
    {
        "center": "분당올림픽스포츠센터",
        "file": "15118652_분당스포츠센터_강좌정보.csv",
        "dataset": "15118652",
        "cols": dict(id="강좌번호", month="수강월", sport="종목", name="강좌명", time="시작종료시간",
                     cap="정원", days="수강요일", target="수강대상", price="수강료"),
        "period": lambda r: [r["기간시작일"], r["기간종료일"]],
    },
]
INFO_FILE = "15147992_스포츠센터_강좌정보_통합.csv"

WEEK = ["월", "화", "수", "목", "금", "토", "일"]

# 종목 → 화면용 큰 분류 (위에서부터 먼저 맞는 것)
CATEGORY_RULES = [
    ("수영", r"수영|연수|교정|아티스틱|수구|생존"),
    ("아쿠아", r"아쿠아"),
    ("스케이트", r"스케이트"),
    ("필라테스·요가", r"필라|요가|발레|바디컨트롤|성장스트레칭"),
    ("헬스·PT", r"헬스|PT|P\.T|서킷|TRX|바디|HIIT|S\.?N\.?P\.?E|크로스"),
    ("댄스·에어로빅", r"댄스|에어로빅|줌바|라인|벨리|밸리|훌라|모델워킹|트램폴린|점핑|스텝|다이어트|체조"),
    ("라켓", r"테니스|배드민턴|탁구|스쿼시"),
    ("골프·당구", r"골프|당구"),
    ("구기", r"농구|축구|풋살"),
    ("자전거·걷기", r"스피닝|사이클|워킹|러닝|노르딕|인라인"),
    ("무도", r"검도|태권|유도"),
]

# 수준: (화면 표시, 단계 1~4). 강좌명에서 찾음. 먼저 맞는 것.
LEVEL_RULES = [
    (r"신기초|처음|입문", "입문", 1),
    (r"기초", "기초", 1),
    (r"초급|초중급|초\.중급", "초급", 2),
    (r"중급|중\.상급|초중상급", "중급", 3),
    (r"상급|고급|연수|교정|마스터|1년이상", "상급", 4),
]

TARGET_RULES = [
    ("유아", r"유아|[67]세"),
    ("어린이", r"어린이|초등|8세"),
    ("청소년", r"청소년"),
    ("여성", r"여성"),
    ("실버", r"실버|55세|65세|효도"),
]


def read_csv(name: str) -> list[dict]:
    raw = (RAW / name).read_bytes()
    try:
        text = raw.decode("cp949")
    except UnicodeDecodeError:
        text = raw.decode("utf-8-sig")  # 포털이 UTF-8로 바꿔 올린 경우
    rows = list(csv.reader(io.StringIO(text)))
    head = [h.strip() for h in rows[0]]
    return [dict(zip(head, (c.strip() for c in r))) for r in rows[1:] if any(r)]


def parse_days(s: str) -> tuple[list[str], list[str]]:
    """'월,수,금,(토)' → (['월','수','금'], ['토']). 괄호 요일은 자유수영 등 선택 이용일."""
    days, opt = [], []
    for part in s.split(","):
        part = part.strip()
        if not part:
            continue
        d = part.strip("()")
        if d not in WEEK:
            continue
        (opt if part.startswith("(") else days).append(d)
    return days, opt


def parse_time(s: str) -> tuple[str | None, str | None]:
    m = re.match(r"\s*(\d{1,2}):(\d{2})\s*[~-]\s*(\d{1,2}):(\d{2})", s)
    if not m:
        return None, None
    h1, m1, h2, m2 = m.groups()
    return f"{int(h1):02d}:{m1}", f"{int(h2):02d}:{m2}"


def minutes(t: str) -> int:
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def to_int(s: str) -> int | None:
    s = re.sub(r"[^\d]", "", s or "")
    return int(s) if s else None


def category_of(sport: str, name: str) -> str:
    for cat, pat in CATEGORY_RULES:
        if re.search(pat, sport):
            return cat
    for cat, pat in CATEGORY_RULES:
        if re.search(pat, name):
            return cat
    return "기타"


def level_of(name: str) -> tuple[str | None, int | None]:
    for pat, label, rank in LEVEL_RULES:
        if re.search(pat, name):
            return label, rank
    return None, None


def targets_of(raw_target: str, name: str) -> list[str]:
    tags = []
    t = raw_target or ""
    if "성인" in t or t in ("전체", ""):
        tags.append("성인")
    for tag, pat in TARGET_RULES:
        if re.search(pat, t) or re.search(pat, name):
            tags.append(tag)
    # "청소년" 대상 + 초등 표기 → 어린이도 포함, 성인 전용 표기가 없으면 성인 제외하지 않음
    if t == "청소년" and "성인" in tags:
        tags.remove("성인")
    if t in ("어린이", "유아") and "성인" in tags:
        tags.remove("성인")
    return sorted(set(tags), key=["성인", "여성", "실버", "청소년", "어린이", "유아"].index)


def load_info() -> dict[str, list[dict]]:
    """센터별 종목 설명·공식 링크 (통합 CSV)."""
    by_center = defaultdict(list)
    for r in read_csv(INFO_FILE):
        by_center[r["스포츠센터"]].append(
            {"center": r["스포츠센터"], "sport": r["강좌명"], "desc": r["강좌설명"], "link": r["링크주소"]})
    return by_center


def match_info(info: list[dict], sport: str, name: str) -> dict | None:
    def norm(x: str) -> str:
        return re.sub(r"[\s()·.]", "", x)

    s, n = norm(sport), norm(name)
    best, best_len = None, 0
    for it in info:
        k = norm(it["sport"])
        if not k:
            continue
        if k == s:
            return it
        if (k in s or s in k or k in n) and len(k) > best_len:
            best, best_len = it, len(k)
    return best


INFOS: list[dict] = []  # 종목 설명·링크를 한 번씩만 담아 JSON 크기를 줄임
bad_examples: dict[str, list[str]] = defaultdict(list)


def info_index(it: dict) -> int:
    for i, x in enumerate(INFOS):
        if x is it:
            return i
    INFOS.append(it)
    return len(INFOS) - 1


def build() -> tuple[list[dict], dict]:
    info = load_info()
    all_info = [it for items in info.values() for it in items]
    courses, stats = [], {}
    for src in SOURCES:
        rows = read_csv(src["file"])
        c = src["cols"]
        if not rows:
            sys.exit(f"[{src['center']}] {src['file']}에 데이터 행이 없습니다.")
        missing = [v for v in c.values() if v not in rows[0]]
        try:
            src["period"](rows[0])
        except KeyError as e:
            missing.append(str(e).strip("'"))
        if missing:
            sys.exit(f"[{src['center']}] {src['file']}에 컬럼이 없습니다: {', '.join(missing)}\n"
                     f"원본 컬럼 이름이 바뀌었는지 확인하고 SOURCES를 고치세요. 현재 컬럼: {', '.join(rows[0])}")
        st = Counter(total=len(rows))
        seen = set()
        for r in rows:
            start, end = (src["period"](r) + ["", ""])[:2]
            if end.strip() != OPEN_END:
                continue
            st["open"] += 1
            cid = r[c["id"]]
            if cid in seen:
                st["dup"] += 1
                continue
            seen.add(cid)
            name = re.sub(r"\s+", " ", r[c["name"]]).strip(" -")
            sport = r[c["sport"]].strip() or "기타"
            days, opt = parse_days(r[c["days"]])
            # 강좌명의 "(토.자유수영)", "(토일자유)"처럼 자유 이용일로 적힌 요일은 선택 이용일로 옮김
            for m in re.finditer(r"(?<=[(.·])([월화수목금토일](?:[.·,]?[월화수목금토일])*)[.·]?\s*자유", name):
                for d in re.sub(r"[.·,]", "", m.group(1)):
                    if d in days and len(days) > 1:
                        days.remove(d)
                        opt.append(d)
            t1, t2 = parse_time(r[c["time"]])
            month = (r[c["month"]] or start)[:7]
            if not re.match(r"(19|20)\d\d-\d\d", month):
                st["bad_month"] += 1
                bad_examples[src["center"]].append(month)
                month = start[:7] if re.match(r"(19|20)\d\d-\d\d", start) else None
            level, rank = level_of(name)
            it = match_info(info.get(src["center"], []), sport, name) or match_info(all_info, sport, "")
            flags = []
            if "일시중지" in name:
                flags.append("일시중지")
            if "결원보충X" in name.replace(" ", ""):
                flags.append("결원보충없음")
            all_day = bool(t1 and t2 and minutes(t2) - minutes(t1) >= 6 * 60)
            courses.append({
                "id": f'{src["dataset"]}-{cid}',
                "center": src["center"],
                "category": category_of(sport, name),
                "sport": sport,
                "name": name,
                "level": level,
                "levelRank": rank,
                "days": days,
                "optDays": opt,
                "start": t1,
                "end": t2,
                "allDay": all_day,
                "capacity": to_int(r[c["cap"]]),
                "targetRaw": r[c["target"]],
                "targets": targets_of(r[c["target"]], name),
                "price": to_int(r[c["price"]]),
                "since": month,
                "recent": bool(month and month >= RECENT_FROM),
                "flags": flags,
                "info": info_index(it) if it else None,
            })
            st["kept"] += 1
            st["linked"] += 1 if it else 0
            st["no_time"] += 0 if t1 else 1
            st["no_days"] += 0 if days else 1
            st["no_price"] += 0 if r[c["price"]] else 1
            st["recent"] += 1 if month and month >= RECENT_FROM else 0
            st["leveled"] += 1 if level else 0
        stats[src["center"]] = st
    return courses, stats


def write_report(courses: list[dict], stats: dict) -> None:
    lines = ["# courses.json 생성 결과", "",
             "`python -I src/build_courses.py`로 만듭니다. 현재 강좌 = 기간 종료일이 9999-12-31인 행.", "",
             "| 센터 | 원본 행 | 현재 행 | 중복 제외 | 수록 | 최근(2025-01~) | 수준 추출 | 설명·링크 연결 | 시간 없음 | 요일 없음 | 금액 없음 |",
             "|---|---|---|---|---|---|---|---|---|---|---|"]
    merged_n = stats.pop("_merged", 0)
    for center, st in stats.items():
        lines.append(f"| {center} | {st['total']} | {st['open']} | {st['dup']} | {st['kept']} | {st['recent']} | "
                     f"{st['leveled']} | {st['linked']} | {st['no_time']} | {st['no_days']} | {st['no_price']} |")
    tot = Counter()
    for st in stats.values():
        tot.update(st)
    lines.append(f"| **합계** | {tot['total']} | {tot['open']} | {tot['dup']} | **{tot['kept']}** | {tot['recent']} | "
                 f"{tot['leveled']} | {tot['linked']} | {tot['no_time']} | {tot['no_days']} | {tot['no_price']} |")
    lines += ["", f"같은 센터·이름·시간·요일·금액의 행 {merged_n}건을 묶어 **최종 {len(courses)}개**를 수록했습니다 (`sameCount`에 묶인 수)."]
    lines += ["", "## 분류별 강좌 수", "", "| 분류 | 강좌 수 |", "|---|---|"]
    for cat, n in Counter(c["category"] for c in courses).most_common():
        lines.append(f"| {cat} | {n} |")
    lines += ["", "## 대상 태그", "", "| 태그 | 강좌 수 |", "|---|---|"]
    for tag, n in Counter(t for c in courses for t in c["targets"]).most_common():
        lines.append(f"| {tag} | {n} |")
    lines += ["", "## 수준", "", "| 수준 | 강좌 수 |", "|---|---|"]
    for lv, n in Counter(c["level"] or "(없음)" for c in courses).most_common():
        lines.append(f"| {lv} | {n} |")
    other = sorted({c["sport"] for c in courses if c["category"] == "기타"})
    lines += ["", f"## '기타'로 분류된 종목 ({len(other)})", "", ", ".join(other) or "없음"]
    if any(st["bad_month"] for st in stats.values()):
        lines += ["", "## 데이터 오류", ""]
        for center, st in stats.items():
            if st["bad_month"]:
                ex = ", ".join(sorted(set(bad_examples[center]))[:3])
                lines.append(f"- {center}: 수강월 값이 날짜 형식이 아닌 행 {st['bad_month']}건 (값: {ex}) → 기간 시작일로 대체")
    OUT_REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")


MIN_PER_CENTER = 50      # 센터별 수록 강좌가 이보다 적으면 원본이 바뀐 것으로 보고 멈춤
MAX_DROP = 0.3           # 직전 결과보다 30% 넘게 줄면 멈춤 (--force로 무시)


def check_sane(courses: list[dict], stats: dict) -> None:
    """원본 형식이 바뀌어 조용히 빈 결과가 만들어지는 것을 막는다."""
    problems = []
    for center, st in stats.items():
        if center.startswith("_"):
            continue
        if st["kept"] < MIN_PER_CENTER:
            problems.append(f"{center}: 수록 {st['kept']}개 (현재 행 {st['open']}). 종료일 표기('{OPEN_END}')나 컬럼이 바뀌었는지 확인하세요.")
    if OUT_JSON.exists() and "--force" not in sys.argv:
        try:
            before = json.loads(OUT_JSON.read_text(encoding="utf-8"))["count"]
        except (ValueError, KeyError):
            before = 0
        if before and len(courses) < before * (1 - MAX_DROP):
            problems.append(f"전체 {before}개 → {len(courses)}개로 {MAX_DROP:.0%} 넘게 줄었습니다. 의도한 것이면 --force를 붙여 다시 실행하세요.")
    if problems:
        sys.exit("데이터 점검에서 멈췄습니다. 기존 courses.json은 바꾸지 않았습니다.\n- " + "\n- ".join(problems))


def main() -> None:
    courses, stats = build()
    # 센터·이름·시간·요일·금액이 모두 같은 행(예: 분당 '주1회 특별강습' 여러 건)은 하나로 묶음
    merged: dict[tuple, dict] = {}
    for c in courses:
        key = (c["center"], c["name"], c["start"], c["end"], tuple(c["days"]), c["price"])
        if key in merged:
            merged[key]["sameCount"] += 1
        else:
            c["sameCount"] = 1
            merged[key] = c
    stats["_merged"] = len(courses) - len(merged)
    courses = list(merged.values())
    check_sane(courses, stats)
    courses.sort(key=lambda c: (c["center"], c["category"], c["start"] or "99", c["name"]))
    payload = {
        "source": "공공데이터포털 한국체육산업개발주식회사 강좌정보 (15101610, 15110953, 15114776, 15118652, 15147992)",
        "recentFrom": RECENT_FROM,
        "count": len(courses),
        "spmLink": SPM_LINK,
        "infos": INFOS,
        "courses": courses,
    }
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    write_report(courses, stats)
    print(f"courses: {len(courses)} -> {OUT_JSON}")


if __name__ == "__main__":
    main()
