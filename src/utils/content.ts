import { getCollection, render } from 'astro:content'

/**
 * 构建期缓存（memoization）：
 * Footer 在每一页都会执行 getAllPostsWordCount（全量渲染文章 markdown），
 * 首页分页每个页面都会执行 tags/categories 聚合。SSG 构建是单进程顺序渲染，
 * 用模块级缓存让这些昂贵计算只执行一次。dev 模式下禁用缓存以支持 HMR。
 */
const useCache = import.meta.env.PROD

// 获取所有文章
async function getAllPosts() {
  const allPosts = await getCollection('posts', ({ data }) => {
    return import.meta.env.PROD ? data.draft !== true : true
  })

  return allPosts
}

let allPostsCache: Awaited<ReturnType<typeof getAllPosts>> | null = null

async function getPostsCached() {
  if (useCache && allPostsCache) return allPostsCache
  const posts = await getAllPosts()
  if (useCache) allPostsCache = posts
  return posts
}

// 获取所有文章，发布日期升序
async function getNewestPosts() {
  const allPosts = await getPostsCached()

  return allPosts.slice().sort((a, b) => {
    return a.data.date.valueOf() - b.data.date.valueOf()
  })
}

let newestPostsCache: Awaited<ReturnType<typeof getNewestPosts>> | null = null

export async function getNewestPostsCached() {
  if (useCache && newestPostsCache) return newestPostsCache
  const posts = await getNewestPosts()
  if (useCache) newestPostsCache = posts
  return posts
}

// 获取所有文章，发布日期降序
export async function getOldestPosts() {
  const allPosts = await getPostsCached()

  return allPosts.slice().sort((a, b) => {
    return b.data.date.valueOf() - a.data.date.valueOf()
  })
}

let oldestPostsCache: Awaited<ReturnType<typeof getOldestPosts>> | null = null

export async function getOldestPostsCached() {
  if (useCache && oldestPostsCache) return oldestPostsCache
  const posts = await getOldestPosts()
  if (useCache) oldestPostsCache = posts
  return posts
}

// 获取所有文章，置顶优先，发布日期降序
export async function getSortedPosts() {
  const allPosts = await getPostsCached()

  return allPosts.slice().sort((a, b) => {
    if (a.data.sticky !== b.data.sticky) {
      return b.data.sticky - a.data.sticky
    } else {
      return b.data.date.valueOf() - a.data.date.valueOf()
    }
  })
}

let sortedPostsCache: Awaited<ReturnType<typeof getSortedPosts>> | null = null

export async function getSortedPostsCached() {
  if (useCache && sortedPostsCache) return sortedPostsCache
  const posts = await getSortedPosts()
  if (useCache) sortedPostsCache = posts
  return posts
}

// 获取所有文章的字数（全量渲染 markdown，最昂贵的聚合，必须缓存）
export async function getAllPostsWordCount() {
  const allPosts = await getPostsCached()

  const promises = allPosts.map((post) => {
    return render(post)
  })

  const res = await Promise.all(promises)

  const wordCount = res.reduce((count, cur) => {
    return count + cur.remarkPluginFrontmatter.words
  }, 0)

  return wordCount
}

let wordCountCache: number | null = null

export async function getAllPostsWordCountCached() {
  if (useCache && wordCountCache !== null) return wordCountCache
  const count = await getAllPostsWordCount()
  if (useCache) wordCountCache = count
  return count
}

// 转换为 URL 安全的 slug，删除点，空格转为短横线，大写转为小写
export function slugify(text: string) {
  return text.replace(/\./g, '').replace(/\s/g, '-').toLowerCase()
}

// 获取所有分类
export async function getAllCategories() {
  const newestPosts = await getNewestPostsCached()

  const allCategories = newestPosts.reduce<{ slug: string; name: string; count: number }[]>(
    (acc, cur) => {
      if (cur.data.category) {
        const slug = slugify(cur.data.category)
        const index = acc.findIndex((category) => category.slug === slug)
        if (index === -1) {
          acc.push({
            slug,
            name: cur.data.category,
            count: 1,
          })
        } else {
          acc[index].count += 1
        }
      }
      return acc
    },
    []
  )

  return allCategories
}

let categoriesCache: Awaited<ReturnType<typeof getAllCategories>> | null = null

export async function getAllCategoriesCached() {
  if (useCache && categoriesCache) return categoriesCache
  const categories = await getAllCategories()
  if (useCache) categoriesCache = categories
  return categories
}

// 获取所有标签
export async function getAllTags() {
  const newestPosts = await getNewestPostsCached()

  const allTags = newestPosts.reduce<{ slug: string; name: string; count: number }[]>(
    (acc, cur) => {
      cur.data.tags.forEach((tag) => {
        const slug = slugify(tag)
        const index = acc.findIndex((tag) => tag.slug === slug)
        if (index === -1) {
          acc.push({
            slug,
            name: tag,
            count: 1,
          })
        } else {
          acc[index].count += 1
        }
      })
      return acc
    },
    []
  )

  return allTags
}

let tagsCache: Awaited<ReturnType<typeof getAllTags>> | null = null

export async function getAllTagsCached() {
  if (useCache && tagsCache) return tagsCache
  const tags = await getAllTags()
  if (useCache) tagsCache = tags
  return tags
}

// 获取热门标签
export async function getHotTags(len = 5) {
  const allTags = await getAllTagsCached()

  return allTags
    .slice()
    .sort((a, b) => {
      return b.count - a.count
    })
    .slice(0, len)
}
