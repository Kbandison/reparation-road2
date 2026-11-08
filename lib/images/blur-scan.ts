/**
 * The heavy, irreversible blur for scans that can't be shown in full (rights,
 * licensing, or the terms agreed with a document's owner). Browser only: it
 * draws on canvases, and renders PDFs with PDF.js.
 *
 * Each image is first shrunk to at most INFO_SIZE pixels on its long side.
 * That is what makes the blur safe: the detail is gone from the file, not just
 * hidden. At 200 pixels a page of handwriting keeps the shape of its lines but
 * no legible letter, and nothing can sharpen them back. The small image is
 * then softened and scaled up, so it reads as a blurred page rather than a
 * mosaic.
 *
 * A PDF comes back as a PDF (every page blurred the same way), so it still
 * opens in the browser's PDF viewer like any other.
 */

/** Long side of the shrink that throws the detail away. */
const INFO_SIZE = 200;
/** Size the softening passes run at. */
const SOFTEN_SIZE = 480;
/** Long side of the blurred copy (never larger than the original). */
const OUTPUT_SIZE = 1200;
const JPEG_QUALITY = 0.8;
/** Long side PDF pages are rendered at before the shrink. */
const PDF_RENDER_SIZE = 800;
const MAX_PDF_PAGES = 500;

export type ScanKind = 'image' | 'pdf';

export interface BlurredScan {
  blob: Blob;
  contentType: 'image/jpeg' | 'application/pdf';
  pages: number;
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not create a drawing surface.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

/** Width and height scaled so the long side is `max`. */
function scaledTo(width: number, height: number, max: number) {
  const scale = max / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Shrinks in halving steps. One big drawImage from thousands of pixels down to
 * a hundred samples only a few of them; halving averages every pixel in.
 */
function shrink(source: CanvasImageSource, width: number, height: number, max: number): HTMLCanvasElement {
  const target = scaledTo(width, height, Math.min(max, Math.max(width, height)));
  let current: CanvasImageSource = source;
  let w = width;
  let h = height;
  while (w / 2 > target.width && h / 2 > target.height) {
    w = Math.round(w / 2);
    h = Math.round(h / 2);
    const step = makeCanvas(w, h);
    context(step).drawImage(current, 0, 0, w, h);
    current = step;
  }
  const out = makeCanvas(target.width, target.height);
  const ctx = context(out);
  // Transparent areas would turn black in a JPEG; scans sit on white.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, target.width, target.height);
  ctx.drawImage(current, 0, 0, target.width, target.height);
  return out;
}

/** One sliding-window pass of a box blur, along rows or columns, edges clamped. */
function boxPass(src: Uint8ClampedArray, dst: Uint8ClampedArray, width: number, height: number, radius: number, horizontal: boolean) {
  const lines = horizontal ? height : width;
  const length = horizontal ? width : height;
  const step = horizontal ? 4 : width * 4;
  const span = radius * 2 + 1;
  for (let line = 0; line < lines; line++) {
    const start = horizontal ? line * width * 4 : line * 4;
    for (let channel = 0; channel < 4; channel++) {
      const at = (i: number) => src[start + Math.min(length - 1, Math.max(0, i)) * step + channel];
      let sum = 0;
      for (let i = -radius; i <= radius; i++) sum += at(i);
      for (let i = 0; i < length; i++) {
        dst[start + i * step + channel] = sum / span;
        sum += at(i + radius + 1) - at(i - radius);
      }
    }
  }
}

/** Three box blurs in a row come out very close to a Gaussian blur. */
function gaussianish(canvas: HTMLCanvasElement, radius: number) {
  const ctx = context(canvas);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const buffer = new Uint8ClampedArray(image.data.length);
  for (let pass = 0; pass < 3; pass++) {
    boxPass(image.data, buffer, canvas.width, canvas.height, radius, true);
    boxPass(buffer, image.data, canvas.width, canvas.height, radius, false);
  }
  ctx.putImageData(image, 0, 0);
}

/** The blurred copy of one page or image, as a canvas. */
function blurDrawable(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const tiny = shrink(source, width, height, INFO_SIZE);

  const soft = scaledTo(width, height, Math.min(SOFTEN_SIZE, Math.max(width, height)));
  const softCanvas = makeCanvas(soft.width, soft.height);
  context(softCanvas).drawImage(tiny, 0, 0, soft.width, soft.height);
  // A light softening: enough to hide the 200-pixel grid, not the page's layout.
  gaussianish(softCanvas, Math.max(2, Math.round(Math.max(soft.width, soft.height) / 120)));

  const out = scaledTo(width, height, Math.min(OUTPUT_SIZE, Math.max(width, height)));
  const outCanvas = makeCanvas(out.width, out.height);
  context(outCanvas).drawImage(softCanvas, 0, 0, out.width, out.height);
  return outCanvas;
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The browser could not encode the blurred image.'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

async function blurImage(file: Blob): Promise<BlurredScan> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This image couldn't be opened in the browser (TIFF and some other formats can't be).");
  }
  try {
    const blurred = blurDrawable(bitmap, bitmap.width, bitmap.height);
    return { blob: await toJpeg(blurred), contentType: 'image/jpeg', pages: 1 };
  } finally {
    bitmap.close();
  }
}

async function blurPdf(file: Blob, assetsBase: string): Promise<BlurredScan> {
  const [pdfjs, { PDFDocument }] = await Promise.all([import('pdfjs-dist'), import('pdf-lib')]);
  pdfjs.GlobalWorkerOptions.workerSrc = `${assetsBase}pdf.worker.min.mjs`;

  const loading = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    // Decoders and fonts load from public/pdfjs/ (scripts/copy-pdfjs-assets.mjs).
    wasmUrl: `${assetsBase}wasm/`,
    cMapUrl: `${assetsBase}cmaps/`,
    standardFontDataUrl: `${assetsBase}standard_fonts/`,
    iccUrl: `${assetsBase}iccs/`,
  });

  try {
    const source = await loading.promise;
    if (source.numPages > MAX_PDF_PAGES) {
      throw new Error(`This PDF has ${source.numPages} pages; the blur handles up to ${MAX_PDF_PAGES}.`);
    }
    const output = await PDFDocument.create();
    for (let n = 1; n <= source.numPages; n++) {
      const page = await source.getPage(n);
      // Page size in PDF points, rotation applied, so the blurred page matches it.
      const size = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: PDF_RENDER_SIZE / Math.max(size.width, size.height) });
      const rendered = makeCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvas: rendered, viewport }).promise;
      page.cleanup();

      const jpeg = await toJpeg(blurDrawable(rendered, rendered.width, rendered.height));
      const embedded = await output.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));
      output
        .addPage([size.width, size.height])
        .drawImage(embedded, { x: 0, y: 0, width: size.width, height: size.height });
    }
    const bytes = await output.save();
    return { blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), contentType: 'application/pdf', pages: source.numPages };
  } finally {
    // Shuts the PDF.js worker down too.
    await loading.destroy();
  }
}

/**
 * The blurred copy of a scan: a JPEG for an image, a PDF for a PDF.
 * `assetsBase` is where PDF.js's runtime files are served (trailing slash).
 */
export function blurScan(file: Blob, kind: ScanKind, assetsBase = '/pdfjs/'): Promise<BlurredScan> {
  return kind === 'pdf' ? blurPdf(file, assetsBase) : blurImage(file);
}
