import { appendFileSync } from 'node:fs'
// Scratch benchmark (not committed): main-thread blocking per artifact share save, old vs new.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { it } from 'vitest'
import * as store from './artifact-share-record-store'

const scope = { cloudUserId: 'u', cloudProfileId: 'p', cloudOrganizationId: 'o', apiOrigin: 'https://x' }

const emit = (value: unknown) => appendFileSync(process.env.BENCH_OUT ?? '/tmp/jf-1117/bench-out.jsonl', JSON.stringify({ arm: process.env.BENCH_ARM, ...(value as object) }) + '\n')

it('artifact share save blocking', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'artifact-bench-'))
  const save = store.saveArtifactShareRecord as unknown as (...a: unknown[]) => unknown
  const N = Number(process.env.BENCH_N ?? 200)
  const blocked: number[] = []
  const h = monitorEventLoopDelay({ resolution: 1 })
  h.enable()
  const t0 = performance.now()
  for (let i = 0; i < N; i++) {
    const record = { ...scope, slug: `s${i}`, editToken: `t${i}`, shareUrl: `https://x/a/s${i}`, expiresAt: '2099-01-01T00:00:00.000Z' }
    const start = performance.now()
    const result = save('bench', dir, `/repo/f${i % 500}.html`, record, () => {})
    blocked.push(performance.now() - start)
    await result
  }
  const total = performance.now() - t0
  h.disable()
  blocked.sort((a, b) => a - b)
  const q = (p: number) => blocked[Math.min(blocked.length - 1, Math.floor(p * blocked.length))].toFixed(3)
  emit(({ N, syncBlockedMs: { p50: q(0.5), p95: q(0.95), max: q(0.999), sum: blocked.reduce((a, b) => a + b, 0).toFixed(1) }, wallMs: total.toFixed(1), loopDelayMaxMs: (h.max / 1e6).toFixed(2), loopDelayP99Ms: (h.percentile(99) / 1e6).toFixed(2) }))
  await rm(dir, { recursive: true, force: true })
})
