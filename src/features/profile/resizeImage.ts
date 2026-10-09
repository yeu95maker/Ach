/** Downscale + re-encode an image client-side (keeps uploads small, strips EXIF). */
export async function resizeImage(file: File, maxSize = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const size = { w: Math.round(bitmap.width * scale), h: Math.round(bitmap.height * scale) }
  const canvas = document.createElement('canvas')
  canvas.width = size.w
  canvas.height = size.h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, size.w, size.h)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/webp', 0.86),
  )
}
