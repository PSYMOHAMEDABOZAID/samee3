import type { ReactNode } from 'react'

/**
 * Keep all audio categories inside /audio, including Alafasy readings.
 * The previous top navigation duplicated the in-page Alafasy tab.
 */
export default function AudioLayout({ children }: { children: ReactNode }) {
  return <div dir="rtl">{children}</div>
}
