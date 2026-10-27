import { describe, expect, it } from 'vitest'
import { orderedModels } from './NativeModelsPanel'

const model = (file: string) => ({ file, installed: true, size_bytes: 1, required: true })

describe('orderedModels', () => {
  it('lists the models in the order they work on a page', () => {
    const files = orderedModels(['det.ort', 'rec.ort', 'layout.ort', 'tsr.ort', 'ocr.res'].map(model)).map((m) => m.file)
    expect(files).toEqual(['layout.ort', 'det.ort', 'rec.ort', 'ocr.res', 'tsr.ort'])
  })

  it('puts a model it does not know last', () => {
    const files = orderedModels(['new.ort', 'det.ort'].map(model)).map((m) => m.file)
    expect(files).toEqual(['det.ort', 'new.ort'])
  })
})
