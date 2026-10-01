// Records raw PCM from a MediaStream and encodes it as a 16-bit mono WAV
// blob on stop. whisper.cpp's server has no built-in audio decoder for
// compressed formats (its --convert flag needs a bundled ffmpeg we don't
// want to ship just for this) - WAV is the one format that works for both
// local whisper-server and OpenAI's cloud Whisper API without conversion,
// so recording is done this way instead of via MediaRecorder (which only
// produces webm/opus).

const TARGET_SAMPLE_RATE = 16000

export type WavRecording = {
  stop: () => Promise<Blob>
}

export function startWavRecording(stream: MediaStream): WavRecording {
  const audioContext = new AudioContext()
  const source = audioContext.createMediaStreamSource(stream)
  const processor = audioContext.createScriptProcessor(4096, 1, 1)
  const chunks: Float32Array[] = []

  processor.onaudioprocess = (e) => {
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
  }
  source.connect(processor)
  processor.connect(audioContext.destination)

  return {
    stop: () =>
      new Promise((resolve) => {
        processor.disconnect()
        source.disconnect()
        const inputSampleRate = audioContext.sampleRate
        void audioContext.close()
        resolve(encodeWav(chunks, inputSampleRate, TARGET_SAMPLE_RATE))
      }),
  }
}

function encodeWav(chunks: Float32Array[], inputSampleRate: number, targetSampleRate: number): Blob {
  const merged = mergeFloat32(chunks)
  const resampled = resampleLinear(merged, inputSampleRate, targetSampleRate)
  const pcm = floatTo16BitPCM(resampled)
  return buildWavBlob(pcm, targetSampleRate)
}

function mergeFloat32(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0)
  const merged = new Float32Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return merged
}

function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) return input
  const ratio = fromRate / toRate
  const outLength = Math.round(input.length / ratio)
  const output = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio
    const srcIndex = Math.floor(srcPos)
    const frac = srcPos - srcIndex
    const a = input[srcIndex] ?? 0
    const b = input[srcIndex + 1] ?? a
    output[i] = a + (b - a) * frac
  }
  return output
}

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return output
}

function buildWavBlob(pcm: Int16Array, sampleRate: number): Blob {
  const bytesPerSample = 2
  const blockAlign = bytesPerSample // mono
  const byteRate = sampleRate * blockAlign
  const dataSize = pcm.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // format = PCM
  view.setUint16(22, 1, true) // channels = mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true) // bits per sample
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < pcm.length; i++, offset += 2) {
    view.setInt16(offset, pcm[i], true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}
