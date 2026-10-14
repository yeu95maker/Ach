export const CATEGORIES = ['apartment', 'house', 'land', 'commercial', 'room'] as const
export type Category = (typeof CATEGORIES)[number]

export const FEATURES = [
  'garage', 'garden', 'parking', 'balcony', 'terrace', 'pool', 'electricity', 'water', 'road_access',
  'furnished', 'lift', 'pets_allowed', 'accessible', 'borehole', 'solar', 'backup_power', 'security', 'staff_quarters',
] as const
export type Feature = (typeof FEATURES)[number]

export const TRANSACTIONS = ['sale', 'rent'] as const
export type Transaction = (typeof TRANSACTIONS)[number]

export const CONDITIONS = ['new', 'renovated', 'good', 'needs_renovation'] as const
export type Condition = (typeof CONDITIONS)[number]

export const NEARBY_KINDS = ['school', 'shopping', 'hospital', 'main_road', 'transport', 'other'] as const
export type NearbyKind = (typeof NEARBY_KINDS)[number]

export const PROVIDER_TYPES = ['private_seller', 'owner', 'agent', 'developer', 'company'] as const
export type ProviderType = (typeof PROVIDER_TYPES)[number]

export const REPORT_REASONS = ['scam', 'incorrect_information', 'not_available', 'duplicate', 'suspicious_provider', 'other'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

export type PropertyStatus = 'draft' | 'pending' | 'active' | 'rejected' | 'removed' | 'sold'
export type ProviderStatus = 'unverified' | 'pending' | 'verified' | 'rejected' | 'suspended'
export type LockReason = 'members_only' | 'early_access'

export interface ProviderRef {
  id: string
  name: string
  type: ProviderType
  verified: boolean
  founding?: boolean
}

/** Card shape returned by search_properties / list_favorites. Locked → no title, price, provider. */
export interface PropertyCard {
  id: string
  category: Category
  transaction: Transaction
  /** Monthly extra costs (rentals) */
  additional_costs?: number | null
  available_from?: string | null
  title: string | null
  country: string
  city: string
  area: string
  lat: number
  lng: number
  price: number | null
  currency: string
  land_size_m2: number | null
  living_area_m2: number | null
  bedrooms: number | null
  bathrooms: number | null
  parking_spaces: number | null
  features: Feature[]
  cover_image: string | null
  image_count: number
  is_premium: boolean
  early_access_until: string | null
  locked: boolean
  lock_reason: LockReason | null
  provider: ProviderRef | null
  published_at: string | null
  is_favorite: boolean
}

export interface NearbyPlace {
  kind: NearbyKind
  name: string
  distance_m: number
}

export interface PropertyDetail extends PropertyCard {
  status: PropertyStatus
  street_address: string | null
  deposit: number | null
  floor: number | null
  year_built: number | null
  condition: Condition | null
  description: string | null
  images: string[]
  nearby: NearbyPlace[]
  show_exact_location: boolean
  last_confirmed_at: string | null
  provider: (ProviderRef & { city: string; country: string; member_since: string; active_count: number }) | null
  is_owner: boolean
  conversation_id: string | null
}

export interface SearchResult {
  total: number
  items: PropertyCard[]
}

export interface Account {
  id: string
  full_name: string
  locale: 'en' | 'de'
  is_admin: boolean
  is_suspended: boolean
  is_premium: boolean
  membership: {
    status: 'active' | 'canceled' | 'expired' | 'past_due'
    billing_interval: 'month' | 'year'
    current_period_end: string
    cancel_at_period_end: boolean
    auto_renew: boolean
    payment_provider: string
  } | null
  provider: { id: string; display_name: string; status: ProviderStatus; provider_type: ProviderType; status_note: string | null } | null
  favorites_count: number
  unread_notifications: number
  unread_messages: number
}

export interface ProviderProfile {
  id: string
  name: string
  type: ProviderType
  verified: boolean
  founding: boolean
  city: string
  country: string
  about: string
  logo_path: string | null
  member_since: string
  active_count: number
}

export interface ConversationSummary {
  id: string
  role: 'customer' | 'provider'
  property: { id: string; title: string; price: number; currency: string; transaction: Transaction; area: string; city: string; category: Category; status: PropertyStatus; cover_image: string | null }
  provider: { id: string; name: string; verified: boolean }
  customer_name: string
  last_message: { body: string; created_at: string; mine: boolean } | null
  last_message_at: string
  unread: boolean
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
}

export interface DashboardProperty {
  id: string
  title: string
  category: Category
  transaction: Transaction
  area: string
  city: string
  price: number
  currency: string
  status: PropertyStatus
  moderation_note: string | null
  is_premium: boolean
  early_access_until: string | null
  views: number
  inquiries: number
  favorites: number
  cover_image: string | null
  published_at: string | null
  last_confirmed_at: string | null
  updated_at: string
}

export interface Notification {
  id: string
  kind: string
  title: string
  body: string
  link: string | null
  read_at: string | null
  created_at: string
}

export interface AppSettings {
  currency: string
  premium_price_month: number
  premium_price_year: number
  free_favorites_limit: number
  early_access_hours: number
  demo_billing: boolean
}
