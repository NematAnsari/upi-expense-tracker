import { Component } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../constants/theme';
import { ErrorState } from './States';

// If the database cannot be opened or migrated, show a message instead of a
// blank or crashed screen. Error boundaries must be class components in React.
export class DatabaseErrorBoundary extends Component {
  state = { error: null, attempt: 0 };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('Database error', error);
  }

  retry = () => {
    // Changing the key remounts the children, which reopens the database.
    this.setState((state) => ({ error: null, attempt: state.attempt + 1 }));
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <ErrorState
            message="Your expenses could not be opened. Your saved data has not been deleted. Try again, or restart the app."
            onRetry={this.retry}
          />
        </View>
      );
    }
    return (
      <View key={this.state.attempt} style={styles.container}>
        {this.props.children}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', backgroundColor: colors.background },
});
