import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

function Svg({ children, className = 'h-4 w-4', ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      {children}
    </svg>
  );
}

export function ClipboardIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="8" y="2.5" width="8" height="4" rx="1.2" />
      <path d="M16.5 4.6H18a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.6a2 2 0 0 1 2-2h1.5" />
      <path d="M8 11.5h8M8 15.5h5" />
    </Svg>
  );
}

export function ClipboardCheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="8" y="2.5" width="8" height="4" rx="1.2" />
      <path d="M16.5 4.6H18a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.6a2 2 0 0 1 2-2h1.5" />
      <path d="m8.5 13.5 2.5 2.5 4.5-5" />
    </Svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14" />
    </Svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </Svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.2 21 19.5H3z" />
      <path d="M12 9v4.5M12 16.8v.2" />
    </Svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.8v.2" />
    </Svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15.5 5.8A2.3 2.3 0 0 0 13.2 3.5H6.5A2.5 2.5 0 0 0 4 6v6.7a2.3 2.3 0 0 0 2.3 2.3" />
    </Svg>
  );
}

export function InsertIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 20V4" />
      <path d="m6.5 9.5 5.5-5.5 5.5 5.5" />
      <path d="M5 20h14" />
    </Svg>
  );
}

export function ExpandIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />
    </Svg>
  );
}

export function GripIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" strokeWidth={2.6} />
    </Svg>
  );
}
