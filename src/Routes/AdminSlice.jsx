import React,{Suspense} from 'react';
import { slicePage } from './index';
import { Route, Routes } from 'react-router-dom';

const AdminSlice = () => {
  return (
   <Suspense fallback={<div>Loading...</div>}>
     <Routes>
      {slicePage.map((v, i) => (
        <Route key={i} path={v.path} element={<v.element/>} />
      ))}
    </Routes>
   </Suspense>
  );
};

export default AdminSlice;
