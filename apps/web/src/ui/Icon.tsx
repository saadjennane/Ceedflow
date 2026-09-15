/** One stroke-based icon set, 24px grid, so every glyph shares a weight. */
const PATHS: Record<string, string> = {
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l6 4V6L6 10H4a1 1 0 0 0-1 1Z M16 8a4 4 0 0 1 0 8 M6 14v4a2 2 0 0 0 4 0',
  form: 'M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h4',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z',
  gavel: 'M4 20h9 M6.5 14.5l4-4 M9 8l5 5 3-3-5-5z M13 16l3-3 4 4-3 3z',
  filter: 'M4 5h16l-6 7v6l-4 2v-8z',
  presentation: 'M3 4h18 M4 4v10h16V4 M12 14v4 M9 21l3-3 3 3',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M15.5 8.5l-2 5-5 2 2-5z',
  file: 'M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z M14 3v4h4',
  calendar: 'M4 6h16v15H4z M4 10h16 M8 3v4 M16 3v4',
  send: 'M21 3 10.5 13.5 M21 3l-6.5 18-4-8-8-4z',
  users: 'M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M2 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5 M17 11a3 3 0 1 0 0-6 M18 14.5c2.4.5 4 2.5 4 5',
  square: 'M4 4h16v16H4z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z M16.2 16.2 21 21',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  list: 'M4 6h16 M4 12h16 M4 18h16',
  home: 'M4 11 12 4l8 7 M6 10v10h12V10',
  layers: 'm12 3 9 5-9 5-9-5z M3 13l9 5 9-5',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  check: 'm5 13 4 4 10-10',
  x: 'M6 6l12 12 M18 6 6 18',
  chevronRight: 'm9 5 7 7-7 7',
  chevronDown: 'm5 9 7 7 7-7',
  chevronLeft: 'm15 5-7 7 7 7',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
  drag: 'M9 6h.01 M9 12h.01 M9 18h.01 M15 6h.01 M15 12h.01 M15 18h.01',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14.5a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.5 1.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z',
  link: 'M10 13a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7L11.5 6 M14 11a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l1.5-1.5',
  eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  copy: 'M9 9h10v12H9z M15 9V3H5v12h4',
  arrowRight: 'M4 12h16 M14 6l6 6-6 6',
  alert: 'M12 3 2 20h20L12 3Z M12 9v5 M12 17h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 7v5l3 2',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  edit: 'M4 20h4L20 8l-4-4L4 16z M14 6l4 4',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  const d = PATHS[name] ?? PATHS.square;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {d.split(' M').map((part, i) => (
        <path key={i} d={i === 0 ? part : `M${part}`} />
      ))}
    </svg>
  );
}
