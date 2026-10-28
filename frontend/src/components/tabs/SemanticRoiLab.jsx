import { useEffect, useRef, useState } from 'react'
import { Play, ScanFace, SquareDashedMousePointer } from 'lucide-react'
import { useApp, SUPPORTED_WAVELETS } from '../../context/AppContext'
import { semanticRoi, pngDataUrl, apiErrorMessage } from '../../api/client'
import { Card, Field, Select, RangeSlider, ToggleGroup, PrimaryButton, ErrorBanner, EmptyState } from '../ui/Primitives'
import { fmt, fmtSigned } from '../../utils/format'

const WAVELET_OPTIONS = SUPPORTED_WAVELETS.map((w) => ({ value: w, label: w }))
const LEVEL_OPTIONS = [1, 2, 3].map((l) => ({ value: String(l), label: `Level ${l}` }))

function RoiCanvas({ previewUrl, naturalWidth, naturalHeight, box, onChange, disabled }) {
  const containerRef = useRef(null)
  const [containerSize, setContainerSize] = useState({ w: 1, h: 1 })
  const [drag, setDrag] = useState(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const obs = new ResizeObserver(update)
    obs.observe(el)
    return () => obs.disconnect()
  }, [previewUrl])

  function toDisplay(natBox) {
    if (!natBox || !naturalWidth || !naturalHeight) return null
    return {
      x: (natBox.x / naturalWidth) * containerSize.w,
      y: (natBox.y / naturalHeight) * containerSize.h,
      w: (natBox.w / naturalWidth) * containerSize.w,
      h: (natBox.h / naturalHeight) * containerSize.h,
    }
  }

  function handleMouseDown(e) {
    if (disabled) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setDrag({ startX: x, startY: y, curX: x, curY: y })
  }
  function handleMouseMove(e) {
    if (!drag) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
    setDrag((d) => ({ ...d, curX: x, curY: y }))
  }
  function handleMouseUp() {
    if (!drag) return
    const { startX, startY, curX, curY } = drag
    const x0 = Math.min(startX, curX)
    const y0 = Math.min(startY, curY)
    const w = Math.abs(curX - startX)
    const h = Math.abs(curY - startY)
    setDrag(null)
    if (w < 6 || h < 6 || !containerSize.w) return
    const scaleX = naturalWidth / containerSize.w
    const scaleY = naturalHeight / containerSize.h
    onChange({ x: Math.round(x0 * scaleX), y: Math.round(y0 * scaleY), w: Math.round(w * scaleX), h: Math.round(h * scaleY) })
  }

  const liveRect = drag && {
    x: Math.min(drag.startX, drag.curX),
    y: Math.min(drag.startY, drag.curY),
    w: Math.abs(drag.curX - drag.startX),
    h: Math.abs(drag.curY - drag.startY),
  }
  const committedRect = !drag ? toDisplay(box) : null

  return (
    <div
      ref={containerRef}
      className={`relative select-none overflow-hidden rounded-lg border-2 ${
        disabled 
          ? 'cursor-not-allowed border-slate-200 bg-slate-100 opacity-60' 
          : 'cursor-crosshair border-emerald-400 border-dashed bg-emerald-50/30'
      }`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => drag && handleMouseUp()}
    >
      <img src={previewUrl} alt="ROI target" className="block w-full select-none" draggable={false} />
      {!disabled && !box && !drag && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/5">
          <p className="rounded-lg bg-white/90 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm">
            ✎ Bir kutu çizmek için tıklayın ve sürükleyin
          </p>
        </div>
      )}
      {(liveRect || committedRect) && (
        <div
          className="pointer-events-none absolute border-2 border-dashed border-emerald-500 bg-emerald-400/20 shadow-lg"
          style={{
            left: (liveRect || committedRect).x,
            top: (liveRect || committedRect).y,
            width: (liveRect || committedRect).w,
            height: (liveRect || committedRect).h,
          }}
        />
      )}
    </div>
  )
}

