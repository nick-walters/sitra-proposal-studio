import html2canvas from 'html2canvas';
import PptxGenJS from 'pptxgenjs';

/**
 * Export a DOM element as a PNG image download.
 */
export async function exportAsPng(element: HTMLElement, filename: string) {
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
  });
  const link = document.createElement('a');
  link.download = `${filename}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/**
 * Export a DOM element as a single-slide PPTX file.
 */
export async function exportAsPptx(element: HTMLElement, filename: string) {
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
  });
  const imgData = canvas.toDataURL('image/png');

  const pptx = new PptxGenJS();
  const slide = pptx.addSlide();

  // Calculate dimensions to fit the slide (10" x 5.63" at 96 DPI)
  const slideW = 10;
  const slideH = 5.63;
  const imgAspect = canvas.width / canvas.height;
  const slideAspect = slideW / slideH;

  let w: number, h: number, x: number, y: number;
  if (imgAspect > slideAspect) {
    w = slideW;
    h = slideW / imgAspect;
    x = 0;
    y = (slideH - h) / 2;
  } else {
    h = slideH;
    w = slideH * imgAspect;
    x = (slideW - w) / 2;
    y = 0;
  }

  slide.addImage({ data: imgData, x, y, w, h });
  await pptx.writeFile({ fileName: `${filename}.pptx` });
}
