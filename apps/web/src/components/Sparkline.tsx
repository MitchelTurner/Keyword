type Point = {
  year: number;
  month: number;
  search_volume?: number | null;
};

const COLORS = {
  rising: "#34d399",
  flat: "#a1a1aa",
  declining: "#fb7185",
  unknown: "#71717a",
} as const;

export default function Sparkline({
  data,
  width = 80,
  height = 22,
  tone = "rising",
}: {
  data: Point[] | null | undefined;
  width?: number;
  height?: number;
  tone?: keyof typeof COLORS;
}) {
  if (!data?.length) {
    return <span className="text-zinc-600">—</span>;
  }

  const values = data.map((d) => d.search_volume ?? 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const stroke = COLORS[tone];
  const gradId = `spark-${tone}-${width}-${height}`;

  const coords = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return { x, y };
  });
  const line = coords.map((p) => `${p.x},${p.y}`).join(" ");
  const area = [
    `0,${height}`,
    ...coords.map((p) => `${p.x},${p.y}`),
    `${width},${height}`,
  ].join(" ");

  return (
    <svg
      width={width}
      height={height}
      className="overflow-visible"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill={`url(#${gradId})`} points={area} />
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={line}
      />
    </svg>
  );
}
