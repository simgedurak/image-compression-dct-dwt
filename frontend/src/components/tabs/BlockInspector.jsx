import { useRef, useState } from 'react'
import { Play, Grid2x2, MousePointerClick } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { inspectBlock, apiErrorMessage } from '../../api/client'
import { Card, Field, PrimaryButton, ErrorBanner, EmptyState, StatPill } from '../ui/Primitives'
import MatrixGrid from '../ui/MatrixGrid'
import { fmt } from '../../utils/format'

function NumberInput({ value, onChange, min = 0 }) {
  return (
    <input
      type="number"
      min={min}
      value={value}
      onChange={(e) => onChange(Math.max(min, parseInt(e.target.value, 10) || 0))}
      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  )
}

function BlockPicker({ previewUrl, naturalWidth, naturalHeight, blockX, blockY, onPick }) {
  const containerRef = useRef(null)

  function handleClick(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const natX = (x / rect.width) * naturalWidth
    const natY = (y / rect.height) * naturalHeight
    onPick(Math.floor(natX / 8), Math.floor(natY / 8))
  }

  const maxBx = Math.max(0, Math.floor(naturalWidth / 8) - 1)
  const maxBy = Math.max(0, Math.floor(naturalHeight / 8) - 1)
  const boxLeft = (blockX * 8) / naturalWidth
  const boxTop = (blockY * 8) / naturalHeight
  const boxW = 8 / naturalWidth
  const boxH = 8 / naturalHeight

  return (
    <div>
      <div
        ref={containerRef}
        onClick={handleClick}
        className="relative cursor-crosshair overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
      >
        <img src={previewUrl} alt="block picker" className="block w-full select-none" draggable={false} />
        <div
          className="pointer-events-none absolute border-2 border-emerald-400"
          style={{
            left: `${boxLeft * 100}%`,
            top: `${boxTop * 100}%`,
            width: `${boxW * 100}%`,
            height: `${boxH * 100}%`,
          }}
        />
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        Click the image to select a block (grid up to {maxBx + 1}×{maxBy + 1} blocks).
      </p>
    </div>
  )
}

// Order matters: a fixed 3-column grid lays these out as two rows —
// row 1: original/shifted/DCT, row 2: quantized/reconstructed/error.
const MATRICES = [
  { key: 'original', label: 'f(x,y) Original', mode: 'grayscale' },
  { key: 'shifted', label: 'Shifted (−128)', mode: 'blue' },
  { key: 'dct_coeffs', label: 'DCT Coeffs F(u,v)', mode: 'diverging', highlightDC: true },
  { key: 'quantized_coeffs', label: 'Quantized Coeffs', highlightDC: true },
  { key: 'reconstructed', label: 'Reconstructed f(x,y)', mode: 'grayscale' },
  { key: 'error_matrix', label: 'Error |f − f_recon|', mode: 'diverging' },
]

export default function BlockInspector() {
  const { file, imageMeta, effectiveTargetBpp } = useApp()
  const [blockX, setBlockX] = useState(0)
  const [blockY, setBlockY] = useState(0)
  const [useAutoQuality, setUseAutoQuality] = useState(true)
  const [quality, setQuality] = useState(50)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  async function run() {
    if (!file) {
      setError('Upload an image in the sidebar first.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await inspectBlock(file, {
        blockX,
        blockY,
        targetBpp: useAutoQuality ? effectiveTargetBpp : undefined,
        quality: useAutoQuality ? undefined : quality,
      })
      setResult(data)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-800">8×8 Block Inspector</h2>
        <p className="text-sm text-slate-500">Step through the full JPEG pipeline for a single 8×8 block.</p>
      </div>

      <ErrorBanner message={error} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
        <Card title="Block Selector" icon={MousePointerClick}>
          {imageMeta ? (
            <BlockPicker
              previewUrl={imageMeta.previewUrl}
              naturalWidth={imageMeta.width}
              naturalHeight={imageMeta.height}
              blockX={blockX}
              blockY={blockY}
              onPick={(bx, by) => {
                setBlockX(bx)
                setBlockY(by)
              }}
            />
          ) : (
            <EmptyState message="Upload an image in the sidebar to pick a block." />
          )}
        </Card>

        <Card title="Parameters" icon={Grid2x2}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Block X">
                <NumberInput value={blockX} onChange={setBlockX} />
              </Field>
              <Field label="Block Y">
                <NumberInput value={blockY} onChange={setBlockY} />
              </Field>
            </div>

            <Field label="Quality Source">
              <div className="flex gap-2 text-xs">
                <label className="flex items-center gap-1">
                  <input type="radio" checked={useAutoQuality} onChange={() => setUseAutoQuality(true)} />
                  Match sidebar target BPP
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" checked={!useAutoQuality} onChange={() => setUseAutoQuality(false)} />
                  Manual Q
                </label>
              </div>
            </Field>

            {!useAutoQuality && (
              <Field label="Quality (1–100)">
                <NumberInput value={quality} min={1} onChange={(v) => setQuality(Math.min(100, v))} />
              </Field>
            )}

            <PrimaryButton onClick={run} loading={loading} icon={Play} className="w-full">
              Inspect Block
            </PrimaryButton>
          </div>
        </Card>
      </div>

      {!result && !loading && <EmptyState message="Pick a block and click Inspect Block." />}

      {result && (
        <>
          <Card title="Block Stats">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              <StatPill label="MSE" value={result.stats.mse.toFixed(2)} />
              <StatPill label="PSNR" value={`${fmt(result.stats.psnr)}dB`} />
              <StatPill label="BPP" value={result.bpp.toFixed(3)} />
              <StatPill label="Matched Q" value={result.matched_q} />
              <StatPill label="Non-zero Coeffs" value={`${result.stats.non_zero_count}/64`} />
            </div>
          </Card>

          <Card title="Pipeline Matrices">
            <div className="grid grid-cols-3 gap-4">
              {MATRICES.map(({ key, label, mode, highlightDC }) => (
                <div key={key}>
                  <p className="mb-1 text-center text-[11px] font-semibold text-slate-500">{label}</p>
                  <MatrixGrid
                    matrix={result[key]}
                    mode={mode}
                    highlightDC={highlightDC}
                    decimals={key === 'dct_coeffs' ? 1 : 0}
                  />
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
