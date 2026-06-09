'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface BenefitSlide {
  icon: React.ReactNode
  title: string
  intro: string
  outro?: string
  items?: readonly string[]
  topicsLabel?: string
  topics?: readonly string[]
}

const AUTO_INTERVAL = 6000

export default function BenefitsSlider({ slides }: { slides: BenefitSlide[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const timer = setInterval(() => {
      setIndex(i => (i + 1) % slides.length)
    }, AUTO_INTERVAL)
    return () => clearInterval(timer)
  }, [paused, slides.length])

  const next = () => setIndex(i => (i + 1) % slides.length)
  const prev = () => setIndex(i => (i - 1 + slides.length) % slides.length)

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Slides viewport */}
      <div className="overflow-hidden rounded-3xl">
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {slides.map((slide, i) => (
            <div key={i} className="w-full flex-shrink-0">
              <SlideCard slide={slide} />
            </div>
          ))}
        </div>
      </div>

      {/* Navigation arrows */}
      <button
        onClick={prev}
        className="absolute top-1/2 -translate-y-1/2 -left-3 md:-left-12 w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 hover:border-emerald-400 hover:text-emerald-400 text-zinc-400 flex items-center justify-center transition shadow-lg"
        aria-label="Slide précédent"
      >
        <ChevronLeft size={20} />
      </button>
      <button
        onClick={next}
        className="absolute top-1/2 -translate-y-1/2 -right-3 md:-right-12 w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 hover:border-emerald-400 hover:text-emerald-400 text-zinc-400 flex items-center justify-center transition shadow-lg"
        aria-label="Slide suivant"
      >
        <ChevronRight size={20} />
      </button>

      {/* Dots */}
      <div className="flex justify-center gap-2 mt-8">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            className={`h-2 rounded-full transition-all ${
              i === index ? 'w-8 bg-emerald-400' : 'w-2 bg-zinc-700 hover:bg-zinc-500'
            }`}
            aria-label={`Aller au slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  )
}

function SlideCard({ slide }: { slide: BenefitSlide }) {
  return (
    <div className="rounded-3xl p-6 md:p-10 border border-zinc-800 bg-zinc-900/50 min-h-[320px]">
      <h3 className="text-2xl md:text-3xl font-semibold mb-5 flex items-center gap-3 text-white">
        {slide.icon}
        {slide.title}
      </h3>
      <p className="mb-4 text-zinc-300 text-lg">{slide.intro}</p>
      {slide.topicsLabel && slide.topics && (
        <>
          <p className="mb-3 text-zinc-500 text-sm">{slide.topicsLabel}</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {slide.topics.map(topic => (
              <span key={topic} className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
                {topic}
              </span>
            ))}
          </div>
        </>
      )}
      {slide.items && (
        <ul className="space-y-1.5 text-zinc-400 mb-4">
          {slide.items.map(i => (
            <li key={i} className="flex gap-2"><span className="text-emerald-400">›</span>{i}</li>
          ))}
        </ul>
      )}
      {slide.outro && (
        <p className="text-zinc-500 italic text-sm">{slide.outro}</p>
      )}
    </div>
  )
}
