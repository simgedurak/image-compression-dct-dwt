import { useState, useEffect } from 'react'
import { Upload, Play, Leaf, Shapes, ArrowRightLeft, TrendingUp } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { compareCodecs, pngDataUrl, apiErrorMessage } from '../../api/client'
import { Card, PrimaryButton, ErrorBanner, StatPill } from '../ui/Primitives'
import { fmt, fmtSigned } from '../../utils/format'

function formatBytes(bytes) {
  if (bytes == null) return '—'
  return bytes < 1024 ? `${bytes.toFixed(0)} B` : `${(bytes / 1024).toFixed(2)} KB`
}

// Theoretical R-D curve model: PSNR ≈ a·ln(bpp) + b (Shannon rate-distortion approximation).
// Each curve is anchored so it passes exactly through its measured reference point at 0.30 bpp.
const RD_ANCHOR_BPP = 0.30
const RD_CURVE_PARAMS = {
  natural: {
    dct: { a: 6.0, anchorPsnr: 30.19 },
    dwt: { a: 6.3, anchorPsnr: 31.57 },
  },
  synthetic: {
    dct: { a: 5.0, anchorPsnr: 26.05 },
    dwt: { a: 5.0, anchorPsnr: 27.18 },
  },
}

function generateRDCurve(contentType, codec) {
  const { a, anchorPsnr } = RD_CURVE_PARAMS[contentType][codec]
  const b = anchorPsnr - a * Math.log(RD_ANCHOR_BPP)
  const points = []
  for (let bpp = 0.10; bpp <= 2.0001; bpp += 0.05) {
    points.push({ bpp, psnr: a * Math.log(bpp) + b })
  }
  return points
}

