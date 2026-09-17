<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import QrScanner from 'qr-scanner'

// Camera scanner for the QR code on a piece's tag. It only reads codes and
// hands them up — what a code means (a product URL, a bag number, a SKU) is
// the parent's business, and so is telling the user what happened, which is
// why the result line is a prop rather than state kept here. The typed
// fallback covers rooms with no camera and USB barcode guns, which type the
// code and press Enter like a keyboard.
//
// Tag codes are ~7 mm across with almost no quiet zone, which stresses a phone
// camera two ways: the lens cannot focus that close, and at the distance where
// it can, the code covers very few pixels. So this component opens the camera
// itself at the highest resolution the device offers, asks for continuous
// focus, and exposes the camera's zoom so the tag can be held at a focusable
// distance and still fill the scan square. For phones whose browser exposes
// none of that (older iPhones), a photo taken with the native camera app —
// which does switch to its macro lens — is decoded as a still.

export interface ScanFeedback {
  tone: 'ok' | 'error' | 'info'
  text: string
}

const props = defineProps<{
  feedback?: ScanFeedback | null
  /** A lookup is in flight — further reads are held until it settles. */
  busy?: boolean
}>()

const emit = defineEmits<{ scan: [code: string]; close: [] }>()

const video = ref<HTMLVideoElement | null>(null)
const photoInput = ref<HTMLInputElement | null>(null)
const cameraState = ref<'starting' | 'live' | 'unavailable'>('starting')
const cameraError = ref('')
const manualCode = ref('')
const photoState = ref<'idle' | 'reading' | 'failed'>('idle')

// Zoom is only offered when the camera reports it; the range comes from the
// device so the slider never asks for a level the lens cannot give.
const zoom = ref<{ min: number; max: number; step: number; value: number } | null>(null)

let scanner: QrScanner | null = null
let stream: MediaStream | null = null
// The decoder fires on every frame while the tag is in view, so one physical
// scan arrives as a burst of identical reads. Repeat the same code only after
// the tag has been out of view for a moment.
let lastCode = ''
let lastCodeAt = 0
const REPEAT_WINDOW_MS = 2500

// Decode the scan region at (close to) the camera's own resolution. The
// library's default shrinks it to 400 px, which leaves a tag code at ~2 px per
// module — below what the decoder can read. The cap keeps a 4K stream from
// stalling the decode worker on slower phones.
const MAX_DECODE_PX = 1600
function calculateScanRegion(videoEl: HTMLVideoElement): QrScanner.ScanRegion {
  const size = Math.round((2 / 3) * Math.min(videoEl.videoWidth, videoEl.videoHeight))
  const decodeSize = Math.min(size, MAX_DECODE_PX)
  return {
    x: Math.round((videoEl.videoWidth - size) / 2),
    y: Math.round((videoEl.videoHeight - size) / 2),
    width: size,
    height: size,
    downScaledWidth: decodeSize,
    downScaledHeight: decodeSize,
  }
}

type CameraCapabilities = MediaTrackCapabilities & {
  zoom?: { min: number; max: number; step?: number }
  focusMode?: string[]
}

function handleDecoded(result: QrScanner.ScanResult) {
  const code = String(result?.data || '').trim()
  if (!code || props.busy) return
  const now = Date.now()
  if (code === lastCode && now - lastCodeAt < REPEAT_WINDOW_MS) {
    lastCodeAt = now
    return
  }
  lastCode = code
  lastCodeAt = now
  emit('scan', code)
}

// Ask for the sharpest stream the back camera can give. Browsers treat these
// as ideals, so a phone that tops out at 1080p still opens; only the bare
// fallback is tried if the camera refuses the first request outright.
async function openCameraStream(): Promise<MediaStream> {
  const attempts: MediaTrackConstraints[] = [
    { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
    { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    { facingMode: { ideal: 'environment' } },
  ]
  let lastError: unknown = null
  for (const videoConstraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false })
    } catch (e) {
      lastError = e
      // A denied permission will not change between attempts; stop asking.
      if (e instanceof Error && /NotAllowed|Permission/i.test(`${e.name} ${e.message}`)) break
    }
  }
  throw lastError instanceof Error ? lastError : new Error('The camera could not be started.')
}

