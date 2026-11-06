/** Resolve once an <img> has loaded. (img.decode() stalls in background tabs.) */
export function loadImage(img: HTMLImageElement): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (img.complete && img.naturalWidth > 0) return resolve(img);
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('failed to load ' + img.src));
  });
}
