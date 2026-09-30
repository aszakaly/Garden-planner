/** Az ágyásokhoz és listákhoz választható színek (Apple rendszerszínek). */
export const LIST_COLORS = {
  red: 'var(--c-red)',
  orange: 'var(--c-orange)',
  yellow: 'var(--c-yellow)',
  green: 'var(--c-green)',
  mint: 'var(--c-mint)',
  teal: 'var(--c-teal)',
  cyan: 'var(--c-cyan)',
  blue: 'var(--c-blue)',
  indigo: 'var(--c-indigo)',
  purple: 'var(--c-purple)',
  pink: 'var(--c-pink)',
  brown: 'var(--c-brown)',
  gray: 'var(--c-gray)',
} as const;

export type ListColor = keyof typeof LIST_COLORS;

export function colorVar(color: string | undefined): string {
  return LIST_COLORS[color as ListColor] ?? LIST_COLORS.green;
}