function videoTrack(): MediaStreamTrack | null {
  return stream?.getVideoTracks()[0] ?? null
}

async function applyCameraHints() {
  const track = videoTrack()
  if (!track) return
  const caps = (track.getCapabilities?.() ?? {}) as CameraCapabilities
  try {
    if (caps.focusMode?.includes('continuous')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
    }
  } catch {
    // Focus hints are best-effort; the stream keeps working without them.
  }
  if (caps.zoom && caps.zoom.max > caps.zoom.min) {
    const { min, max } = caps.zoom
    const step = caps.zoom.step && caps.zoom.step > 0 ? caps.zoom.step : 0.1
    // Start zoomed in a little: a tag at arm's-length focus distance is tiny
    // at 1x, and staff can always slide back out.
    const value = Math.min(max, Math.max(min, min * 2))
    zoom.value = { min, max, step, value }
    await setZoom(value)
  }
}

async function setZoom(value: number) {
  const track = videoTrack()
  if (!track || !zoom.value) return
  const clamped = Math.min(zoom.value.max, Math.max(zoom.value.min, value))
  zoom.value.value = clamped
  try {
    await track.applyConstraints({ advanced: [{ zoom: clamped } as MediaTrackConstraintSet] })
  } catch {
    // Some cameras report zoom but refuse it mid-stream; leave the slider where it is.
  }
}

function onZoomInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (Number.isFinite(value)) void setZoom(value)
}

async function startCamera() {
  if (!video.value) return
  cameraState.value = 'starting'
  cameraError.value = ''
  try {
    if (!(await QrScanner.hasCamera())) throw new Error('No camera found on this device.')
    stream = await openCameraStream()
    // qr-scanner plays whatever stream is already attached rather than
    // opening its own, which is how our resolution and zoom choices survive.
    video.value.srcObject = stream
    scanner = new QrScanner(video.value, handleDecoded, {
      preferredCamera: 'environment',
      calculateScanRegion,
      highlightScanRegion: true,
      highlightCodeOutline: true,
      maxScansPerSecond: 8,
      returnDetailedScanResult: true,
      // Frames with no code in them are the normal case, not an error.
      onDecodeError: () => {},
    })
    await scanner.start()
    await applyCameraHints()
    cameraState.value = 'live'
  } catch (e) {
    cameraState.value = 'unavailable'
    const message = e instanceof Error ? e.message : String(e || '')
    cameraError.value = /permission|denied|NotAllowed/i.test(message)
      ? 'Camera access was blocked. Allow the camera for this site, or type the code below.'
      : message || 'The camera could not be started. Type the code below instead.'
    stopCamera()
  }
}

function stopCamera() {
  scanner?.stop()
  scanner?.destroy()
  scanner = null
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  if (video.value) video.value.srcObject = null
}

// A still from the native camera app: it focuses (and on newer iPhones swaps
// to the macro lens) in ways the in-page stream cannot, so it reads tags the
// live view misses. Try the centre first, then the whole frame.
async function onPhotoPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || props.busy) return
  photoState.value = 'reading'
  try {
    const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true, alsoTryWithoutScanRegion: true })
    photoState.value = 'idle'
    lastCode = ''
    handleDecoded(result)
  } catch {
    photoState.value = 'failed'
  }
}

function submitManual() {
  const code = manualCode.value.trim()
  if (!code || props.busy) return
  manualCode.value = ''
  emit('scan', code)
}

onMounted(() => {
  void startCamera()
})

onBeforeUnmount(() => {
  stopCamera()
})
</script>