function ImagePane({ title, children, titleColor = 'text-slate-600' }) {
  return (
    <div className="flex flex-col">
      <div className="aspect-square w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-900/40 flex items-center justify-center">
        {children}
      </div>
      <p className={`mt-2 text-center text-[11px] font-bold uppercase tracking-wider ${titleColor}`}>{title}</p>
    </div>
  )
}

// The mask itself is a plain grayscale PNG; painted as a blue layer whose
// alpha follows the (feathered) mask's luminance, it reads as the classic
// "blue ROI overlay" on top of the source image.
function MaskOverlayPane({ sourceUrl, maskUrl }) {
  return (
    <div className="relative w-full h-full">
      <img src={sourceUrl} alt="ROI mask base" className="w-full h-full object-cover" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor: '#2563eb',
          opacity: 0.55,
          WebkitMaskImage: `url(${maskUrl})`,
          maskImage: `url(${maskUrl})`,
          WebkitMaskSize: 'cover',
          maskSize: 'cover',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
        }}
      />
    </div>
  )
}

function RegionalMetricCard({ label, value, hint, baseline, semantic, tone = 'neutral' }) {
  const tones = {
    positive: 'border-emerald-200 bg-emerald-50',
    negative: 'border-amber-200 bg-amber-50',
    neutral: 'border-slate-200 bg-slate-50',
  }
  
  const valueTones = {
    positive: 'text-emerald-700',
    negative: 'text-amber-700',
    neutral: 'text-slate-700',
  }
  
  return (
    <div className={`rounded-lg border p-4 ${tones[tone] || tones.neutral}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      {baseline !== undefined && semantic !== undefined ? (
        <div className="mt-3 space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-slate-500">Baseline</span>
            <span className="font-mono text-base font-bold text-slate-700">{baseline}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-slate-500">Semantic</span>
            <span className="font-mono text-base font-bold text-slate-700">{semantic}</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between border-t border-slate-200 pt-2">
            <span className="text-xs font-semibold text-slate-600">Fark</span>
            <span className={`font-mono text-xl font-bold ${valueTones[tone]}`}>{value}</span>
          </div>
        </div>
      ) : (
        <>
          <p className={`mt-2 font-mono text-2xl font-bold ${valueTones[tone]}`}>{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </>
      )}
    </div>
  )
}

export default function SemanticRoiLab() {
  const { file, imageMeta, wavelet, setWavelet, level, setLevel } = useApp()
  const [autoFace, setAutoFace] = useState(true)
  const [box, setBox] = useState(null)
  const [deltaRoi, setDeltaRoi] = useState(5)
  const [deltaBg, setDeltaBg] = useState(40)
  const [blurBackground, setBlurBackground] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  async function run() {
    if (!file) {
      setError('Upload an image in the sidebar first.')
      return
    }
    
    // Validate manual mode has a box selected
    if (!autoFace && !box) {
      setError('Lütfen görsel üzerinde bir alan seçin (Please select a region on the image)')
      return
    }
    
    setLoading(true)
    setError('')
    try {
      const roiCoords = !autoFace && box ? [[box.x, box.y, box.w, box.h]] : undefined
      const data = await semanticRoi(file, { roiCoords, deltaRoi, deltaBg, wavelet, level, blurBackground })
      setResult(data)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const hasRoi = !!result?.boxes?.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4">
        <h2 className="text-xl font-bold text-slate-800">SEMANTİK-FARKINDA BİT TAHSİSİ</h2>
        <p className="mt-1 text-sm text-slate-500">Aynı toplam bit bütçesi, farklı uzamsal kalite tahsisi.</p>
      </div>

      <ErrorBanner message={error} />

      {result && (
        <>
          {/* Top Row: 4 Images Side by Side */}
          <div className="grid grid-cols-4 gap-3">
            <ImagePane title="KAYNAK GÖRÜNTÜ">
              <img src={pngDataUrl(result.original_png)} alt="Source" className="w-full h-full object-cover" />
            </ImagePane>
            <ImagePane title="ROI MASKESİ">
              <MaskOverlayPane sourceUrl={pngDataUrl(result.original_png)} maskUrl={pngDataUrl(result.soft_mask_png)} />
            </ImagePane>
            <ImagePane title="BASELINE (UNIFORM)">
              <img src={pngDataUrl(result.baseline.reconstructed_png)} alt="Baseline" className="w-full h-full object-cover" />
            </ImagePane>
            <ImagePane title="SEMANTİK ROI" titleColor="text-emerald-600">
              <div className="relative w-full h-full">
                <img src={pngDataUrl(result.semantic.reconstructed_png)} alt="Semantic ROI" className="w-full h-full object-cover" />
                {/* ROI Visual Feedback Overlay */}
                {hasRoi && result.boxes && result.boxes.length > 0 && (
                  <>
                    {result.boxes.map((box, idx) => {
                      const [x, y, w, h] = box
                      const imgWidth = imageMeta?.width || 1
                      const imgHeight = imageMeta?.height || 1
                      return (
                        <div
                          key={idx}
                          className="pointer-events-none absolute border-2 border-dashed border-emerald-400 shadow-lg"
                          style={{
                            left: `${(x / imgWidth) * 100}%`,
                            top: `${(y / imgHeight) * 100}%`,
                            width: `${(w / imgWidth) * 100}%`,
                            height: `${(h / imgHeight) * 100}%`,
                          }}
                        />
                      )
                    })}
                  </>
                )}
              </div>
            </ImagePane>
          </div>

          {/* Bottom Section: Left Controls + Right Metrics */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
            {/* Left: ROI Selection */}
            <div className="space-y-4">
              <Card title="ROI SEÇİMİ" icon={SquareDashedMousePointer}>
                <div className="space-y-3">
                  <Field label="Mod">
                    <ToggleGroup
                      value={autoFace ? 'auto' : 'manual'}
                      onChange={(v) => setAutoFace(v === 'auto')}
                      options={[
                        { value: 'auto', label: 'Otomatik (YOLO)' },
                        { value: 'manual', label: 'Manuel ROI' },
                      ]}
                    />
                  </Field>

                  {imageMeta ? (
                    <div>
                      <RoiCanvas
                        previewUrl={imageMeta.previewUrl}
                        naturalWidth={imageMeta.width}
                        naturalHeight={imageMeta.height}
                        box={box}
                        onChange={setBox}
                        disabled={autoFace}
                      />
                      <p className="mt-2 text-[10px] text-slate-400">
                        {autoFace ? 'Yüz tespiti otomatik — backend Haar cascade ile yüzleri bulur.' : 'Görüntü üzerinde bir kutu çizerek ROI belirleyin.'}
                      </p>
                    </div>
                  ) : (
                    <EmptyState message="Kenar çubuğundan bir görüntü yükleyin" />
                  )}
                </div>
              </Card>

              <Card title="YENİDEN TESPİT ET">
                <div className="space-y-3">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Field label="Wavelet">
                        <Select value={wavelet} onChange={setWavelet} options={WAVELET_OPTIONS} />
                      </Field>
                    </div>
                    <div className="w-24">
                      <Field label="Level">
                        <Select value={String(level)} onChange={(v) => setLevel(Number(v))} options={LEVEL_OPTIONS} />
                      </Field>
                    </div>
                  </div>

                  <Field label="ROI Step Size (fine)" hint="δ_roi">
                    <RangeSlider value={deltaRoi} min={1} max={30} step={1} onChange={setDeltaRoi} formatValue={(v) => v.toFixed(0)} />
                  </Field>

                  <Field label="Background Step Size (coarse)" hint="δ_bg">
                    <RangeSlider value={deltaBg} min={10} max={150} step={1} onChange={setDeltaBg} formatValue={(v) => v.toFixed(0)} />
                  </Field>

                  <Field label="Background Blur / Smooth" hint="Portrait mode defocus">
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 transition-colors hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={blurBackground}
                        onChange={(e) => setBlurBackground(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700">Arka Planı Pürüzsüzleştir / Bulanıklaştır</span>
                    </label>
                  </Field>

                  <PrimaryButton onClick={run} loading={loading} icon={Play} className="w-full">
                    {autoFace ? '1 nesne tespit edildi' : box ? 'Seçili ROI ile Çalıştır' : 'Manuel ROI Seçin'}
                  </PrimaryButton>
                </div>
              </Card>
            </div>

            {/* Right: Metrics Section */}
            <div className="space-y-4">
              {/* Bit Budget Comparison */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">AYNI BİT BÜTÇESİ</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <p className="text-[10px] text-slate-500">Baseline</p>
                    <p className="mt-1 font-mono text-xl font-bold text-slate-700">{result.baseline.bpp.toFixed(3)} bpp</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-slate-500">Semantic</p>
                    <p className="mt-1 font-mono text-xl font-bold text-slate-700">{result.semantic.bpp.toFixed(3)} bpp</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-slate-500">Fark</p>
                    <p className="mt-1 font-mono text-xl font-bold text-emerald-600">
                      {fmtSigned(result.semantic.bpp - result.baseline.bpp)} bpp
                    </p>
                  </div>
                </div>
                
                {/* Baseline Auto-Calibration Info */}
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <p className="text-center text-[10px] text-slate-500">
                    Baseline Calibrated Step: <span className="font-mono font-semibold text-slate-700">δ = {result.baseline.delta ? result.baseline.delta.toFixed(2) : 'Auto'}</span>
                    <span className="ml-1 text-slate-400">(auto-matched to semantic bpp)</span>
                  </p>
                </div>
              </div>

              {/* Three Metric Cards */}
              <div className="grid grid-cols-3 gap-3">
                <RegionalMetricCard
                  label="SEMANTİK BÖLGE KAZANCI (FOREGROUND)"
                  baseline={hasRoi ? `${fmt(result.baseline.foreground_psnr)} dB` : '—'}
                  semantic={hasRoi ? `${fmt(result.semantic.foreground_psnr)} dB` : '—'}
                  value={hasRoi ? `${fmtSigned(result.summary.delta_foreground_psnr)} dB` : '—'}
                  tone={hasRoi && result.summary.delta_foreground_psnr > 0 ? 'positive' : 'neutral'}
                />
                <RegionalMetricCard
                  label="ARKA PLAN KALİTE KAYBI (BACKGROUND PSNR)"
                  baseline={`${fmt(result.baseline.background_psnr)} dB`}
                  semantic={`${fmt(result.semantic.background_psnr)} dB`}
                  value={`${fmtSigned(result.summary.delta_background_psnr)} dB`}
                  tone={result.summary.delta_background_psnr < 0 ? 'negative' : 'neutral'}
                />
                <RegionalMetricCard
                  label="GLOBAL KALİTE DEĞİŞİMİ (GLOBAL PSNR)"
                  baseline={`${fmt(result.baseline.psnr)} dB`}
                  semantic={`${fmt(result.semantic.psnr)} dB`}
                  value={`${fmtSigned(result.summary.delta_psnr)} dB`}
                  tone={result.summary.delta_psnr >= 0 ? 'positive' : 'negative'}
                />
              </div>

              {/* Detailed Metrics Table */}
              <Card title="Baseline vs Semantic — Detaylı Metrikler">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="py-2 pr-2">Metrik</th>
                      <th className="py-2 pr-2 text-slate-600">Baseline</th>
                      <th className="py-2 pr-2 text-emerald-700">Semantic</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['BPP', result.baseline.bpp.toFixed(3), result.semantic.bpp.toFixed(3)],
                      ['Global PSNR (dB)', fmt(result.baseline.psnr), fmt(result.semantic.psnr)],
                      ['SSIM', result.baseline.ssim.toFixed(4), result.semantic.ssim.toFixed(4)],
                      ['MSE', result.baseline.mse.toFixed(2), result.semantic.mse.toFixed(2)],
                      ['ROI PSNR (dB)', hasRoi ? fmt(result.baseline.foreground_psnr) : '—', hasRoi ? fmt(result.semantic.foreground_psnr) : '—'],
                      ['Background PSNR (dB)', fmt(result.baseline.background_psnr), fmt(result.semantic.background_psnr)],
                    ].map(([label, a, b]) => (
                      <tr key={label} className="border-b border-slate-100 last:border-0">
                        <td className="py-1.5 pr-2 font-medium text-slate-600">{label}</td>
                        <td className="py-1.5 pr-2 font-mono text-slate-700">{a}</td>
                        <td className="py-1.5 pr-2 font-mono text-slate-700">{b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          </div>
        </>
      )}

      {!result && !loading && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          {/* Left: ROI Selection when no result */}
          <div className="space-y-4">
            <Card title="ROI SEÇİMİ" icon={SquareDashedMousePointer}>
              <div className="space-y-3">
                <Field label="Mod">
                  <ToggleGroup
                    value={autoFace ? 'auto' : 'manual'}
                    onChange={(v) => setAutoFace(v === 'auto')}
                    options={[
                      { value: 'auto', label: 'Otomatik (YOLO)' },
                      { value: 'manual', label: 'Manuel ROI' },
                    ]}
                  />
                </Field>

                {imageMeta ? (
                  <div>
                    <RoiCanvas
                      previewUrl={imageMeta.previewUrl}
                      naturalWidth={imageMeta.width}
                      naturalHeight={imageMeta.height}
                      box={box}
                      onChange={setBox}
                      disabled={autoFace}
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-[10px] text-slate-400">
                        {autoFace ? 'Yüz tespiti otomatik — backend Haar cascade ile yüzleri bulur.' : 'Görüntü üzerinde bir kutu çizerek ROI belirleyin.'}
                      </p>
                      {!autoFace && box && (
                        <button
                          onClick={() => setBox(null)}
                          className="text-[10px] font-semibold text-slate-500 hover:text-slate-700 underline"
                        >
                          Temizle
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <EmptyState message="Kenar çubuğundan bir görüntü yükleyin" />
                )}
              </div>
            </Card>

            <Card title="YENİDEN TESPİT ET">
              <div className="space-y-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Field label="Wavelet">
                      <Select value={wavelet} onChange={setWavelet} options={WAVELET_OPTIONS} />
                    </Field>
                  </div>
                  <div className="w-24">
                    <Field label="Level">
                      <Select value={String(level)} onChange={(v) => setLevel(Number(v))} options={LEVEL_OPTIONS} />
                    </Field>
                  </div>
                </div>

                <Field label="ROI Step Size (fine)" hint="δ_roi">
                  <RangeSlider value={deltaRoi} min={1} max={30} step={1} onChange={setDeltaRoi} formatValue={(v) => v.toFixed(0)} />
                </Field>

                <Field label="Background Step Size (coarse)" hint="δ_bg">
                  <RangeSlider value={deltaBg} min={10} max={150} step={1} onChange={setDeltaBg} formatValue={(v) => v.toFixed(0)} />
                </Field>

                <Field label="Background Blur / Smooth" hint="Portrait mode defocus">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 transition-colors hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={blurBackground}
                      onChange={(e) => setBlurBackground(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700">Arka Planı Pürüzsüzleştir / Bulanıklaştır</span>
                  </label>
                </Field>

                <PrimaryButton onClick={run} loading={loading} icon={Play} className="w-full">
                  {autoFace ? 'Semantic ROI Çalıştır' : box ? 'Seçili ROI ile Çalıştır' : 'Manuel ROI Seçin'}
                </PrimaryButton>
              </div>
            </Card>
          </div>

          {/* Right: Empty state */}
          <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-12">
            <EmptyState message="ROI yapılandırın ve semantic sıkıştırmayı çalıştırın" />
          </div>
        </div>
      )}
    </div>
  )
}
