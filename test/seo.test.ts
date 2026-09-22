import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageMetadata, publicUrl, siteUrl } from '../app/seo';
import sitemap from '../app/sitemap';
import robots from '../app/robots';

afterEach(() => vi.unstubAllEnvs());

describe('public SEO URLs', () => {
  it('preserves the Pages subdirectory exactly once', () => {
    vi.stubEnv('RADAR_SITE_URL', 'https://example.github.io/radar-dividendos/');
    expect(publicUrl('/fiis')).toBe('https://example.github.io/radar-dividendos/fiis');
    expect(pageMetadata('/acoes').alternates?.canonical).toBe('https://example.github.io/radar-dividendos/acoes');
    expect(sitemap().map(entry => entry.url)).toEqual([
      'https://example.github.io/radar-dividendos/',
      'https://example.github.io/radar-dividendos/acoes',
      'https://example.github.io/radar-dividendos/fiis',
      'https://example.github.io/radar-dividendos/termos',
    ]);
    expect(robots().sitemap).toBe('https://example.github.io/radar-dividendos/sitemap.xml');
    expect(robots().rules).toMatchObject({ disallow: ['/radar-dividendos/api/', '/radar-dividendos/data/'] });
  });

  it('supports a custom domain without a trailing slash', () => {
    vi.stubEnv('RADAR_SITE_URL', 'https://radar.example');
    expect(publicUrl('/fiis')).toBe('https://radar.example/fiis');
  });

  it('does not publish invented URLs when deployment is unconfigured', () => {
    vi.stubEnv('RADAR_SITE_URL', '');
    expect(pageMetadata('/').alternates).toBeUndefined();
    expect(sitemap()).toEqual([]);
    expect(robots().sitemap).toBeUndefined();
  });

  it('rejects query parameters and non-HTTP URLs in deployment configuration', () => {
    for (const value of ['https://radar.example/?t=PETR4', 'ftp://radar.example']) {
      vi.stubEnv('RADAR_SITE_URL', value);
      expect(siteUrl).toThrow();
    }
  });

  it('lets crawlers read noindex on parameter-driven tools', () => {
    vi.stubEnv('RADAR_SITE_URL', 'https://radar.example');
    for (const path of ['/analise', '/carteira'] as const) {
      expect(pageMetadata(path).robots).toEqual({ index: false, follow: true });
      expect(robots().rules).not.toHaveProperty('disallow', expect.arrayContaining([path]));
    }
  });
});
