'use client'
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react'
import { useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/client'
import { imageUrl } from '@/lib/images'

/** Swipeable photo gallery (scroll-snap) with "1 / 12" counter. */
export function Gallery({ images, total, locked }: { images: string[]; total: number; locked: boolean }) {
  const { t } = useI18n()
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)

  const go = (i: number) => {
    const el = track.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  if (!images.length) {
    return (
      <div className="flex aspect-[16/10] items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
        <ImageOff className="size-10" />
      </div>
    )
  }

  return (
    <div className="relative -mx-4 overflow-hidden bg-gray-900 md:mx-0 md:rounded-2xl">
      <div
        ref={track}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="scrollbar-none flex aspect-[16/10] snap-x snap-mandatory overflow-x-auto"
        aria-roledescription="carousel"
      >
        {images.map((src, i) => (
          <img key={src + i} src={imageUrl(src) ?? ''} alt={t('gallery.photo', { n: i + 1, total })}
            className={`h-full w-full shrink-0 snap-center object-cover ${locked ? 'blur-sm' : ''}`} loading={i === 0 ? 'eager' : 'lazy'} />
        ))}
      </div>
      {images.length > 1 && (
        <>
          <button type="button" aria-label={t('gallery.previous')} onClick={() => go(Math.max(0, index - 1))}
            className="absolute top-1/2 left-2 hidden -translate-y-1/2 rounded-full bg-white/90 p-2 shadow md:block"><ChevronLeft className="size-5" /></button>
          <button type="button" aria-label={t('gallery.next')} onClick={() => go(Math.min(images.length - 1, index + 1))}
            className="absolute top-1/2 right-2 hidden -translate-y-1/2 rounded-full bg-white/90 p-2 shadow md:block"><ChevronRight className="size-5" /></button>
        </>
      )}
      <span className="absolute right-3 bottom-3 rounded-full bg-black/65 px-2.5 py-1 text-xs font-semibold text-white">
        {locked ? `🔒 1 / ${total}` : `${index + 1} / ${images.length}`}
      </span>
    </div>
  )
}
