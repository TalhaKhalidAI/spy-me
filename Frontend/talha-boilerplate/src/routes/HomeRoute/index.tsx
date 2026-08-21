import { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { routeSlice } from './routes';
import { PageSkeleton } from '../../components/Skeletons';

export default function HomeRoute() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        {routeSlice.map((v, i) => (
          <Route
            key={i}
            path={v.path}
            element={<v.component />}
          />
        ))}
      </Routes>
    </Suspense>
  );
}
