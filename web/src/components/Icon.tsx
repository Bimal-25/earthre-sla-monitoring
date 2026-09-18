import type { SVGProps } from "react";

export type IconName =
  | "upload"
  | "chevron"
  | "check"
  | "warning"
  | "error"
  | "file"
  | "clock"
  | "pulse"
  | "coverage"
  | "speed"
  | "filter"
  | "refresh"
  | "info";

const paths: Record<IconName, React.ReactNode> = {
  upload: <><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></>,
  chevron: <path d="m8 10 4 4 4-4"/>,
  check: <path d="m5 12 4 4L19 6"/>,
  warning: <><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.8 2.4 17.5A2 2 0 0 0 4.1 20h15.8a2 2 0 0 0 1.7-2.5L13.7 3.8a2 2 0 0 0-3.4 0Z"/></>,
  error: <><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></>,
  file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  pulse: <path d="M3 13h4l2-6 4 12 2-6h6"/>,
  coverage: <><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>,
  speed: <><path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 14 4-4"/></>,
  filter: <path d="M4 5h16l-6 7v5l-4 2v-7Z"/>,
  refresh: <><path d="M20 11a8 8 0 0 0-14-5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14 5l2-2"/><path d="M20 20v-4h-4"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></>,
};

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
