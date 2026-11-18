// 직접 그린 선 아이콘 (24×24, currentColor). 올림픽 오륜 등 보호 표장은 쓰지 않음.

const wrap = (body: string, size = 24) =>
  `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const SPORT_BODY: Record<string, string> = {
  수영: '<circle cx="16.5" cy="6.5" r="2"/><path d="M4 12.5 9 9l3 2.5 4-1.5"/><path d="M2 17c1.7 0 1.7-1.3 3.3-1.3S7 17 8.7 17s1.7-1.3 3.3-1.3 1.7 1.3 3.3 1.3 1.7-1.3 3.4-1.3S20.3 17 22 17"/><path d="M2 20.5c1.7 0 1.7-1.3 3.3-1.3s1.7 1.3 3.4 1.3 1.7-1.3 3.3-1.3 1.7 1.3 3.3 1.3 1.7-1.3 3.4-1.3 1.6 1.3 3.3 1.3"/>',
  아쿠아: '<path d="M12 3s5 5.5 5 9a5 5 0 0 1-10 0c0-3.5 5-9 5-9z"/><path d="M2 20c1.7 0 1.7-1.3 3.3-1.3S7 20 8.7 20s1.7-1.3 3.3-1.3 1.7 1.3 3.3 1.3 1.7-1.3 3.4-1.3S20.3 20 22 20"/>',
  스케이트: '<path d="M6 4h5l1 7 6 2a2 2 0 0 1 2 2v1H5z"/><path d="M3 20h17a2 2 0 0 0 2-2"/><path d="M8 16v4M16 16v4"/>',
  "필라테스·요가": '<circle cx="12" cy="4.5" r="2"/><path d="M12 7v6"/><path d="M5 9.5 12 11l7-1.5"/><path d="M12 13l-4 5h8l-4-5z"/><path d="M3 21h18"/>',
  "헬스·PT": '<path d="M6.5 6.5v11M17.5 6.5v11"/><path d="M3.5 9v6M20.5 9v6"/><path d="M6.5 12h11"/>',
  "댄스·에어로빅": '<circle cx="13" cy="4.5" r="2"/><path d="M13 7l-2 6 3 3v5"/><path d="M11 13l-4 1"/><path d="M14 9l4-3"/><path d="M11 13l-2 8"/>',
  라켓: '<ellipse cx="9.5" cy="9.5" rx="5.5" ry="6.5" transform="rotate(-45 9.5 9.5)"/><path d="m13.5 13.5 6 6"/><path d="M6 8l5 5M8 6l5 5"/><circle cx="19" cy="5" r="1.6"/>',
  "골프·당구": '<path d="M7 21V3l9 3.5L7 10"/><circle cx="15.5" cy="17.5" r="3"/><path d="M4 21h8"/>',
  구기: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/>',
  "자전거·걷기": '<circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="M6 16l4-7h5l3 7"/><path d="M10 9 8 6H6"/><path d="M14 6h2"/>',
  무도: '<path d="M4 20 19 5"/><path d="M15 5h4v4"/><path d="M7 14l3 3"/><path d="M3 21l2-2"/>',
  기타: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/>',
};

export function sportIcon(category: string, size = 24): string {
  return wrap(SPORT_BODY[category] ?? SPORT_BODY["기타"], size);
}

/** 메달 + 레인: 사이트 로고 (오륜 대신 '메달'로 올림픽 시설을 떠올리게) */
export const LOGO = `<svg aria-hidden="true" width="36" height="36" viewBox="0 0 40 40">
  <path d="M12 2h6l3 10h-6z" fill="#2F5BEA"/><path d="M28 2h-6l-3 10h6z" fill="#1F45C8"/>
  <circle cx="20" cy="24" r="13" fill="#DDF57A" stroke="#1A1F26" stroke-width="2.4"/>
  <circle cx="20" cy="24" r="8.5" fill="none" stroke="#1A1F26" stroke-width="1.6" stroke-dasharray="2 2.4"/>
  <path d="M15 22.5h10M15 26h7.5" stroke="#1A1F26" stroke-width="2.2" stroke-linecap="round"/>
</svg>`;

export const ICON = {
  x: wrap('<path d="M6 6l12 12"/><path d="M18 6 6 18"/>', 14),
  check: wrap('<path d="m5 12 5 5 9-10"/>', 14),
  down: wrap('<path d="m6 9 6 6 6-6"/>', 12),
  heart: wrap('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>', 20),
  pin: wrap('<path d="M12 21s7-5.6 7-11a7 7 0 0 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>', 14),
  out: wrap('<path d="M7 17 17 7"/><path d="M8 7h9v9"/>', 14),
  copy: wrap('<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/>', 16),
  info: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>', 16),
  moon: wrap('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>', 16),
  sun: wrap('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', 16),
  sunrise: wrap('<path d="M4 18h16"/><path d="M7 18a5 5 0 0 1 10 0"/><path d="M12 6v4M5 11l1.5 1.5M19 11l-1.5 1.5"/>', 16),
  kid: wrap('<circle cx="12" cy="6" r="3"/><path d="M8 21v-6l-2-3 3-1h6l3 1-2 3v6"/>', 16),
  won: wrap('<path d="M4 7l3 10 3-8 2 0 3 8 3-10"/><path d="M3 11h18"/>', 16),
  link: wrap('<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>', 16),
  arrow: wrap('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>', 18),
  sparkle: wrap('<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m6 6 2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>', 16),
};
