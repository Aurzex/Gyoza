export function HeadGradient() {
  // 一次性入场动画由 CSS 实现（head-gradient-in），纯 SSR 输出
  return (
    <div
      className="head-gradient absolute -z-1 top-0 inset-x-0 h-[350px] bg-gradient-to-r from-accent/5 to-accent/15"
      style={{
        maskImage: 'linear-gradient(black, transparent)',
      }}
      aria-hidden
    />
  )
}
