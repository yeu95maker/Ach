import type { Metadata } from 'next'
import { LandingPage, landingMetadata } from '@/components/LandingPage'

export async function generateMetadata({ params }: PageProps<'/buy/[category]/[place]'>): Promise<Metadata> {
  const { category, place } = await params
  return landingMetadata('buy', category, place)
}

export default async function Page({ params }: PageProps<'/buy/[category]/[place]'>) {
  const { category, place } = await params
  return <LandingPage tx="buy" category={category} place={place} />
}
