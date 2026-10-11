'use client'
import dynamic from 'next/dynamic'

/** MapLibre touches `window` – load it on the client only. */
export const PropertyMap = dynamic(() => import('./PropertyMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-gray-200" />,
})

export const LocationPicker = dynamic(() => import('./LocationPicker'), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-xl bg-gray-200" />,
})

export type { BBox } from './PropertyMap'
