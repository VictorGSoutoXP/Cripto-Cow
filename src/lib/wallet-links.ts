export const phantomDownloadUrl = 'https://phantom.com/download';
export const zcashTestnetGuideUrl =
  'https://zcash.readthedocs.io/en/latest/rtd_pages/testnet_guide.html';
export const zcashSigningGuideUrl = 'https://zcash.github.io/rpc/signmessage.html';

export function phantomBrowseUrl(siteUrl: string): string | null {
  try {
    const site = new URL(siteUrl);
    if (
      site.protocol !== 'https:' ||
      site.username ||
      site.password ||
      /^(?:localhost|127\.|\[::1\])/.test(site.hostname) ||
      site.hostname.endsWith('.localhost')
    )
      return null;
    // Only the origin and fixed profile route travel to Phantom, never login tokens or challenges.
    const profile = `${site.origin}/#/perfil`;
    return `https://phantom.com/ul/browse/${encodeURIComponent(profile)}?ref=${encodeURIComponent(site.origin)}`;
  } catch {
    return null;
  }
}

export function zcashSigningCommand(address: string, message: string): string {
  // Bash single-quoted arguments preserve the exact multiline challenge and prevent interpolation.
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  return `zcash-cli -testnet signmessage ${quote(address)} ${quote(message)}`;
}
