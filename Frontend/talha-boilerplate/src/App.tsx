import './App.css'
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import { lazy, Suspense } from 'react';
import { PageSkeleton } from './components/Skeletons';
import "./index.css"
const HomeRoutesSlicer = lazy(() => import('./routes/HomeRoute/index'))

function App() {
  return (
    <>
      <Suspense fallback={<PageSkeleton />}>
        <HomeRoutesSlicer />
      </Suspense>
    </>
  )
}

export default App;
