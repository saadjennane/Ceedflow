import { Star } from 'lucide-react'

export default function RatingPill({ avg, count, size = 'sm' }: { avg: number | null; count: number; size?: 'sm' | 'xs' }) {
  if (avg === null || count === 0) {
    return <span className="text-gray-300 text-xs">—</span>
  }
  const px = size === 'xs' ? 'px-1.5 py-0.5 text-[10px] gap-0.5' : 'px-2 py-0.5 text-xs gap-1'
  const iconSize = size === 'xs' ? 10 : 12
  return (
    <span
      className={`inline-flex items-center ${px} rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium whitespace-nowrap`}
      title={`Average ${avg.toFixed(1)}/5 across ${count} rater${count > 1 ? 's' : ''}`}
    >
      <Star size={iconSize} className="fill-amber-400 stroke-amber-500" />
      {avg.toFixed(1)}
      <span className="text-amber-500/70">({count})</span>
    </span>
  )
}