// One compact R-D chart for a single content type (natural or synthetic).
function MiniRDChart({ title, contentType, result, targetBpp }) {
  const width = 380
  const height = 260
  const padding = { top: 22, right: 22, bottom: 36, left: 40 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom

  const bppMin = 0.10
  const bppMax = 2.00
  const psnrMin = 20
  const psnrMax = 45

  const xScale = (bpp) => padding.left + ((bpp - bppMin) / (bppMax - bppMin)) * plotWidth
  const yScale = (psnr) => padding.top + ((psnrMax - psnr) / (psnrMax - psnrMin)) * plotHeight
  // Clamp so a point slightly outside the modeled range can never render outside the axes.
  const clampX = (x) => Math.min(Math.max(x, padding.left), width - padding.right)
  const clampY = (y) => Math.min(Math.max(y, padding.top), height - padding.bottom)

  const dctCurve = generateRDCurve(contentType, 'dct')
  const dwtCurve = generateRDCurve(contentType, 'dwt')

  const createPath = (curve) =>
    curve
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${clampX(xScale(p.bpp)).toFixed(2)},${clampY(yScale(p.psnr)).toFixed(2)}`)
      .join(' ')

  const dctPath = createPath(dctCurve)
  const dwtPath = createPath(dwtCurve)

  const anchor = RD_CURVE_PARAMS[contentType]
  // Markers sit on the X-axis at the active target BPP (not the codec's actual measured bpp,
  // which can drift slightly off target) and on the Y-axis at the live measured PSNR.
  const markerBpp = targetBpp != null ? targetBpp : RD_ANCHOR_BPP
  const dctPoint = { bpp: markerBpp, psnr: result?.dct ? result.dct.psnr : anchor.dct.anchorPsnr }
  const dwtPoint = { bpp: markerBpp, psnr: result?.dwt ? result.dwt.psnr : anchor.dwt.anchorPsnr }

  const xTicks = [0.25, 0.50, 0.75, 1.00, 1.25, 1.50, 1.75]
  const yTicks = [20, 25, 30, 35, 40, 45]

  const showTarget = targetBpp != null && targetBpp >= bppMin && targetBpp <= bppMax

  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-3 shadow-lg">
      <p className="mb-2 text-center text-xs font-semibold text-slate-200">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full overflow-hidden">
        {/* Grid lines */}
        <g className="opacity-20">
          {xTicks.map((bpp) => (
            <line key={`gx-${bpp}`} x1={xScale(bpp)} y1={padding.top} x2={xScale(bpp)} y2={height - padding.bottom} stroke="#64748b" strokeWidth="1" strokeDasharray="3 3" />
          ))}
          {yTicks.map((psnr) => (
            <line key={`gy-${psnr}`} x1={padding.left} y1={yScale(psnr)} x2={width - padding.right} y2={yScale(psnr)} stroke="#64748b" strokeWidth="1" strokeDasharray="3 3" />
          ))}
        </g>

        {/* Axes */}
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="1.5" />
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="1.5" />

        {/* X-axis ticks/labels */}
        {xTicks.map((bpp) => (
          <text key={`xt-${bpp}`} x={xScale(bpp)} y={height - padding.bottom + 14} textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="monospace">
            {bpp.toFixed(2)}
          </text>
        ))}
        {/* Y-axis ticks/labels */}
        {yTicks.map((psnr) => (
          <text key={`yt-${psnr}`} x={padding.left - 6} y={yScale(psnr)} textAnchor="end" dominantBaseline="middle" fill="#94a3b8" fontSize="9" fontFamily="monospace">
            {psnr}
          </text>
        ))}

        <text x={width / 2} y={height - 4} textAnchor="middle" fill="#cbd5e1" fontSize="9" fontWeight="600">
          bpp (bit / piksel)
        </text>
        <text x={-height / 2} y={11} textAnchor="middle" fill="#cbd5e1" fontSize="9" fontWeight="600" transform={`rotate(-90 11 ${height / 2})`}>
          PSNR (dB)
        </text>

        {/* Target BPP vertical line */}
        {showTarget && (
          <line
            x1={xScale(targetBpp)}
            y1={padding.top}
            x2={xScale(targetBpp)}
            y2={height - padding.bottom}
            stroke="#fbbf24"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            opacity="0.85"
          />
        )}

        {/* R-D curves */}
        <path d={dctPath} fill="none" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d={dwtPath} fill="none" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* DCT marker */}
        <g>
          <circle cx={clampX(xScale(dctPoint.bpp))} cy={clampY(yScale(dctPoint.psnr))} r="8" fill="none" stroke="#06b6d4" strokeWidth="1.5" opacity="0.4">
            <animate attributeName="r" values="8;11;8" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx={clampX(xScale(dctPoint.bpp))} cy={clampY(yScale(dctPoint.psnr))} r="4.5" fill="#06b6d4" stroke="#0c4a6e" strokeWidth="1.5" />
        </g>

        {/* DWT marker */}
        <g>
          <circle cx={clampX(xScale(dwtPoint.bpp))} cy={clampY(yScale(dwtPoint.psnr))} r="8" fill="none" stroke="#a855f7" strokeWidth="1.5" opacity="0.4">
            <animate attributeName="r" values="8;11;8" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx={clampX(xScale(dwtPoint.bpp))} cy={clampY(yScale(dwtPoint.psnr))} r="4.5" fill="#a855f7" stroke="#581c87" strokeWidth="1.5" />
        </g>
      </svg>

      <div className="mt-1.5 flex items-center justify-center gap-4 text-[10px]">
        <span className="text-cyan-400">DCT: {fmt(dctPoint.psnr)} dB @ {dctPoint.bpp.toFixed(2)} bpp</span>
        <span className="text-violet-400">DWT: {fmt(dwtPoint.psnr)} dB @ {dwtPoint.bpp.toFixed(2)} bpp</span>
      </div>
    </div>
  )
}

function RateDistortionChart({ naturalResult, syntheticResult, targetBpp }) {
  return (
    <Card title="Rate-Distortion Analysis" icon={TrendingUp} className="mt-4">
      <div className="mb-3 flex items-center justify-end gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="h-0.5 w-6 bg-cyan-500"></div>
          <span className="text-slate-600">DCT (JPEG)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-0.5 w-6 bg-purple-500"></div>
          <span className="text-slate-600">DWT (JPEG2000)</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <MiniRDChart title="Natural Image (Lena) R-D Curve" contentType="natural" result={naturalResult} targetBpp={targetBpp} />
        <MiniRDChart title="Synthetic Image R-D Curve" contentType="synthetic" result={syntheticResult} targetBpp={targetBpp} />
      </div>

      {/* Insights */}
      <div className="mt-4 rounded-lg bg-slate-800/60 p-3 text-xs text-slate-300">
        <p className="font-semibold text-slate-200">Rate-Distortion Insights:</p>
        <ul className="mt-2 space-y-1">
          <li>• <span className="font-semibold text-cyan-400">DCT curve (cyan):</span> Shows JPEG quality vs bitrate trade-off</li>
          <li>• <span className="font-semibold text-purple-400">DWT curve (violet):</span> JPEG2000 leads by a wider margin on natural imagery; the gap narrows on sharp synthetic content</li>
          <li>• <span className="font-semibold text-amber-400">Target line:</span> Current compression target at {targetBpp ? targetBpp.toFixed(2) : '—'} bpp</li>
          <li>• <span className="font-semibold text-emerald-400">Glowing markers:</span> Live measured PSNR for each uploaded image (reference values shown until analyzed)</li>
        </ul>
      </div>
    </Card>
  )
}

function ContentColumn({ label, icon, file, setFile, previewUrl, setPreviewUrl, loading, setLoading, error, setError, result, setResult, ranWith, setRanWith }) {
  const { effectiveTargetBpp, targetBpp, wavelet, level } = useApp()

  function handleFile(e) {
    const picked = e.target.files?.[0]
    if (!picked) return
    setFile(picked)
    setPreviewUrl(URL.createObjectURL(picked))
    setResult(null)
    setError('')
  }

  async function run() {
    if (!file) {
      setError('Upload an image first.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await compareCodecs(file, { targetBpp: effectiveTargetBpp, wavelet, level })
      setResult(data)
      setRanWith({ targetBpp, wavelet, level })
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // Auto-recalculate when target BPP, wavelet, or level changes
  useEffect(() => {
    if (file && result && ranWith) {
      const needsUpdate =
        ranWith.targetBpp !== targetBpp ||
        ranWith.wavelet !== wavelet ||
        ranWith.level !== level

      if (needsUpdate) {
        run()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetBpp, wavelet, level])

  return (
    <Card title={label} icon={icon}>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs text-slate-500 transition-colors hover:border-blue-400 hover:bg-blue-50">
        <Upload size={16} className="text-slate-400" />
        <span className="font-medium">{file ? `Replace: ${file.name}` : 'Click to select an image'}</span>
        <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </label>

      {file && (
        <PrimaryButton onClick={run} loading={loading} icon={Play} className="mt-2 w-full">
          {result ? 'Recalculate' : 'Analyze'}
        </PrimaryButton>
      )}

      <ErrorBanner message={error} />

      {!result && !loading && previewUrl && (
        <img
          src={previewUrl}
          alt={label}
          className="mt-3 max-h-48 w-full rounded-lg border border-slate-200 bg-slate-100 object-contain"
        />
      )}

      {result && (
        <>
          {/* Three-column layout: Original | DCT | DWT */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div>
              <img
                src={pngDataUrl(result.original_png)}
                alt="Original"
                className="w-full rounded-lg border border-slate-300 bg-slate-100 object-contain"
              />
              <p className="mt-1 text-center text-[10px] text-slate-500">Original</p>
            </div>
            <div>
              <img
                src={pngDataUrl(result.dct.reconstructed_png)}
                alt="DCT Reconstruction"
                className="w-full rounded-lg border-2 border-blue-400 bg-slate-100 object-contain"
              />
              <p className="mt-1 text-center text-[10px] font-semibold text-blue-600">DCT (JPEG)</p>
            </div>
            <div>
              <img
                src={pngDataUrl(result.dwt.reconstructed_png)}
                alt="DWT Reconstruction"
                className="w-full rounded-lg border-2 border-violet-400 bg-slate-100 object-contain"
              />
              <p className="mt-1 text-center text-[10px] font-semibold text-violet-600">DWT (JPEG2000)</p>
            </div>
          </div>

          {/* Dual metrics: DCT vs DWT */}
          <div className="mt-3 space-y-2">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-2">
              <p className="mb-1 text-center text-[10px] font-bold uppercase tracking-wide text-blue-600">DCT Metrics</p>
              <div className="grid grid-cols-2 gap-1">
                <StatPill label="PSNR" value={`${fmt(result.dct.psnr)}dB`} />
                <StatPill label="SSIM" value={result.dct.ssim.toFixed(4)} />
                <StatPill label="BPP" value={result.dct.bpp.toFixed(3)} />
                <StatPill label="CR" value={`${fmt(result.dct.compression_ratio)}:1`} />
              </div>
            </div>

            <div className="rounded-lg border border-violet-200 bg-violet-50 p-2">
              <p className="mb-1 text-center text-[10px] font-bold uppercase tracking-wide text-violet-600">DWT Metrics</p>
              <div className="grid grid-cols-2 gap-1">
                <StatPill label="PSNR" value={`${fmt(result.dwt.psnr)}dB`} />
                <StatPill label="SSIM" value={result.dwt.ssim.toFixed(4)} />
                <StatPill label="BPP" value={result.dwt.bpp.toFixed(3)} />
                <StatPill label="CR" value={`${fmt(result.dwt.compression_ratio)}:1`} />
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

// Metrics shown in the comparison table, in display order.
const COMPARISON_METRICS = [
  { label: 'PSNR (dB)', field: 'psnr', formatValue: (v) => fmt(v), formatDelta: (d) => fmtSigned(d) },
  { label: 'SSIM', field: 'ssim', formatValue: (v) => (v == null ? '∞' : v.toFixed(4)), formatDelta: (d) => fmtSigned(d, 4) },
  { label: 'CR', field: 'compression_ratio', formatValue: (v) => (v == null ? '∞' : `${fmt(v)}:1`), formatDelta: (d) => fmtSigned(d) },
  { label: 'BPP', field: 'bpp', formatValue: (v) => (v == null ? '∞' : v.toFixed(3)), formatDelta: (d) => fmtSigned(d, 3) },
]

function Academic2x2ComparisonMatrix({ naturalResult, syntheticResult }) {
  if (!naturalResult || !syntheticResult) return null

  const groups = [
    { label: 'Natural Image (Lena)', colorClass: 'text-green-700', dct: naturalResult.dct, dwt: naturalResult.dwt },
    { label: 'Synthetic Image', colorClass: 'text-amber-700', dct: syntheticResult.dct, dwt: syntheticResult.dwt },
  ]

  return (
    <Card title="Academic Comparison: DCT vs DWT" icon={ArrowRightLeft} className="mt-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-300 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="py-2 pr-2">Content Type</th>
              <th className="py-2 pr-2">Metric</th>
              <th className="py-2 pr-2 text-center text-blue-600">DCT (JPEG)</th>
              <th className="py-2 pr-2 text-center text-violet-600">DWT (JPEG2000)</th>
              <th className="py-2 pr-2 text-center text-slate-600">Δ (DWT − DCT)</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group, gi) => (
              COMPARISON_METRICS.map((metric, mi) => {
                const dctVal = group.dct[metric.field]
                const dwtVal = group.dwt[metric.field]
                const delta = dctVal == null || dwtVal == null ? null : dwtVal - dctVal
                const isLastRowOfGroup = mi === COMPARISON_METRICS.length - 1
                return (
                  <tr
                    key={`${group.label}-${metric.field}`}
                    className={isLastRowOfGroup && gi < groups.length - 1 ? 'border-b-2 border-slate-200' : 'border-b border-slate-100'}
                  >
                    {mi === 0 && (
                      <td rowSpan={COMPARISON_METRICS.length} className={`py-2 pr-2 align-top font-semibold ${group.colorClass}`}>
                        {group.label}
                      </td>
                    )}
                    <td className="py-2 pr-2 text-slate-500">{metric.label}</td>
                    <td className="py-2 pr-2 text-center font-mono text-slate-700">{metric.formatValue(dctVal)}</td>
                    <td className="py-2 pr-2 text-center font-mono text-slate-700">{metric.formatValue(dwtVal)}</td>
                    <td className="py-2 pr-2 text-center font-mono font-semibold text-emerald-600">{metric.formatDelta(delta)}</td>
                  </tr>
                )
              })
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 rounded-lg bg-slate-50 p-3">
        <p className="text-xs font-semibold text-slate-700">Key Insights:</p>
        <ul className="mt-1.5 space-y-1 text-xs text-slate-600">
          <li>
            <span className="font-semibold text-emerald-600">DWT advantage on natural images:</span> wavelets better preserve smooth gradients and textures (higher PSNR/SSIM)
          </li>
          <li>
            <span className="font-semibold text-blue-600">DCT competitive on synthetic:</span> sharp edges and uniform colors favor block-based transforms
          </li>
          <li>
            <span className="font-semibold text-violet-600">Rate matching:</span> both codecs converge to a similar BPP at the target bit rate
          </li>
        </ul>
      </div>
    </Card>
  )
}

export default function ContentTypeLab() {
  const { targetBpp } = useApp()

  // Natural image state
  const [naturalFile, setNaturalFile] = useState(null)
  const [naturalPreview, setNaturalPreview] = useState(null)
  const [naturalLoading, setNaturalLoading] = useState(false)
  const [naturalError, setNaturalError] = useState('')
  const [naturalResult, setNaturalResult] = useState(null)
  const [naturalRanWith, setNaturalRanWith] = useState(null)

  // Synthetic image state
  const [syntheticFile, setSyntheticFile] = useState(null)
  const [syntheticPreview, setSyntheticPreview] = useState(null)
  const [syntheticLoading, setSyntheticLoading] = useState(false)
  const [syntheticError, setSyntheticError] = useState('')
  const [syntheticResult, setSyntheticResult] = useState(null)
  const [syntheticRanWith, setSyntheticRanWith] = useState(null)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Content Type Lab</h2>
        <p className="text-sm text-slate-500">
          Compare DCT (JPEG) vs DWT (JPEG2000) performance on natural vs. synthetic content at {targetBpp.toFixed(2)} bpp.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ContentColumn
          label="Natural Image"
          icon={Leaf}
          file={naturalFile}
          setFile={setNaturalFile}
          previewUrl={naturalPreview}
          setPreviewUrl={setNaturalPreview}
          loading={naturalLoading}
          setLoading={setNaturalLoading}
          error={naturalError}
          setError={setNaturalError}
          result={naturalResult}
          setResult={setNaturalResult}
          ranWith={naturalRanWith}
          setRanWith={setNaturalRanWith}
        />
        <ContentColumn
          label="Synthetic Image"
          icon={Shapes}
          file={syntheticFile}
          setFile={setSyntheticFile}
          previewUrl={syntheticPreview}
          setPreviewUrl={setSyntheticPreview}
          loading={syntheticLoading}
          setLoading={setSyntheticLoading}
          error={syntheticError}
          setError={setSyntheticError}
          result={syntheticResult}
          setResult={setSyntheticResult}
          ranWith={syntheticRanWith}
          setRanWith={setSyntheticRanWith}
        />
      </div>
      <Academic2x2ComparisonMatrix
        naturalResult={naturalResult}
        syntheticResult={syntheticResult}
      />
      <RateDistortionChart
        naturalResult={naturalResult}
        syntheticResult={syntheticResult}
        targetBpp={targetBpp}
      />
    </div>
  )
}
