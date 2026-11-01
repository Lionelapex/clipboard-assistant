import { RestrictionProvider } from './restrictions/RestrictionContext';
import { HomePage } from './pages/HomePage';
import { TestControls } from './components/TestControls';

export function App() {
  return (
    <RestrictionProvider>
      <HomePage />
      <TestControls />
    </RestrictionProvider>
  );
}
