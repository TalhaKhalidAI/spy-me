// src/api/http/errorHandler.ts

// ✅ Define error messages by status code
export const ERROR_MESSAGES: Record<number, string> = {
    400: 'Bad request. Please check your input.',
    401: 'Session expired. Please login again.',
    403: 'You don\'t have permission to perform this action.',
    404: 'Resource not found.',
    405: 'Method not allowed.',
    409: 'Conflict. The resource already exists.',
    422: 'Validation error. Please check your input.',
    429: 'Too many requests. Please try again later.',
    500: 'Server error. Please try again later.',
    502: 'Bad gateway. Please try again.',
    503: 'Service unavailable. Please try again later.',
    504: 'Gateway timeout. Please try again.',
};

// ✅ Extract human-readable error message from any error format
export const extractErrorMessage = (data: any): string => {
    // If data is a string, return it
    if (typeof data === 'string') return data;
    
    // If data is null/undefined
    if (!data) return 'An unknown error occurred';
    
    // ✅ Handle FastAPI 422 validation errors: { detail: [{ msg, loc, ... }] }
    if (data.detail && Array.isArray(data.detail) && data.detail.length > 0) {
        const firstError = data.detail[0];
        // Return the first error message
        if (firstError.msg) return firstError.msg;
        if (firstError.message) return firstError.message;
        // If no msg, stringify the whole error
        return JSON.stringify(firstError);
    }
    
    // ✅ Handle array of errors directly
    if (Array.isArray(data) && data.length > 0) {
        const firstError = data[0];
        if (firstError.msg) return firstError.msg;
        if (firstError.message) return firstError.message;
        return JSON.stringify(firstError);
    }
    
    // ✅ Handle single error object with detail string
    if (data.detail && typeof data.detail === 'string') return data.detail;
    
    // ✅ Handle message/error fields
    if (data.message) return typeof data.message === 'string' ? data.message : JSON.stringify(data.message);
    if (data.error) return typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
    
    // ✅ Fallback
    return 'An unknown error occurred';
};

// ✅ Get field-specific errors from validation errors
export const extractFieldErrors = (data: any): Record<string, string> => {
    const fieldErrors: Record<string, string> = {};
    
    if (!data) return fieldErrors;
    
    // ✅ Handle FastAPI 422 validation errors: { detail: [{ msg, loc, ... }] }
    if (data.detail && Array.isArray(data.detail)) {
        data.detail.forEach((item: any) => {
            // Extract field from 'loc' array
            let field = 'general';
            if (item.loc && Array.isArray(item.loc)) {
                // Get the last element of loc (usually the field name)
                const lastPath = item.loc[item.loc.length - 1];
                field = typeof lastPath === 'string' ? lastPath : 'general';
            }
            const message = item.msg || item.message || 'Invalid value';
            fieldErrors[field] = message;
        });
    }
    
    // ✅ Handle array of errors directly
    if (Array.isArray(data)) {
        data.forEach((item: any) => {
            let field = 'general';
            if (item.loc && Array.isArray(item.loc)) {
                const lastPath = item.loc[item.loc.length - 1];
                field = typeof lastPath === 'string' ? lastPath : 'general';
            }
            const message = item.msg || item.message || 'Invalid value';
            fieldErrors[field] = message;
        });
    }
    
    return fieldErrors;
};

// ✅ Get error message by status code (with fallback to backend message)
export const getErrorMessage = (status: number, data?: any): string => {
    // 1️⃣ First priority: Backend error message
    if (data) {
        const extracted = extractErrorMessage(data);
        if (extracted && extracted !== 'An unknown error occurred') {
            return extracted;
        }
    }
    
    // 2️⃣ Second priority: Predefined message for this status
    const predefinedMessage = ERROR_MESSAGES[status];
    if (predefinedMessage) return predefinedMessage;
    
    // 3️⃣ Fallback
    return `Request failed with status ${status}`;
};