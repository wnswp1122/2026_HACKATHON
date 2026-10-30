import { toBlob } from 'html-to-image';

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
export async function captureSnapshot(node: HTMLElement): Promise<Blob> {
  await document.fonts.ready;
  await frame();
  await frame();
  const width = node.scrollWidth;
  const height = node.scrollHeight;
  if (
    !node.isConnected ||
    width !== 1100 ||
    height > 4096 ||
    height === 0 ||
    !node.querySelector('.chart .recharts-surface')
  ) {
    throw new Error('고정 영역의 차트나 레이아웃이 준비되지 않았습니다. 캡처를 중단했습니다.');
  }
  const blob = await toBlob(node, {
    width,
    height,
    pixelRatio: 1,
    backgroundColor: '#0a0c10',
    preferredFontFormat: 'woff2',
    cacheBust: false,
  });
  if (!blob || blob.type !== 'image/png' || blob.size > 5 * 1024 * 1024)
    throw new Error('PNG를 만들지 못했거나 5 MiB를 초과했습니다. 분석을 중단했습니다.');
  const image = await createImageBitmap(blob);
  try {
    if (
      image.width !== width ||
      image.height !== height ||
      image.width > 4096 ||
      image.height > 4096
    )
      throw new Error('PNG 크기를 검증하지 못했습니다.');
  } finally {
    image.close();
  }
  return blob;
}
