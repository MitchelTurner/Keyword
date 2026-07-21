type Point = {
  year: number;
  month: number;
  search_volume?: number | null;
};

export default function Sparkline({
  data,
  width = 80,
  height = 22,
}: {
  data: Point[] | null | undefined;
  width?: number;
  height?: number;
}) {
  if (!data?.length) {
    return <span className="text-zinc-600">—</span>;
  }

  const values = data.map((d) => d.search_volume ?? 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const step = values.length > 1 ? width / (values.length - 1) : width;

  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke="#34d399"
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
}
