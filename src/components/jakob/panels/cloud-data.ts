import cloudJson from './cloud-data.json'

export type CloudGame = {
  name: string
  game_key: string
  description: string
  image: string
  cover: string
  tags: string[]
}

export const CLOUD_GAMES: CloudGame[] = cloudJson as CloudGame[]
