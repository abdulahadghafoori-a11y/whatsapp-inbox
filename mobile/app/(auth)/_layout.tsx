import { Slot } from 'expo-router'

/** Single login screen — no nested stack (avoids double-navigator issues). */
export default function AuthLayout() {
  return <Slot />
}
