import html2canvas from 'html2canvas';

const PNG_EXPORT_SCALE = 4;

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function waitForRenderableAssets(root: HTMLElement) {
  await document.fonts.ready;

  const images = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    images.map((image) => {
      if (image.complete) return Promise.resolve();

      return new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      });
    })
  );

  await waitForNextPaint();
  await waitForNextPaint();
}

function createDetachedSnapshot(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const width = Math.max(rect.width, element.scrollWidth, element.offsetWidth);
  const height = Math.max(rect.height, element.scrollHeight, element.offsetHeight);

  const wrapper = document.createElement('div');
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.style.position = 'fixed';
  wrapper.style.left = '0';
  wrapper.style.top = '0';
  wrapper.style.zIndex = '-1';
  wrapper.style.pointerEvents = 'none';
  wrapper.style.margin = '0';
  wrapper.style.padding = '0';
  wrapper.style.border = '0';
  wrapper.style.backgroundColor = '#ffffff';
  wrapper.style.width = `${width}px`;
  wrapper.style.height = `${height}px`;
  wrapper.style.overflow = 'visible';

  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.margin = '0';
  clone.style.width = `${width}px`;
  clone.style.maxWidth = 'none';

  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  return { clone, wrapper, width, height };
}

async function renderSnapshotToCanvas(element: HTMLElement, width: number, height: number) {
  const baseOptions = {
    backgroundColor: '#ffffff',
    scale: PNG_EXPORT_SCALE,
    useCORS: true,
    logging: false,
    width,
    height,
    windowWidth: width,
    windowHeight: height,
    scrollX: 0,
    scrollY: 0,
  };

  try {
    return await html2canvas(element, {
      ...baseOptions,
      foreignObjectRendering: true,
    });
  } catch {
    return await html2canvas(element, baseOptions);
  }
}

export async function renderElementToPngBlob(element: HTMLElement): Promise<Blob | null> {
  const { clone, wrapper, width, height } = createDetachedSnapshot(element);
  try {
    await waitForRenderableAssets(wrapper);
    const canvas = await renderSnapshotToCanvas(clone, width, height);
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    );
  } finally {
    wrapper.remove();
  }
}

export async function exportElementAsPng(element: HTMLElement, filename: string) {
  const { clone, wrapper, width, height } = createDetachedSnapshot(element);

  try {
    await waitForRenderableAssets(wrapper);

    const canvas = await renderSnapshotToCanvas(clone, width, height);
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } finally {
    wrapper.remove();
  }
}