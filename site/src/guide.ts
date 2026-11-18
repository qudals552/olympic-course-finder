// 수준 안내: 할 수 있는 것을 고르면 강좌명 수준(1 입문·기초 ~ 4 상급)을 추천합니다.

export type GuideSport = "swim" | "skate" | "tennis" | "golf" | "badminton" | "pilates";

export interface Skill {
  id: string;
  label: string;
  /** 이 기술까지 할 수 있으면 추천할 수준 */
  next: number[];
}

export interface GuideSportDef {
  id: GuideSport;
  label: string;
  /** 아이콘에 쓸 종목 분류 */
  category: string;
  /** 찾기에 쓸 검색어 */
  text: string;
  skills: Skill[];
}

export const GUIDE_SPORTS: GuideSportDef[] = [
  {
    id: "swim", label: "수영", category: "수영", text: "수영",
    skills: [
      { id: "float", label: "물에 뜨고 발차기를 할 수 있어요", next: [1] },
      { id: "free", label: "자유형으로 25m를 갈 수 있어요", next: [1, 2] },
      { id: "back", label: "배영을 할 수 있어요", next: [2] },
      { id: "breast", label: "평영을 할 수 있어요", next: [3] },
      { id: "fly", label: "접영을 할 수 있어요", next: [4] },
      { id: "all", label: "네 가지 영법으로 쉬지 않고 여러 바퀴 돌 수 있어요", next: [4] },
    ],
  },
  {
    id: "skate", label: "스케이트", category: "스케이트", text: "스케이트",
    skills: [
      { id: "stand", label: "얼음 위에서 혼자 서 있을 수 있어요", next: [1, 2] },
      { id: "glide", label: "혼자 앞으로 미끄러져 나갈 수 있어요", next: [2] },
      { id: "stop", label: "멈추기와 방향 바꾸기를 할 수 있어요", next: [3] },
      { id: "cross", label: "크로스오버나 뒤로 타기를 할 수 있어요", next: [3, 4] },
    ],
  },
  {
    id: "tennis", label: "테니스", category: "라켓", text: "테니스",
    skills: [
      { id: "grip", label: "라켓으로 공을 넘길 수 있어요", next: [1, 2] },
      { id: "rally", label: "포핸드·백핸드로 5번 이상 주고받을 수 있어요", next: [2] },
      { id: "serve", label: "서브를 넣고 게임을 할 수 있어요", next: [3] },
      { id: "match", label: "복식 경기를 꾸준히 해요", next: [4] },
    ],
  },
  {
    id: "golf", label: "골프", category: "골프·당구", text: "골프",
    skills: [
      { id: "hold", label: "클럽 잡는 법과 기본 자세를 알아요", next: [1, 2] },
      { id: "iron", label: "7번 아이언으로 공을 똑바로 보낼 수 있어요", next: [2] },
      { id: "driver", label: "드라이버와 어프로치를 칠 수 있어요", next: [3] },
      { id: "round", label: "필드에 나가 라운딩을 해요", next: [4] },
    ],
  },
  {
    id: "badminton", label: "배드민턴", category: "라켓", text: "배드민턴",
    skills: [
      { id: "hit", label: "셔틀콕을 라켓에 맞힐 수 있어요", next: [1, 2] },
      { id: "clear", label: "하이클리어로 길게 주고받을 수 있어요", next: [2] },
      { id: "smash", label: "스매시와 드롭을 쓸 수 있어요", next: [3] },
      { id: "game", label: "복식 경기를 꾸준히 해요", next: [4] },
    ],
  },
  {
    id: "pilates", label: "필라테스·요가", category: "필라테스·요가", text: "",
    skills: [
      { id: "new", label: "운동을 거의 해 본 적이 없어요", next: [1] },
      { id: "regular", label: "주 2회 이상 운동한 지 3개월이 넘었어요", next: [1, 2] },
      { id: "basic", label: "기본 동작을 혼자 따라 할 수 있어요", next: [2] },
      { id: "hard", label: "균형·코어를 쓰는 고난도 동작도 해요", next: [3, 4] },
    ],
  },
];

export const LEVEL_LABEL: Record<number, string> = { 1: "입문·기초", 2: "초급", 3: "중급", 4: "상급" };

export const guideSport = (id: GuideSport) => GUIDE_SPORTS.find((s) => s.id === id)!;

/** 고른 기술 중 가장 높은 단계의 추천. 아무것도 못 하면 입문·기초 */
export function recommend(sport: GuideSport, checked: string[]): number[] {
  let best: number[] = [1];
  for (const s of guideSport(sport).skills) if (checked.includes(s.id)) best = s.next;
  return best;
}
