export interface CoaOption {
  id: string
  code: string
  name: string
  is_header?: boolean
  type?: string
}

export interface OutletOption {
  id: string
  name: string
  address: string | null
  timezone: string
}

export interface ItemOption {
  id: string
  name: string
  unit: string
  purchase_unit: string | null
  conversion_factor: number | null
  category: 'raw' | 'wip' | 'packaging' | 'finished'
  is_inventory: boolean
  default_coa_id: string | null
}

export interface VendorOption {
  id: string
  name: string
  email: string | null
  phone: string | null
}

export interface StepProps {
  orgId: string
  accounts: CoaOption[]
  outlets: OutletOption[]
  items: ItemOption[]
  vendors: VendorOption[]
  onItemCreated: (item: ItemOption) => void
  onOutletCreated: (outlet: OutletOption) => void
  onVendorCreated: (vendor: VendorOption) => void
  markDone: () => void
}
