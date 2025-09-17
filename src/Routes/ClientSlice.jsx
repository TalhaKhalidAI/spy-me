import React,{Suspense} from 'react';
import { ClientPages } from './index';
import { Route, Routes } from 'react-router-dom';

const ClientSlice = () => {
  return (
   <Suspense fallback={<div>Loading...</div>}>
     <Routes>
      {ClientPages.map((v, i) => (
        <Route key={i} path={v.path} element={<v.element/>} />
      ))}
    </Routes>
   </Suspense>
  );
};

export default ClientSlice;
