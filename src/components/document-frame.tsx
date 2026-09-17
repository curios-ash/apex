"use client";

export function DocumentFrame(props: {
  src: string;
  filename: string;
  mimeType: string | null;
  highlights: Array<{
    page: number | null;
    bbox: [number, number, number, number] | null;
    note: string | null;
  }>;
}) {
  const isPdf = (props.mimeType ?? "").includes("pdf") || props.filename.toLowerCase().endsWith(".pdf");
  const isImage = (props.mimeType ?? "").startsWith("image/");
  const overlay = props.highlights.find((h) => h.bbox);

  return (
    <div className="relative min-h-[28rem] overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
      {isImage ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={props.src} alt={props.filename} className="max-h-[36rem] w-full object-contain" />
          {overlay?.bbox ? <BboxOverlay bbox={overlay.bbox} /> : null}
        </div>
      ) : (
        <iframe
          title={props.filename}
          src={props.src}
          className="h-[36rem] w-full bg-white"
        />
      )}
      {overlay?.bbox && isPdf ? (
        <p className="border-t border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Highlight recorded
          {overlay.page ? ` on page ${overlay.page}` : ""}
          {overlay.note ? ` — ${overlay.note}` : ""}. PDF viewers do not overlay the box; the
          region is listed beside the document.
        </p>
      ) : null}
    </div>
  );
}

function BboxOverlay({ bbox }: { bbox: [number, number, number, number] }) {
  const [x, y, w, h] = bbox;
  const normalized = w <= 1 && h <= 1 && x <= 1 && y <= 1;
  const style = normalized
    ? { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }
    : { left: x, top: y, width: w, height: h };
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute border-2 border-amber-400 bg-amber-300/20"
      style={style}
    />
  );
}
