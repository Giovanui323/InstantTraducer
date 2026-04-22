export interface CoverSearchResult {
  coverUrl: string | null;
  title: string | null;
  author: string | null;
  year: string | null;
  isbn: string;
  publishers?: string[];
  description?: string;
}

/**
 * Extract ISBN-10 or ISBN-13 from raw text (first pages of PDF).
 * Returns the first valid ISBN found, or null.
 */
export function extractIsbnFromText(text: string): string | null {
  const patterns = [
    // ISBN-13 with label
    /\bISBN[-\s]?13[:\s]*(\d[\d\s-]{11,}\d)/i,
    // ISBN-10 with label
    /\bISBN[-\s]?10[:\s]*(\d[\d\s-]{9,}[\dXx])/i,
    // Generic ISBN with label
    /\bISBN[:\s]*(\d[\d\s-]{9,}[\dXx])/i,
    // Standalone ISBN-13 (13 digits, possibly with hyphens)
    /\b(97[89][\d-]{10,13}\d)\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const cleaned = match[1].replace(/[-\s]/g, '');
      if (validateIsbnChecksum(cleaned)) return cleaned;
    }
  }
  return null;
}

function validateIsbnChecksum(isbn: string): boolean {
  const digits = isbn.replace(/[-\s]/g, '');
  if (digits.length === 13) {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(digits[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const check = (10 - (sum % 10)) % 10;
    return check === parseInt(digits[12]);
  }
  if (digits.length === 10) {
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(digits[i]) * (10 - i);
    }
    const last = digits[9].toUpperCase() === 'X' ? 10 : parseInt(digits[9]);
    const check = (11 - (sum % 11)) % 11;
    return check === last;
  }
  return false;
}

/**
 * Lookup book metadata and cover from Open Library API.
 * No API key required.
 */
export async function fetchOpenLibraryCover(isbn: string): Promise<CoverSearchResult> {
  const cleaned = isbn.replace(/[-\s]/g, '');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(
      `https://openlibrary.org/isbn/${encodeURIComponent(cleaned)}.json`,
      { signal: controller.signal }
    );

    if (!res.ok) {
      return { coverUrl: null, title: null, author: null, year: null, isbn: cleaned };
    }

    const data = await res.json();

    // Resolve author names
    let author: string | null = null;
    if (data.authors?.length > 0) {
      const authorKeys = data.authors
        .map((a: any) => a.key || a.author?.key)
        .filter(Boolean);
      if (authorKeys.length > 0) {
        try {
          const authorRes = await fetch(`https://openlibrary.org${authorKeys[0]}.json`, {
            signal: controller.signal
          });
          if (authorRes.ok) {
            const authorData = await authorRes.json();
            author = authorData.name || null;
          }
        } catch { /* non-critical */ }
      }
    }

    const coverId = data.covers?.[0];
    const coverUrl = coverId
      ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
      : null;

    return {
      coverUrl,
      title: data.title || null,
      author,
      year: data.publish_date || null,
      isbn: cleaned,
      publishers: data.publishers || [],
      description: typeof data.description === 'string' ? data.description : data.description?.value || undefined,
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return { coverUrl: null, title: null, author: null, year: null, isbn: cleaned };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generate a cover image as data URL using canvas.
 * Renders title, author, year with elegant styling.
 */
export function generateCoverDataURL(
  title: string,
  author?: string,
  year?: string
): string {
  const W = 400;
  const H = 600;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#1a1f2e');
  bgGrad.addColorStop(0.5, '#141824');
  bgGrad.addColorStop(1, '#0d1018');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Top decorative band
  const bandGrad = ctx.createLinearGradient(0, 0, W, 0);
  bandGrad.addColorStop(0, '#7c1d2e');
  bandGrad.addColorStop(0.5, '#9b2335');
  bandGrad.addColorStop(1, '#7c1d2e');
  ctx.fillStyle = bandGrad;
  ctx.fillRect(0, 0, W, 180);

  // Gold line under band
  ctx.fillStyle = '#fde68a';
  ctx.fillRect(0, 180, W, 2);

  // Decorative diamond
  ctx.save();
  ctx.translate(W / 2, 90);
  ctx.rotate(Math.PI / 4);
  ctx.strokeStyle = 'rgba(253, 230, 138, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(-15, -15, 30, 30);
  ctx.restore();

  // Title
  ctx.fillStyle = '#fde68a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const titleLines = wrapText(ctx, title || 'Senza Titolo', W - 60, 22, '600');
  const titleY = 210;
  ctx.font = '600 22px Georgia, "Times New Roman", serif';
  titleLines.forEach((line, i) => {
    ctx.fillText(line, W / 2, titleY + i * 30);
  });

  // Author
  if (author) {
    ctx.fillStyle = 'rgba(253, 230, 138, 0.65)';
    ctx.font = '400 15px Georgia, "Times New Roman", serif';
    const authorY = titleY + titleLines.length * 30 + 30;
    ctx.fillText(author, W / 2, authorY);

    // Small decorative line
    ctx.strokeStyle = 'rgba(253, 230, 138, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 40, authorY + 25);
    ctx.lineTo(W / 2 + 40, authorY + 25);
    ctx.stroke();
  }

  // Year
  if (year) {
    ctx.fillStyle = 'rgba(253, 230, 138, 0.4)';
    ctx.font = '400 12px Georgia, "Times New Roman", serif';
    ctx.fillText(year, W / 2, H - 50);
  }

  // Bottom label
  ctx.fillStyle = 'rgba(253, 230, 138, 0.25)';
  ctx.font = '700 8px sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText('ITRADUCER', W / 2, H - 22);

  // Subtle texture overlay
  ctx.fillStyle = 'rgba(255,255,255,0.01)';
  for (let y = 0; y < H; y += 3) {
    ctx.fillRect(0, y, W, 1);
  }

  return canvas.toDataURL('image/jpeg', 0.88);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontSize: number,
  weight: string
): string[] {
  ctx.font = `${weight} ${fontSize}px Georgia, "Times New Roman", serif`;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 6); // max 6 lines
}
