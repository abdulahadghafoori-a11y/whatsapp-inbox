import { Component, type ReactNode } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { captureError } from '@/lib/errorReporting'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches render-time crashes anywhere in the tree so a single thrown error
 * shows a recoverable fallback instead of a permanent white screen, and reports
 * it to Sentry. Resetting re-mounts the subtree without a full app restart.
 */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    captureError(error, { componentStack: info.componentStack ?? undefined })
  }

  private reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.subtitle}>
          The app hit an unexpected error. You can try again without restarting.
        </Text>
        <Pressable style={styles.button} onPress={this.reset} accessibilityRole="button">
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    )
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#0B141A',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#8696A0',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#00A884',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
})
