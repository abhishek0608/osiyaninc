<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import QrScanner from 'qr-scanner'

// Camera scanner for the QR code on a piece's tag. It only reads codes and
// hands them up — what a code means (a product URL, a bag number, a SKU) is
// the parent's business, and so is telling the user what happened, which is
// why the result line is a prop rather than state kept here. The typed
// fallback covers rooms with no camera and USB barcode guns, which type the
// code and press Enter like a keyboard.

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
const cameraState = ref<'starting' | 'live' | 'unavailable'>('starting')
const cameraError = ref('')
const manualCode = ref('')

let scanner: QrScanner | null = null
// The decoder fires on every frame while the tag is in view, so one physical
// scan arrives as a burst of identical reads. Repeat the same code only after
// the tag has been out of view for a moment.
let lastCode = ''
let lastCodeAt = 0
const REPEAT_WINDOW_MS = 2500

// Jewellery tags carry a QR code about 7 mm across with almost no quiet zone.
// qr-scanner's default shrinks the centre of the frame to a 400 px canvas
// before decoding, which leaves such a code at ~2 px per module — below what
// the decoder can read. Decode the scan region at the camera's own resolution
// instead; the region stays the centred square staff already see highlighted.
function calculateScanRegion(videoEl: HTMLVideoElement): QrScanner.ScanRegion {
  const size = Math.round((2 / 3) * Math.min(videoEl.videoWidth, videoEl.videoHeight))
  return {
    x: Math.round((videoEl.videoWidth - size) / 2),
    y: Math.round((videoEl.videoHeight - size) / 2),
    width: size,
    height: size,
    downScaledWidth: size,
    downScaledHeight: size,
  }
}

// Phones default to a focus that hunts when a tag is held close. Ask for
// continuous autofocus where the browser supports it; elsewhere this is a no-op.
async function preferCloseFocus(videoEl: HTMLVideoElement) {
  const stream = videoEl.srcObject
  if (!(stream instanceof MediaStream)) return
  const [track] = stream.getVideoTracks()
  if (!track) return
  try {
    const caps = (track.getCapabilities?.() ?? {}) as { focusMode?: string[] }
    if (caps.focusMode?.includes('continuous')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
    }
  } catch {
    // Focus hints are best-effort; the stream keeps working without them.
  }
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

async function startCamera() {
  if (!video.value) return
  cameraState.value = 'starting'
  cameraError.value = ''
  try {
    if (!(await QrScanner.hasCamera())) throw new Error('No camera found on this device.')
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
    await preferCloseFocus(video.value)
    cameraState.value = 'live'
  } catch (e) {
    cameraState.value = 'unavailable'
    const message = e instanceof Error ? e.message : String(e || '')
    cameraError.value = /permission|denied|NotAllowed/i.test(message)
      ? 'Camera access was blocked. Allow the camera for this site, or type the code below.'
      : message || 'The camera could not be started. Type the code below instead.'
    scanner?.destroy()
    scanner = null
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
  scanner?.stop()
  scanner?.destroy()
  scanner = null
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
      Hold the tag close so the QR code fills the highlighted square. Each piece is added as soon as it is read.
    </p>

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
