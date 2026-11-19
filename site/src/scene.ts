/** 첫 화면 오른쪽 장면. 새로고침할 때마다 종목이 바뀌고, 센터 레인·추천 강좌는 장면과 상관없이 같은 기능을 함 */
export interface Scene {
  id: "swim" | "skate" | "run" | "tennis";
  /** 화면에 보이는 이름 */
  label: string;
  /** 추천 강좌를 고를 때 우선하는 종목 분류 */
  category: string;
  /** 레인 위 안내 문구 */
  caption: string;
  /** 레인 한 줄(높이 58, 폭 112) 안에서 움직이는 그림 */
  actor: string;
}

const open = '<svg viewBox="0 0 124 64" width="112" height="58" aria-hidden="true" focusable="false">';

const swimArm = (cls: string) =>
  `<g class="a-arm ${cls}"><path class="limb" d="M86 30 86 16"/><g class="a-fore"><path class="limb" d="M86 16 86 2"/></g></g>`;

export const SCENES: Scene[] = [
  {
    id: "swim", label: "수영", category: "수영", caption: "수영 레인을 골라 센터별 강좌를 모아 보세요",
    actor: `${open}<g class="a-bob"><path class="limb a-leg a-leg-a" d="M38 36 14 42"/><path class="limb a-leg a-leg-b" d="M38 36 14 30"/><ellipse class="fill" cx="66" cy="34" rx="32" ry="10"/><circle class="fill" cx="102" cy="29" r="10"/><path class="cap" d="M92 27a10 10 0 0 1 20 0z"/>${swimArm("a-arm-a")}${swimArm("a-arm-b")}</g><circle class="drop d1" cx="10" cy="26" r="3"/><circle class="drop d2" cx="4" cy="38" r="2.4"/></svg>`,
  },
  {
    id: "skate", label: "스케이트", category: "스케이트", caption: "빙판 레인을 골라 센터별 강좌를 모아 보세요",
    actor: `${open}<g class="a-bob"><g class="a-leg a-leg-a"><path class="limb" d="M56 36 46 54"/><path class="limb thin" d="M38 57H54"/></g><g class="a-leg a-leg-b"><path class="limb" d="M56 36 66 54"/><path class="limb thin" d="M58 57H76"/></g><path class="limb" d="M56 36 74 20"/><circle class="fill" cx="82" cy="13" r="8"/><path class="cap" d="M74 11a8 8 0 0 1 16 0z"/><g class="a-arm a-arm-a"><path class="limb" d="M74 22 90 28"/></g><g class="a-arm a-arm-b lime"><path class="limb" d="M74 22 90 28"/></g></g></svg>`,
  },
  {
    id: "run", label: "달리기", category: "자전거·걷기", caption: "트랙 레인을 골라 센터별 강좌를 모아 보세요",
    actor: `${open}<g class="a-bob"><g class="a-leg a-leg-a"><path class="limb" d="M56 38 56 54"/></g><g class="a-leg a-leg-b"><path class="limb" d="M56 38 56 54"/></g><path class="limb" d="M56 38 60 20"/><circle class="fill" cx="62" cy="11" r="7"/><g class="a-arm a-arm-a"><path class="limb" d="M60 22 60 36"/></g><g class="a-arm a-arm-b lime"><path class="limb" d="M60 22 60 36"/></g></g></svg>`,
  },
  {
    id: "tennis", label: "테니스", category: "라켓", caption: "코트 레인을 골라 센터별 강좌를 모아 보세요",
    actor: `${open}<g class="a-ball-x"><ellipse class="shadow" cx="62" cy="54" rx="11" ry="3"/><g class="a-ball-y"><circle class="ball" cx="62" cy="44" r="8"/><path class="seam" d="M55 41c4 3 10 3 14 0M55 47c4-3 10-3 14 0"/></g></g></svg>`,
  },
];

/** 직전에 보여 준 장면과 다른 장면을 무작위로 고름 */
export function pickScene(prev: string | null, rnd: () => number = Math.random): Scene {
  const pool = SCENES.filter((s) => s.id !== prev);
  return pool[Math.floor(rnd() * pool.length)] ?? SCENES[0];
}
