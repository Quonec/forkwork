const RING_PATH = "M 60,60 m -50,0 a 50,50 0 1,1 100,0 a 50,50 0 1,1 -100,0";
const RING_LENGTH = 314;
const RING_PATH_ID = "scan-shutter-ring";
const RING_TEXT = "СНИМИ · ОЦЕНИ · УЧТИ · ИЗУЧИ · ";

/** Затвор: жёлтое кольцо с диском, вокруг вращается надпись «СНИМИ · ОЦЕНИ · УЧТИ · ИЗУЧИ». */
export function ShutterGraphic() {
  return (
    <span aria-hidden className="relative flex h-[7.5rem] w-[7.5rem] items-center justify-center">
      <svg viewBox="0 0 120 120" className="ring-spin absolute inset-0 h-full w-full">
        <defs>
          <path id={RING_PATH_ID} d={RING_PATH} />
        </defs>
        <text className="fill-orange-700" style={{ fontSize: 9, fontFamily: "ui-monospace, monospace" }}>
          <textPath href={`#${RING_PATH_ID}`} textLength={RING_LENGTH} lengthAdjust="spacing">
            {RING_TEXT}
          </textPath>
        </text>
      </svg>
      <span className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border-2 border-orange-500">
        <span className="h-14 w-14 rounded-full bg-orange-500 shadow-md shadow-orange-900/30 transition-transform duration-150 group-active:scale-90" />
      </span>
    </span>
  );
}
