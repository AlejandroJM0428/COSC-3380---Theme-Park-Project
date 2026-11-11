import { useEffect, useState } from 'react'

// A background-image block that shows a neutral gradient when the image is missing or fails.
// Usage: <BrandImage src={BRAND.images.hero} className="hero" label="Roller coaster">content</BrandImage>
export default function BrandImage({ src, className = '', label, children, style }) {
  const [ok, setOk] = useState(Boolean(src))

  useEffect(() => {
    if (!src) { setOk(false); return undefined }
    let live = true
    const img = new Image()
    img.onload = () => { if (live) setOk(true) }
    img.onerror = () => { if (live) setOk(false) }
    img.src = src
    return () => { live = false }
  }, [src])

  return (
    <div
      className={`brand-image ${ok ? '' : 'brand-image-fallback'} ${className}`.trim()}
      style={ok ? { ...style, backgroundImage: `url(${src})` } : style}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      {children}
    </div>
  )
}
