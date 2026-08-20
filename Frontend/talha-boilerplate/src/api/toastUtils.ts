import { toast, type ToastOptions } from 'react-toastify';
import { ToastConfig } from './toastConfig';
import React from 'react';

export const ToastMsgs = {
    // Basic toasts
    info: (msg: string, conf: ToastOptions = ToastConfig as ToastOptions) => toast.info(msg, conf),
    error: (msg: string, conf: ToastOptions = ToastConfig as ToastOptions) => toast.error(msg, conf),
    warning: (msg: string, conf: ToastOptions = ToastConfig as ToastOptions) => toast.warning(msg, conf),
    success: (msg: string, conf: ToastOptions = ToastConfig as ToastOptions) => toast.success(msg, conf),

    // Custom toast - accepts JSX/ReactNode
    custom: (content: React.ReactNode, conf: ToastOptions = ToastConfig as ToastOptions) =>
        toast(content, conf),

    // Custom with type
    customWithType: (type: 'info' | 'success' | 'error' | 'warning',
        content: React.ReactNode,
        conf: ToastOptions = ToastConfig as ToastOptions) => {
        switch (type) {
            case 'info': return toast.info(content, conf);
            case 'success': return toast.success(content, conf);
            case 'error': return toast.error(content, conf);
            case 'warning': return toast.warning(content, conf);
            default: return toast(content, conf);
        }
    },
};
