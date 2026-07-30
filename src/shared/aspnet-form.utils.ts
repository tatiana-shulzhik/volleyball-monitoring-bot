export function createPostbackForm(html: string): URLSearchParams {
  const form = new URLSearchParams();
  const inputRegex =
    /<input\b(?=[^>]*type="hidden")(?=[^>]*name="([^"]+)")(?=[^>]*value="([^"]*)")[^>]*>/gi;

  for (const match of html.matchAll(inputRegex)) {
    form.set(match[1], decodeHtml(match[2]));
  }

  return form;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
}
