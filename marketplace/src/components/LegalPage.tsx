import type { ReactNode } from 'react'
import { Card, PageHeader } from './ui'

export interface LegalSection {
  title: string
  body: ReactNode
}

/** Plain, readable layout for privacy policy, terms, imprint and support. */
export function LegalPage({ title, intro, sections, updated }: { title: string; intro?: ReactNode; sections: LegalSection[]; updated?: string }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={title} subtitle={updated} />
      {intro && <p className="text-[15px] leading-relaxed text-gray-700">{intro}</p>}
      <Card className="divide-y divide-gray-100">
        {sections.map((s) => (
          <section key={s.title} className="space-y-2 p-5 text-[15px] leading-relaxed text-gray-700">
            <h2 className="text-lg font-bold text-gray-900">{s.title}</h2>
            {s.body}
          </section>
        ))}
      </Card>
    </div>
  )
}
