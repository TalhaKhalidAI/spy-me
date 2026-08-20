import { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { routeSlice } from './routes';

export default function ProtectedRoute() {
  return (
    <Suspense fallback={<div>Loading page</div>}>
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
