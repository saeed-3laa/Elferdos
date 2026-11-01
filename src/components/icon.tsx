import type { ReactNode } from "react";

const paths = {
  bell:<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  box: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5"/></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  cart: <><path d="M2 3h3l3 12h11l3-9H6M8 15l-1 3h13"/><circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
  users: <><circle cx="9" cy="7" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M17 4a3 3 0 0 1 0 6M22 21v-3a7 7 0 0 0-4-6"/></>,
  truck: <><path d="M2 4h12v13H2zM14 9h4l4 5v3h-8"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/></>,
  wallet: <><rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 8V5a2 2 0 0 1 2-2h13M16 11h5v5h-5a2.5 2.5 0 0 1 0-5Z"/></>,
  search: <><circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/></>,
  arrow: <path d="M21 12H3m7-7-7 7 7 7"/>,
  report: <><path d="M4 3v18h17M9 16v-5M14 16V6M19 16v-8"/></>,
  tag: <><path d="M3 3h9l9 9-9 9-9-9V3Z"/><circle cx="8" cy="8" r="1"/></>,
  settings: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
  shield: <><path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z"/><path d="m8 12 3 3 5-6"/></>,
  history: <><path d="M3 11a9 9 0 1 1 2.7 7M3 3v8h8M12 7v5l3 2"/></>,
  excel: <><path d="M14 2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9l-7-7ZM14 2v7h7M8 12l6 6M14 12l-6 6"/></>,
  logout: <><path d="M9 3H4v18h5M9 12h13m-5-5 5 5-5 5"/></>,
  check: <path d="m5 12 4 4L20 5"/>,
  location: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></>,
  menu: <path d="M3 6h18M3 12h18M3 18h18"/>,
} satisfies Record<string, ReactNode>;
export type IconName = keyof typeof paths;
export function Icon({name,className=""}:{name:IconName;className?:string}) {
  return <svg className={`icon ${className}`} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
