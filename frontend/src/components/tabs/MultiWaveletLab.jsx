import { useState } from 'react'
import { Play, Waves } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { multiWavelet, pngDataUrl, apiErrorMessage } from '../../api/client'
import { Card, PrimaryButton, ErrorBanner, EmptyState } from '../ui/Primitives'
import { fmt } from '../../utils/format'

function formatBytes(bytes) {
  if (bytes == null) return '—'
  return bytes < 1024 ? `${bytes.toFixed(0)} B` : `${(bytes / 1024).toFixed(2)} KB`
}

function WaveletCard({ result }) {
  return (
    <Card className="flex h-full flex-col">
      <p className="mb-2 text-center font-mono text-sm font-bold text-violet-700">{result.parameter.wavelet}</p>
      <img
        src={pngDataUrl(result.reconstructed_png)}
        alt={`${result.parameter.wavelet} reconstruction`}
        className="w-full rounded-lg border-2 border-violet-200 bg-black object-contain"
      />
      
      {/* Primary Metrics - Prominent Display */}
      <div className="mt-3 flex items-baseline justify-center gap-4 border-b border-slate-200 pb-3">
        <div className="text-center">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">PSNR</p>
          <p className="text-sm font-bold text-slate-900">{fmt(result.psnr)} dB</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">BPP</p>
          <p className="text-sm font-bold text-slate-900">{result.bpp.toFixed(3)}</p>
        </div>
      </div>
      
      {/* Secondary Metrics - 2-Column Grid */}
      <div className="mt-3 grid flex-1 grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">MSE</p>
          <p className="font-mono text-[11px] font-semibold text-slate-700">{result.mse.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">CR</p>
          <p className="font-mono text-[11px] font-semibold text-slate-700">{fmt(result.compression_ratio)}:1</p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">File Size</p>
          <p className="font-mono text-[11px] font-semibold text-slate-700">{formatBytes(result.compressed_bytes)}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Step δ</p>
          <p className="font-mono text-[11px] font-semibold text-slate-700">{result.parameter.delta.toFixed(2)}</p>
        </div>
      </div>
    </Card>
  )
}

export default function MultiWaveletLab() {
  const { file, targetBpp, effectiveTargetBpp, level } = useApp()
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
      const data = await multiWavelet(file, { targetBpp: effectiveTargetBpp, level })
      setResult(data)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Multi-Wavelet Lab</h2>
          <p className="text-sm text-slate-500">
            haar / db2 / db4 / db8 / db12 — all rate-matched to the same {targetBpp.toFixed(2)} bpp target.
          </p>
        </div>
        <PrimaryButton onClick={run} loading={loading} icon={Play}>
          Compare Wavelets
        </PrimaryButton>
      </div>

      <ErrorBanner message={error} />

      {!result && !loading && <EmptyState message="Upload an image and click Compare Wavelets to begin." />}

      {result && (
        <>
          <Card title="Original" icon={Waves} className="max-w-xs">
            <img
              src={pngDataUrl(result.original_png)}
              alt="Original"
              className="w-full rounded-lg border border-slate-300 bg-slate-100 object-contain"
            />
            <p className="mt-1 text-center text-xs text-slate-500">{formatBytes(result.original_bytes)} (8-bit)</p>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {result.results.map((r) => (
              <WaveletCard key={r.parameter.wavelet} result={r} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
