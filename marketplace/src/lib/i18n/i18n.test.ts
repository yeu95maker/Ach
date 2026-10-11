import { describe, expect, it } from 'vitest'
import { de } from './dictionaries/de'
import { en } from './dictionaries/en'
import { createT } from './index'

describe('i18n', () => {
  it('has the same keys and placeholders in every language', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort())
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()
    for (const key of Object.keys(en) as (keyof typeof en)[]) expect(vars(de[key]), key).toEqual(vars(en[key]))
  })
  it('interpolates', () => {
    expect(createT('de')('search.titleIn', { where: 'Borrowdale' })).toBe('Immobilien in Borrowdale')
    expect(createT('en')('category.land')).toBe('Land')
  })
})
