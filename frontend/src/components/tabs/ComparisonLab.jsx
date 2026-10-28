import { useState } from 'react'
import { Play, Image as ImageIcon, ArrowRightLeft, Waves, Columns2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { compareCodecs, pngDataUrl, apiErrorMessage } from '../../api/client'
import { Card, PrimaryButton, ErrorBanner, EmptyState } from '../ui/Primitives'
import { fmt, fmtSigned } from '../../utils/format'
import MultiWaveletLab from './MultiWaveletLab'
import ContentTypeLab from './ContentTypeLab'

function formatBytes(bytes) {
  if (bytes == null) return '—'
  return bytes < 1024 ? `${bytes.toFixed(0)} B` : `${(bytes / 1024).toFixed(2)} KB`
}

function CodecImage({ title, accent, src, meta }) {
  return (
    <Card title={title} className="flex flex-col">
      <div className={`mb-2 rounded-lg border-2 ${accent} overflow-hidden bg-slate-100`}>
        {src ? <img src={src} alt={title} className="w-full object-contain" /> : <EmptyState message="No image" />}
      </div>
      {meta && <p className="text-center text-xs text-slate-500">{meta}</p>}
    </Card>
  )
}

function MetricsTable({ dct, dwt, summary }) {
  const rows = [
    ['Parameter', dct.parameter.quality != null ? `Q=${dct.parameter.quality}` : '—', dwt.parameter.delta != null ? `δ=${dwt.parameter.delta.toFixed(2)}` : '—', '—'],
    ['BPP', dct.bpp.toFixed(3), dwt.bpp.toFixed(3), fmtSigned(summary.delta_bpp, 3)],
    ['PSNR (dB)', fmt(dct.psnr), fmt(dwt.psnr), fmtSigned(summary.delta_psnr)],
    ['SSIM', dct.ssim.toFixed(4), dwt.ssim.toFixed(4), fmtSigned(summary.delta_ssim, 4)],
    ['MSE', dct.mse.toFixed(2), dwt.mse.toFixed(2), fmtSigned(summary.delta_mse)],
    ['Compression Ratio', `${fmt(dct.compression_ratio)}:1`, `${fmt(dwt.compression_ratio)}:1`, '—'],
  ]
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
          <th className="py-2 pr-2">Metric</th>
          <th className="py-2 pr-2 text-blue-600">DCT</th>
          <th className="py-2 pr-2 text-violet-600">DWT</th>
          <th className="py-2 pr-2">Δ (DWT − DCT)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, a, b, d]) => (
          <tr key={label} className="border-b border-slate-100 last:border-0">
            <td className="py-1.5 pr-2 font-medium text-slate-600">{label}</td>
            <td className="py-1.5 pr-2 font-mono text-slate-700">{a}</td>
            <td className="py-1.5 pr-2 font-mono text-slate-700">{b}</td>
            <td className="py-1.5 pr-2 font-mono text-slate-500">{d}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SummaryCard({ label, accent, bytes, kb, reduction }) {
  return (
    <div className={`rounded-xl border p-4 ${accent}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-bold">{kb}</p>
      <p className="text-xs opacity-70">{bytes} bytes</p>
      {reduction != null && <p className="mt-2 text-sm font-semibold">{reduction}% smaller</p>}
    </div>
  )
}

function SubTabNavigation({ activeSubTab, setActiveSubTab, tabs }) {
  return (
    <div className="mb-4 flex gap-2 border-b border-slate-200 pb-0">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setActiveSubTab(id)}
          className={`flex items-center gap-1.5 rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeSubTab === id
              ? 'border-blue-600 bg-white text-blue-700'
              : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700'
          }`}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
    </div>
  )
}

export default function ComparisonLab() {
  const { file, targetBpp, effectiveTargetBpp, wavelet, level } = useApp()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [activeSubTab, setActiveSubTab] = useState('dct-vs-dwt') // 'dct-vs-dwt' | 'multi-wavelet' | 'content-type'

  const SUB_TABS = [
    { id: 'dct-vs-dwt', label: 'DCT vs DWT', icon: ArrowRightLeft },
    { id: 'multi-wavelet', label: 'Multi-Wavelet', icon: Waves },
    { id: 'content-type', label: 'Content-Type', icon: Columns2 },
  ]

  async function runComparison() {
    if (!file) {
      setError('Upload an image in the sidebar first.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await compareCodecs(file, { targetBpp: effectiveTargetBpp, wavelet, level })
      setResult(data)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // Render content based on active sub-tab
  if (activeSubTab === 'multi-wavelet') {
    return (
      <div>
        <SubTabNavigation activeSubTab={activeSubTab} setActiveSubTab={setActiveSubTab} tabs={SUB_TABS} />
        <MultiWaveletLab />
      </div>
    )
  }

  if (activeSubTab === 'content-type') {
    return (
      <div>
        <SubTabNavigation activeSubTab={activeSubTab} setActiveSubTab={setActiveSubTab} tabs={SUB_TABS} />
        <ContentTypeLab />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <SubTabNavigation activeSubTab={activeSubTab} setActiveSubTab={setActiveSubTab} tabs={SUB_TABS} />
      
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">DCT vs DWT Comparison</h2>
          <p className="text-sm text-slate-500">
            Rate-matched DCT vs DWT at target {targetBpp.toFixed(2)} bpp ({(8 / targetBpp).toFixed(1)}:1 target CR)
          </p>
        </div>
        <PrimaryButton onClick={runComparison} loading={loading} icon={Play}>
          Run Comparison
        </PrimaryButton>
      </div>

      <ErrorBanner message={error} />

      {!result && !loading && <EmptyState message="Upload an image and click Run Comparison to begin." />}

      {result && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <CodecImage title="Original" accent="border-slate-300" src={pngDataUrl(result.original_png)} meta={`${formatBytes(result.original_bytes)} (8-bit)`} />
            <CodecImage
              title="JPEG · DCT"
              accent="border-blue-400"
              src={pngDataUrl(result.dct.reconstructed_png)}
              meta={`Q=${result.dct.parameter.quality} · ${result.dct.bpp.toFixed(3)} bpp`}
            />
            <CodecImage
              title="JPEG2000 · DWT"
              accent="border-violet-400"
              src={pngDataUrl(result.dwt.reconstructed_png)}
              meta={`${result.dwt.parameter.wavelet} L${result.dwt.parameter.level} · δ=${result.dwt.parameter.delta.toFixed(2)}`}
            />
          </div>

          <Card title="Quality Comparison" icon={ArrowRightLeft}>
            <MetricsTable dct={result.dct} dwt={result.dwt} summary={result.summary} />
          </Card>

          <Card title="Compression Summary" icon={ImageIcon}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <SummaryCard
                label="Original"
                accent="border-slate-200 bg-slate-50 text-slate-700"
                bytes={result.original_bytes}
                kb={formatBytes(result.original_bytes)}
              />
              <SummaryCard
                label="DCT Compressed"
                accent="border-blue-200 bg-blue-50 text-blue-800"
                bytes={result.dct.compressed_bytes.toFixed(0)}
                kb={formatBytes(result.dct.compressed_bytes)}
                reduction={result.dct.reduction_percent.toFixed(1)}
              />
              <SummaryCard
                label="DWT Compressed"
                accent="border-violet-200 bg-violet-50 text-violet-800"
                bytes={result.dwt.compressed_bytes.toFixed(0)}
                kb={formatBytes(result.dwt.compressed_bytes)}
                reduction={result.dwt.reduction_percent.toFixed(1)}
              />
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