<template>
  <div class="ect-rounded-xl ect-border ect-border-sand ect-bg-cream ect-p-3">
    <div class="ect-flex ect-items-center ect-justify-between ect-gap-3">
      <p class="ect-font-body ect-text-xs ect-font-semibold ect-uppercase ect-tracking-[0.12em] ect-text-charcoal/45">
        Scan tag
      </p>
      <button
        type="button"
        class="ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal/55 hover:ect-text-gold-700"
        @click="emit('close')"
      >
        Close scanner
      </button>
    </div>

    <div class="ect-relative ect-mt-2 ect-overflow-hidden ect-rounded-lg ect-bg-charcoal" :class="cameraState === 'unavailable' ? 'ect-hidden' : ''">
      <video ref="video" class="ect-block ect-h-56 ect-w-full ect-object-cover" muted playsinline></video>
      <p
        v-if="cameraState === 'starting'"
        class="ect-absolute ect-inset-0 ect-flex ect-items-center ect-justify-center ect-font-body ect-text-sm ect-text-white/80"
      >
        Starting camera…
      </p>
      <p
        v-else-if="busy"
        class="ect-absolute ect-inset-x-0 ect-bottom-0 ect-bg-charcoal/70 ect-px-3 ect-py-1.5 ect-text-center ect-font-body ect-text-xs ect-text-white/90"
      >
        Looking up…
      </p>
    </div>
    <p v-if="cameraState === 'unavailable'" class="ect-mt-2 ect-font-body ect-text-xs ect-text-amber-700">{{ cameraError }}</p>
    <p v-else-if="cameraState === 'live'" class="ect-mt-2 ect-font-body ect-text-xs ect-text-charcoal/55">
      Hold the tag flat and steady until it is sharp, with the QR code filling the highlighted square. Each piece is added as soon as it is read.
    </p>

    <label v-if="zoom && cameraState === 'live'" class="ect-mt-2 ect-flex ect-items-center ect-gap-2 ect-font-body ect-text-xs ect-text-charcoal/55">
      <span class="ect-shrink-0">Zoom {{ zoom.value.toFixed(1) }}×</span>
      <input
        type="range"
        class="ect-min-w-0 ect-flex-1 ect-accent-gold-500"
        :min="zoom.min"
        :max="zoom.max"
        :step="zoom.step"
        :value="zoom.value"
        aria-label="Camera zoom"
        @input="onZoomInput"
      />
    </label>

    <div class="ect-mt-2 ect-flex ect-items-center ect-gap-2">
      <input
        ref="photoInput"
        type="file"
        accept="image/*"
        capture="environment"
        class="ect-hidden"
        @change="onPhotoPicked"
      />
      <button
        type="button"
        :disabled="busy || photoState === 'reading'"
        class="ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-1.5 ect-font-body ect-text-xs ect-font-semibold ect-text-charcoal hover:ect-border-gold-400 hover:ect-text-gold-700 ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-not-allowed"
        @click="photoInput?.click()"
      >
        {{ photoState === 'reading' ? 'Reading photo…' : 'Take a photo of the tag instead' }}
      </button>
      <span v-if="photoState === 'failed'" class="ect-font-body ect-text-xs ect-text-red-600">No QR code found in that photo. Get closer and keep it sharp.</span>
    </div>

    <form class="ect-mt-2 ect-flex ect-gap-2" @submit.prevent="submitManual">
      <input
        v-model="manualCode"
        type="text"
        autocomplete="off"
        placeholder="Or type / scan-gun a bag no, style no, SKU or slug"
        class="ect-min-w-0 ect-flex-1 ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-text-charcoal placeholder:ect-text-charcoal/35 focus:ect-border-gold-400 focus:ect-outline-none"
        aria-label="Code to look up"
        @keydown.enter.prevent="submitManual"
      />
      <button
        type="submit"
        :disabled="!manualCode.trim() || busy"
        class="ect-shrink-0 ect-rounded-lg ect-border ect-border-charcoal/15 ect-bg-white ect-px-3 ect-py-2 ect-font-body ect-text-sm ect-font-semibold ect-text-charcoal hover:ect-border-gold-400 hover:ect-text-gold-700 ect-transition-colors disabled:ect-opacity-50 disabled:ect-cursor-not-allowed"
      >
        Add
      </button>
    </form>

    <p
      v-if="feedback"
      class="ect-mt-2 ect-font-body ect-text-sm"
      :class="{
        'ect-text-green-700': feedback.tone === 'ok',
        'ect-text-red-600': feedback.tone === 'error',
        'ect-text-charcoal/70': feedback.tone === 'info',
      }"
      role="status"
    >
      {{ feedback.text }}
    </p>
  </div>
</template>
