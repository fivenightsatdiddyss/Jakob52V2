'use client'

/**
 * OceanBackground — fluid water with coral + sea life.
 * CSS-driven (no canvas) for performance: layered wave SVGs, rising bubbles,
 * coral silhouettes at the bottom, and a couple of fish swimming across.
 */
export default function OceanBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Deep water gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, #0a1929 0%, #0c4a6e 40%, #075985 70%, #0c4a6e 100%)',
        }}
      />

      {/* Light rays from the surface */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background:
            'linear-gradient(180deg, rgba(125,211,252,0.25) 0%, transparent 40%)',
        }}
      />

      {/* Rising bubbles */}
      {BUBBLES.map((b, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${b.left}%`,
            bottom: '-20px',
            width: `${b.size}px`,
            height: `${b.size}px`,
            background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4), rgba(125,211,252,0.15))',
            border: '1px solid rgba(255,255,255,0.2)',
            animation: `bubble-rise ${b.duration}s linear infinite`,
            animationDelay: `${b.delay}s`,
          }}
        />
      ))}

      {/* Swimming fish */}
      {FISH.map((f, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            top: `${f.top}%`,
            left: '-5vw',
            fontSize: `${f.size}px`,
            animation: `fish-swim ${f.duration}s linear infinite`,
            animationDelay: `${f.delay}s`,
            opacity: 0.4,
          }}
        >
          {f.emoji}
        </div>
      ))}

      {/* Coral silhouettes at the bottom */}
      <div className="absolute inset-x-0 bottom-0 h-[30vh]">
        <svg
          viewBox="0 0 1200 300"
          preserveAspectRatio="none"
          className="absolute bottom-0 h-full w-full"
        >
          {/* Coral structures */}
          <g fill="rgba(8,47,73,0.8)">
            <path d="M0,300 L0,200 Q50,180 80,220 Q100,150 130,210 Q160,140 190,200 Q220,170 250,210 L250,300 Z" />
            <path d="M300,300 L300,180 Q340,160 370,200 Q400,130 430,190 Q460,150 490,200 L490,300 Z" />
            <path d="M550,300 L550,220 Q580,180 610,210 Q640,140 670,200 Q700,170 730,210 L730,300 Z" />
            <path d="M800,300 L800,190 Q830,160 860,200 Q890,130 920,190 Q950,160 980,200 L980,300 Z" />
            <path d="M1030,300 L1030,210 Q1060,180 1090,210 Q1120,140 1150,200 Q1180,170 1200,210 L1200,300 Z" />
          </g>
          {/* Seaweed */}
          <g fill="rgba(8,47,73,0.6)">
            <path d="M70,300 Q75,250 72,200 Q78,150 73,100 L78,100 Q83,150 77,200 Q80,250 75,300 Z" />
            <path d="M400,300 Q405,240 402,180 Q408,120 403,80 L408,80 Q413,120 407,180 Q410,240 405,300 Z" />
            <path d="M650,300 Q655,250 652,200 Q658,150 653,110 L658,110 Q663,150 657,200 Q660,250 655,300 Z" />
            <path d="M920,300 Q925,240 922,180 Q928,120 923,90 L928,90 Q933,120 927,180 Q930,240 925,300 Z" />
          </g>
        </svg>
      </div>

      {/* Animated wave layers */}
      <div className="absolute inset-x-0 bottom-0 h-[20vh] overflow-hidden">
        <svg
          viewBox="0 0 1200 200"
          preserveAspectRatio="none"
          className="absolute bottom-0 h-full w-[200%]"
          style={{ animation: 'wave-move 12s linear infinite' }}
        >
          <path
            d="M0,100 Q150,50 300,100 T600,100 T900,100 T1200,100 L1200,200 L0,200 Z"
            fill="rgba(125,211,252,0.08)"
          />
        </svg>
        <svg
          viewBox="0 0 1200 200"
          preserveAspectRatio="none"
          className="absolute bottom-0 h-full w-[200%]"
          style={{ animation: 'wave-move 8s linear infinite reverse' }}
        >
          <path
            d="M0,120 Q150,80 300,120 T600,120 T900,120 T1200,120 L1200,200 L0,200 Z"
            fill="rgba(56,189,248,0.06)"
          />
        </svg>
      </div>

      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 40%, transparent 30%, rgba(8,25,41,0.6) 90%)',
        }}
      />
    </div>
  )
}

const BUBBLES = Array.from({ length: 18 }, (_, i) => ({
  left: Math.random() * 100,
  size: 4 + Math.random() * 12,
  duration: 6 + Math.random() * 10,
  delay: Math.random() * 10,
}))

const FISH = [
  { emoji: '🐠', top: 25, size: 28, duration: 25, delay: 0 },
  { emoji: '🐟', top: 45, size: 22, duration: 30, delay: 8 },
  { emoji: '🐡', top: 65, size: 24, duration: 35, delay: 15 },
  { emoji: '🐠', top: 35, size: 20, duration: 28, delay: 20 },
]
