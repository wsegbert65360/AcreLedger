import type { EquipmentKind } from '@/types/equipment';

interface EquipmentIconProps {
  kind: EquipmentKind;
  color: string;
  size?: number;
  className?: string;
}

const wheel = (cx: number, cy: number, radius: number, key: string) => (
  <g key={key}>
    <circle cx={cx} cy={cy} r={radius} fill="#444441" />
    <circle cx={cx} cy={cy} r={radius * 0.42} fill="#B4B2A9" />
  </g>
);

const eyes = (x: number, y: number) => (
  <g>
    <circle cx={x} cy={y} r="2" fill="white" />
    <circle cx={x + 7} cy={y} r="2" fill="white" />
    <circle cx={x + 0.5} cy={y + 0.3} r="0.8" fill="#343431" />
    <circle cx={x + 7.5} cy={y + 0.3} r="0.8" fill="#343431" />
  </g>
);

function Machine({ kind, color }: Pick<EquipmentIconProps, 'kind' | 'color'>) {
  switch (kind) {
    case 'tractor':
      return <>
        <path d="M25 12h14l6 9h10v9H18V20h7z" fill={color} />
        <path d="M29 7h11v13H29z" fill={color} />
        <path d="M31 9h7v8h-7z" fill="#CFE8F5" />
        <path d="M48 11h2v10h-2z" fill="#444441" />
        {eyes(45, 24)}{wheel(27, 31, 7, 'a')}{wheel(51, 32, 4.5, 'b')}
      </>;
    case 'combine':
      return <>
        <path d="M14 20h35l7 10H18z" fill={color} />
        <path d="M35 8h14l5 13H35z" fill={color} />
        <path d="M39 10h8l3 8H39z" fill="#CFE8F5" />
        <path d="M47 9l11-5 1 2-10 7z" fill={color} />
        <path d="M4 27h18v3H4zM7 23h2v8h-2M14 23h2v8h-2" fill={color} />
        {eyes(25, 23)}{wheel(38, 31, 7, 'a')}{wheel(54, 32, 4, 'b')}
      </>;
    case 'sprayer':
      return <>
        <path d="M25 14h15v11H25z" fill={color} />
        <path d="M28 8h9l3 7H28z" fill={color} />
        <path d="M30 10h6l2 4h-8z" fill="#CFE8F5" />
        <rect x="14" y="23" width="36" height="3" rx="1.5" fill={color} />
        <path d="M8 20h48v2H8zM18 22h2v10h-2M46 22h2v10h-2" fill={color} />
        {eyes(28, 19)}{wheel(19, 33, 4, 'a')}{wheel(47, 33, 4, 'b')}
      </>;
    case 'planter':
      return <>
        <path d="M6 22h52v4H6z" fill={color} />
        {[13, 25, 37, 49].map((x) => <path key={x} d={`M${x - 4} 13h8l2 9h-12z`} fill={color} />)}
        {[13, 25, 37, 49].map((x) => wheel(x, 30, 3, `w${x}`))}
        {eyes(28, 18)}
      </>;
    case 'truck':
      return <>
        <path d="M7 13h29v17H7zM36 19h13l7 7v4H36z" fill={color} />
        <path d="M40 21h7l5 5H40z" fill="#CFE8F5" />
        <circle cx="53" cy="28" r="1.5" fill="#FFF4B0" />
        {eyes(18, 21)}{wheel(18, 32, 5, 'a')}{wheel(47, 32, 5, 'b')}
      </>;
    case 'tillage':
      return <>
        <path d="M7 17h42l8 7-3 4H12z" fill={color} />
        <path d="M14 28l5 7 5-7 5 7 5-7 5 7 5-7" fill="none" stroke="#444441" strokeWidth="2" />
        {eyes(22, 22)}
      </>;
    case 'implement':
      return <>
        <path d="M8 19h9l5-5h31v17H17l-5-5H8z" fill={color} />
        {eyes(30, 23)}{wheel(24, 32, 4, 'a')}{wheel(47, 32, 4, 'b')}
      </>;
    default:
      return <>
        <path d="M17 11a10 10 0 0 0 12 12L45 37l7-7-16-16A10 10 0 0 0 24 2l6 7-6 6z" fill={color} />
        {eyes(41, 29)}
      </>;
  }
}

export default function EquipmentIcon({ kind, color, size = 56, className }: EquipmentIconProps) {
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        alignItems: 'center',
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        borderRadius: 12,
        display: 'inline-flex',
        height: size * 0.75,
        justifyContent: 'center',
        width: size,
      }}
    >
      <svg viewBox="0 0 64 40" width={size * 0.86} height={size * 0.54}>
        <Machine kind={kind} color={color} />
      </svg>
    </span>
  );
}
