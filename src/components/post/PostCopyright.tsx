import { author, site } from '@/config.json'
import { getFormattedDateTime } from '@/utils/date'
import { toast } from '@/store/toast'

function getPostUrl(slug: string) {
  return new URL(slug, site.url).href
}

export function PostCopyright({
  title,
  slug,
  lastMod,
}: {
  title: string
  slug: string
  lastMod: Date
}) {
  // 纯函数，SSR 直接渲染（此前用 useEffect 延迟填充，client:visible 水合前
  // 一直为空——修复：初始 HTML 即带最后修改时间）
  const lastModStr = getFormattedDateTime(lastMod)
  const url = getPostUrl(slug)

  function handleCopyUrl() {
    navigator.clipboard.writeText(url)
    toast('已复制文章链接')
  }

  return (
    <section className="text-xs leading-loose text-secondary">
      <p>文章标题：{title}</p>
      <p>文章作者：{author.name}</p>
      <p>
        <span>文章链接：{url}</span>
        <span role="button" className="cursor-pointer select-none" onClick={handleCopyUrl}>
          [复制]
        </span>
      </p>
      <p>最后修改时间：{lastModStr}</p>
      <hr className="my-3 border-primary" />
      <div className="mt-4 space-y-2">
        <p>商业转载请联系站长获得授权，非商业转载请注明本文出处及文章链接。</p>
        <p>
          您可以自由地在任何媒体以任何形式复制和分发作品，也可以修改和创作，但分发衍生作品时必须采用相同的许可协议。
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 pt-3">
          <span>本文采用</span>
          <a
            className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-accent/10 text-accent font-medium"
            href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="text-sm font-semibold">CC</span>
            <span>BY-NC-SA 4.0</span>
          </a>
          <span>进行许可</span>
        </div>
      </div>
    </section>
  )
}
