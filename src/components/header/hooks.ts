import { useAtomValue } from 'jotai'
import {
  pathNameAtom,
  metaTitleAtom,
  metaDescriptionAtom,
  metaSlugAtom,
  hasMetaInfoAtom,
} from '@/store/metaInfo'
import {
  pageScrollDirectionAtom,
  isHeaderScrolledAtom,
  isAccessibleMenuScrolledAtom,
} from '@/store/scrollInfo'
import { isMobileAtom } from '@/store/viewport'

export function useHasMetaInfo() {
  return useAtomValue(hasMetaInfoAtom)
}

export function useShouldHeaderMenuBgShow() {
  return !useAtomValue(isHeaderScrolledAtom)
}

export function useIsMobile() {
  return useAtomValue(isMobileAtom)
}

export function useShouldHeaderMetaShow() {
  const hasMetaInfo = useHasMetaInfo()
  const isScrolled = useAtomValue(isHeaderScrolledAtom)

  return hasMetaInfo && isScrolled
}

export function useHeaderMetaInfo() {
  const title = useAtomValue(metaTitleAtom)
  const description = useAtomValue(metaDescriptionAtom)
  const slug = useAtomValue(metaSlugAtom)

  return {
    title,
    description,
    slug,
  }
}

export function usePathName() {
  return useAtomValue(pathNameAtom)
}

export function useShouldAccessibleMenuShow() {
  const hasMetaInfo = useHasMetaInfo()
  const isScrolled = useAtomValue(isAccessibleMenuScrolledAtom)
  const scrollDirection = useAtomValue(pageScrollDirectionAtom)

  return hasMetaInfo && isScrolled && scrollDirection === 'up'
}
