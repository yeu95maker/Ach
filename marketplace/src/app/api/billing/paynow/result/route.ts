import { NextResponse } from 'next/server'
import { paynowKey } from '@/lib/billing/paynow'
import { parseMessage, toRecord, verifyHash } from '@/lib/billing/paynow-protocol'
import { settlePayment } from '@/lib/billing/settle'

/** Paynow result URL (server-to-server status update). */
export async function POST(request: Request) {
  const fields = parseMessage(await request.text())
  if (!verifyHash(fields, paynowKey())) return new NextResponse('invalid hash', { status: 400 })
  const reference = toRecord(fields).reference
  if (!reference) return new NextResponse('missing reference', { status: 400 })
  try {
    await settlePayment(reference)
  } catch {
    return new NextResponse('retry', { status: 500 })
  }
  return new NextResponse('OK')
}
