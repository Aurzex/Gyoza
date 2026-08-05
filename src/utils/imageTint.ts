/**
 * 图片主色取样：头像/封面加载完成后，从图片提取平均色并柔和化，
 * 作为卡片背景色（配合 CSS transition 渐变为新背景色）。
 * 跨域图片（canvas 被污染）或取样失败时保持默认统一色（渐进增强）。
 */
export function initImageTint(cardSelector: string) {
  const apply = (img: HTMLImageElement) => {
    const card = img.closest(cardSelector)
    if (!(card instanceof HTMLElement)) return
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 32
      canvas.height = 32
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(img, 0, 0, 32, 32)
      const { data } = ctx.getImageData(0, 0, 32, 32)

      let r = 0
      let g = 0
      let b = 0
      let count = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue // 跳过透明像素
        r += data[i]
        g += data[i + 1]
        b += data[i + 2]
        count++
      }
      if (!count) return

      r = Math.round(r / count)
      g = Math.round(g / count)
      b = Math.round(b / count)

      // 与白色混合 80%：柔和浅色调，保持整体视觉统一
      const mix = 0.8
      const fr = Math.round(r + (255 - r) * mix)
      const fg = Math.round(g + (255 - g) * mix)
      const fb = Math.round(b + (255 - b) * mix)

      card.style.backgroundColor = `rgb(${fr} ${fg} ${fb} / 0.55)`
    } catch {
      // 跨域等原因无法读取像素：保持默认统一色
    }
  }

  // 图片 load 事件不冒泡，需捕获阶段在 document 上监听
  document.addEventListener(
    'load',
    (event) => {
      const target = event.target
      if (target instanceof HTMLImageElement && target.complete) {
        apply(target)
      }
    },
    true
  )

  // 兜底：监听器注册前已加载完成的图片（缓存命中）直接处理
  document.querySelectorAll<HTMLImageElement>(`${cardSelector} img`).forEach((img) => {
    if (img.complete && img.naturalWidth > 0) {
      apply(img)
    }
  })
}
