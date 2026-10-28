import { useMemo, useState } from 'react'
import { Play, Layers, Image as ImageIcon, ScissorsLineDashed } from 'lucide-react'
import { useApp, SUPPORTED_WAVELETS } from '../../context/AppContext'
import { getSubbandTree, zeroOutSubbands, pngDataUrl, apiErrorMessage } from '../../api/client'
import { Card, Field, Select, PrimaryButton, ErrorBanner, EmptyState, StatPill } from '../ui/Primitives'
import { fmt } from '../../utils/format'

const WAVELET_OPTIONS = SUPPORTED_WAVELETS.map((w) => ({ value: w, label: w }))
const LEVEL_OPTIONS = [1, 2, 3].map((l) => ({ value: String(l), label: `Level ${l}` }))

function subbandNames(level) {
  const names = [`LL${level}`]
  for (let d = level; d >= 1; d--) names.push(`LH${d}`, `HL${d}`, `HH${d}`)
  return names
}

function SubbandBadge({ label, type }) {
  const styles = {
    LL: 'bg-blue-500 text-white border-blue-600',
    LH: 'bg-teal-500 text-white border-teal-600',
    HL: 'bg-amber-500 text-white border-amber-600',
    HH: 'bg-purple-500 text-white border-purple-600',
  }
  const style = styles[type] || styles.LL
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-[10px] font-bold ${style}`}>
      {label}
    </span>
  )
}

// Hierarchical tree view with proper Mallat recursive decomposition
function HierarchicalTree({ level, imageWidth, imageHeight, wavelet }) {
  // Recursive function to render each DWT level
  const renderDWTLevel = (currentLevel, maxLevel, parentSize) => {
    if (currentLevel > maxLevel) return null
    
    const size = Math.floor(parentSize / 2)
    const levelNumber = maxLevel - currentLevel + 1
    const isFirstLevel = currentLevel === 1
    
    return (
      <div className="space-y-1">
        {/* Level header */}
        <div className="flex items-center gap-2 py-1">
          <span className="text-indigo-600 font-semibold">
            {isFirstLevel ? '└──' : '    └──'} DWT Level {levelNumber} ({wavelet})
          </span>
        </div>
        
        {/* Subbands with border connector */}
        <div className="border-l-2 border-indigo-400/60 ml-3 pl-3 space-y-1">
          {/* LL - Approximation (will recurse if not at max level) */}
          <div className="flex items-center gap-2 py-0.5">
            <span className="text-slate-400">├──</span>
            <SubbandBadge label={`LL${levelNumber}`} type="LL" />
            <span className="text-slate-500">Approximation {size}×{size}</span>
          </div>
          
          {/* Recursive decomposition of LL */}
          {currentLevel < maxLevel && (
            <div className="ml-4">
              {renderDWTLevel(currentLevel + 1, maxLevel, size)}
            </div>
          )}
          
          {/* LH - Horizontal Detail */}
          <div className="flex items-center gap-2 py-0.5">
            <span className="text-slate-400">├──</span>
            <SubbandBadge label={`LH${levelNumber}`} type="LH" />
            <span className="text-slate-500">Horizontal Detail {size}×{size}</span>
          </div>
          
          {/* HL - Vertical Detail */}
          <div className="flex items-center gap-2 py-0.5">
            <span className="text-slate-400">├──</span>
            <SubbandBadge label={`HL${levelNumber}`} type="HL" />
            <span className="text-slate-500">Vertical Detail {size}×{size}</span>
          </div>
          
          {/* HH - Diagonal Detail */}
          <div className="flex items-center gap-2 py-0.5">
            <span className="text-slate-400">└──</span>
            <SubbandBadge label={`HH${levelNumber}`} type="HH" />
            <span className="text-slate-500">Diagonal Detail {size}×{size}</span>
          </div>
        </div>
      </div>
    )
  }
  
  return (
    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 overflow-x-auto">
      <div className="space-y-1 font-mono text-xs">
        {/* Root */}
        <div className="flex items-center gap-2 text-slate-700 mb-2">
          <ImageIcon size={16} className="text-slate-400" />
          <span className="font-semibold text-sm">Image Root ({imageWidth}×{imageHeight} px)</span>
        </div>
        
        {/* Recursive DWT levels */}
        <div className="border-l-2 border-slate-300 ml-2 pl-3">
          {renderDWTLevel(1, level, imageWidth)}
        </div>
      </div>
    </div>
  )
}

// Enhanced 2D canvas with overlays - strict square, no letterbox bars
function EnhancedSubbandCanvas({ canvasUrl, stats, level }) {
  if (!canvasUrl) return <EmptyState message="Click Compute Tree to render the canvas" />
  
  const statsEntries = Object.entries(stats || {})
  
  // Calculate badge positions based on the recursive quad-tree layout
  // The canvas is built recursively: [LL, LH; HL, HH] at each level
  // Level 1 occupies the full 512x512
  // Level 2 occupies the top-left quadrant (256x256)
  // Level 3 occupies the top-left of Level 2 (128x128)
  
  const getBadgePosition = (name) => {
    const match = name.match(/^(LL|LH|HL|HH)(\d+)$/)
    if (!match) return { top: '2%', left: '2%' }
    
    const [, type, levelStr] = match
    const subbandLevel = parseInt(levelStr, 10)
    
    // Calculate the scale factor: each level deeper halves the size
    // Level 1: 50% of canvas (256/512)
    // Level 2: 25% of canvas (128/512)
    // Level 3: 12.5% of canvas (64/512)
    const scale = 50 / Math.pow(2, level - subbandLevel)
    
    // Base positions for each subband type within its quadrant
    let top = 0
    let left = 0
    
    // For levels deeper than 1, they're nested in the top-left
    if (subbandLevel === level) {
      // Deepest level (LL3, LH3, HL3, HH3 for level=3)
      const offset = 1 // Small offset from edge
      if (type === 'LL') {
        top = offset
        left = offset
      } else if (type === 'LH') {
        top = offset
        left = scale + offset
      } else if (type === 'HL') {
        top = scale + offset
        left = offset
      } else if (type === 'HH') {
        top = scale + offset
        left = scale + offset
      }
    } else if (subbandLevel < level) {
      // Middle levels (e.g., Level 2 when max is 3, or Level 1 when max is 2/3)
      // These are in the top-left region, but at their respective scale
      const levelDiff = level - subbandLevel
      const baseOffset = scale * Math.pow(2, levelDiff - 1)
      const offset = 1
      
      if (type === 'LL') {
        // LL is recursively nested, so it's at the top-left of its region
        top = offset
        left = offset
      } else if (type === 'LH') {
        top = offset
        left = baseOffset + offset
      } else if (type === 'HL') {
        top = baseOffset + offset
        left = offset
      } else if (type === 'HH') {
        top = baseOffset + offset
        left = baseOffset + offset
      }
    }
    
    return { top: `${top}%`, left: `${left}%` }
  }
  
  return (
    <div className="w-full max-w-[512px] aspect-square mx-auto relative rounded-lg overflow-hidden border border-slate-700 bg-slate-900">
      <img 
        src={canvasUrl} 
        alt="Subband Canvas"
        className="w-full h-full object-cover block"
      />
      
      {/* Overlay badges and statistics */}
      {statsEntries.map(([name, stat]) => {
        const position = getBadgePosition(name)
        const type = name.replace(/\d+/, '')
        
        return (
          <div 
            key={name}
            className="absolute pointer-events-none"
            style={position}
          >
            <SubbandBadge label={name} type={type} />
            <div className="mt-1 text-[9px] text-white bg-black/60 px-1 rounded">
              Std Dev: {stat.std.toFixed(2)}
            </div>
          </div>
        )
      })}
      
      {/* Dimension indicators for main quadrants */}
      <div className="absolute top-2 right-2 text-white text-xs bg-black/60 px-2 py-1 rounded">
        Level {level}
      </div>
    </div>
  )
}

function SubbandStats({ stats }) {
  const entries = Object.entries(stats)
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {entries.map(([name, s]) => {
        const type = name.replace(/\d+/, '')
        const isApprox = name.startsWith('LL')
        return (
          <div
            key={name}
            className={`rounded-lg border p-2 text-[11px] ${
              isApprox ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className="mb-1 flex items-center gap-1">
              <SubbandBadge label={name} type={type} />
            </div>
            <div className="grid grid-cols-2 gap-x-2 text-slate-500">
              <span>mean {s.mean.toFixed(2)}</span>
              <span>std {s.std.toFixed(2)}</span>
              <span>min {s.min.toFixed(2)}</span>
              <span>max {s.max.toFixed(2)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function SubbandTreeCanvas() {
  const { file, imageMeta, wavelet, setWavelet, level, setLevel } = useApp()
  const bands = useMemo(() => subbandNames(level), [level])
  const [activeBands, setActiveBands] = useState(() => new Set(bands))

  const [treeLoading, setTreeLoading] = useState(false)
  const [treeError, setTreeError] = useState('')
  const [treeResult, setTreeResult] = useState(null)

  const [zeroLoading, setZeroLoading] = useState(false)
  const [zeroError, setZeroError] = useState('')
  const [zeroResult, setZeroResult] = useState(null)

  function handleLevelChange(nextLevel) {
    setLevel(nextLevel)
    setActiveBands(new Set(subbandNames(nextLevel)))
    setZeroResult(null)
  }

  function handleWaveletChange(nextWavelet) {
    setWavelet(nextWavelet)
    setZeroResult(null)
  }

  function toggleBand(name) {
    setActiveBands((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  async function decompose() {
    if (!file) {
      setTreeError('Upload an image in the sidebar first.')
      return
    }
    setTreeLoading(true)
    setTreeError('')
    try {
      const data = await getSubbandTree(file, { wavelet, level })
      setTreeResult(data)
    } catch (err) {
      setTreeError(apiErrorMessage(err))
    } finally {
      setTreeLoading(false)
    }
  }

  async function zeroOutAndReconstruct() {
    if (!file) {
      setZeroError('Upload an image in the sidebar first.')
      return
    }
    const inactiveSubbands = bands.filter((b) => !activeBands.has(b))
    setZeroLoading(true)
    setZeroError('')
    try {
      const data = await zeroOutSubbands(file, { wavelet, level, inactiveSubbands })
      setZeroResult(data)
    } catch (err) {
      setZeroError(apiErrorMessage(err))
    } finally {
      setZeroLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4">
        <h2 className="text-xl font-bold text-slate-800">DWT LAB</h2>
        <p className="mt-1 text-sm text-slate-500">
          Mathematical hierarchy, 2D coefficient subband breakdown, and a subband knock-out experiment for multi-resolution wavelet analysis.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 border border-blue-200">
          <span className="text-sm font-semibold text-blue-700">Wavelet: {wavelet}</span>
          <span className="text-sm text-blue-600">• Level {level}</span>
        </div>
        <div className="flex items-end gap-2">
          <div className="w-32">
            <Field label="Wavelet">
              <Select value={wavelet} onChange={handleWaveletChange} options={WAVELET_OPTIONS} />
            </Field>
          </div>
          <div className="w-28">
            <Field label="Level">
              <Select value={String(level)} onChange={(v) => handleLevelChange(Number(v))} options={LEVEL_OPTIONS} />
            </Field>
          </div>
          <PrimaryButton onClick={decompose} loading={treeLoading} icon={Play}>
            Compute Tree
          </PrimaryButton>
        </div>
      </div>

      <ErrorBanner message={treeError} />

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[400px_1fr]">
        {/* Left Column: Hierarchical Tree */}
        <Card 
          title="Subband Tree Hierarchy" 
          subtitle="RECURSIVE MALLAT BRANCHING"
          icon={Layers}
        >
          {treeResult && imageMeta ? (
            <HierarchicalTree 
              level={treeResult.level} 
              imageWidth={imageMeta.width}
              imageHeight={imageMeta.height}
              wavelet={treeResult.wavelet}
            />
          ) : (
            <EmptyState message="Click Compute Tree to build the hierarchy" />
          )}
        </Card>

        {/* Right Column: 2D Canvas */}
        <Card 
          title="2D Coefficient Subband Canvas" 
          subtitle="SUBBAND IMAGES & STATISTICS"
          icon={ImageIcon}
        >
          {treeResult ? (
            <EnhancedSubbandCanvas 
              canvasUrl={pngDataUrl(treeResult.canvas_png)}
              stats={treeResult.stats}
              level={treeResult.level}
            />
          ) : (
            <EmptyState message="Click Compute Tree to render the canvas" />
          )}
        </Card>
      </div>

      {/* Subband Statistics */}
      {treeResult && (
        <Card title="Subband Statistics" icon={Layers}>
          <SubbandStats stats={treeResult.stats} />
        </Card>
      )}

      {/* Zero-Out Controls */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Subband Zero-Out Lab" icon={ScissorsLineDashed}>
          <div className="flex flex-wrap gap-2">
            {bands.map((name) => {
              const active = activeBands.has(name)
              const type = name.replace(/\d+/, '')
              return (
                <label
                  key={name}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-400 line-through'
                  }`}
                >
                  <input type="checkbox" checked={active} onChange={() => toggleBand(name)} className="accent-blue-600" />
                  <SubbandBadge label={name} type={type} />
                </label>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Unchecked subbands are zeroed out before reconstruction.</p>
          <ErrorBanner message={zeroError} />
          <PrimaryButton onClick={zeroOutAndReconstruct} loading={zeroLoading} icon={Play} className="mt-3 w-full">
            Zero-Out &amp; Reconstruct
          </PrimaryButton>
        </Card>

        <Card title="Reconstructed Image">
          {!zeroResult ? (
            <EmptyState message="Toggle subbands and click Zero-Out & Reconstruct." />
          ) : (
            <>
              <img
                src={pngDataUrl(zeroResult.reconstructed_png)}
                alt="Reconstructed"
                className="w-full rounded-lg border border-slate-200 bg-black object-contain"
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <StatPill label="MSE" value={zeroResult.mse.toFixed(2)} />
                <StatPill label="PSNR" value={`${fmt(zeroResult.psnr)} dB`} />
              </div>
              <div className="mt-2 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-500">
                <span className="font-medium text-slate-600">Zeroed: </span>
                {zeroResult.zeroed_subbands.length ? zeroResult.zeroed_subbands.join(', ') : 'none'}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
