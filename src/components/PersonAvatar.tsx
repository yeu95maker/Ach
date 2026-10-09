import { useQuery } from '@tanstack/react-query'
import { profileRepository } from '@/data/profileRepository'
import { queryKeys } from '@/features/queryKeys'
import { Avatar } from '@/ui'

type Props = {
  person: { firstName: string; lastName: string; avatarPath: string | null }
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  ring?: boolean
}

/** Avatar that resolves a private storage path into a cached signed URL. */
export function PersonAvatar({ person, size, className, ring }: Props) {
  const path = person.avatarPath
  const { data } = useQuery({
    queryKey: queryKeys.avatar(path ?? ''),
    queryFn: async () => (await profileRepository.avatarUrls([path!]))[path!] ?? null,
    enabled: !!path,
    staleTime: 50 * 60_000,
  })
  return <Avatar src={data} firstName={person.firstName} lastName={person.lastName} size={size} className={className} ring={ring} />
}
