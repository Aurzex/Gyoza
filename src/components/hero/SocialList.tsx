import clsx from 'clsx'
import { hero } from '@/config.json'

/**
 * 社交图标列表。
 *
 * 入场 stagger 动画由 CSS 实现（animation + 递增 animation-delay），
 * 纯 SSR 输出，无需客户端水合。
 */
export function SocialList({ className }: { className?: string }) {
  return (
    <ul
      className={clsx(
        'flex gap-4 flex-wrap items-center justify-center lg:justify-start',
        className
      )}
    >
      {hero.socials.map((social, index) => (
        <li key={social.name} className="social-item" style={{ animationDelay: `${index * 0.1}s` }}>
          <a
            className="relative size-9 text-white text-xl flex justify-center items-center group"
            href={social.url}
            title={social.name}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span
              className="absolute inset-0 -z-1 rounded-full group-hover:scale-105 transition"
              style={{ backgroundColor: social.color }}
            ></span>
            <i className={clsx('iconfont', social.icon)} />
          </a>
        </li>
      ))}
    </ul>
  )
}
