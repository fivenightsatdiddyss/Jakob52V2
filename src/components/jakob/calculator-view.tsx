'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Calculator } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  onUnlock: () => void
}

const UNLOCK_VALUE = 8 // 3 + 2 + 3

/**
 * Evaluate a simple arithmetic expression safely.
 * Only digits, + - * / . ( ) % are allowed.
 */
function safeEval(expr: string): number {
  const cleaned = expr.replace(/×/g, '*').replace(/÷/g, '/')
  if (!/^[-+*/.()%\d\s]+$/.test(cleaned)) return NaN
  try {
    const fn = new Function(`return (${cleaned})`)
    const result = fn()
    return typeof result === 'number' && isFinite(result) ? result : NaN
  } catch {
    return NaN
  }
}

function formatNumber(n: number): string {
  if (!isFinite(n)) return 'Error'
  const rounded = Math.round(n * 1e10) / 1e10
  return String(rounded)
}

export default function CalculatorView({ onUnlock }: Props) {
  const [expr, setExpr] = useState('')
  const [display, setDisplay] = useState('0')
  const [justEvaluated, setJustEvaluated] = useState(false)
  const [attempting, setAttempting] = useState(false)

  const updateDisplay = (e: string) => {
    if (!e) {
      setDisplay('0')
      return
    }
    setDisplay(e)
  }

  const inputDigit = (d: string) => {
    setJustEvaluated(false)
    setExpr((prev) => {
      const next = prev === '0' || justEvaluated ? d : prev + d
      updateDisplay(next)
      return next
    })
  }

  const inputDot = () => {
    setJustEvaluated(false)
    setExpr((prev) => {
      // prevent double dots in current number
      const parts = prev.split(/[+\-×÷%]/)
      const last = parts[parts.length - 1]
      if (last.includes('.')) return prev
      const next = (prev === '' || justEvaluated ? '0' : prev) + '.'
      updateDisplay(next)
      return next
    })
  }

  const inputOperator = (op: string) => {
    setJustEvaluated(false)
    setExpr((prev) => {
      if (prev === '') return prev
      const lastChar = prev[prev.length - 1]
      if (['+', '-', '×', '÷', '%'].includes(lastChar)) {
        const next = prev.slice(0, -1) + op
        updateDisplay(next)
        return next
      }
      const next = prev + op
      updateDisplay(next)
      return next
    })
  }

  const clearAll = () => {
    setExpr('')
    setDisplay('0')
    setJustEvaluated(false)
  }

  const toggleSign = () => {
    setExpr((prev) => {
      if (!prev) return prev
      // toggle sign of the last number
      const match = prev.match(/(-?\d*\.?\d+)$/)
      if (!match) return prev
      const num = match[1]
      const start = prev.length - num.length
      const toggled = num.startsWith('-') ? num.slice(1) : '-' + num
      const next = prev.slice(0, start) + toggled
      updateDisplay(next)
      return next
    })
  }

  const percent = () => {
    setExpr((prev) => {
      const val = safeEval(prev)
      if (isNaN(val)) return prev
      const next = formatNumber(val / 100)
      updateDisplay(next)
      return next
    })
  }

  const evaluate = useCallback(() => {
    if (!expr) return
    const result = safeEval(expr)
    if (isNaN(result)) {
      setDisplay('Error')
      return
    }
    const formatted = formatNumber(result)
    setDisplay(formatted)
    setJustEvaluated(true)

    // The cosmic gate: ONLY the exact expression "3+2+3" unlocks.
    // Not just anything that equals 8 — the specific sequence 3, +, 2, +, 3.
    const normalizedExpr = expr.replace(/\s/g, '').replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/')
    if (normalizedExpr === '3+2+3') {
      setAttempting(true)
      setTimeout(() => {
        onUnlock()
      }, 900)
    }
  }, [expr, onUnlock])

  // Keyboard support
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (attempting) return
      const k = e.key
      if (/^[0-9]$/.test(k)) inputDigit(k)
      else if (k === '.') inputDot()
      else if (k === '+') inputOperator('+')
      else if (k === '-') inputOperator('-')
      else if (k === '*') inputOperator('×')
      else if (k === '/') {
        e.preventDefault()
        inputOperator('÷')
      } else if (k === '%') percent()
      else if (k === 'Enter' || k === '=') {
        e.preventDefault()
        evaluate()
      } else if (k === 'Escape') clearAll()
      else if (k === 'Backspace') {
        setExpr((prev) => {
          const next = prev.slice(0, -1)
          updateDisplay(next)
          return next
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expr, justEvaluated, attempting, evaluate])

  const buttons: Array<{
    label: string
    onClick: () => void
    variant?: 'num' | 'op' | 'fn' | 'eq'
    span?: boolean
  }> = [
    { label: 'AC', onClick: clearAll, variant: 'fn' },
    { label: '±', onClick: toggleSign, variant: 'fn' },
    { label: '%', onClick: percent, variant: 'fn' },
    { label: '÷', onClick: () => inputOperator('÷'), variant: 'op' },
    { label: '7', onClick: () => inputDigit('7') },
    { label: '8', onClick: () => inputDigit('8') },
    { label: '9', onClick: () => inputDigit('9') },
    { label: '×', onClick: () => inputOperator('×'), variant: 'op' },
    { label: '4', onClick: () => inputDigit('4') },
    { label: '5', onClick: () => inputDigit('5') },
    { label: '6', onClick: () => inputDigit('6') },
    { label: '−', onClick: () => inputOperator('-'), variant: 'op' },
    { label: '1', onClick: () => inputDigit('1') },
    { label: '2', onClick: () => inputDigit('2') },
    { label: '3', onClick: () => inputDigit('3') },
    { label: '+', onClick: () => inputOperator('+'), variant: 'op' },
    { label: '0', onClick: () => inputDigit('0'), span: true },
    { label: '.', onClick: inputDot },
    { label: '=', onClick: evaluate, variant: 'eq' },
  ]

  return (
    <motion.div
      className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-black px-4 py-10"
      exit={{ opacity: 0, scale: 1.08, filter: 'blur(8px)' }}
      transition={{ duration: 0.7, ease: 'easeInOut' }}
    >
      {/* The themed background is now rendered globally at the page level
          (page.tsx → ThemedBackground) so it shows on the calculator gate too. */}

      {/* Calculator only — no title. Classic theme: black, gray, orange. */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut', delay: 0.15 }}
        className="w-full max-w-[340px] rounded-[1.5rem] bg-[#1a1a1a] p-4 shadow-2xl ring-1 ring-[#333] sm:max-w-[380px] sm:p-5"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)' }}
      >
        {/* Display — classic calculator style */}
        <div className="mb-4 rounded-xl bg-[#0d0d0d] p-4 ring-1 ring-[#2a2a2a]">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-gray-600">
            <span className="inline-flex items-center gap-1.5">
              <Calculator className="h-3 w-3" />
              calculator
            </span>
            <span>{justEvaluated ? 'result' : 'input'}</span>
          </div>
          <div className="mt-2 truncate text-right font-mono text-4xl font-light text-gray-100 sm:text-5xl">
            {display}
          </div>
          <div className="mt-1 h-4 truncate text-right font-mono text-sm text-gray-600">
            {expr || '\u00A0'}
          </div>
        </div>

        {/* Buttons — classic calculator theme */}
        <div className="grid grid-cols-4 gap-2">
          {buttons.map((b, i) => (
            <motion.button
              key={b.label + i}
              onClick={b.onClick}
              whileTap={{ scale: 0.92 }}
              whileHover={{ y: -1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              className={cn(
                'relative flex h-14 items-center justify-center rounded-xl text-xl font-medium transition-all',
                b.span && 'col-span-2',
                b.variant === 'fn' &&
                  'bg-[#3a3a3a] text-gray-300 hover:bg-[#4a4a4a] active:bg-[#2a2a2a]',
                b.variant === 'op' &&
                  'bg-[#ff9500] text-white hover:bg-[#ffaa20] active:bg-[#e68600]',
                b.variant === 'eq' &&
                  'bg-[#ff9500] text-white hover:bg-[#ffaa20] active:bg-[#e68600]',
                (!b.variant || b.variant === 'num') &&
                  'bg-[#2a2a2a] text-gray-100 hover:bg-[#3a3a3a] active:bg-[#1a1a1a]'
              )}
            >
              {b.label}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Unlock attempt overlay */}
      {attempting && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(168,85,247,0.4), rgba(4,2,10,0.95))',
          }}
        >
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="text-center"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              className="mx-auto mb-5 h-16 w-16 rounded-full border-2 border-fuchsia-400/30 border-t-fuchsia-400"
            />
            <p className="text-lg font-medium text-white/90">access granted</p>
            <p className="mt-1 text-sm text-fuchsia-200/60">entering jakob-52…</p>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  )
}
