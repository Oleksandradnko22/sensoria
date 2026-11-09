// Turns a raw navigator.userAgent string into a short "Browser · OS"
// label for the "Активні сеанси" list — deliberately simple regex
// matching (order matters: Edge/OPR contain "Chrome" too, so those
// checks come first) rather than a full UA-parsing dependency, since
// this only needs to be roughly right for a settings screen, not
// analytics-grade.

export function parseUserAgent(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
    ? "Opera"
    : /Chrome\//.test(ua)
    ? "Chrome"
    : /Firefox\//.test(ua)
    ? "Firefox"
    : /Safari\//.test(ua)
    ? "Safari"
    : "Невідомий браузер";

  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
    ? "Android"
    : /Mac OS X/.test(ua)
    ? "macOS"
    : /Windows/.test(ua)
    ? "Windows"
    : /Linux/.test(ua)
    ? "Linux"
    : null;

  return os ? `${browser} · ${os}` : browser;
}
