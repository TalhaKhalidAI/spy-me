import { ToastContainer, type ToastContainerProps } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ToastConfig } from './toastConfig';

export const MyToastContainer = (props: Partial<ToastContainerProps> = {}) => {
  const mergedConfig = {
    ...ToastConfig,
    ...props,
  } as ToastContainerProps;
  return <ToastContainer {...mergedConfig} />;
};
