import Link from 'next/link'
import { Fragment } from 'react'
import { ArrowDown, ArrowRight, CheckCircle2, Zap, Target, Rocket, Code } from 'lucide-react'
import { HOME_COPY, type Lang } from '@/lib/home-copy'
import StickyHeader from '@/components/StickyHeader'
import { BridgeArc, BridgeCables, BridgeMark, ArcDivider } from '@/components/BridgeMotifs'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>
}) {
  const params = await searchParams
  const lang: Lang = params.lang === 'en' ? 'en' : 'fr'
  const t = HOME_COPY[lang]

  return (
    <div className="min-h-screen bg-black text-zinc-100 selection:bg-emerald-400 selection:text-black">
      {/* Top partner banner */}
      <div className="bg-zinc-950 border-b border-zinc-800 py-3 px-4 flex items-center justify-center">
        <img
          src="/Banner.png"
          alt="Led by Royaume du Maroc, operated by Tamwilcom, as part of Digital Morocco 2030"
          className="max-h-14 md:max-h-16 w-auto opacity-90"
        />
      </div>

      <StickyHeader lang={lang} applyLabel={lang === 'fr' ? t.applyFr : t.applyEn} />

      {/* HERO */}
      <section className="relative overflow-hidden px-6 pt-20 pb-24">
        {/* Grid pattern background */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'linear-gradient(rgba(16,185,129,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.5) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        {/* Green glow */}
        <div className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 w-[40rem] h-[40rem] bg-emerald-500/20 rounded-full blur-[120px]" />
        {/* Bridge cables motif — large, faded */}
        <BridgeCables className="pointer-events-none absolute top-1/4 left-0 w-full h-[28rem] text-emerald-400/15" strokeWidth={2.5} />

        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {lang === 'fr' ? 'Programme d\'accélération · 8 mois' : 'Acceleration program · 8 months'}
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-[1.05]">
            <span className="block">{t.hero.tagline.split('.')[0]}.</span>
            <span className="block">{t.hero.tagline.split('.')[1]?.trim()}.</span>
            <span className="block bg-gradient-to-r from-emerald-300 via-emerald-400 to-emerald-500 bg-clip-text text-transparent">
              {t.hero.tagline.split('.')[2]?.trim()}.
            </span>
          </h1>
          <p className="text-lg md:text-xl text-zinc-300 max-w-2xl mx-auto mb-4 leading-relaxed">
            {t.hero.lead}
          </p>
          <p className="text-base text-zinc-500 max-w-2xl mx-auto mb-12 leading-relaxed">
            {t.hero.sub}
          </p>
          <ApplyButtons lang={lang} label={lang === 'fr' ? t.applyFr : t.applyEn} />
        </div>
      </section>

      <ArcDivider className="w-full h-16 mx-auto max-w-6xl" color="#10b981" />

      {/* POURQUOI — titre dans une carte verte arrondie + arc décoratif */}
      <section className="relative px-6 py-24 overflow-hidden">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[auto_1fr] gap-12 lg:gap-20 items-center">
          {/* Title card LEFT with decorative arc on its right */}
          <div className="relative mx-auto lg:mx-0">
            <svg
              className="hidden lg:block absolute -right-10 top-6 bottom-6 w-20 z-0"
              style={{ height: 'calc(100% - 3rem)' }}
              viewBox="0 0 80 400"
              preserveAspectRatio="none"
              fill="none"
              aria-hidden
            >
              <path d="M 0 0 Q 70 200 0 400" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <div className="relative z-10 rounded-[2.5rem] bg-emerald-400 p-10 lg:p-12 lg:w-[400px]">
              <div className="text-xs font-mono text-black/60 mb-4">/ 01</div>
              <h2 className="text-4xl lg:text-5xl font-bold text-black leading-[1.05] tracking-tight">
                {t.why.title}
              </h2>
              <BridgeMark className="mt-8 w-24 h-14 text-black/60" />
            </div>
          </div>
          {/* Content RIGHT */}
          <div>
            <p className="text-2xl md:text-3xl text-emerald-400 font-medium mb-6">{t.why.pitch}</p>
            <p className="text-zinc-300 mb-8 leading-relaxed text-lg">{t.why.body}</p>
            <p className="text-zinc-400 mb-4">{t.why.intro}</p>
            <ul className="space-y-3 text-lg">
              {t.why.bullets.map(item => (
                <li key={item} className="flex items-start gap-3">
                  <span className="text-emerald-400 mt-2.5 text-sm">▸</span>
                  <span className="text-zinc-200">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* À QUI S'ADRESSE — titre dans une carte verte à droite + arc décoratif */}
      <section className="relative px-6 py-24 overflow-hidden">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_auto] gap-12 lg:gap-20 items-center">
          {/* Content LEFT */}
          <div className="order-2 lg:order-1">
            {t.whoFor.paragraphs.map((p, i) => (
              <p key={i} className="text-zinc-300 mb-6 last:mb-0 text-lg leading-relaxed">
                {p}
              </p>
            ))}
          </div>
          {/* Title card RIGHT with decorative arc on its left */}
          <div className="relative mx-auto lg:mx-0 order-1 lg:order-2">
            <svg
              className="hidden lg:block absolute -left-10 top-6 bottom-6 w-20 z-0"
              style={{ height: 'calc(100% - 3rem)' }}
              viewBox="0 0 80 400"
              preserveAspectRatio="none"
              fill="none"
              aria-hidden
            >
              <path d="M 80 0 Q 10 200 80 400" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <div className="relative z-10 rounded-[2.5rem] bg-emerald-400 p-10 lg:p-12 lg:w-[400px]">
              <div className="text-xs font-mono text-black/60 mb-4">/ 02</div>
              <h2 className="text-4xl lg:text-5xl font-bold text-black leading-[1.05] tracking-tight">
                {t.whoFor.title}
              </h2>
              <BridgeMark className="mt-8 w-24 h-14 text-black/60" />
            </div>
          </div>
        </div>
      </section>

      <ArcDivider className="w-full h-16 mx-auto max-w-6xl" color="#10b981" variant="up" />

      {/* CE QUE VOUS OBTENEZ */}
      <section className="relative bg-zinc-950 border-y border-zinc-900 px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <SectionLabel>03</SectionLabel>
          <h2 className="text-4xl md:text-5xl font-bold mb-16 tracking-tight">{t.benefits.title}</h2>

          <div className="space-y-6">
            <Block icon={<Target className="text-emerald-400" size={20} />} title={t.benefits.mentoring.title}>
              <p className="mb-3 text-zinc-300">{t.benefits.mentoring.intro}</p>
              <ul className="space-y-1 text-zinc-400 mb-3">
                {t.benefits.mentoring.items.map(i => <li key={i} className="flex gap-2"><span className="text-emerald-400">›</span>{i}</li>)}
              </ul>
              <p className="text-zinc-500 italic text-sm">{t.benefits.mentoring.outro}</p>
            </Block>

            <Block icon={<Zap className="text-emerald-400" size={20} />} title={t.benefits.workshops.title}>
              <p className="mb-3 text-zinc-300">{t.benefits.workshops.intro}</p>
              <p className="mb-3 text-zinc-500 text-sm">{t.benefits.workshops.topicsLabel}</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {t.benefits.workshops.topics.map(topic => (
                  <span key={topic} className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
                    {topic}
                  </span>
                ))}
              </div>
              <p className="text-zinc-500 italic text-sm">{t.benefits.workshops.outro}</p>
            </Block>

            <Block icon={<Rocket className="text-emerald-400" size={20} />} title={t.benefits.mvp.title}>
              <p className="mb-3 text-zinc-300">{t.benefits.mvp.intro}</p>
              <ul className="space-y-1 text-zinc-400 mb-3">
                {t.benefits.mvp.items.map(i => <li key={i} className="flex gap-2"><span className="text-emerald-400">›</span>{i}</li>)}
              </ul>
              <p className="text-zinc-500 italic text-sm">{t.benefits.mvp.outro}</p>
            </Block>

            <Block icon={<Code className="text-emerald-400" size={20} />} title={t.benefits.vibe.title}>
              <p className="mb-3 text-zinc-300">{t.benefits.vibe.intro}</p>
              <p className="mb-3 text-zinc-400">{t.benefits.vibe.learnLabel}</p>
              <ul className="space-y-1 text-zinc-400">
                {t.benefits.vibe.items.map(i => <li key={i} className="flex gap-2"><span className="text-emerald-400">›</span>{i}</li>)}
              </ul>
            </Block>

            <Block title={t.benefits.funding.title} accent>
              <BridgeMark className="pointer-events-none absolute top-6 right-6 w-24 h-14 text-emerald-400/15" />
              <p className="mb-4 text-zinc-300 relative">{t.benefits.funding.intro}</p>
              <div className="grid md:grid-cols-2 gap-4 relative">
                <div className="relative overflow-hidden rounded-2xl p-6 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/30">
                  <BridgeArc className="pointer-events-none absolute -top-4 -right-4 w-32 h-32 text-white/10" strokeWidth={2} />
                  <div className="text-4xl font-bold text-emerald-400 mb-2">200K MAD</div>
                  <h4 className="font-semibold text-white mb-1">{t.benefits.funding.grant.title}</h4>
                  <p className="text-sm text-zinc-400">{t.benefits.funding.grant.desc}</p>
                </div>
                <div className="relative overflow-hidden rounded-2xl p-6 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/30">
                  <BridgeArc className="pointer-events-none absolute -top-4 -right-4 w-32 h-32 text-white/10" strokeWidth={2} />
                  <div className="text-4xl font-bold text-emerald-400 mb-2">{lang === 'fr' ? '12 mois' : '12 months'}</div>
                  <h4 className="font-semibold text-white mb-1">{t.benefits.funding.stipend.title}</h4>
                  <p className="text-sm text-zinc-400">{t.benefits.funding.stipend.desc}</p>
                </div>
              </div>
            </Block>
          </div>
        </div>
      </section>

      {/* INTERMEDIATE CTA 1 */}
      <MidCta title={t.midCta1.title} sub={t.midCta1.sub} lang={lang} label={lang === 'fr' ? t.applyFr : t.applyEn} />

      {/* COMMENT FONCTIONNE */}
      <section className="relative px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <SectionLabel>04</SectionLabel>
          <h2 className="text-4xl md:text-5xl font-bold mb-16 tracking-tight">{t.how.title}</h2>

          <div className="space-y-4">
            {t.how.phases.map((p, i) => (
              <Phase key={i} num={i + 1} month={p.tag} title={p.title}>
                {'intro' in p && p.intro && <p className="text-zinc-300 mb-2">{p.intro}</p>}
                <ul className="space-y-1 text-zinc-400 mb-3">
                  {p.items.map(item => <li key={item} className="flex gap-2"><span className="text-emerald-400">›</span>{item}</li>)}
                </ul>
                {'note' in p && p.note && (
                  <p className="text-sm text-zinc-500 italic">{p.note}</p>
                )}
              </Phase>
            ))}
          </div>
        </div>
      </section>

      {/* NOTRE ADN */}
      <section className="relative bg-zinc-950 border-y border-zinc-900 px-6 py-24 overflow-hidden">
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30rem] h-[30rem] bg-emerald-500/10 rounded-full blur-[120px]" />
        <BridgeCables className="pointer-events-none absolute bottom-0 left-0 w-full h-72 text-emerald-400/10" strokeWidth={2} />
        <div className="relative max-w-5xl mx-auto">
          <SectionLabel>05</SectionLabel>
          <h2 className="text-4xl md:text-5xl font-bold mb-16 tracking-tight">{t.dna.title}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {t.dna.cards.map(c => (
              <DnaCard key={c.title} letter={c.letter} title={c.title} text={c.text} />
            ))}
          </div>
        </div>
      </section>

      {/* INTERMEDIATE CTA 2 */}
      <MidCta title={t.midCta2.title} sub={t.midCta2.sub} lang={lang} label={lang === 'fr' ? t.applyFr : t.applyEn} variant="alt" />

      {/* PROCESSUS DE SELECTION */}
      <section className="relative px-6 py-24">
        <div className="max-w-3xl mx-auto">
          <SectionLabel>06</SectionLabel>
          <h2 className="text-4xl md:text-5xl font-bold mb-16 tracking-tight">{t.selection.title}</h2>
          <ol className="space-y-2">
            {t.selection.steps.map((s, i) => (
              <Fragment key={s.title}>
                <Step n={i + 1} title={s.title} text={s.text} />
                {i < t.selection.steps.length - 1 && <Connector />}
              </Fragment>
            ))}
          </ol>
        </div>
      </section>

      {/* CE QU'ON ATTEND */}
      <section className="relative px-6 py-24">
        <div className="max-w-3xl mx-auto">
          <SectionLabel>07</SectionLabel>
          <h2 className="text-4xl md:text-5xl font-bold mb-12 tracking-tight">{t.expectations.title}</h2>
          <ul className="space-y-4">
            {t.expectations.items.map(item => (
              <li key={item} className="flex items-start gap-3 p-4 rounded-xl border border-zinc-800 bg-zinc-950 hover:border-emerald-500/40 transition">
                <CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                <span className="text-zinc-200">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA FINAL — bloc vert plein avec coins arrondis en haut */}
      <section className="relative bg-black pt-12 overflow-hidden">
        <div className="relative bg-emerald-500 px-6 pt-20 pb-32 text-center rounded-t-[3rem] md:rounded-t-[5rem] overflow-hidden">
          <BridgeMark className="pointer-events-none absolute top-8 left-1/2 -translate-x-1/2 w-[32rem] h-72 text-black/10" />
          <div className="relative max-w-3xl mx-auto">
            <h2 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight leading-[1.05] text-black">
              {t.finalCta.title}
            </h2>
            <p className="text-black/70 mb-12 leading-relaxed text-lg">{t.finalCta.sub}</p>
            <ApplyButtons lang={lang} label={lang === 'fr' ? t.applyFr : t.applyEn} large variant="onGreen" />
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-black border-t border-zinc-900">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <img src="/THE BRIDGE LOGO-02.png" alt="The Bridge" className="h-7 w-auto opacity-70" />
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span>© {new Date().getFullYear()} The Bridge by CEED</span>
            <span className="text-zinc-700">·</span>
            <Link href="/admin" className="hover:text-emerald-400 transition">
              Admin
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

function ApplyButtons({ lang, label, large = false, variant = 'default' }: { lang: Lang; label: string; large?: boolean; variant?: 'default' | 'onGreen' }) {
  const padding = large ? 'px-10 py-4 text-base' : 'px-8 py-3.5 text-sm'
  const styles = variant === 'onGreen'
    ? 'bg-black text-emerald-400 hover:bg-zinc-900 shadow-[0_0_30px_-5px_rgba(0,0,0,0.4)]'
    : 'bg-emerald-400 text-black hover:bg-emerald-300 shadow-[0_0_30px_-5px_rgba(16,185,129,0.5)] hover:shadow-[0_0_40px_-5px_rgba(16,185,129,0.7)]'
  return (
    <div className="flex items-center justify-center">
      <Link
        href={`/apply?lang=${lang}`}
        className={`group inline-flex items-center justify-center gap-2 ${styles} ${padding} rounded-xl font-semibold transition`}
      >
        {label}
        <ArrowRight size={16} className="group-hover:translate-x-0.5 transition" />
      </Link>
    </div>
  )
}

function MidCta({
  title, sub, lang, label, variant = 'default',
}: {
  title: string; sub: string; lang: Lang; label: string; variant?: 'default' | 'alt'
}) {
  return (
    <section className="relative px-6 py-16 overflow-hidden">
      <div className={`relative overflow-hidden max-w-4xl mx-auto rounded-[2rem] p-10 md:p-14 text-center border ${variant === 'alt' ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent' : 'border-zinc-800 bg-zinc-950'}`}>
        {variant === 'alt' && (
          <>
            <BridgeArc className="pointer-events-none absolute -top-10 -right-10 w-72 h-72 text-emerald-300/30" direction="right" strokeWidth={2.5} />
            <BridgeArc className="pointer-events-none absolute -bottom-10 -left-10 w-72 h-72 text-emerald-300/20" direction="left" strokeWidth={2.5} />
          </>
        )}
        <div className="relative">
          <h3 className="text-2xl md:text-3xl font-bold mb-3 tracking-tight">{title}</h3>
          <p className="text-zinc-400 mb-8">{sub}</p>
          <ApplyButtons lang={lang} label={label} />
        </div>
      </div>
    </section>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-xs font-mono text-emerald-400">/ {children}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-emerald-500/40 to-transparent" />
    </div>
  )
}

function Block({ title, icon, children, accent = false }: { title: string; icon?: React.ReactNode; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-3xl p-6 md:p-8 border transition group ${accent ? 'border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-transparent' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'}`}>
      <h3 className="text-2xl font-semibold mb-4 flex items-center gap-3 text-white relative">
        {icon}
        {title}
      </h3>
      <div className="relative">{children}</div>
    </div>
  )
}

function Phase({ num, month, title, children }: { num: number; month: string; title: string; children: React.ReactNode }) {
  return (
    <div className="group relative overflow-hidden rounded-3xl p-6 md:p-8 border border-zinc-800 bg-zinc-900/50 hover:border-emerald-500/40 transition">
      <div className="flex items-baseline gap-4 mb-4">
        <span className="text-4xl font-bold text-zinc-800 group-hover:text-emerald-500/30 transition tabular-nums">
          {String(num).padStart(2, '0')}
        </span>
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-emerald-400 mb-1">{month}</div>
          <h3 className="text-xl font-semibold text-white">{title}</h3>
        </div>
      </div>
      <div className="pl-0 md:pl-16">{children}</div>
    </div>
  )
}

function DnaCard({ letter, title, text }: { letter: string; title: string; text: string }) {
  return (
    <div className="group relative rounded-3xl p-6 border border-zinc-800 bg-zinc-900/40 hover:border-emerald-500/50 hover:bg-zinc-900 transition overflow-hidden">
      <div className="absolute -top-4 -right-4 text-8xl font-bold text-emerald-500/5 group-hover:text-emerald-500/15 transition select-none">
        {letter}
      </div>
      <div className="relative">
        <div className="w-12 h-12 rounded-2xl bg-emerald-400 text-black flex items-center justify-center text-xl font-bold mb-4">
          {letter}
        </div>
        <h3 className="font-bold text-white mb-2 tracking-wide">{title}</h3>
        <p className="text-sm text-zinc-400 leading-relaxed">{text}</p>
      </div>
    </div>
  )
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <li className="group rounded-3xl p-5 border border-zinc-800 bg-zinc-900/50 hover:border-emerald-500/40 transition flex gap-4">
      <div className="w-10 h-10 rounded-full bg-emerald-400 text-black flex items-center justify-center font-bold flex-shrink-0 shadow-[0_0_20px_-5px_rgba(16,185,129,0.5)]">
        {n}
      </div>
      <div>
        <h3 className="font-semibold text-white mb-1">{title}</h3>
        <p className="text-sm text-zinc-400 leading-relaxed">{text}</p>
      </div>
    </li>
  )
}

function Connector() {
  return (
    <li className="flex justify-center py-1">
      <div className="flex flex-col items-center">
        <div className="w-px h-3 bg-zinc-800" />
        <ArrowDown size={14} className="text-emerald-500/60" />
      </div>
    </li>
  )
}
