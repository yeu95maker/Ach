import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge the custom shadow tokens so they merge correctly.
const twMerge = extendTailwindMerge({ extend: { classGroups: { shadow: [{ shadow: ['card'] }] } } })

/** Conditional class names; later Tailwind classes win over earlier conflicting ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
