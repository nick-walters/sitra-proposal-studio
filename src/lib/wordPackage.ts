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
 * Package layout:
 *   [Content_Types].xml
 *   _rels/.rels                  -> word/document.xml
 *   word/document.xml            -> <w:altChunk r:id="htmlChunk"/>
 *   word/_rels/document.xml.rels -> word/afchunk.htm (aFChunk relationship)
 *   word/afchunk.htm             -> the HTML body
 */
export async function buildDocxFromHtml(html: string): Promise<Blob> {
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="htm" ContentType="text/html"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
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
  <Relationship Id="htmlChunk" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk" Target="afchunk.htm"/>
</Relationships>`,
  );

  zip.file('word/afchunk.htm', '\ufeff' + html);

  return zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });
}
