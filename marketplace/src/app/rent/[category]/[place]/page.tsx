import type { Metadata } from 'next'
import { LandingPage, landingMetadata } from '@/components/LandingPage'

export async function generateMetadata({ params }: PageProps<'/rent/[category]/[place]'>): Promise<Metadata> {
  const { category, place } = await params
  return landingMetadata('rent', category, place)
}

export default async function Page({ params }: PageProps<'/rent/[category]/[place]'>) {
  const { category, place } = await params
  return <LandingPage tx="rent" category={category} place={place} />
}
