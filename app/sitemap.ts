import type { MetadataRoute } from 'next';
import { PAGES, publicUrl } from './seo';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  return Object.entries(PAGES).flatMap(([path, page]) => {
    const url = publicUrl(path);
    return page.index && url ? [{ url }] : [];
  });
}
