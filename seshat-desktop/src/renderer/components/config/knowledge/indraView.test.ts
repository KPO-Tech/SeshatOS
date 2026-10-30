import { describe, expect, it } from 'vitest'
import { indraPhase, indraPill, indraSizeText, indraStepText, INDRA_LICENSE_POINTS } from './indraView'
import type { IndraInstallState, IndraStatus } from './knowledgeTypes'

const fresh: IndraStatus = {
  license_accepted: false,
  license_version: 'v1',
  license_url: 'https://huggingface.co/datalab-to/indra-ocr/blob/main/LICENSE',
  project_url: 'https://github.com/datalab-to/indra',
  installed: false,
  enabled: false,
  ready: false,
  version: '1.1.2',
  size_mb: 350,
  python_found: true,
  dir: ''
}
const idle: IndraInstallState = { status: 'idle' }
const installed: IndraStatus = { ...fresh, installed: true, license_accepted: true, enabled: true, ready: true }

describe('indraPhase', () => {
  it('offers the installation when Python is there, and says what is missing when it is not', () => {
    expect(indraPhase(fresh, idle)).toBe('available')
    expect(indraPhase({ ...fresh, python_found: false }, idle)).toBe('no-python')
  })

  it('shows the progress while installing, and the failure once it has failed, with the install still possible', () => {
    expect(indraPhase(fresh, { status: 'running' })).toBe('installing')
    expect(indraPhase(fresh, { status: 'failed', error: 'pip failed' })).toBe('failed')
  })

  it('tells installed from switched off, and asks again when the licence text changed', () => {
    expect(indraPhase(installed, idle)).toBe('on')
    expect(indraPhase({ ...installed, enabled: false, ready: false }, idle)).toBe('off')
    expect(indraPhase({ ...installed, license_accepted: false, enabled: false, ready: false }, idle)).toBe('relicense')
  })

  it('does not report a finished installation as running', () => {
    expect(indraPhase(installed, { status: 'completed' })).toBe('on')
  })
})

describe('Indra texts', () => {
  it('labels each phase with a pill', () => {
    expect(indraPill('on')).toEqual({ tone: 'ok', label: 'On' })
    expect(indraPill('available').label).toBe('Not installed')
    expect(indraPill('relicense').tone).toBe('warn')
  })

  it('numbers the installation steps', () => {
    expect(indraStepText({ status: 'running', step: 'Creating the environment', step_index: 2, step_count: 4 })).toBe('Step 2 of 4 · Creating the environment')
    expect(indraStepText({ status: 'running' })).toBe('Starting')
    expect(indraStepText(idle)).toBe('')
  })

  it('states the weight and the Python requirement before the install', () => {
    expect(indraSizeText(fresh)).toContain('350 MB')
    expect(indraSizeText(fresh)).toContain('Python 3.10')
  })

  it('keeps the points of the licence that decide who may use the weights', () => {
    const text = INDRA_LICENSE_POINTS.join(' ')
    expect(text).toContain('$20 million')
    expect(text).toContain('competing')
    expect(text).toContain('commercial licence')
  })
})
