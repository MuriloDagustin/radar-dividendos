import type { MetadataRoute } from 'next';
import { publicUrl, siteUrl } from './seo';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  const prefix = siteUrl()?.pathname.replace(/\/$/, '') ?? '';
  return {
    rules: { userAgent: '*', allow: '/', disallow: [`${prefix}/api/`, `${prefix}/data/`] },
    sitemap: publicUrl('/sitemap.xml'),
  };
}
