export interface WorkflowStep {
  label: string
  desc: string
}

export interface ServiceOffering {
  id: string
  no: string
  title: string
  subtitle: string
  desc: string
  duration: string
  steps: WorkflowStep[]
}

export const SERVICE_OFFERINGS: ServiceOffering[] = [
  {
    id: 'cad',
    no: '01',
    title: 'CAD',
    subtitle: 'Computer-Aided Design',
    desc: 'Every extraordinary piece begins as an idea. Our expert CAD designers transform your vision into a precise digital blueprint — with exact dimensions, stone placements, and metal profiles — before a single gram of gold is touched.',
    duration: '3–5 days',
    steps: [
      {
        label: 'Consultation',
        desc: 'Share your inspiration — a sketch, reference image, or a simple description of your dream piece.',
      },
      {
        label: 'Concept Sketch',
        desc: 'Our designers create a hand-drawn concept for your initial approval and feedback.',
      },
      {
        label: '3D CAD Modelling',
        desc: 'The approved concept is converted into a fully detailed 3D digital model with precise measurements.',
      },
      {
        label: 'Client Review',
        desc: 'You receive photorealistic renders from multiple angles and request any adjustments.',
      },
      {
        label: 'Final Approval',
        desc: 'CAD file is locked and handed to the wax team for prototyping.',
      },
    ],
  },
  {
    id: 'wax',
    no: '02',
    title: 'WAX',
    subtitle: 'Wax Prototyping',
    desc: 'Before any precious metal is poured, we craft a physical wax model — your chance to hold and feel the exact proportions and weight of the piece before it permanently comes to life in gold or silver.',
    duration: '2–3 days',
    steps: [
      {
        label: 'Receive CAD File',
        desc: 'The approved digital design is loaded into our precision 3D wax printer.',
      },
      {
        label: '3D Print / Hand Carve',
        desc: 'High-resolution wax model is printed or hand-carved by our master artisans, capturing every fine detail.',
      },
      {
        label: 'Physical Review',
        desc: 'The wax model is sent to the client to assess fit, proportion, and feel.',
      },
      {
        label: 'Refinements',
        desc: 'Any adjustments are made directly to the wax before proceeding to casting.',
      },
      {
        label: 'Cast-Ready Sign-Off',
        desc: 'Final wax model is approved and dispatched to the casting floor.',
      },
    ],
  },
  {
    id: 'casting',
    no: '03',
    title: 'Casting',
    subtitle: 'Lost-Wax Metal Casting',
    desc: 'Using the centuries-old lost-wax casting method, the approved wax model is invested in plaster, the wax is burned away, and molten precious metal floods every detail of the cavity — emerging as your raw jewellery.',
    duration: '1–2 days',
    steps: [
      {
        label: 'Wax Tree Assembly',
        desc: 'Multiple wax models are attached to a central sprue rod to form a "tree" for batch casting.',
      },
      {
        label: 'Investment Mould',
        desc: 'The wax tree is encased in a special plaster investment and left to fully cure.',
      },
      {
        label: 'Burnout',
        desc: 'The mould is kiln-fired at high temperature to vaporise the wax, leaving a perfect hollow cavity.',
      },
      {
        label: 'Metal Pour',
        desc: 'Molten gold or silver is injected under centrifugal force, filling every precise detail.',
      },
      {
        label: 'Breakout & Cleaning',
        desc: 'Mould is broken open, raw castings are cut from the tree, and excess metal is removed.',
      },
    ],
  },
  {
    id: 'final',
    no: '04',
    title: 'Final Product',
    subtitle: 'Finishing & Delivery',
    desc: 'The raw casting undergoes hours of skilled hand-finishing — filing, stone-setting by expert karigars, polishing, rigorous quality inspection, BIS hallmarking — before being packaged and delivered to you.',
    duration: '2–4 days',
    steps: [
      {
        label: 'Filing & Cleaning',
        desc: 'Raw casting is filed, sanded, and precision-cleaned to remove casting marks and surface imperfections.',
      },
      {
        label: 'Stone Setting',
        desc: 'Diamonds and gemstones are set by hand by our specialist setters with exactness and care.',
      },
      {
        label: 'Polishing',
        desc: 'High-mirror polish or bespoke satin finish is applied to exact specification.',
      },
      {
        label: 'Quality Inspection',
        desc: 'Each piece is checked against the original CAD specification — weight, dimensions, and finish.',
      },
      {
        label: 'Hallmarking & Dispatch',
        desc: 'BIS hallmark applied, certificate of authenticity issued, and piece packaged in Kiana luxury box.',
      },
    ],
  },
]

export function getServiceOfferingById(id: string): ServiceOffering | null {
  const mapped = id === 'full-pipeline' ? 'cad' : id
  return SERVICE_OFFERINGS.find((s) => s.id === mapped) ?? null
}
