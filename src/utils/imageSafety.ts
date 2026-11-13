// Photos for posts, prepared in the person's own browser — free and with no load on Sensoria:
//   1) a safety check: an open-source model (nsfwjs) looks for explicit images. It is downloaded only when someone
//      actually picks a photo, then cached by the browser;
//   2) gentle compression that keeps photos sharp: the longest side down to 2048 px (enough for any screen, retina
//      included), WebP at high quality, so a 5 MB phone photo becomes ~500–900 KB.
// The check is a first filter, not a guarantee: reports from people and moderation stay the second line.

type Prediction = { className: string; probability: number };
type Model = { classify: (img: HTMLImageElement) => Promise<Prediction[]> };

let modelPromise: Promise<Model | null> | null = null;
function loadModel(): Promise<Model | null> {
  modelPromise ??= (async () => {
    try {
      const tf = await import("@tensorflow/tfjs");
      tf.enableProdMode();
      // only the small MobileNetV2 model (~2.6 MB), not the default bundle of all models
      const [{ load }, { MobileNetV2Model }] = await Promise.all([import("nsfwjs/core"), import("nsfwjs/models/mobilenet_v2")]);
      return (await load("MobileNetV2", { modelDefinitions: [MobileNetV2Model] })) as unknown as Model;
    } catch {
      modelPromise = null; // offline or blocked: try again next time
      return null;
    }
  })();
  return modelPromise;
}

function fileToImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Не вдалося прочитати зображення.")); };
    img.src = url;
  });
}

export type PhotoVerdict = { ok: true } | { ok: false; reason: string };

/** Pure rule on the model's answer (tested): explicit content is refused, suggestive only when the model is sure. */
export function verdictFrom(predictions: Prediction[]): PhotoVerdict {
  const p = (name: string) => predictions.find((x) => x.className === name)?.probability ?? 0;
  if (p("Porn") + p("Hentai") >= 0.5 || p("Sexy") >= 0.85) {
    return { ok: false, reason: "Це фото не можна опублікувати: воно схоже на відвертий вміст. Оберіть інше." };
  }
  return { ok: true };
}

/** Checks a photo in the browser. When the model cannot load (offline), the photo is let through: reports remain. */
export async function checkPhoto(file: File): Promise<PhotoVerdict> {
  const model = await loadModel();
  if (!model) return { ok: true };
  const img = await fileToImage(file);
  try {
    return verdictFrom(await model.classify(img));
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

/** Longest side to `max` px, high-quality WebP. GIFs and already light files are kept as they are. */
export async function compressPhoto(file: File, max = 2048, quality = 0.9): Promise<File> {
  if (file.type === "image/gif" || file.size < 600_000) return file;
  const img = await fileToImage(file);
  try {
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(img.src);
  }
}
