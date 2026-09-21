'use client'

/**
 * HalloweenBackground — a big glowing pumpkin in the center of the screen,
 * with a dark starry sky, a moon, and bats flying across.
 * CSS/SVG-driven for performance.
 */
export default function HalloweenBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Dark sky */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, #1a0a02 0%, #0d0604 50%, #050201 100%)',
        }}
      />

      {/* Stars */}
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'radial-gradient(1px 1px at 15% 20%, rgba(255,255,255,0.8), transparent), radial-gradient(1px 1px at 80% 15%, rgba(255,200,100,0.6), transparent), radial-gradient(1.5px 1.5px at 45% 30%, rgba(255,255,255,0.5), transparent), radial-gradient(1px 1px at 90% 50%, rgba(255,180,80,0.6), transparent), radial-gradient(1px 1px at 25% 60%, rgba(255,255,255,0.5), transparent), radial-gradient(1px 1px at 60% 70%, rgba(255,200,100,0.5), transparent), radial-gradient(1.5px 1.5px at 10% 80%, rgba(255,255,255,0.4), transparent)',
          backgroundSize: '500px 500px',
        }}
      />

      {/* Moon */}
      <div
        className="absolute right-[10%] top-[10%] h-24 w-24 rounded-full"
        style={{
          background:
            'radial-gradient(circle at 40% 40%, #fef3c7 0%, #fde68a 50%, #f59e0b 100%)',
          boxShadow: '0 0 40px 8px rgba(254,243,199,0.3), 0 0 80px 20px rgba(245,158,11,0.15)',
        }}
      />

      {/* Bats */}
      {BATS.map((b, i) => (
        <div
          key={i}
          className="absolute text-2xl"
          style={{
            top: `${b.top}%`,
            left: `${b.left}%`,
            animation: `bat-fly ${b.duration}s ease-in-out infinite`,
            animationDelay: `${b.delay}s`,
            opacity: 0.5,
          }}
        >
          🦇
        </div>
      ))}

      {/* Big glowing pumpkin in the center */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: 'min(42vmin, 400px)', height: 'min(42vmin, 400px)' }}
      >
        {/* Outer glow */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(249,115,22,0.4) 0%, rgba(234,88,12,0.15) 50%, transparent 70%)',
            filter: 'blur(20px)',
            animation: 'pumpkin-flicker 3s ease-in-out infinite',
          }}
        />
        {/* Pumpkin body */}
        <svg
          viewBox="0 0 200 200"
          className="relative h-full w-full"
          style={{ filter: 'drop-shadow(0 0 20px rgba(249,115,22,0.6))' }}
        >
          {/* Stem */}
          <path
            d="M95,30 Q92,20 98,15 Q105,18 103,28 Z"
            fill="#4d7c0f"
          />
          {/* Pumpkin lobes */}
          <g>
            <ellipse cx="100" cy="110" rx="80" ry="75" fill="#ea580c" />
            <ellipse cx="65" cy="105" rx="35" ry="72" fill="#f97316" />
            <ellipse cx="135" cy="105" rx="35" ry="72" fill="#f97316" />
            <ellipse cx="100" cy="108" rx="40" ry="74" fill="#fb923c" opacity="0.5" />
          </g>
          {/* Jack-o-lantern face — glowing eyes + mouth */}
          {/* Left eye */}
          <path
            d="M70,90 L85,80 L90,100 L75,105 Z"
            fill="#fbbf24"
            style={{ filter: 'drop-shadow(0 0 6px #fbbf24)' }}
          />
          {/* Right eye */}
          <path
            d="M130,90 L115,80 L110,100 L125,105 Z"
            fill="#fbbf24"
            style={{ filter: 'drop-shadow(0 0 6px #fbbf24)' }}
          />
          {/* Mouth */}
          <path
            d="M65,130 Q75,155 90,140 Q100,150 110,140 Q125,155 135,130 Q120,145 110,135 Q100,142 90,135 Q80,145 65,130 Z"
            fill="#fbbf24"
            style={{ filter: 'drop-shadow(0 0 6px #fbbf24)' }}
          />
        </svg>
      </div>

      {/* Ground mist */}
      <div
        className="absolute inset-x-0 bottom-0 h-[25vh]"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, rgba(249,115,22,0.06) 50%, rgba(249,115,22,0.1) 100%)',
        }}
      />

      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, transparent 30%, rgba(5,2,1,0.7) 90%)',
        }}
      />
    </div>
  )
}

const BATS = Array.from({ length: 6 }, (_, i) => ({
  top: 10 + Math.random() * 50,
  left: Math.random() * 80,
  duration: 15 + Math.random() * 20,
  delay: Math.random() * 15,
}))
