import JSZip from 'jszip';

/**
 * Builds a genuine OOXML (.docx) package around an HTML body.
 *
 * The previous export wrote a raw HTML string with a `.docx` filename. Word
 * refuses to open that: the extension promises a ZIP-based OOXML package and
 * the bytes are `<!DOCTYPE html>`, so Word reports the file as corrupt and
 * stops. (The same bytes named `.doc` would have opened, because the legacy
 * `.doc` reader sniffs HTML — the extension was the entire defect.)
 *
 * Rather than re-authoring every renderer against the `docx` object model, we
 * keep the existing HTML pipeline and wrap it in a valid package that embeds
 * the HTML as an "alternative format import" (`w:altChunk`). Word converts the
 * chunk into native content when the document is opened, preserving the styling
 * the HTML pipeline already produces.
 *
 * The chunk is written as MHTML (`message/rfc822`) rather than plain HTML,
 * because Word's HTML importer drops `data:` URIs. Every inline base64 image is
 * therefore lifted into its own MIME part and referenced by `Content-Location`.
 *
 * Package layout:
 *   [Content_Types].xml
 *   _rels/.rels                  -> word/document.xml
 *   word/document.xml            -> <w:altChunk r:id="htmlChunk"/>
 *   word/_rels/document.xml.rels -> word/afchunk.mht (aFChunk relationship)
 *   word/afchunk.mht             -> MHTML: the HTML body plus its images
 */

const BOUNDARY = '----=_NextPart_SitraProposalStudio';

/** Wraps a base64 payload at 76 characters, as required by MIME. */
function wrapBase64(data: string): string {
  return (data.match(/.{1,76}/g) ?? []).join('\r\n');
}

/**
 * Replaces every `data:` image URI with a `Content-Location` URL and returns
 * the rewritten HTML together with the extracted image parts.
 */
function extractInlineImages(html: string): {
  html: string;
  images: { location: string; mime: string; base64: string }[];
} {
  const images: { location: string; mime: string; base64: string }[] = [];
  let index = 0;

  const rewritten = html.replace(
    /(<img\b[^>]*?\bsrc=)(["'])data:(image\/[a-zA-Z0-9.+-]+);base64,([^"']+)\2/g,
    (_match, prefix: string, quote: string, mime: string, base64: string) => {
      index += 1;
      const extension = mime.split('/')[1]?.replace('svg+xml', 'svg') ?? 'png';
      const location = `http://sitra.local/image${index}.${extension}`;
      images.push({ location, mime, base64: base64.replace(/\s+/g, '') });
      return `${prefix}${quote}${location}${quote}`;
    },
  );

  return { html: rewritten, images };
}

function buildMhtml(html: string): string {
  const { html: rewritten, images } = extractInlineImages(html);
  const root = 'http://sitra.local/document.htm';

  const parts: string[] = [];
  parts.push(
    [
      'MIME-Version: 1.0',
      `Content-Type: multipart/related; boundary="${BOUNDARY}"; type="text/html"`,
      '',
      `--${BOUNDARY}`,
      'Content-Type: text/html; charset="utf-8"',
      'Content-Transfer-Encoding: base64',
      `Content-Location: ${root}`,
      '',
      wrapBase64(base64EncodeUtf8(rewritten)),
      '',
    ].join('\r\n'),
  );

  for (const image of images) {
    parts.push(
      [
        `--${BOUNDARY}`,
        `Content-Type: ${image.mime}`,
        'Content-Transfer-Encoding: base64',
        `Content-Location: ${image.location}`,
        '',
        wrapBase64(image.base64),
        '',
      ].join('\r\n'),
    );
  }

  parts.push(`--${BOUNDARY}--\r\n`);
  return parts.join('');
}

/** UTF-8 safe base64 encoding (btoa alone throws on non-Latin-1 characters). */
function base64EncodeUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function buildDocxFromHtml(html: string): Promise<Blob> {
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/afchunk.mht" ContentType="message/rfc822"/>
</Types>`,
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );

  // A4 portrait, 1.5 cm margins (850 twentieths of a point = 1.5 cm).
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:altChunk r:id="htmlChunk"/>
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="0" w:footer="0" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`,
  );

  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="htmlChunk" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="afchunk.mht"/>
</Relationships>`,
  );

  zip.file('word/afchunk.mht', buildMhtml(html));

  return zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });
}
