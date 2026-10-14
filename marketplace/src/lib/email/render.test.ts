import { describe, expect, it } from 'vitest'
import { renderEmail } from './render'

const base = { id: '1', to: 'a@b.c', name: 'Rudo', locale: 'en', link: '/messages/x' }

describe('renderEmail', () => {
  it('renders a new-message email with a link and escapes HTML', () => {
    const e = renderEmail({ ...base, kind: 'new_message', params: { title: 'Family Home', from: 'Tariro', body: 'Is it <still> available?' } }, 'https://pf.example')
    expect(e.subject).toBe('New message from Tariro about “Family Home”')
    expect(e.text).toContain('https://pf.example/messages/x')
    expect(e.html).toContain('&lt;still&gt;')
    expect(e.html).not.toContain('<still>')
  })
  it('uses the recipient language and notification texts', () => {
    const e = renderEmail({ ...base, locale: 'de', kind: 'property_approved', params: { title: 'Stand in Ruwa', body: '' } }, 'https://pf.example')
    expect(e.subject).toBe('Ihr Inserat ist online: Stand in Ruwa')
    expect(e.text.startsWith('Hallo Rudo')).toBe(true)
  })
  it('renders team invitations', () => {
    const e = renderEmail({ ...base, name: '', kind: 'team_invite', link: '/provider/join?token=abc', params: { provider: 'ABC Properties', from: 'Rudo' } }, 'https://pf.example')
    expect(e.subject).toContain('ABC Properties')
    expect(e.text).toContain('/provider/join?token=abc')
  })
})
