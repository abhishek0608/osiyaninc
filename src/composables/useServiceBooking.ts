import { ref, shallowRef } from 'vue'
import { getServiceOfferingById, type ServiceOffering } from '../data/services-catalog'

const bookingOpen = ref(false)
const bookingService = shallowRef<ServiceOffering | null>(null)

export function useServiceBooking() {
  function openBookingByServiceId(serviceId: string) {
    const svc = getServiceOfferingById(serviceId)
    if (!svc) return
    bookingService.value = svc
    bookingOpen.value = true
  }

  function openBookingForService(service: ServiceOffering) {
    bookingService.value = service
    bookingOpen.value = true
  }

  function closeBooking() {
    bookingOpen.value = false
    bookingService.value = null
  }

  return {
    bookingOpen,
    bookingService,
    openBookingByServiceId,
    openBookingForService,
    closeBooking,
  }
}
