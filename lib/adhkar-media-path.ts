export function isLocalAdhkarMediaPath(path: string): boolean {
  return /^\/audio\/adhkar\/[a-z0-9-]+\/(?:\d{3}\/\d{3}(?:-\d{3}(?:-(?:morning|evening))?)?|sections\/\d{3})\.mp3$/.test(path)
}
