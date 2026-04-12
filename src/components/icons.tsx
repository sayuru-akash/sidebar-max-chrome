import type { SVGProps } from 'react';

export function PinIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path
        d="M15.6 4.4 19 7.8l-2.6 2.6v3.4l-2.4 2.4-2.9-2.9-4.7 6.1-.6-.6 6.1-4.7-2.9-2.9 2.4-2.4h3.4z"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path d="M6 6 18 18M18 6 6 18" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path d="M12 5v14M5 12h14" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function ExternalLinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path d="M8 8h8v8" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 8 7 17" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <circle cx="11" cy="11" r="6" strokeWidth="1.8" />
      <path d="m16 16 4 4" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

