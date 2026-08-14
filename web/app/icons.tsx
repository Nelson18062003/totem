// Jeu d'icônes au trait — cohérent, 1.5px, 24×24. Aucun emoji dans l'app.

type P = { className?: string; size?: number };

function base(size = 20) {
  return {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.5,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
}

export const IconHome = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M3.5 10.5 12 4l8.5 6.5" /><path d="M5.5 9.8V20h13V9.8" /></svg>
);
export const IconCard = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /></svg>
);
export const IconInbox = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M4 13V6h16v7" /><path d="M4 13h4l1.5 2.5h5L16 13h4v5H4z" /></svg>
);
export const IconChart = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M4 19V11M9.3 19V5M14.7 19v-5M20 19V8" /></svg>
);
export const IconGrid = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>
);
export const IconArrowDown = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 5v14" /><path d="m6.5 13.5 5.5 5.5 5.5-5.5" /></svg>
);
export const IconArrowUp = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 19V5" /><path d="m6.5 10.5 5.5-5.5 5.5 5.5" /></svg>
);
export const IconPlus = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconSearch = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
);
export const IconClose = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="m6 6 12 12M18 6 6 18" /></svg>
);
export const IconSettings = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.6 1.6 0 0 0 15 19.4a1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 4.6 15a1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 9 4.6a1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 15 4.6a1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.6 1.6 0 0 0 19.4 9v.09c0 .67.4 1.27 1.03 1.51H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></svg>
);
export const IconDownload = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 4v11" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M5 19h14" /></svg>
);
export const IconCopy = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>
);
export const IconRefund = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M4 10h11a4.5 4.5 0 1 1 0 9h-6" /><path d="m8 6-4 4 4 4" /></svg>
);
export const IconLock = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>
);
export const IconList = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" /></svg>
);
export const IconWallet = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><rect x="4" y="7.5" width="16" height="12" rx="2" /><path d="M16.5 13.5h.01" /></svg>
);
export const IconPhone = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18h2" /></svg>
);
export const IconBank = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M4 10h16M5 10v8m4.7-8v8m4.6-8v8M19 10v8M3.5 18h17M12 4l8 6H4z" /></svg>
);
export const IconChevron = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="m9 6 6 6-6 6" /></svg>
);
export const IconGlobe = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5c2.6 2.3 3.9 5.1 3.9 8.5s-1.3 6.2-3.9 8.5c-2.6-2.3-3.9-5.1-3.9-8.5s1.3-6.2 3.9-8.5Z" /></svg>
);
export const IconRefresh = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v4.5h-4.5" /></svg>
);
export const IconHash = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M9.5 4 8 20M16 4l-1.5 16M4.5 9h16M3.5 15h16" /></svg>
);
export const IconDoc = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 13h6M9 17h4" /></svg>
);
export const IconTransfer = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M4 8.5h13.5" /><path d="M14 5l3.5 3.5L14 12" /><path d="M20 15.5H6.5" /><path d="M10 12l-3.5 3.5L10 19" /></svg>
);
export const IconMegaphone = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M14 5.5 7 9H4.5v6H7l7 3.5z" /><path d="M17.5 9.5a4.5 4.5 0 0 1 0 5" /></svg>
);
export const IconBubble = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 4.5a7.5 7.5 0 0 1 0 15c-1.2 0-2.3-.28-3.3-.78L4.5 19.5l.8-4.2A7.5 7.5 0 0 1 12 4.5Z" /></svg>
);
export const IconMail = ({ size, className }: P) => (
  <svg {...base(size)} className={className}><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="m4.5 7.5 7.5 5.5 7.5-5.5" /></svg>
);
